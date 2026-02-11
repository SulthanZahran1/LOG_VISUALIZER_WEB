/**
 * API Client for PLC Log Visualizer backend
 * Base URL configured for dev server proxy
 */

import type { FileInfo, ParseSession, HealthResponse, LogEntry, SignalType } from '../models/types';
export { uploadFileOptimized, CONFIG as UPLOAD_CONFIG } from './upload';
export {
    uploadFileWebSocket,
    uploadMapWebSocket,
    uploadRulesWebSocket,
    uploadCarrierLogWebSocket,
    closeWebSocket,
    getWebSocketClient,
    WebSocketUploadClient,
    WS_CONFIG,
} from './websocketUpload';
import { fileToBase64 } from '../utils/base64';

const API_BASE = '/api';

class ApiError extends Error {
    status: number;

    constructor(status: number, message: string) {
        super(message);
        this.name = 'ApiError';
        this.status = status;
    }
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
    const url = `${API_BASE}${path}`;
    const response = await fetch(url, {
        headers: {
            'Content-Type': 'application/json',
            ...options?.headers,
        },
        ...options,
    });

    if (!response.ok) {
        const error = await response.json().catch(() => ({ error: 'Unknown error' }));
        throw new ApiError(response.status, error.error || `Request failed: ${response.status}`);
    }

    // Handle 204 No Content or empty bodies
    if (response.status === 204 || response.headers.get('content-length') === '0') {
        return undefined as T;
    }

    return response.json();
}

// Health
export async function checkHealth(): Promise<HealthResponse> {
    return request<HealthResponse>('/health');
}

// Files
export async function uploadFile(file: File): Promise<FileInfo> {
    const base64Data = await fileToBase64(file);

    const response = await fetch(`${API_BASE}/files/upload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            name: file.name,
            data: base64Data,
        }),
    });

    if (!response.ok) {
        const error = await response.json().catch(() => ({ error: 'Upload failed' }));
        throw new ApiError(response.status, error.error);
    }

    return response.json();
}

/**
 * Uploads a file in chunks with optimizations:
 * - Parallel chunk uploads (3 concurrent)
 * - 5MB chunks (was 1MB) for reduced HTTP overhead
 * - Retry logic with exponential backoff
 * - Connection keep-alive
 * 
 * For small files (< 5MB), uses single upload to avoid chunking overhead.
 * 
 * @deprecated Use uploadFileOptimized from './upload' for full optimization
 */
export async function uploadFileChunked(
    file: File,
    onProgress?: (progress: number) => void
): Promise<FileInfo> {
    // Dynamically import to avoid circular deps
    const { uploadFileOptimized } = await import('./upload');
    return uploadFileOptimized(file, onProgress);
}

export async function getRecentFiles(): Promise<FileInfo[]> {
    return request<FileInfo[]>('/files/recent');
}

export async function getFile(id: string): Promise<FileInfo> {
    return request<FileInfo>(`/files/${id}`);
}

export async function deleteFile(id: string): Promise<void> {
    await request<void>(`/files/${id}`, { method: 'DELETE' });
}

export async function renameFile(id: string, name: string): Promise<FileInfo> {
    return request<FileInfo>(`/files/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ name }),
    });
}

// Parse
export async function startParse(fileId: string): Promise<ParseSession> {
    return request<ParseSession>('/parse', {
        method: 'POST',
        body: JSON.stringify({ fileId }),
    });
}

/**
 * Start a merged parse session with multiple files.
 * Files will be parsed individually and merged with deduplication.
 */
export async function startParseMerge(fileIds: string[]): Promise<ParseSession> {
    return request<ParseSession>('/parse', {
        method: 'POST',
        body: JSON.stringify({ fileIds }),
    });
}

export async function getParseStatus(sessionId: string): Promise<ParseSession> {
    return request<ParseSession>(`/parse/${sessionId}/status`);
}

export async function getParseSignals(sessionId: string): Promise<string[]> {
    return request<string[]>(`/parse/${sessionId}/signals`);
}

