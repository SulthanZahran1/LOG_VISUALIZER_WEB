/**
 * Map Store Utilities
 * 
 * Pure helper functions for map operations.
 */

import {
    mapLayout,
    mapRules,
    mapZoom,
    mapOffset,
    viewportSize,
    carrierLocations,
    unitCarrierCounts,
    carrierTrackingEnabled,
    latestSignalValues,
    signalHistory,
    mapUseServerSide,
    unitSignalCache,
    regexCache,
    playbackTime
} from './state';
import type { UnitColorResult } from './types';

/**
 * Center the map view on a specific unit.
 */
export function centerOnUnit(unitId: string): void {
    if (!mapLayout.value) return;
    const obj = mapLayout.value.objects[unitId];
    if (!obj || !obj.location) return;

    const [x, y] = obj.location.split(',').map(Number);
    if (isNaN(x) || isNaN(y)) return;

    const z = mapZoom.value;
    const w = viewportSize.value.width;
    const h = viewportSize.value.height;

    // Center on (x, y) relative to viewport size
    mapOffset.value = {
        x: w / 2 - x * z,
        y: h / 2 - y * z
    };
}

/**
 * Center the map view on a carrier.
 */
export function centerOnCarrier(carrierId: string): void {
    const unitId = carrierLocations.value.get(carrierId);
    if (unitId) {
        centerOnUnit(unitId);
    }
}

/**
 * Get carriers at a specific unit.
 */
export function getCarriersAtUnit(unitId: string): string[] {
    const carriers: string[] = [];
    for (const [carrierId, uid] of carrierLocations.value.entries()) {
        if (uid === unitId) {
            carriers.push(carrierId);
        }
    }
    return carriers;
}

/**
 * Maps a device ID to a unit ID using the current rules.
 * Supports exact matches and wildcards (e.g. "PLC_*").
 */
export function applyDeviceMapping(deviceId: string): string | null {
    if (mapRules.value?.deviceToUnit) {
        for (const mapping of mapRules.value.deviceToUnit) {
            const pattern = mapping.pattern;
            if (pattern.includes('*')) {
                // Use cached regex
                let regex = regexCache.get(pattern);
                if (!regex) {
                    regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
                    regexCache.set(pattern, regex);
                }

                if (regex.test(deviceId)) {
                    return mapping.unitId;
                }
            } else if (pattern === deviceId) {
                return mapping.unitId;
            }
        }
    }

    // Fallback Heuristic: extract unit portion from device ID
    // Pattern: "...Belts.B1ACNV13301-102@B13" -> "B1ACNV13301-102"
    let unitPortion = deviceId;

    const lastDotIndex = deviceId.lastIndexOf('.');
    if (lastDotIndex !== -1) {
        unitPortion = deviceId.substring(lastDotIndex + 1);
    }

    const atIndex = unitPortion.indexOf('@');
    if (atIndex !== -1) {
        unitPortion = unitPortion.substring(0, atIndex);
    }

    return unitPortion;
}

/**
 * Get signal value at a specific time, or latest if time is null.
 * For large files (server-side mode), uses latest cached values.
 */
export function getSignalValueAtTime(key: string, time: number | null): unknown {
    // If no playback time, use latest value
    if (time === null) {
        return latestSignalValues.value.get(key);
    }

    // For server-side mode (large files), don't use history - rely on latest values
    if (mapUseServerSide.value) {
        return latestSignalValues.value.get(key);
    }

    // Look up in history (client-side mode only)
    const history = signalHistory.value.get(key);
    if (!history || history.length === 0) {
        return latestSignalValues.value.get(key);
    }

    // Find the value at or before the target time
    let result: unknown = undefined;
    for (const entry of history) {
        if (entry.timestamp <= time) {
            result = entry.value;
        } else {
            break;
        }
    }
    return result;
}

/**
 * Returns the color and optional text label for a unit based on current state.
 * Uses playbackTime if set, otherwise uses latest values.
 */
