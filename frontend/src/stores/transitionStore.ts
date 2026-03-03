/**
 * Transition Store - Manages a single transition configuration and calculated results
 */
import { computed, signal } from '@preact/signals';
import { fetchTransitions, type TransitionRequestBody } from '../api/client';
import { currentSession } from './logStore';

// ============================================================================
// Types
// ============================================================================

export type RuleType = 'a-to-b' | 'cycle' | 'value-populated';
export type ConditionType = 'equals' | 'not-equals' | 'greater' | 'less' | 'not-empty';
export type ResultStatus = 'ok' | 'above' | 'below' | 'no-target';

export interface TransitionConfig {
    name: string;
    type: RuleType;
    enabled: boolean;

    // Start condition
    startDeviceId: string;
    startSignalName: string;
    startCondition: ConditionType;
    startValue: string | number | boolean;

    // End condition (not used for 'value-populated')
    endDeviceId?: string;
    endSignalName?: string;
    endCondition?: ConditionType;
    endValue?: string | number | boolean;

    // Target timing (optional, in milliseconds)
    targetDuration?: number;
    tolerance?: number;
}

export interface TransitionResult {
    configName: string;
    startTime: number;      // Unix timestamp ms
    endTime: number;        // Unix timestamp ms
    duration: number;       // milliseconds
    status: ResultStatus;
}