export async function getParseCategories(sessionId: string): Promise<string[]> {
    return request<string[]>(`/parse/${sessionId}/categories`);
}

export async function getParseSignalTypes(sessionId: string): Promise<Record<string, SignalType>> {
    return request<Record<string, SignalType>>(`/parse/${sessionId}/signal-types`);
}

export interface PaginatedEntries {
    entries: LogEntry[];
    total: number;
    page: number;
    pageSize: number;
}

interface RawLogEntry {
    timestamp: string | number;
    deviceId: string;
    signalName: string;
    value: string | number | boolean;
    signalType?: string;
    [key: string]: unknown;
}

interface RawPaginatedEntries {
    entries: RawLogEntry[];
    total: number;
    page: number;
    pageSize: number;
}

function transformEntry(e: RawLogEntry): LogEntry {
    return {
        ...e,
        timestamp: new Date(e.timestamp).getTime()
    } as LogEntry;
}

export async function getParseEntries(
    sessionId: string,
    page: number = 1,
    pageSize: number = 100,
    filters?: {
        search?: string;
        category?: string;
        sort?: string;
        order?: string;
        type?: string;
        regex?: boolean;
        caseSensitive?: boolean;
        signals?: string;
    },
    signal?: AbortSignal
): Promise<PaginatedEntries> {
    let url = `/parse/${sessionId}/entries?page=${page}&pageSize=${pageSize}`;
    if (filters) {
        if (filters.search) url += `&search=${encodeURIComponent(filters.search)}`;
        if (filters.category) url += `&category=${encodeURIComponent(filters.category)}`;
        if (filters.sort) url += `&sort=${encodeURIComponent(filters.sort)}`;
        if (filters.order) url += `&order=${encodeURIComponent(filters.order)}`;
        if (filters.type) url += `&type=${encodeURIComponent(filters.type)}`;
        if (filters.regex) url += `&regex=true`;
        if (filters.caseSensitive) url += `&caseSensitive=true`;
        if (filters.signals) url += `&signals=${encodeURIComponent(filters.signals)}`;
    }

    const res = await request<RawPaginatedEntries>(url, signal ? { signal } : undefined);
    return {
        ...res,
        entries: res.entries.map(transformEntry)
    };
}

export async function getIndexOfTime(
    sessionId: string,
    ts: number,
    filters?: {
        search?: string;
        category?: string;
        sort?: string;
        order?: string;
        type?: string;
        regex?: boolean;
        caseSensitive?: boolean;
        signals?: string;
    }
): Promise<number> {
    let url = `/parse/${sessionId}/index-of-time?ts=${ts}`;
    if (filters) {
        if (filters.search) url += `&search=${encodeURIComponent(filters.search)}`;
        if (filters.category) url += `&category=${encodeURIComponent(filters.category)}`;
        if (filters.sort) url += `&sort=${encodeURIComponent(filters.sort)}`;
        if (filters.order) url += `&order=${encodeURIComponent(filters.order)}`;
        if (filters.type) url += `&type=${encodeURIComponent(filters.type)}`;
        if (filters.regex) url += `&regex=true`;
        if (filters.caseSensitive) url += `&caseSensitive=true`;
        if (filters.signals) url += `&signals=${encodeURIComponent(filters.signals)}`;
    }

    const res = await request<{ index: number }>(url);
    return res.index;
}

export interface TimeTreeEntry {
    date: string;
    hour: number;
    minute: number;
    ts: number;
}

export async function getTimeTree(
    sessionId: string,
    filters?: {
        search?: string;
        category?: string;
        sort?: string;
        order?: string;
        type?: string;
        regex?: boolean;
        caseSensitive?: boolean;
        signals?: string;
    }
): Promise<TimeTreeEntry[]> {
    let url = `/parse/${sessionId}/time-tree`;
    const params: string[] = [];
    if (filters) {
        if (filters.search) params.push(`search=${encodeURIComponent(filters.search)}`);
        if (filters.category) params.push(`category=${encodeURIComponent(filters.category)}`);
        if (filters.sort) params.push(`sort=${encodeURIComponent(filters.sort)}`);
        if (filters.order) params.push(`order=${encodeURIComponent(filters.order)}`);
        if (filters.type) params.push(`type=${encodeURIComponent(filters.type)}`);
        if (filters.regex) params.push('regex=true');
        if (filters.caseSensitive) params.push('caseSensitive=true');
        if (filters.signals) params.push(`signals=${encodeURIComponent(filters.signals)}`);
    }
    if (params.length > 0) url += '?' + params.join('&');
    return request<TimeTreeEntry[]>(url);
}