export function getUnitColor(unitId: string): UnitColorResult {
    // 1. If carrier tracking is enabled, use carrier count coloring
    if (carrierTrackingEnabled.value) {
        const count = unitCarrierCounts.value.get(unitId) || 0;
        return { color: getCarrierCountColor(count) };
    }

    // 2. Otherwise, evaluate signal rules for this unit
    if (!mapRules.value?.rules || mapRules.value.rules.length === 0) {
        return { color: mapRules.value?.defaultColor || 'var(--bg-tertiary)' };
    }

    // Sort rules by priority (higher priority first)
    const sortedRules = [...mapRules.value.rules].sort((a, b) => b.priority - a.priority);

    // Check cache first
    let signalMap = unitSignalCache.get(unitId);
    if (!signalMap) {
        // Cache miss - compute and store
        signalMap = new Map<string, string>();

        for (const key of latestSignalValues.value.keys()) {
            const [deviceId, signalName] = key.split('::');

            // Only check if this signal is actually used in a rule
            const isRelevantSignal = sortedRules.some(r => r.signal === signalName);
            if (!isRelevantSignal) continue;

            const targetUnitId = applyDeviceMapping(deviceId);
            if (targetUnitId === unitId) {
                signalMap.set(signalName, deviceId);
            }
        }
        unitSignalCache.set(unitId, signalMap);

        // Log diagnostic on first cache build
        if (unitSignalCache.size === 1) {
            logSignalDiagnostic(sortedRules);
        }
    }

    // Evaluate rules using cached mapping
    for (const rule of sortedRules) {
        const deviceId = signalMap.get(rule.signal);
        if (!deviceId) continue;

        const key = `${deviceId}::${rule.signal}`;
        const value = getSignalValueAtTime(key, playbackTime.value);
        if (value === undefined) continue;

        if (evaluateRuleCondition(value, rule.value, rule.op)) {
            return {
                color: rule.color || rule.bgColor,
                text: rule.text
            };
        }
    }

    return { color: mapRules.value.defaultColor || 'var(--bg-tertiary)' };
}

/**
 * Evaluate a rule condition.
 */
function evaluateRuleCondition(value: unknown, ruleValue: unknown, op: string): boolean {
    const normalizeValue = (v: unknown) => {
        if (v === null || v === undefined) return '';
        const s = String(v).trim().toLowerCase();
        if (s === 'on' || s === 'true' || s === '1') return 'true';
        if (s === 'off' || s === 'false' || s === '0') return 'false';
        return s;
    };

    const valNorm = normalizeValue(value);
    const ruleNorm = normalizeValue(ruleValue);

    switch (op) {
        case '==': return valNorm === ruleNorm;
        case '!=': return valNorm !== ruleNorm;
        case '>': return Number(value) > Number(ruleValue);
        case '>=': return Number(value) >= Number(ruleValue);
        case '<': return Number(value) < Number(ruleValue);
        case '<=': return Number(value) <= Number(ruleValue);
        default: return false;
    }
}

/**
 * Log diagnostic information about signals on first cache build.
 */
function logSignalDiagnostic(sortedRules: Array<{ signal: string }>): void {
    const allSignalNames = new Set<string>();
    const deviceIds = new Set<string>();
    for (const key of latestSignalValues.value.keys()) {
        const [did, sn] = key.split('::');
        allSignalNames.add(sn);
        deviceIds.add(did);
    }
    const ruleSignalNames = [...new Set(sortedRules.map(r => r.signal))];
    const matchingNames = ruleSignalNames.filter(s => allSignalNames.has(s));
    const missingNames = ruleSignalNames.filter(s => !allSignalNames.has(s));
    void matchingNames; // Used for debug logging

    //     latestSignalValues.value.size, deviceIds.size, allSignalNames.size);
    // Debug: void deviceIds;
    // Debug: void allSignalNames;
    //     'Matching:', matchingNames, 'Missing:', missingNames);

    if (missingNames.length > 0) {
        console.warn('[getUnitColor] Rule signals NOT found in loaded data:', missingNames,
            '— coloring will not work for these rules');
    }
}

/**
 * Get color based on carrier count.
 */
export function getCarrierCountColor(count: number): string {
    if (count === 0) return '#3a3a3a';
    if (count === 1) return '#90EE90';
    if (count === 2) return '#FFD700';
    if (count === 3) return '#FFA500';
    return '#FF4444'; // 4+ carriers
}

/**
 * Get display text for carriers at a unit.
 */
export function getCarrierDisplayText(unitId: string): string | null {
    const carriers = getCarriersAtUnit(unitId);
    if (carriers.length === 0) return null;
    if (carriers.length === 1) {
        const id = carriers[0];
        return id.length > 6 ? '...' + id.slice(-6) : id;
    }
    return `${carriers.length}x`;
}

/**
 * Format playback time for display (UTC to match log timestamps).
 */
export function formatPlaybackTime(timeMs: number | null): string {
    if (timeMs === null) return '--:--:--';
    const date = new Date(timeMs);
    const hours = date.getUTCHours().toString().padStart(2, '0');
    const minutes = date.getUTCMinutes().toString().padStart(2, '0');
    const seconds = date.getUTCSeconds().toString().padStart(2, '0');
    const ms = date.getUTCMilliseconds().toString().padStart(3, '0');
    return `${hours}:${minutes}:${seconds}.${ms}`;
}
