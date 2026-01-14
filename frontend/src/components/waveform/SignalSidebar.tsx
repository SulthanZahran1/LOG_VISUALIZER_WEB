import { selectedSignals, toggleSignal } from '../../stores/waveformStore';

export function SignalSidebar() {
    const signals = selectedSignals.value;

    return (
        <div class="signal-sidebar">
            <div class="sidebar-header">
                <h3>Signals</h3>
            </div>
            <div class="signal-list">
                {signals.length === 0 ? (
                    <div class="empty-state">No signals selected. Right-click a row in the Log Table to add signals.</div>
                ) : (
                    signals.map(key => {
                        const [device, signal] = key.split('::');
                        return (
                            <div class="signal-item" key={key}>
                                <div class="signal-info">
                                    <span class="device-name">{device}</span>
                                    <span class="signal-name">{signal}</span>
                                </div>
                                <button class="remove-btn" onClick={() => toggleSignal(device, signal)}>✕</button>
                            </div>
                        );
                    })
                )}
            </div>

            <style>{`
                .signal-sidebar {
                    width: 250px;
                    background: var(--bg-secondary);
                    border-right: 1px solid var(--border-color);
                    display: flex;
                    flex-direction: column;
                    flex-shrink: 0;
                }

                .sidebar-header {
                    padding: 8px 12px;
                    border-bottom: 1px solid var(--border-color);
                    background: var(--bg-tertiary);
                }

                .sidebar-header h3 {
                    margin: 0;
                    font-size: 12px;
                    text-transform: uppercase;
                    letter-spacing: 0.5px;
                    color: var(--text-muted);
                }

                .signal-list {
                    flex: 1;
                    overflow-y: auto;
                }

                .signal-item {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    padding: 8px 12px;
                    border-bottom: 1px solid var(--border-color);
                    font-size: 13px;
                    height: 48px; /* Fixed height to match canvas rows */
                }

                .signal-item:hover {
                    background: rgba(255, 255, 255, 0.03);
                }

                .signal-info {
                    display: flex;
                    flex-direction: column;
                    gap: 2px;
                    overflow: hidden;
                }

                .device-name {
                    font-size: 10px;
                    color: var(--accent-primary);
                    white-space: nowrap;
                    overflow: hidden;
                    text-overflow: ellipsis;
                }

                .signal-name {
                    font-weight: 500;
                    white-space: nowrap;
                    overflow: hidden;
                    text-overflow: ellipsis;
                }

                .remove-btn {
                    background: none;
                    border: none;
                    color: var(--text-muted);
                    cursor: pointer;
                    padding: 4px;
                    border-radius: 4px;
                }

                .remove-btn:hover {
                    color: #f44336;
                    background: rgba(244, 67, 54, 0.1);
                }

                .empty-state {
                    padding: 20px;
                    font-size: 11px;
                    color: var(--text-muted);
                    text-align: center;
                    line-height: 1.5;
                }
            `}</style>
        </div>
    );
}
