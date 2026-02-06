/**
 * Bookmark Store - Manages time bookmarks for navigation
 * Bookmarks are file-scoped (persist per log file ID)
 */
import { signal, computed, effect } from '@preact/signals';
import { currentSession, activeTab, selectedLogTime } from './logStore';
import { jumpToTime as waveformJumpToTime, scrollOffset, viewRange, hoverTime } from './waveformStore';
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

// Notification State - for visual feedback when bookmark is added
export const bookmarkNotification = signal<{ message: string; time: number } | null>(null);
let notificationTimeout: number | null = null;

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

/** Show a brief notification message */
function showNotification(message: string, time: number): void {
    // Clear any existing notification timeout
    if (notificationTimeout !== null) {
        clearTimeout(notificationTimeout);
    }

    bookmarkNotification.value = { message, time };

    // Auto-hide after 2 seconds
    notificationTimeout = window.setTimeout(() => {
        bookmarkNotification.value = null;
        notificationTimeout = null;
    }, 2000);
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

    // Show visual feedback
    showNotification(`Bookmarked ${formatTimeForName(time)}`, time);

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

/** 
 * Get the current playback/view time from the currently active view.
 * Prioritizes time source based on which tab is active.
 */
export function getCurrentTime(): number {
    const currentView = activeTab.value;

    // Log Table: Use selected row's timestamp
    if (currentView === 'log-table') {
        if (selectedLogTime.value !== null) {
            return selectedLogTime.value;
        }
        // Fallback to session start if no row selected
        const session = currentSession.value;
        if (session?.startTime !== undefined) {
            return session.startTime;
        }
    }

    // Map Viewer: Use playback time
    if (currentView === 'map-viewer') {
        if (playbackTime.value !== null) {
            return playbackTime.value;
        }
        // Fallback to playback range start
        if (playbackStartTime.value !== null) {
            return playbackStartTime.value;
        }
    }

    // Waveform: Use cursor (hoverTime) - already snapped by WaveformCanvas
    if (currentView === 'waveform') {
        // First priority: cursor position (already snapped to signal changes)
        if (hoverTime.value !== null) {
            return hoverTime.value;
        }
        // Second: view center
        const range = viewRange.value;
        if (range) {
            return (range.start + range.end) / 2;
        }
        // Fallback to scrollOffset if valid
        if (scrollOffset.value > 1000000000) {
            return scrollOffset.value;
        }
    }

    // General fallbacks (for any view without specific time)

    // Try map playback time
    if (playbackTime.value !== null) {
        return playbackTime.value;
    }

    // Try waveform viewRange
    const range = viewRange.value;
    if (range) {
        return (range.start + range.end) / 2;
    }

    // Try selectedLogTime
    if (selectedLogTime.value !== null) {
        return selectedLogTime.value;
    }

    // Try scrollOffset if valid
    if (scrollOffset.value > 1000000000) {
        return scrollOffset.value;
    }

    // Try session start time
    const session = currentSession.value;
    if (session?.startTime !== undefined) {
        return session.startTime;
    }

    // Try playback range start
    if (playbackStartTime.value !== null) {
        return playbackStartTime.value;
    }

    // Absolute fallback
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
    const newValue = !isSyncEnabled.value;
    isSyncEnabled.value = newValue;
    
    // Perform initial sync when enabling
    if (newValue) {
        // Sync from current view to other views
        const currentView = activeTab.value;
        const currentTime = getCurrentTime();
        
        if (currentView === 'waveform' || currentView === 'map-viewer') {
            // Set sync source to prevent loops during initial sync
            syncSource = currentView === 'waveform' ? 'waveform' : 'map';
            
            // Sync to both views
            if (playbackStartTime.value !== null && playbackEndTime.value !== null) {
                playbackTime.value = Math.max(
                    playbackStartTime.value,
                    Math.min(currentTime, playbackEndTime.value)
                );
            }
            waveformJumpToTime(currentTime);
            syncTime.value = currentTime;
            
            // Clear sync source after a short delay
            setTimeout(() => { syncSource = null; }, 50);
        }
    }
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
