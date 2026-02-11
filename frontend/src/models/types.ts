/**
 * TypeScript type definitions mirroring Go backend types.
 * Keep in sync with backend/internal/models/
 */

export type SignalType = 'boolean' | 'string' | 'integer';

export interface LogEntry {
    deviceId: string;
    signalName: string;
    timestamp: number; // Unix ms
    value: boolean | string | number;
    signalType: SignalType;
    category?: string; // Category from PLC debug format
}

export interface ParsedLog {
    entries: LogEntry[];
    signals: string[];
    devices: string[];
    timeRange: TimeRange | null;
}

export interface TimeRange {
    start: number; // Unix ms
    end: number;   // Unix ms
}

export type SessionStatus = 'pending' | 'parsing' | 'complete' | 'error';

export interface ParseSession {
    id: string;
    fileId: string;
    fileIds?: string[]; // All file IDs for merged sessions
    status: SessionStatus;
    progress: number; // 0-100
    entryCount?: number;
    signalCount?: number;
    processingTimeMs?: number;
    startTime?: number;
    endTime?: number;
    errors?: ParseError[];
}

export interface ParseError {
    line: number;
    content: string;
    reason: string;
}

export interface FileInfo {
    id: string;
    name: string;
    size: number;
    uploadedAt: string; // ISO date string
    status: 'uploaded' | 'parsing' | 'parsed' | 'error';
}

export interface HealthResponse {
    status: string;
}