export interface TransitionStats {
    configName: string;
    count: number;
    min: number;
    max: number;
    average: number;
    median: number;
    p90: number;
    p95: number;
    stdDev: number;
    range: number;
    cv: number; // coefficient of variation (stdDev / average)
    totalDuration: number;
    firstStartTime: number | null;
    lastEndTime: number | null;
    elapsedTime: number;
    throughputPerHour: number;
    targetLowerBound?: number;
    targetUpperBound?: number;
    withinTarget: number;
    aboveTarget: number;
    belowTarget: number;
    withinTargetPct: number;
    aboveTargetPct: number;
    belowTargetPct: number;
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

export const transitionConfig = signal<TransitionConfig | null>(null);

// Results (computed from config + log entries)
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

const DEFAULT_TREND_SETTINGS: TrendSettings = {
    aggregationType: 'moving-average',
    movingAverageWindow: 10,
    timeBucketMinutes: 5,
    displayMode: 'line'
};

// ============================================================================
// Computed
// ============================================================================

export const filteredResults = computed(() => {
    const filter = resultFilter.value;
    if (filter === 'all') return transitionResults.value;
    return transitionResults.value.filter(r => r.status === filter);
});

export const transitionStats = computed((): TransitionStats | null => {
    const config = transitionConfig.value;
    if (!config) return null;

    const results = transitionResults.value;
    if (results.length === 0) {
        return {
            configName: config.name,
            count: 0,
            min: 0,
            max: 0,
            average: 0,
            median: 0,
            p90: 0,
            p95: 0,
            stdDev: 0,
            range: 0,
            cv: 0,
            totalDuration: 0,
            firstStartTime: null,
            lastEndTime: null,
            elapsedTime: 0,
            throughputPerHour: 0,
            targetLowerBound: config.targetDuration !== undefined ? config.targetDuration - (config.tolerance ?? 0) : undefined,
            targetUpperBound: config.targetDuration !== undefined ? config.targetDuration + (config.tolerance ?? 0) : undefined,
            withinTarget: 0,
            aboveTarget: 0,
            belowTarget: 0,
            withinTargetPct: 0,
            aboveTargetPct: 0,
            belowTargetPct: 0
        };
    }

    const durations = results.map(r => r.duration);
    const sortedDurations = [...durations].sort((a, b) => a - b);
    const min = Math.min(...durations);
    const max = Math.max(...durations);
    const sum = durations.reduce((a, b) => a + b, 0);
    const average = sum / durations.length;
    const median = calculatePercentile(sortedDurations, 50);
    const p90 = calculatePercentile(sortedDurations, 90);
    const p95 = calculatePercentile(sortedDurations, 95);

    // Standard deviation
    const squaredDiffs = durations.map(d => Math.pow(d - average, 2));
    const avgSquaredDiff = squaredDiffs.reduce((a, b) => a + b, 0) / durations.length;
    const stdDev = Math.sqrt(avgSquaredDiff);
    const range = max - min;
    const cv = average > 0 ? stdDev / average : 0;

    const startTimes = results.map(r => r.startTime);
    const endTimes = results.map(r => r.endTime);
    const firstStartTime = Math.min(...startTimes);
    const lastEndTime = Math.max(...endTimes);
    const elapsedTime = Math.max(0, lastEndTime - firstStartTime);
    const throughputPerHour = elapsedTime > 0
        ? results.length / (elapsedTime / (60 * 60 * 1000))
        : 0;

    // Target compliance
    const withinTarget = results.filter(r => r.status === 'ok').length;
    const aboveTarget = results.filter(r => r.status === 'above').length;
    const belowTarget = results.filter(r => r.status === 'below').length;
    const withinTargetPct = (withinTarget / results.length) * 100;
    const aboveTargetPct = (aboveTarget / results.length) * 100;
    const belowTargetPct = (belowTarget / results.length) * 100;
    const targetLowerBound = config.targetDuration !== undefined
        ? config.targetDuration - (config.tolerance ?? 0)
        : undefined;
    const targetUpperBound = config.targetDuration !== undefined
        ? config.targetDuration + (config.tolerance ?? 0)
        : undefined;

    return {
        configName: config.name,
        count: results.length,
        min,
        max,
        average,
        median,
        p90,
        p95,
        stdDev,
        range,
        cv,
        totalDuration: sum,
        firstStartTime,
        lastEndTime,
        elapsedTime,
        throughputPerHour,
        targetLowerBound,
        targetUpperBound,
        withinTarget,
        aboveTarget,
        belowTarget,
        withinTargetPct,
        aboveTargetPct,
        belowTargetPct
    };
});

function calculatePercentile(sortedValues: number[], percentile: number): number {
    if (sortedValues.length === 0) return 0;
    if (sortedValues.length === 1) return sortedValues[0];

    const rank = (percentile / 100) * (sortedValues.length - 1);
    const lowerIndex = Math.floor(rank);
    const upperIndex = Math.ceil(rank);

    if (lowerIndex === upperIndex) {
        return sortedValues[lowerIndex];
    }

    const weight = rank - lowerIndex;
    return sortedValues[lowerIndex] + (sortedValues[upperIndex] - sortedValues[lowerIndex]) * weight;
}

// ============================================================================
// Config Operations
// ============================================================================

export function setTransitionConfig(config: TransitionConfig): void {
    transitionConfig.value = { ...config };
}

export function clearTransitionConfig(): void {
    transitionConfig.value = null;
    transitionResults.value = [];
}

// ============================================================================
// Calculation
// ============================================================================

/**
 * Fetch transitions from the backend. The backend queries the full DuckDB
 * dataset — not the in-memory page slice — so results reflect all entries.
 */
export async function calculateTransitions(): Promise<void> {
    const config = transitionConfig.value;
    const session = currentSession.value;

    if (!config || !config.enabled || !session) {
        transitionResults.value = [];
        return;
    }

    isCalculating.value = true;
    try {
        const body: TransitionRequestBody = {
            type: config.type,
            start: {
                deviceId: config.startDeviceId,
                signalName: config.startSignalName,
                condition: config.startCondition,
                value: config.startValue,
            },
            targetDuration: config.targetDuration,
            tolerance: config.tolerance,
        };

        if (config.type === 'a-to-b' && config.endDeviceId && config.endSignalName && config.endCondition && config.endValue !== undefined) {
            body.end = {
                deviceId: config.endDeviceId,
                signalName: config.endSignalName,
                condition: config.endCondition,
                value: config.endValue,
            };
        }

        const items = await fetchTransitions(session.id, body);
        transitionResults.value = items.map(r => ({
            configName: config.name,
            startTime: r.startTime,
            endTime: r.endTime,
            duration: r.duration,
            status: r.status,
        }));
    } catch {
        transitionResults.value = [];
    } finally {
        isCalculating.value = false;
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

export function getAggregatedTrendData(): TrendDataPoint[] {
    const results = transitionResults.value;
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
    transitionConfig.value = null;
    transitionResults.value = [];
    isCalculating.value = false;
    viewMode.value = 'table';
    resultFilter.value = 'all';
    trendSettings.value = { ...DEFAULT_TREND_SETTINGS };
}
