/**
 * Color Coding Settings Store
 * Manages visual color coding preferences for the log table
 * All settings are persisted to localStorage
 */

import { signal, computed } from '@preact/signals';

export type ColorCodingMode = 'none' | 'category' | 'signalPattern' | 'valueSeverity' | 'signalType' | 'device';

export interface SignalPatternRule {
    id: string;
    name: string;
    pattern: string;
    isRegex: boolean;
    color: string;
    enabled: boolean;
}

export interface ValueSeverityRule {
    id: string;
    keyword: string;
    severity: 'error' | 'warning' | 'info' | 'success';
    enabled: boolean;
}

export interface CategoryColor {
    category: string;
    color: string;
    enabled: boolean;
}

export interface ColorCodingSettings {
    enabled: boolean;
    mode: ColorCodingMode;
    // Category settings
    categoryColors: CategoryColor[];
    // Signal pattern settings
    signalPatterns: SignalPatternRule[];
    // Value severity settings
    valueSeverityRules: ValueSeverityRule[];
    // Device settings
    deviceColorSaturation: number;
    deviceColorLightness: number;
    // Signal type colors
    booleanTrueColor: string;
    booleanFalseColor: string;
    integerColor: string;
    stringColor: string;
    // General options
    applyToRow: boolean;
    applyToValue: boolean;
    rowOpacity: number;
    // Alternating rows
    alternatingRows: boolean;
    alternatingRowOpacity: number;
}

const STORAGE_KEY = 'log-visualizer-color-coding';

// Default settings
const defaultSettings: ColorCodingSettings = {
    enabled: true,
    mode: 'category',
    categoryColors: [
        { category: 'Alarm', color: '#f85149', enabled: true },
        { category: 'Error', color: '#f85149', enabled: true },
        { category: 'Warning', color: '#d29922', enabled: true },
        { category: 'Status', color: '#3fb950', enabled: true },
        { category: 'Command', color: '#58a6ff', enabled: true },
        { category: 'Info', color: '#a371f7', enabled: true },
    ],
    signalPatterns: [
        { id: '1', name: 'Errors', pattern: '(ERROR|ALARM|FAULT|FAIL)', isRegex: true, color: '#f85149', enabled: true },
        { id: '2', name: 'Warnings', pattern: '(WARN|CAUTION)', isRegex: true, color: '#d29922', enabled: true },
        { id: '3', name: 'Status OK', pattern: '(READY|OK|DONE|SUCCESS)', isRegex: true, color: '#3fb950', enabled: true },
        { id: '4', name: 'Commands', pattern: '(CMD|COMMAND|REQ)', isRegex: true, color: '#58a6ff', enabled: true },
        { id: '5', name: 'Heartbeat', pattern: '(HB|HEARTBEAT|ALIVE)', isRegex: true, color: '#a371f7', enabled: true },
    ],
    valueSeverityRules: [
        { id: '1', keyword: 'ERROR', severity: 'error', enabled: true },
        { id: '2', keyword: 'FAIL', severity: 'error', enabled: true },
        { id: '3', keyword: 'WARN', severity: 'warning', enabled: true },
        { id: '4', keyword: 'OK', severity: 'success', enabled: true },
        { id: '5', keyword: 'SUCCESS', severity: 'success', enabled: true },
        { id: '6', keyword: 'DONE', severity: 'success', enabled: true },
    ],
    deviceColorSaturation: 50,
    deviceColorLightness: 40,
    booleanTrueColor: '#4caf50',
    booleanFalseColor: '#f44336',
    integerColor: '#82aaff',
    stringColor: '#c3e88d',
    applyToRow: true,
    applyToValue: true,
    rowOpacity: 0.08,
    alternatingRows: true,
    alternatingRowOpacity: 0.04,
};

// Load settings from localStorage
function loadSettings(): ColorCodingSettings {
    try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
            const parsed = JSON.parse(stored);
            return { ...defaultSettings, ...parsed };
        }
    } catch (e) {
        console.warn('Failed to load color coding settings:', e);
    }
    return { ...defaultSettings };
}

// Save settings to localStorage
function saveSettings(settings: ColorCodingSettings) {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch (e) {
        console.warn('Failed to save color coding settings:', e);
    }
}

// Main settings signal
export const colorSettings = signal<ColorCodingSettings>(loadSettings());

// Computed values
export const isColorCodingEnabled = computed(() => colorSettings.value.enabled);
export const currentColorMode = computed(() => colorSettings.value.mode);

// Actions
export function toggleColorCoding() {
    colorSettings.value = { ...colorSettings.value, enabled: !colorSettings.value.enabled };
    saveSettings(colorSettings.value);
}

export function setColorMode(mode: ColorCodingMode) {
    colorSettings.value = { ...colorSettings.value, mode };
    saveSettings(colorSettings.value);
}

export function updateSettings(updates: Partial<ColorCodingSettings>) {
    colorSettings.value = { ...colorSettings.value, ...updates };
    saveSettings(colorSettings.value);
}

