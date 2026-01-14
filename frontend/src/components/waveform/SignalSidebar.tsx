import { useState, useMemo } from 'preact/hooks';
import { selectedSignals, toggleSignal } from '../../stores/waveformStore';

export function SignalSidebar() {
    const signals = selectedSignals.value;
    const [searchQuery, setSearchQuery] = useState('');
    const [isRegex, setIsRegex] = useState(false);

    const filteredSignals = useMemo(() => {
        if (!searchQuery) return signals;

        try {
            const flags = 'i';
            const pattern = isRegex
                ? searchQuery
                : searchQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const regex = new RegExp(pattern, flags);

            return signals.filter(key => regex.test(key));
        } catch (e) {
            return []; // Invalid regex or no match
        }
    }, [signals, searchQuery, isRegex]);

    return (
        <div class="signal-sidebar">
            <div class="sidebar-header">
                <h3>Signals</h3>
                <div class="search-bar">
                    <svg class="search-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="11" cy="11" r="8" />
                        <path d="m21 21-4.35-4.35" />
                    </svg>
                    <input
                        type="text"
                        placeholder="Filter signals..."
                        value={searchQuery}
                        onInput={(e) => setSearchQuery((e.target as HTMLInputElement).value)}
                    />
                    <button
                        class={`regex-toggle ${isRegex ? 'active' : ''}`}
                        onClick={() => setIsRegex(!isRegex)}
                        title="Regex Mode"
                    >.*</button>
                </div>
            </div>
            <div class="signal-list">
                {filteredSignals.length === 0 ? (
                    <div class="empty-state">
                        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                            <path d="M3 12h4l3-9 4 18 3-9h4" />
                        </svg>
                        <p>
                            {searchQuery
                                ? 'No matching signals.'
                                : 'No signals selected.'}
                        </p>
                        {!searchQuery && (
                            <span class="hint">Right-click a row in the Log Table and select "Add to Waveform"</span>
                        )}
                    </div>
                ) : (
                    filteredSignals.map(key => {
                        const [device, signal] = key.split('::');
                        return (
                            <div class="signal-item" key={key}>
                                <div class="signal-info">
                                    <span class="device-name">{device}</span>
                                    <span class="signal-name">{signal}</span>
                                </div>
                                <button class="remove-btn" onClick={() => toggleSignal(device, signal)} title="Remove signal">
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                        <line x1="18" y1="6" x2="6" y2="18" />
                                        <line x1="6" y1="6" x2="18" y2="18" />
                                    </svg>
                                </button>
                            </div>
                        );
                    })
                )}
            </div>

            <style>{`
                .signal-sidebar {
                    width: var(--sidebar-width, 250px);
                    background: var(--bg-secondary);
                    border-right: 1px solid var(--border-color);
                    display: flex;
                    flex-direction: column;
                    flex-shrink: 0;
                }

                .sidebar-header {
                    padding: var(--spacing-sm) var(--spacing-md);
                    border-bottom: 1px solid var(--border-color);
                    background: var(--bg-tertiary);
                }

                .sidebar-header h3 {
                    margin: 0 0 var(--spacing-sm) 0;
                    font-size: 11px;
                    text-transform: uppercase;
                    letter-spacing: 0.5px;
                    color: var(--text-muted);
                    font-weight: 600;
                }

                .search-bar {
                    display: flex;
                    align-items: center;
                    gap: var(--spacing-xs);
                    background: var(--bg-primary);
                    border: 1px solid var(--border-color);
                    border-radius: var(--border-radius);
                    padding: 4px 8px;
                }

                .search-bar:focus-within {
                    border-color: var(--primary-accent);
                    box-shadow: 0 0 0 3px rgba(77, 182, 226, 0.15);
                }

                .search-icon {
                    color: var(--text-muted);
                    flex-shrink: 0;
                }

                .search-bar input {
                    flex: 1;
                    background: none;
                    border: none;
                    color: var(--text-primary);
                    font-size: 12px;
                    outline: none;
                    padding: 4px;
                    min-width: 0;
                }

                .search-bar input::placeholder {
                    color: var(--text-muted);
                }

                .regex-toggle {
                    background: none;
                    border: none;
                    color: var(--text-muted);
                    font-family: var(--font-mono);
                    font-size: 11px;
                    cursor: pointer;
                    padding: 2px 6px;
                    border-radius: 4px;
                    font-weight: 600;
                    flex-shrink: 0;
                }

                .regex-toggle:hover {
                    color: var(--text-primary);
                    background: var(--bg-hover);
                }

                .regex-toggle.active {
                    color: var(--primary-accent);
                    background: rgba(77, 182, 226, 0.15);
                }

                .signal-list {
                    flex: 1;
                    overflow-y: auto;
                }

                .signal-item {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    padding: var(--spacing-sm) var(--spacing-md);
                    border-bottom: 1px solid var(--border-color);
                    height: 60px; /* Match canvas row height */
                    transition: background var(--transition-fast);
                }

                .signal-item:hover {
                    background: var(--bg-hover);
                }

                .signal-info {
                    display: flex;
                    flex-direction: column;
                    gap: 2px;
                    overflow: hidden;
                    min-width: 0;
                }

                .device-name {
                    font-size: 10px;
                    color: var(--primary-accent);
                    white-space: nowrap;
                    overflow: hidden;
                    text-overflow: ellipsis;
                    font-weight: 500;
                }

                .signal-name {
                    font-size: 13px;
                    font-weight: 500;
                    color: var(--text-primary);
                    white-space: nowrap;
                    overflow: hidden;
                    text-overflow: ellipsis;
                }

                .remove-btn {
                    background: none;
                    border: none;
                    color: var(--text-muted);
                    cursor: pointer;
                    padding: 6px;
                    border-radius: 4px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    flex-shrink: 0;
                    transition: all var(--transition-fast);
                }

                .remove-btn:hover {
                    color: var(--accent-error);
                    background: rgba(248, 81, 73, 0.15);
                }

                .empty-state {
                    padding: var(--spacing-xl);
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: center;
                    text-align: center;
                    gap: var(--spacing-md);
                    color: var(--text-muted);
                    height: 100%;
                }

                .empty-state svg {
                    opacity: 0.3;
                }

                .empty-state p {
                    font-size: 13px;
                    margin: 0;
                    color: var(--text-secondary);
                }

                .empty-state .hint {
                    font-size: 11px;
                    color: var(--text-muted);
                    line-height: 1.5;
                    max-width: 180px;
                }
            `}</style>
        </div>
    );
}
