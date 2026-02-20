/**
 * Log Store (Legacy Entry Point)
 * 
 * ⚠️ This file is kept for backward compatibility.
 * 
 * The log store has been refactored into a modular structure:
 * - stores/log/state.ts - Signals and computed values
 * - stores/log/actions.ts - Action functions
 * - stores/log/effects.ts - Side effects
 * - stores/log/types.ts - TypeScript interfaces
 * - stores/log/index.ts - Main exports
 * 
 * Please import from 'stores/log' for new code.
 */

// Re-export everything from the modular store
export * from './log';

// Debug helper for browser console
import {
    currentSession, logEntries, totalEntries, isLoadingLog,
    searchQuery, searchRegex, searchCaseSensitive, showChangedOnly,
    isSyncEnabled
} from './log';

declare global {
    interface Window {
        logStore?: typeof logStoreDebug;
    }
}

const logStoreDebug = {
    currentSession,
    logEntries,
    totalEntries,
    isLoadingLog,
    searchQuery,
    searchRegex,
    searchCaseSensitive,
    showChangedOnly,
    isSyncEnabled
};

if (typeof window !== 'undefined') {
    window.logStore = logStoreDebug;
}