export async function getParseChunk(
    sessionId: string,
    start: number,
    end: number,
    signals?: string[]
): Promise<LogEntry[]> {
    // Use POST to avoid 414 URI Too Long when signals list is large
    const url = `/parse/${sessionId}/chunk?start=${start}&end=${end}`;
    const body = signals && signals.length > 0 ? { signals } : undefined;
    const res = await request<RawLogEntry[]>(url, {
        method: 'POST',
        body: body ? JSON.stringify(body) : undefined,
    });
    return res.map(transformEntry);
}

export async function getValuesAtTime(
    sessionId: string,
    ts: number,
    signals?: string[]
): Promise<LogEntry[]> {
    let url = `/parse/${sessionId}/at-time?ts=${ts}`;
    if (signals && signals.length > 0) {
        url += `&signals=${encodeURIComponent(signals.join(','))}`;
    }
    const res = await request<RawLogEntry[]>(url);
    return res.map(transformEntry);
}

/**
 * Boundary values response - contains last entry before viewport start
 * and first entry after viewport end for proper waveform continuity.
 */
export interface ChunkBoundaries {
    before: Record<string, LogEntry>;
    after: Record<string, LogEntry>;
}

/**
 * Get boundary values for waveform rendering.
 * Returns the last entry before start and first entry after end for each signal,
 * allowing waveforms to properly render signal state continuation.
 */
export async function getChunkBoundaries(
    sessionId: string,
    start: number,
    end: number,
    signals: string[]
): Promise<ChunkBoundaries> {
    const res = await request<{ before: Record<string, RawLogEntry>, after: Record<string, RawLogEntry> }>(
        `/parse/${sessionId}/chunk-boundaries`,
        {
            method: 'POST',
            body: JSON.stringify({ signals, start, end }),
        }
    );

    // Transform entries
    const before: Record<string, LogEntry> = {};
    const after: Record<string, LogEntry> = {};

    for (const [key, entry] of Object.entries(res.before)) {
        before[key] = transformEntry(entry);
    }
    for (const [key, entry] of Object.entries(res.after)) {
        after[key] = transformEntry(entry);
    }

    return { before, after };
}

/**
 * Send a keepalive ping to prevent session cleanup during long viewing sessions.
 * Call this periodically (e.g., every 2 minutes) when user is actively viewing
 * but not making data requests (e.g., paused on waveform view).
 */
export async function sessionKeepAlive(sessionId: string): Promise<void> {
    await request<void>(`/parse/${sessionId}/keepalive`, { method: 'POST' });
}

/**
 * Stream log entries via Server-Sent Events for progressive loading.
 * This allows displaying entries incrementally as they are received.
 * 
 * @param sessionId - The parse session ID
 * @param onBatch - Callback for each batch of entries received
 * @param onComplete - Callback when streaming is complete
 * @param onError - Callback for error handling
 * @returns AbortController to cancel the stream
 */
export function streamParseEntries(
    sessionId: string,
    onBatch: (entries: LogEntry[], progress: number, total: number) => void,
    onComplete: (total: number) => void,
    onError?: (error: string) => void
): AbortController {
    const controller = new AbortController();
    const url = `${API_BASE}/parse/${sessionId}/stream`;

    const eventSource = new EventSource(url);

    eventSource.onmessage = (event) => {
        try {
            const data = JSON.parse(event.data);

            if (data.error) {
                eventSource.close();
                onError?.(data.error);
                return;
            }

            if (data.done) {
                eventSource.close();
                onComplete(data.total);
            } else if (data.entries) {
                const entries = data.entries.map(transformEntry);
                onBatch(entries, data.progress, data.total);
            }
        } catch (err) {
            console.error('Failed to parse SSE data:', err);
        }
    };

    eventSource.onerror = () => {
        eventSource.close();
        onError?.('Stream connection error');
    };

    controller.signal.addEventListener('abort', () => eventSource.close());
    return controller;
}

