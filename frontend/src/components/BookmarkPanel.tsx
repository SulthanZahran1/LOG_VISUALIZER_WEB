/**
 * BookmarkPanel - Slide-out panel showing all bookmarks
 * Opens with Ctrl+Shift+B
 */
import {
    isBookmarkPanelOpen,
    removeBookmark,
    jumpToBookmark,
    toggleBookmarkPanel,
    sortedBookmarks
} from '../stores/bookmarkStore';

function formatTime(timeMs: number): string {
    const date = new Date(timeMs);
    return date.toISOString().substring(11, 23); // HH:MM:SS.mmm
}

export function BookmarkPanel() {
    if (!isBookmarkPanelOpen.value) return null;

    const items = sortedBookmarks.value;

    const handleBackdropClick = () => {
        toggleBookmarkPanel();
    };

    const handlePanelClick = (e: Event) => {
        e.stopPropagation();
    };

    return (
        <div class="bookmark-overlay" onClick={handleBackdropClick}>
            <div class="bookmark-panel" onClick={handlePanelClick}>
                <div class="bookmark-header">
                    <h2>Bookmarks</h2>
                    <button class="close-btn" onClick={toggleBookmarkPanel}>×</button>
                </div>

                <div class="bookmark-list">
                    {items.length === 0 ? (
                        <div class="bookmark-empty">
                            <p>No bookmarks yet</p>
                            <small>Press <kbd>Ctrl</kbd>+<kbd>B</kbd> to add a bookmark</small>
                        </div>
                    ) : (
                        items.map(bookmark => (
                            <div
                                key={bookmark.id}
                                class="bookmark-item"
                                onClick={() => jumpToBookmark(bookmark)}
                            >
                                <div class="bookmark-info">
                                    <span class="bookmark-time">{formatTime(bookmark.time)}</span>
                                    <span class="bookmark-name">{bookmark.name}</span>
                                </div>
                                <button
                                    class="bookmark-delete"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        removeBookmark(bookmark.id);
                                    }}
                                >
                                    ×
                                </button>
                            </div>
                        ))
                    )}
                </div>

                <div class="bookmark-footer">
                    <small>
                        <kbd>Ctrl</kbd>+<kbd>]</kbd> Next • <kbd>Ctrl</kbd>+<kbd>[</kbd> Previous
                    </small>
                </div>
            </div>

            <style>{`
                .bookmark-overlay {
                    position: fixed;
                    top: 0; left: 0; right: 0; bottom: 0;
                    background: rgba(0, 0, 0, 0.5);
                    backdrop-filter: blur(2px);
                    z-index: var(--z-modal);
                    display: flex;
                    justify-content: flex-end;
                }

                .bookmark-panel {
                    width: 320px;
                    max-width: 90%;
                    height: 100%;
                    background: var(--bg-secondary);
                    border-left: 1px solid var(--border-color);
                    display: flex;
                    flex-direction: column;
                    box-shadow: var(--shadow-lg);
                    animation: slideIn 0.2s ease-out;
                }

                @keyframes slideIn {
                    from { transform: translateX(100%); }
                    to { transform: translateX(0); }
                }

                .bookmark-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    padding: var(--spacing-md) var(--spacing-lg);
                    background: var(--bg-tertiary);
                    border-bottom: 1px solid var(--border-color);
                }

                .bookmark-header h2 {
                    margin: 0;
                    font-size: 16px;
                    font-weight: 600;
                    color: var(--text-primary);
                }

                .close-btn {
                    background: none;
                    border: none;
                    font-size: 20px;
                    color: var(--text-muted);
                    cursor: pointer;
                    padding: 4px 8px;
                    border-radius: 4px;
                }

                .close-btn:hover {
                    background: var(--bg-hover);
                    color: var(--text-primary);
                }

                .bookmark-list {
                    flex: 1;
                    overflow-y: auto;
                    padding: var(--spacing-sm);
                }

                .bookmark-empty {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: center;
                    height: 200px;
                    color: var(--text-muted);
                    text-align: center;
                }

                .bookmark-empty p {
                    margin: 0 0 var(--spacing-sm);
                    font-size: 14px;
                }

                .bookmark-empty small {
                    font-size: 11px;
                    opacity: 0.7;
                }

                .bookmark-empty kbd {
                    background: var(--bg-tertiary);
                    border: 1px solid var(--border-color);
                    border-radius: 3px;
                    padding: 1px 4px;
                    font-size: 10px;
                }

                .bookmark-item {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    padding: var(--spacing-sm) var(--spacing-md);
                    margin-bottom: 2px;
                    border-radius: var(--border-radius);
                    cursor: pointer;
                    transition: background var(--transition-fast);
                }

                .bookmark-item:hover {
                    background: var(--bg-hover);
                }

                .bookmark-info {
                    display: flex;
                    flex-direction: column;
                    gap: 2px;
                    overflow: hidden;
                }

                .bookmark-time {
                    font-family: var(--font-mono);
                    font-size: 12px;
                    color: var(--primary-accent);
                }

                .bookmark-name {
                    font-size: 13px;
                    color: var(--text-secondary);
                    white-space: nowrap;
                    overflow: hidden;
                    text-overflow: ellipsis;
                }

                .bookmark-delete {
                    background: none;
                    border: none;
                    color: var(--text-muted);
                    font-size: 16px;
                    cursor: pointer;
                    padding: 4px 8px;
                    border-radius: 4px;
                    opacity: 0;
                    transition: all var(--transition-fast);
                }

                .bookmark-item:hover .bookmark-delete {
                    opacity: 1;
                }

                .bookmark-delete:hover {
                    background: rgba(248, 81, 73, 0.2);
                    color: var(--accent-error);
                }

                .bookmark-footer {
                    padding: var(--spacing-sm) var(--spacing-md);
                    border-top: 1px solid var(--border-color);
                    background: var(--bg-tertiary);
                    text-align: center;
                }

                .bookmark-footer small {
                    font-size: 11px;
                    color: var(--text-muted);
                }

                .bookmark-footer kbd {
                    background: var(--bg-primary);
                    border: 1px solid var(--border-color);
                    border-radius: 3px;
                    padding: 1px 4px;
                    font-size: 10px;
                }
            `}</style>
        </div>
    );
}
