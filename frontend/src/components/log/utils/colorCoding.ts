/**
 * Color Coding Utilities
 * 
 * Pure functions for computing color classes and styles for log table rows.
 */
import type { LogEntry } from '../../../models/types';
import type { ColorCodingSettings } from '../../../stores/colorCodingStore';

export interface ColorCodingResult {
    /** CSS classes to apply */
    classes: string[];
    /** Inline styles to apply */
    styles: Record<string, string>;
    /** Value column modifier classes */
    valueClassMods: string[];
}

/**
 * Get category-based color class
 */
function getCategoryClass(category: string | undefined): string {
    const cat = (category || 'uncategorized').toLowerCase().replace(/[^a-z0-9]/g, '-');
    return `category-${cat}`;
}

/**
 * Get pattern-based color class from signal name
 */
function getPatternClass(
    signalName: string,
    patterns: Array<{ name: string; pattern: string; enabled: boolean; isRegex: boolean }>
): string | null {
    const matchedPattern = patterns.find(p => {
        if (!p.enabled) return false;
        try {
            const regex = p.isRegex
                ? new RegExp(p.pattern, 'i')
                : new RegExp(p.pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
            return regex.test(signalName);
        } catch {
            return false;
        }
    });

    if (matchedPattern) {
        return `pattern-${matchedPattern.name.toLowerCase().replace(/[^a-z0-9]/g, '-')}`;
    }
    return null;
}

/**
 * Get severity class from value
 */
function getSeverityClass(value: string): string | null {
    const lowerValue = value.toLowerCase();

    if (['error', 'fail', 'failed', 'critical', 'fatal'].some(v => lowerValue.includes(v))) {
        return 'severity-error';
    }
    if (['warn', 'warning'].some(v => lowerValue.includes(v))) {
        return 'severity-warning';
    }
    if (['success', 'ok', 'done', 'complete'].some(v => lowerValue.includes(v))) {
        return 'severity-success';
    }
    if (['info', 'notice', 'log'].some(v => lowerValue.includes(v))) {
        return 'severity-info';
    }

    return null;
}

/**
 * Compute color coding for a log entry
 */
export function computeRowColorCoding(
    entry: LogEntry,
    settings: ColorCodingSettings
): ColorCodingResult {
    const classes: string[] = [];
    const styles: Record<string, string> = {};
    const valueClassMods: string[] = [];

    if (!settings.enabled) {
        return { classes, styles, valueClassMods };
    }

    switch (settings.mode) {
        case 'category': {
            const catColorEntry = settings.categoryColors?.find(
                c => c.category.toLowerCase() === (entry.category || '').toLowerCase() && c.enabled
            );
            if (catColorEntry && settings.applyToRow) {
                classes.push(getCategoryClass(entry.category));
                styles['--row-opacity'] = String(settings.rowOpacity);
            }
            break;
        }

        case 'signalPattern': {
            const patternClass = getPatternClass(entry.signalName, settings.signalPatterns);
            if (patternClass && settings.applyToRow) {
                classes.push(patternClass);
                styles['--row-opacity'] = String(settings.rowOpacity);
            }
            break;
        }

        case 'valueSeverity': {
            const valueStr = String(entry.value);
            const severityClass = getSeverityClass(valueStr);
            if (severityClass) {
                if (settings.applyToRow) {
                    classes.push(severityClass);
                    styles['--row-opacity'] = String(settings.rowOpacity);
                }
                if (settings.applyToValue) {
                    valueClassMods.push(severityClass.replace('severity-', 'val-severity-'));
                }
            }
            break;
        }

        case 'signalType': {
            styles['--color-bool-true'] = settings.booleanTrueColor;
            styles['--color-bool-false'] = settings.booleanFalseColor;
            styles['--color-integer'] = settings.integerColor;
            styles['--color-string'] = settings.stringColor;
            break;
        }

        case 'device': {
            if (settings.applyToRow) {
                // Generate device color from hash of deviceId
                let hash = 0;
                for (let i = 0; i < entry.deviceId.length; i++) {
                    hash = entry.deviceId.charCodeAt(i) + ((hash << 5) - hash);
                }
                const hue = Math.abs(hash % 360);
                const deviceColor = `hsl(${hue}, ${settings.deviceColorSaturation}%, ${settings.deviceColorLightness}%)`;
                
                classes.push('device-colored', 'custom-color');
                styles['--device-color'] = deviceColor;
                styles['--custom-bg-color'] = `hsla(${hue}, ${settings.deviceColorSaturation}%, ${settings.deviceColorLightness}%, ${settings.rowOpacity})`;
                styles['--custom-border-color'] = deviceColor;
            }
            break;
        }
    }

    if (settings.alternatingRows) {
        classes.push('alternating');
        styles['--alternating-opacity'] = String(settings.alternatingRowOpacity);
    }

    return { classes, styles, valueClassMods };
}

/**
 * Check if entry matches search criteria for highlighting
 */
export function entryMatchesSearch(
    entry: LogEntry,
    query: string,
    useRegex: boolean,
    caseSensitive: boolean
): boolean {
    if (!query.trim()) return false;

    const searchStr = caseSensitive ? query : query.toLowerCase();
    const fields = [
        entry.deviceId,
        entry.signalName,
        String(entry.value),
        entry.category
    ].filter((f): f is string => f !== undefined);

    if (useRegex) {
        try {
            const flags = caseSensitive ? 'i' : '';
            const regex = new RegExp(searchStr, flags);
            return fields.some(field => regex.test(String(field)));
        } catch {
            // Invalid regex, fall back to string includes
            return fields.some(field =>
                String(field).toLowerCase().includes(searchStr.toLowerCase())
            );
        }
    }

    return fields.some(field => {
        const fieldStr = caseSensitive ? String(field) : String(field).toLowerCase();
        return fieldStr.includes(searchStr);
    });
}

export default {
    computeRowColorCoding,
    entryMatchesSearch
};