// Map
export async function getMapLayout(): Promise<any> {
    return request<any>('/map/layout');
}

export async function uploadMapLayout(file: File): Promise<FileInfo> {
    const base64Data = await fileToBase64(file);

    const response = await fetch(`${API_BASE}/map/upload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            name: file.name,
            data: base64Data,
        }),
    });

    if (!response.ok) {
        const error = await response.json().catch(() => ({ error: 'Upload failed' }));
        throw new ApiError(response.status, error.error);
    }

    return response.json();
}

// Map Rules
export interface RulesInfo {
    id: string;
    name: string;
    uploadedAt: string;
    rulesCount: number;
    deviceCount: number;
}

export interface DeviceMapping {
    pattern: string;
    unitId: string;
}

export interface ColorRule {
    signal: string;
    op: string;
    value: string | number | boolean;
    color?: string;
    bgColor?: string;
    text?: string;
    textColor?: string;
    priority: number;
}

export interface MapRules {
    id?: string;
    name?: string;
    defaultColor: string;
    deviceToUnit: DeviceMapping[];
    rules: ColorRule[];
}

export async function uploadMapRules(file: File): Promise<RulesInfo> {
    const base64Data = await fileToBase64(file);

    const response = await fetch(`${API_BASE}/map/rules`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            name: file.name,
            data: base64Data,
        }),
    });

    if (!response.ok) {
        const error = await response.json().catch(() => ({ error: 'Upload failed' }));
        throw new ApiError(response.status, error.error);
    }

    return response.json();
}

export async function getMapRules(): Promise<MapRules> {
    return request<MapRules>('/map/rules');
}

export async function setActiveMap(id: string): Promise<void> {
    await request<void>('/map/active', {
        method: 'POST',
        body: JSON.stringify({ id }),
    });
}

export interface RecentMapFiles {
    xmlFiles: FileInfo[];
    yamlFiles: FileInfo[];
}

export async function getRecentMapFiles(): Promise<RecentMapFiles> {
    return request<RecentMapFiles>('/map/files/recent');
}

// Default Maps
export interface DefaultMapInfo {
    id: string;
    name: string;
}

export interface DefaultMapsResponse {
    maps: DefaultMapInfo[];
}

export async function getDefaultMaps(): Promise<DefaultMapsResponse> {
    return request<DefaultMapsResponse>('/map/defaults');
}

export async function loadDefaultMap(name: string): Promise<any> {
    return request<any>('/map/defaults/load', {
        method: 'POST',
        body: JSON.stringify({ name }),
    });
}


// Carrier Log
export interface CarrierLogInfo {
    loaded: boolean;
    sessionId?: string;
    status?: string;
    entryCount?: number;
}

export interface CarrierEntry {
    carrierId: string;
    unitId: string;
    timestamp: number;
}

export interface CarrierEntriesResponse {
    entries: CarrierEntry[];
    total: number;
}

export async function uploadCarrierLog(file: File): Promise<{ sessionId: string; fileId: string; fileName: string }> {
    const base64Data = await fileToBase64(file);

    const response = await fetch(`${API_BASE}/map/carrier-log`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            name: file.name,
            data: base64Data,
        }),
    });

    if (!response.ok) {
        const error = await response.json().catch(() => ({ error: 'Upload failed' }));
        throw new ApiError(response.status, error.error);
    }

    return response.json();
}

export async function getCarrierLog(): Promise<CarrierLogInfo> {
    return request<CarrierLogInfo>('/map/carrier-log');
}

export async function getCarrierEntries(): Promise<CarrierEntriesResponse> {
    return request<CarrierEntriesResponse>('/map/carrier-log/entries');
}
