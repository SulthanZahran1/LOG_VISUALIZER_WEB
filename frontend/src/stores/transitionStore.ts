/**
 * Transition Store - Manages transition rules and calculated results for tact time analysis
 */
import { signal, computed } from '@preact/signals';
import type { LogEntry } from '../models/types';
import { logEntries } from './logStore';

// ============================================================================
// Types
// ============================================================================

export type RuleType = 'a-to-b' | 'cycle' | 'value-populated';
export type ConditionType = 'equals' | 'not-equals' | 'greater' | 'less' | 'not-empty';
export type ResultStatus = 'ok' | 'above' | 'below' | 'no-target';

export interface TransitionRule {
    id: string;
    name: string;
    type: RuleType;
    enabled: boolean;

    // Start condition
    startSignal: string;
    startCondition: ConditionType;
    startValue: string | number | boolean;

    // End condition (not used for 'value-populated')
    endSignal?: string;
    endCondition?: ConditionType;
    endValue?: string | number | boolean;

    // Target timing (optional, in milliseconds)
    targetDuration?: number;
    tolerance?: number;
}

export interface TransitionResult {
    ruleId: string;
    ruleName: string;
    startTime: number;      // Unix timestamp ms
    endTime: number;        // Unix timestamp ms
    duration: number;       // milliseconds
    status: ResultStatus;
}

export interface TransitionStats {
    ruleId: string;
    ruleName: string;
    count: number;
    min: number;
    max: number;
    average: number;
    stdDev: number;
    withinTarget: number;
    aboveTarget: number;
    belowTarget: number;
}

// Aggregation settings for trend chart
export type AggregationType = 'none' | 'moving-average' | 'time-bucket';
export type TrendDisplayMode = 'line' | 'points';

export interface TrendSettings {
    aggregationType: AggregationType;
    movingAverageWindow: number;      // Number of points for moving average
    timeBucketMinutes: number;        // Bucket size for time aggregation
    displayMode: TrendDisplayMode;
}

// View mode for results display
export type ViewMode = 'table' | 'stats' | 'histogram' | 'trend';

// ============================================================================
// Signals
// ============================================================================

// Rules
export const transitionRules = signal<TransitionRule[]>([]);
export const selectedRuleId = signal<string | null>(null);

// Results (computed from rules + log entries)
export const transitionResults = signal<TransitionResult[]>([]);
export const isCalculating = signal(false);

// View settings
export const viewMode = signal<ViewMode>('table');
export const resultFilter = signal<'all' | 'ok' | 'above' | 'below'>('all');

// Trend chart settings
export const trendSettings = signal<TrendSettings>({
    aggregationType: 'moving-average',
    movingAverageWindow: 10,
    timeBucketMinutes: 5,
    displayMode: 'line'
});

// ============================================================================
// Computed
// ============================================================================

export const selectedRule = computed(() => {
    if (!selectedRuleId.value) return null;
    return transitionRules.value.find(r => r.id === selectedRuleId.value) || null;
});

export const filteredResults = computed(() => {
    const filter = resultFilter.value;
    if (filter === 'all') return transitionResults.value;
    return transitionResults.value.filter(r => r.status === filter);
});

export const resultsByRule = computed(() => {
    const byRule = new Map<string, TransitionResult[]>();
    for (const result of transitionResults.value) {
        const list = byRule.get(result.ruleId) || [];
        list.push(result);
        byRule.set(result.ruleId, list);
    }
    return byRule;
});

export const statisticsByRule = computed((): TransitionStats[] => {
    const stats: TransitionStats[] = [];

    for (const rule of transitionRules.value) {
        const results = resultsByRule.value.get(rule.id) || [];
        if (results.length === 0) {
            stats.push({
                ruleId: rule.id,
                ruleName: rule.name,
                count: 0,
                min: 0,
                max: 0,
                average: 0,
                stdDev: 0,
                withinTarget: 0,
                aboveTarget: 0,
                belowTarget: 0
            });
            continue;
        }

        const durations = results.map(r => r.duration);
        const min = Math.min(...durations);
        const max = Math.max(...durations);
        const sum = durations.reduce((a, b) => a + b, 0);
        const average = sum / durations.length;

        // Standard deviation
        const squaredDiffs = durations.map(d => Math.pow(d - average, 2));
        const avgSquaredDiff = squaredDiffs.reduce((a, b) => a + b, 0) / durations.length;
        const stdDev = Math.sqrt(avgSquaredDiff);

        // Target compliance
        const withinTarget = results.filter(r => r.status === 'ok').length;
        const aboveTarget = results.filter(r => r.status === 'above').length;
        const belowTarget = results.filter(r => r.status === 'below').length;

        stats.push({
            ruleId: rule.id,
            ruleName: rule.name,
            count: results.length,
            min,
            max,
            average,
            stdDev,
            withinTarget,
            aboveTarget,
            belowTarget
        });
    }

    return stats;
});

