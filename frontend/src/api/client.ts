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

export async function getRecentFiles(): Promise<FileInfo[]> {
    return request<FileInfo[]>('/files/recent');
}

export async function getFile(id: string): Promise<FileInfo> {
    return request<FileInfo>(`/files/${id}`);
}

export async function deleteFile(id: string): Promise<void> {
    await request<void>(`/files/${id}`, { method: 'DELETE' });
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

export interface PaginatedEntries {
    entries: LogEntry[];
    total: number;
    page: number;
    pageSize: number;
}

function transformEntry(e: any): LogEntry {
    return {
        ...e,
        timestamp: new Date(e.timestamp).getTime()
    };
}

export async function getParseEntries(
    sessionId: string,
    page: number = 1,
    pageSize: number = 100
): Promise<PaginatedEntries> {
    const res = await request<any>(
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
    const res = await request<any[]>(
        `/parse/${sessionId}/chunk?start=${start}&end=${end}`
    );
    return res.map(transformEntry);
}
