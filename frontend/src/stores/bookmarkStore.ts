/**
 * Bookmark Store - Manages time bookmarks for navigation
 * Bookmarks are file-scoped (persist per log file ID)
 */
import { signal, computed, effect } from '@preact/signals';
import { currentSession } from './logStore';
import { jumpToTime as waveformJumpToTime, scrollOffset, viewRange } from './waveformStore';
import { playbackTime, playbackStartTime, playbackEndTime } from './mapStore';

// ============================================================================
// Types
// ============================================================================

export interface Bookmark {
    id: string;
    time: number;        // Unix ms timestamp
    name: string;        // User-defined or auto-generated
    color?: string;      // Optional color tag
    createdAt: number;   // When bookmark was created
}

// ============================================================================
// State
// ============================================================================

export const bookmarks = signal<Bookmark[]>([]);
export const isBookmarkPanelOpen = signal(false);

// Sync State - bidirectional time sync between views
export const isSyncEnabled = signal(false);
export const syncTime = signal<number | null>(null);
let syncSource: 'waveform' | 'map' | null = null;

// ============================================================================
// Persistence
// ============================================================================

const BOOKMARKS_PREFIX = 'plc_bookmarks_';

function getStorageKey(): string | null {
    const session = currentSession.value;
    if (!session?.fileId) return null;
    return `${BOOKMARKS_PREFIX}${session.fileId}`;
}

function loadBookmarks(): Bookmark[] {
    const key = getStorageKey();
    if (!key) return [];
    try {
        const stored = window.localStorage.getItem(key);
        return stored ? JSON.parse(stored) : [];
    } catch {
        return [];
    }
}

function saveBookmarks(items: Bookmark[]): void {
    const key = getStorageKey();
    if (!key) return;
    try {
        window.localStorage.setItem(key, JSON.stringify(items));
    } catch (e) {
        console.error('Failed to save bookmarks:', e);
    }
}

// Reload bookmarks when session changes
effect(() => {
    const session = currentSession.value;
    if (session?.fileId) {
        bookmarks.value = loadBookmarks();
    } else {
        bookmarks.value = [];
    }
});

// Auto-save on change
effect(() => {
    saveBookmarks(bookmarks.value);
});

// ============================================================================
// Computed
// ============================================================================

/** Bookmarks sorted by time ascending */
export const sortedBookmarks = computed(() =>
    [...bookmarks.value].sort((a, b) => a.time - b.time)
);

// ============================================================================
// Actions
// ============================================================================

let bookmarkCounter = 0;

function generateId(): string {
    return `bm_${Date.now()}_${++bookmarkCounter}`;
}

function formatTimeForName(timeMs: number): string {
    const date = new Date(timeMs);
    return date.toISOString().substring(11, 23); // HH:MM:SS.mmm
}

/** Add a bookmark at the given time */
export function addBookmark(time: number, name?: string): Bookmark {
    const bookmark: Bookmark = {
        id: generateId(),
        time,
        name: name || `Bookmark ${formatTimeForName(time)}`,
        createdAt: Date.now()
    };
    bookmarks.value = [...bookmarks.value, bookmark];
    return bookmark;
}

/** Remove a bookmark by ID */
export function removeBookmark(id: string): void {
    bookmarks.value = bookmarks.value.filter(b => b.id !== id);
}

/** Rename a bookmark */
export function renameBookmark(id: string, name: string): void {
    bookmarks.value = bookmarks.value.map(b =>
        b.id === id ? { ...b, name } : b
    );
}

/** Get the next bookmark after the given time */
export function getNextBookmark(currentTime: number): Bookmark | null {
    const sorted = sortedBookmarks.value;
    return sorted.find(b => b.time > currentTime) || null;
}

/** Get the previous bookmark before the given time */
export function getPrevBookmark(currentTime: number): Bookmark | null {
    const sorted = sortedBookmarks.value;
    for (let i = sorted.length - 1; i >= 0; i--) {
        if (sorted[i].time < currentTime) {
            return sorted[i];
        }
    }
    return null;
}

