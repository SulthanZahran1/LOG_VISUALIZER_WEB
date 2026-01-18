import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
    bookmarks,
    addBookmark,
    removeBookmark,
    renameBookmark,
    getNextBookmark,
    getPrevBookmark,
    sortedBookmarks,
    bookmarkNotification,
    isBookmarkPanelOpen,
    toggleBookmarkPanel
} from '../stores/bookmarkStore'

describe('bookmarkStore', () => {
    beforeEach(() => {
        // Reset state before each test
        bookmarks.value = [];
        bookmarkNotification.value = null;
        isBookmarkPanelOpen.value = false;
    });

    describe('addBookmark', () => {
        it('adds a bookmark with auto-generated name', () => {
            const time = 1700000000000; // Arbitrary timestamp
            const bookmark = addBookmark(time);

            expect(bookmark.time).toBe(time);
            expect(bookmark.name).toContain('Bookmark');
            expect(bookmark.id).toMatch(/^bm_/);
            expect(bookmarks.value).toHaveLength(1);
        });

        it('adds a bookmark with custom name', () => {
            const bookmark = addBookmark(1700000000000, 'My Bookmark');

            expect(bookmark.name).toBe('My Bookmark');
        });

        it('shows notification when bookmark is added', () => {
            addBookmark(1700000000000);

            expect(bookmarkNotification.value).not.toBeNull();
            expect(bookmarkNotification.value?.message).toContain('Bookmarked');
        });

        it('generates unique IDs for each bookmark', () => {
            const b1 = addBookmark(1000);
            const b2 = addBookmark(2000);

            expect(b1.id).not.toBe(b2.id);
        });
    });

    describe('removeBookmark', () => {
        it('removes a bookmark by ID', () => {
            const b1 = addBookmark(1000);
            addBookmark(2000);

            expect(bookmarks.value).toHaveLength(2);

            removeBookmark(b1.id);

            expect(bookmarks.value).toHaveLength(1);
            expect(bookmarks.value[0].time).toBe(2000);
        });

        it('does nothing if ID not found', () => {
            addBookmark(1000);

            removeBookmark('nonexistent');

            expect(bookmarks.value).toHaveLength(1);
        });
    });

    describe('renameBookmark', () => {
        it('renames a bookmark', () => {
            const b = addBookmark(1000, 'Original');

            renameBookmark(b.id, 'Renamed');

            expect(bookmarks.value[0].name).toBe('Renamed');
        });

        it('does nothing if ID not found', () => {
            addBookmark(1000, 'Original');

            renameBookmark('nonexistent', 'Renamed');

            expect(bookmarks.value[0].name).toBe('Original');
        });
    });

    describe('sortedBookmarks', () => {
        it('returns bookmarks sorted by time ascending', () => {
            addBookmark(3000, 'Third');
            addBookmark(1000, 'First');
            addBookmark(2000, 'Second');

            const sorted = sortedBookmarks.value;

            expect(sorted[0].name).toBe('First');
            expect(sorted[1].name).toBe('Second');
            expect(sorted[2].name).toBe('Third');
        });
    });

    describe('getNextBookmark', () => {
        it('returns the next bookmark after given time', () => {
            addBookmark(1000, 'First');
            addBookmark(2000, 'Second');
            addBookmark(3000, 'Third');

            const next = getNextBookmark(1500);

            expect(next?.name).toBe('Second');
        });

        it('returns null if no bookmark after given time', () => {
            addBookmark(1000, 'First');

            const next = getNextBookmark(2000);

            expect(next).toBeNull();
        });
    });

    describe('getPrevBookmark', () => {
        it('returns the previous bookmark before given time', () => {
            addBookmark(1000, 'First');
            addBookmark(2000, 'Second');
            addBookmark(3000, 'Third');

            const prev = getPrevBookmark(2500);

            expect(prev?.name).toBe('Second');
        });

        it('returns null if no bookmark before given time', () => {
            addBookmark(2000, 'First');

            const prev = getPrevBookmark(1000);

            expect(prev).toBeNull();
        });
    });

    describe('toggleBookmarkPanel', () => {
        it('toggles panel visibility', () => {
            expect(isBookmarkPanelOpen.value).toBe(false);

            toggleBookmarkPanel();
            expect(isBookmarkPanelOpen.value).toBe(true);

            toggleBookmarkPanel();
            expect(isBookmarkPanelOpen.value).toBe(false);
        });
    });
});