export function addCategoryColor(category: string, color: string) {
    const categoryColors = [...colorSettings.value.categoryColors];
    const existingIndex = categoryColors.findIndex(c => c.category === category);
    if (existingIndex >= 0) {
        categoryColors[existingIndex] = { ...categoryColors[existingIndex], color, enabled: true };
    } else {
        categoryColors.push({ category, color, enabled: true });
    }
    colorSettings.value = { ...colorSettings.value, categoryColors };
    saveSettings(colorSettings.value);
}

export function removeCategoryColor(category: string) {
    const categoryColors = colorSettings.value.categoryColors.filter(c => c.category !== category);
    colorSettings.value = { ...colorSettings.value, categoryColors };
    saveSettings(colorSettings.value);
}

export function toggleCategoryColor(category: string) {
    const categoryColors = colorSettings.value.categoryColors.map(c =>
        c.category === category ? { ...c, enabled: !c.enabled } : c
    );
    colorSettings.value = { ...colorSettings.value, categoryColors };
    saveSettings(colorSettings.value);
}

export function addSignalPattern(rule: Omit<SignalPatternRule, 'id'>) {
    const id = Date.now().toString();
    const signalPatterns = [...colorSettings.value.signalPatterns, { ...rule, id }];
    colorSettings.value = { ...colorSettings.value, signalPatterns };
    saveSettings(colorSettings.value);
}

export function updateSignalPattern(id: string, updates: Partial<SignalPatternRule>) {
    const signalPatterns = colorSettings.value.signalPatterns.map(p =>
        p.id === id ? { ...p, ...updates } : p
    );
    colorSettings.value = { ...colorSettings.value, signalPatterns };
    saveSettings(colorSettings.value);
}

export function removeSignalPattern(id: string) {
    const signalPatterns = colorSettings.value.signalPatterns.filter(p => p.id !== id);
    colorSettings.value = { ...colorSettings.value, signalPatterns };
    saveSettings(colorSettings.value);
}

export function addValueSeverityRule(rule: Omit<ValueSeverityRule, 'id'>) {
    const id = Date.now().toString();
    const valueSeverityRules = [...colorSettings.value.valueSeverityRules, { ...rule, id }];
    colorSettings.value = { ...colorSettings.value, valueSeverityRules };
    saveSettings(colorSettings.value);
}

export function updateValueSeverityRule(id: string, updates: Partial<ValueSeverityRule>) {
    const valueSeverityRules = colorSettings.value.valueSeverityRules.map(r =>
        r.id === id ? { ...r, ...updates } : r
    );
    colorSettings.value = { ...colorSettings.value, valueSeverityRules };
    saveSettings(colorSettings.value);
}

export function removeValueSeverityRule(id: string) {
    const valueSeverityRules = colorSettings.value.valueSeverityRules.filter(r => r.id !== id);
    colorSettings.value = { ...colorSettings.value, valueSeverityRules };
    saveSettings(colorSettings.value);
}

export function resetToDefaults() {
    colorSettings.value = { ...defaultSettings };
    saveSettings(colorSettings.value);
}

// Helper functions for applying colors

export function getCategoryColor(category: string | undefined): string | null {
    if (!category) return null;
    const found = colorSettings.value.categoryColors.find(
        c => c.category.toLowerCase() === category.toLowerCase() && c.enabled
    );
    return found?.color || null;
}

export function getSignalPatternColor(signalName: string): string | null {
    for (const pattern of colorSettings.value.signalPatterns) {
        if (!pattern.enabled) continue;
        try {
            const regex = pattern.isRegex
                ? new RegExp(pattern.pattern, 'i')
                : new RegExp(pattern.pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
            if (regex.test(signalName)) {
                return pattern.color;
            }
        } catch (e) {
            // Invalid regex, skip
            continue;
        }
    }
    return null;
}

export function getValueSeverity(value: string): 'error' | 'warning' | 'info' | 'success' | null {
    const upperValue = value.toUpperCase();
    for (const rule of colorSettings.value.valueSeverityRules) {
        if (!rule.enabled) continue;
        if (upperValue.includes(rule.keyword.toUpperCase())) {
            return rule.severity;
        }
    }
    return null;
}

// Generate a consistent color from a string (for device coloring)
export function getDeviceColor(deviceId: string): string {
    const settings = colorSettings.value;
    let hash = 0;
    for (let i = 0; i < deviceId.length; i++) {
        hash = deviceId.charCodeAt(i) + ((hash << 5) - hash);
    }
    const hue = Math.abs(hash % 360);
    return `hsl(${hue}, ${settings.deviceColorSaturation}%, ${settings.deviceColorLightness}%)`;
}

// Get severity color
export function getSeverityColor(severity: 'error' | 'warning' | 'info' | 'success'): string {
    switch (severity) {
        case 'error': return '#f85149';
        case 'warning': return '#d29922';
        case 'info': return '#58a6ff';
        case 'success': return '#3fb950';
        default: return '#8b949e';
    }
}