// ============================================================================
// Rule CRUD Operations
// ============================================================================

export function addRule(rule: Omit<TransitionRule, 'id'>): TransitionRule {
    const newRule: TransitionRule = {
        ...rule,
        id: window.crypto.randomUUID()
    };
    transitionRules.value = [...transitionRules.value, newRule];
    saveRulesToStorage();
    return newRule;
}

export function updateRule(id: string, updates: Partial<TransitionRule>): void {
    transitionRules.value = transitionRules.value.map(r =>
        r.id === id ? { ...r, ...updates } : r
    );
    saveRulesToStorage();
}

export function deleteRule(id: string): void {
    transitionRules.value = transitionRules.value.filter(r => r.id !== id);
    if (selectedRuleId.value === id) {
        selectedRuleId.value = null;
    }
    saveRulesToStorage();
}

export function selectRule(id: string | null): void {
    selectedRuleId.value = id;
}

// ============================================================================
// Calculation
// ============================================================================

/**
 * Calculate transitions based on current rules and log entries.
 * This is done client-side for now; can be moved to backend for large datasets.
 */
export function calculateTransitions(): void {
    isCalculating.value = true;
    const results: TransitionResult[] = [];
    const entries = logEntries.value;

    if (entries.length === 0) {
        transitionResults.value = [];
        isCalculating.value = false;
        return;
    }

    // Sort entries by timestamp
    const sortedEntries = [...entries].sort((a, b) => {
        const timeA = new Date(a.timestamp).getTime();
        const timeB = new Date(b.timestamp).getTime();
        return timeA - timeB;
    });

    for (const rule of transitionRules.value) {
        if (!rule.enabled) continue;

        const ruleResults = calculateRuleTransitions(rule, sortedEntries);
        results.push(...ruleResults);
    }

    // Sort results by start time
    results.sort((a, b) => a.startTime - b.startTime);
    transitionResults.value = results;
    isCalculating.value = false;
}

function calculateRuleTransitions(rule: TransitionRule, entries: LogEntry[]): TransitionResult[] {
    const results: TransitionResult[] = [];

    switch (rule.type) {
        case 'cycle':
            return calculateCycleTransitions(rule, entries);
        case 'a-to-b':
            return calculateABTransitions(rule, entries);
        case 'value-populated':
            return calculateValuePopulatedTransitions(rule, entries);
        default:
            return results;
    }
}

function matchesCondition(entry: LogEntry, signal: string, condition: ConditionType, expectedValue: string | number | boolean): boolean {
    // Check if signal matches (format: "deviceId::signalName" or just "signalName")
    const signalKey = `${entry.deviceId}::${entry.signalName}`;
    if (signalKey !== signal && entry.signalName !== signal) {
        return false;
    }

    const value = entry.value;

    switch (condition) {
        case 'equals':
            return value === expectedValue || String(value) === String(expectedValue);
        case 'not-equals':
            return value !== expectedValue && String(value) !== String(expectedValue);
        case 'greater':
            return Number(value) > Number(expectedValue);
        case 'less':
            return Number(value) < Number(expectedValue);
        case 'not-empty':
            return value !== null && value !== undefined && value !== '';
        default:
            return false;
    }
}

function calculateCycleTransitions(rule: TransitionRule, entries: LogEntry[]): TransitionResult[] {
    const results: TransitionResult[] = [];
    let lastMatchTime: number | null = null;

    for (const entry of entries) {
        if (matchesCondition(entry, rule.startSignal, rule.startCondition, rule.startValue)) {
            const currentTime = new Date(entry.timestamp).getTime();

            if (lastMatchTime !== null) {
                const duration = currentTime - lastMatchTime;
                const status = getStatus(duration, rule.targetDuration, rule.tolerance);

                results.push({
                    ruleId: rule.id,
                    ruleName: rule.name,
                    startTime: lastMatchTime,
                    endTime: currentTime,
                    duration,
                    status
                });
            }

            lastMatchTime = currentTime;
        }
    }

    return results;
}

function calculateABTransitions(rule: TransitionRule, entries: LogEntry[]): TransitionResult[] {
    const results: TransitionResult[] = [];
    let waitingForEnd = false;
    let startTime: number | null = null;

    for (const entry of entries) {
        if (!waitingForEnd) {
            // Looking for start condition
            if (matchesCondition(entry, rule.startSignal, rule.startCondition, rule.startValue)) {
                startTime = new Date(entry.timestamp).getTime();
                waitingForEnd = true;
            }
        } else {
            // Looking for end condition
            if (rule.endSignal && rule.endCondition && rule.endValue !== undefined) {
                if (matchesCondition(entry, rule.endSignal, rule.endCondition, rule.endValue)) {
                    const endTime = new Date(entry.timestamp).getTime();
                    const duration = endTime - startTime!;
                    const status = getStatus(duration, rule.targetDuration, rule.tolerance);

                    results.push({
                        ruleId: rule.id,
                        ruleName: rule.name,
                        startTime: startTime!,
                        endTime,
                        duration,
                        status
                    });

                    waitingForEnd = false;
                    startTime = null;
                }
            }
        }
    }

    return results;
}

