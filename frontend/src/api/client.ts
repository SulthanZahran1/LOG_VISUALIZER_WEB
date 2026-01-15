/**
 * API Client for PLC Log Visualizer backend
 * Base URL configured for dev server proxy
 */

import type { FileInfo, ParseSession, HealthResponse, LogEntry } from '../models/types';

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
    const formData = new FormData();
    formData.append('file', file);

    const response = await fetch(`${API_BASE}/files/upload`, {
        method: 'POST',
        body: formData,
    });

    if (!response.ok) {
        const error = await response.json().catch(() => ({ error: 'Upload failed' }));
        throw new ApiError(response.status, error.error);
    }

    return response.json();
}

/**
 * Uploads a file in chunks to bypass server body limits.
 */
export async function uploadFileChunked(
    file: File,
    onProgress?: (progress: number) => void
): Promise<FileInfo> {
    const CHUNK_SIZE = 1 * 1024 * 1024; // 1MB chunks (Nginx default limit safe)
    const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
    const uploadId = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

    for (let i = 0; i < totalChunks; i++) {
        const start = i * CHUNK_SIZE;
        const end = Math.min(start + CHUNK_SIZE, file.size);
        const chunk = file.slice(start, end);

        const formData = new FormData();
        formData.append('file', chunk);
        formData.append('uploadId', uploadId);
        formData.append('chunkIndex', i.toString());

        const response = await fetch(`${API_BASE}/files/upload/chunk`, {
            method: 'POST',
            body: formData,
        });

        if (!response.ok) {
            const error = await response.json().catch(() => ({ error: 'Chunk upload failed' }));
            throw new ApiError(response.status, error.error || `Chunk ${i} failed`);
        }

        if (onProgress) {
            onProgress(Math.round(((i + 1) / totalChunks) * 100));
        }
    }

    // Complete upload
    return request<FileInfo>('/files/upload/complete', {
        method: 'POST',
        body: JSON.stringify({
            uploadId,
            name: file.name,
            totalChunks,
        }),
    });
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

export async function getParseStatus(sessionId: string): Promise<ParseSession> {
    return request<ParseSession>(`/parse/${sessionId}/status`);
}

export async function getParseSignals(sessionId: string): Promise<string[]> {
    return request<string[]>(`/parse/${sessionId}/signals`);
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
    pageSize: number = 100
): Promise<PaginatedEntries> {
    const res = await request<RawPaginatedEntries>(
        `/parse/${sessionId}/entries?page=${page}&pageSize=${pageSize}`
    );
    return {
        ...res,
        entries: res.entries.map(transformEntry)
    };
}

export async function getParseChunk(
    sessionId: string,
    start: number,
    end: number
): Promise<LogEntry[]> {
    const res = await request<RawLogEntry[]>(
        `/parse/${sessionId}/chunk?start=${start}&end=${end}`
    );
    return res.map(transformEntry);
}

// Map
export async function getMapLayout(): Promise<any> {
    return request<any>('/map/layout');
}

export async function uploadMapLayout(file: File): Promise<FileInfo> {
    const formData = new FormData();
    formData.append('file', file);

    const response = await fetch(`${API_BASE}/map/upload`, {
        method: 'POST',
        body: formData,
    });

    if (!response.ok) {
        const error = await response.json().catch(() => ({ error: 'Upload failed' }));
        throw new ApiError(response.status, error.error);
    }

    return response.json();
}