/** Get the current playback/view time from whichever view is active */
export function getCurrentTime(): number {
    // Prefer map playback time if available, else use waveform center
    if (playbackTime.value !== null) {
        return playbackTime.value;
    }
    const range = viewRange.value;
    if (range) {
        return (range.start + range.end) / 2;
    }
    return scrollOffset.value;
}

/** Jump to a bookmark's time in both views */
export function jumpToBookmark(bookmark: Bookmark): void {
    // Update waveform
    waveformJumpToTime(bookmark.time);

    // Update map playback if it has a range
    if (playbackStartTime.value !== null && playbackEndTime.value !== null) {
        playbackTime.value = Math.max(
            playbackStartTime.value,
            Math.min(bookmark.time, playbackEndTime.value)
        );
    }
}

/** Toggle the bookmark panel visibility */
export function toggleBookmarkPanel(): void {
    isBookmarkPanelOpen.value = !isBookmarkPanelOpen.value;
}

/** Jump to next bookmark from current time */
export function jumpToNextBookmark(): void {
    const next = getNextBookmark(getCurrentTime());
    if (next) jumpToBookmark(next);
}

/** Jump to previous bookmark from current time */
export function jumpToPrevBookmark(): void {
    const prev = getPrevBookmark(getCurrentTime());
    if (prev) jumpToBookmark(prev);
}

// ============================================================================
// Bidirectional Sync
// ============================================================================

/** Toggle sync mode */
export function toggleSync(): void {
    isSyncEnabled.value = !isSyncEnabled.value;
}

/** Sync waveform time to map */
export function syncFromWaveform(time: number): void {
    if (!isSyncEnabled.value) return;
    if (syncSource === 'map') return; // Prevent loops

    syncSource = 'waveform';
    if (playbackStartTime.value !== null && playbackEndTime.value !== null) {
        playbackTime.value = Math.max(
            playbackStartTime.value,
            Math.min(time, playbackEndTime.value)
        );
    }
    syncTime.value = time;
    setTimeout(() => { syncSource = null; }, 50);
}

/** Sync map time to waveform */
export function syncFromMap(time: number): void {
    if (!isSyncEnabled.value) return;
    if (syncSource === 'waveform') return; // Prevent loops

    syncSource = 'map';
    waveformJumpToTime(time);
    syncTime.value = time;
    setTimeout(() => { syncSource = null; }, 50);
}

// ============================================================================
// Debug
// ============================================================================

declare global {
    interface Window {
        bookmarkStore?: typeof bookmarkStoreDebug;
    }
}

const bookmarkStoreDebug = {
    bookmarks,
    sortedBookmarks,
    isBookmarkPanelOpen,
    isSyncEnabled,
    syncTime,
    addBookmark,
    removeBookmark,
    jumpToNextBookmark,
    jumpToPrevBookmark
};

if (typeof window !== 'undefined') {
    window.bookmarkStore = bookmarkStoreDebug;
}

// Effect: sync waveform scroll to map playback when sync is enabled
let lastSyncedWaveformTime: number | null = null;
effect(() => {
    if (!isSyncEnabled.value) return;

    const range = viewRange.value;
    if (!range) return;

    // Use center of waveform view
    const centerTime = (range.start + range.end) / 2;

    // Don't sync if we just received a sync from map
    if (syncSource === 'map') return;

    // Debounce: don't sync if time hasn't changed meaningfully (>100ms)
    if (lastSyncedWaveformTime !== null && Math.abs(centerTime - lastSyncedWaveformTime) < 100) {
        return;
    }

    lastSyncedWaveformTime = centerTime;

    // Update map playback time
    syncSource = 'waveform';
    if (playbackStartTime.value !== null && playbackEndTime.value !== null) {
        playbackTime.value = Math.max(
            playbackStartTime.value,
            Math.min(centerTime, playbackEndTime.value)
        );
    }
    setTimeout(() => { syncSource = null; }, 50);
});