function calculateValuePopulatedTransitions(rule: TransitionRule, entries: LogEntry[]): TransitionResult[] {
    const results: TransitionResult[] = [];
    let waitingForValue = false;
    let startTime: number | null = null;

    for (const entry of entries) {
        const signalKey = `${entry.deviceId}::${entry.signalName}`;
        const isTargetSignal = signalKey === rule.startSignal || entry.signalName === rule.startSignal;

        if (!isTargetSignal) continue;

        const isEmpty = entry.value === null || entry.value === undefined || entry.value === '';

        if (!waitingForValue && isEmpty) {
            // Started with empty value - wait for it to be populated
            startTime = new Date(entry.timestamp).getTime();
            waitingForValue = true;
        } else if (waitingForValue && !isEmpty) {
            // Value became populated
            const endTime = new Date(entry.timestamp).getTime();
            const duration = endTime - startTime!;
            const status = getStatus(duration, rule.targetDuration, rule.tolerance);

            results.push({
                ruleId: rule.id,
                ruleName: rule.name,
                startTime: startTime!,
                endTime,
                duration,
                status
            });

            waitingForValue = false;
            startTime = null;
        }
    }

    return results;
}

function getStatus(duration: number, target?: number, tolerance?: number): ResultStatus {
    if (target === undefined || target === null) {
        return 'no-target';
    }

    const tol = tolerance ?? 0;
    const lowerBound = target - tol;
    const upperBound = target + tol;

    if (duration >= lowerBound && duration <= upperBound) {
        return 'ok';
    } else if (duration > upperBound) {
        return 'above';
    } else {
        return 'below';
    }
}

// ============================================================================
// Persistence
// ============================================================================

const STORAGE_KEY = 'plc-visualizer-transition-rules';

export function saveRulesToStorage(): void {
    try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(transitionRules.value));
    } catch (e) {
        console.error('Failed to save transition rules:', e);
    }
}

export function loadRulesFromStorage(): void {
    try {
        const stored = window.localStorage.getItem(STORAGE_KEY);
        if (stored) {
            transitionRules.value = JSON.parse(stored);
        }
    } catch (e) {
        console.error('Failed to load transition rules:', e);
    }
}

// ============================================================================
// Trend Data Aggregation
// ============================================================================

export interface TrendDataPoint {
    time: number;
    value: number;
    count?: number;  // For aggregated points
}

export function getAggregatedTrendData(ruleId: string): TrendDataPoint[] {
    const results = resultsByRule.value.get(ruleId) || [];
    if (results.length === 0) return [];

    const settings = trendSettings.value;

    switch (settings.aggregationType) {
        case 'none':
            return results.map(r => ({ time: r.startTime, value: r.duration }));

        case 'moving-average':
            return calculateMovingAverage(results, settings.movingAverageWindow);

        case 'time-bucket':
            return calculateTimeBuckets(results, settings.timeBucketMinutes);

        default:
            return results.map(r => ({ time: r.startTime, value: r.duration }));
    }
}

function calculateMovingAverage(results: TransitionResult[], windowSize: number): TrendDataPoint[] {
    const points: TrendDataPoint[] = [];
    const window: number[] = [];

    for (const result of results) {
        window.push(result.duration);
        if (window.length > windowSize) {
            window.shift();
        }

        const avg = window.reduce((a, b) => a + b, 0) / window.length;
        points.push({
            time: result.startTime,
            value: avg,
            count: window.length
        });
    }

    return points;
}

function calculateTimeBuckets(results: TransitionResult[], bucketMinutes: number): TrendDataPoint[] {
    const bucketMs = bucketMinutes * 60 * 1000;
    const buckets = new Map<number, { sum: number; count: number }>();

    for (const result of results) {
        const bucketStart = Math.floor(result.startTime / bucketMs) * bucketMs;
        const bucket = buckets.get(bucketStart) || { sum: 0, count: 0 };
        bucket.sum += result.duration;
        bucket.count++;
        buckets.set(bucketStart, bucket);
    }

    const points: TrendDataPoint[] = [];
    for (const [time, bucket] of buckets) {
        points.push({
            time,
            value: bucket.sum / bucket.count,
            count: bucket.count
        });
    }

    return points.sort((a, b) => a.time - b.time);
}

// ============================================================================
// Initialization
// ============================================================================

export function initTransitionStore(): void {
    loadRulesFromStorage();
}
