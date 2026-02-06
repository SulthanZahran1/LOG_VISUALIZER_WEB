import { useState, useMemo } from 'preact/hooks';
import {
    availableSignals,
    selectedSignals,
    toggleSignal,
    selectAllSignalsForDevice,
    deselectAllSignalsForDevice,
    showChangedInView,
    signalsWithChanges,
    signalSearchQuery,
    signalIsRegex,
    signalTypeFilter,
    filterPresets,
    savePreset,
    loadPreset,
    deletePreset,
    deviceColors,
    focusedSignal
} from '../../stores/waveformStore';
import { logEntries } from '../../stores/logStore';
import { ChevronRightIcon } from '../icons';
import type { SignalType } from '../../models/types';

export function SignalSidebar() {
    const [expandedDevices, setExpandedDevices] = useState<Set<string>>(new Set());
    const [presetName, setPresetName] = useState('');
    const [showSaveDialog, setShowSaveDialog] = useState(false);
    const [contextMenu, setContextMenu] = useState<{ visible: boolean, x: number, y: number, signalKey: string | null }>({
        visible: false,
        x: 0,
        y: 0,
        signalKey: null
    });

    // Build a map of signal key -> type
    const signalTypes = useMemo(() => {
        const types = new Map<string, SignalType>();
        for (const entry of logEntries.value) {
            const key = `${entry.deviceId}::${entry.signalName}`;
            if (!types.has(key)) {
                types.set(key, entry.signalType);
            }
        }
        return types;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [logEntries.value]);

    // Get all available signals grouped by device
    // Note: accessing .value inside useMemo creates reactivity; empty deps is intentional for signals
    const devices = useMemo(() => {
        const devicesMap = availableSignals.value;
        return Array.from(devicesMap.entries()).sort((a, b) => a[0].localeCompare(b[0]));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [availableSignals.value]);

    // Filter devices and signals based on search query, type filter, and "show changed"
    const filteredDevices = useMemo(() => {
        let result = devices;

        // "Show Changed" filter
        const activeChangedFilter = showChangedInView.value;
        const changedKeys = signalsWithChanges.value;

        if (activeChangedFilter) {
            result = result
                .map(([device, signals]) => {
                    const matchingSignals = signals.filter(s => {
                        const key = `${device}::${s}`;
                        return changedKeys.has(key);
                    });
                    return matchingSignals.length > 0 ? [device, matchingSignals] as [string, string[]] : null;
                })
                .filter((d): d is [string, string[]] => d !== null);
        }

        // Type filter
        if (signalTypeFilter.value !== 'all') {
            result = result
                .map(([device, signals]) => {
                    const matchingSignals = signals.filter(s => {
                        const key = `${device}::${s}`;
                        return signalTypes.get(key) === signalTypeFilter.value;
                    });
                    return matchingSignals.length > 0 ? [device, matchingSignals] as [string, string[]] : null;
                })
                .filter((d): d is [string, string[]] => d !== null);
        }

        // Text/regex filter
        if (signalSearchQuery.value) {
            try {
                const flags = 'i';
                const pattern = signalIsRegex.value
                    ? signalSearchQuery.value
                    : signalSearchQuery.value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                const regex = new RegExp(pattern, flags);

                result = result
                    .map(([device, signals]) => {
                        const matchingSignals = signals.filter(s =>
                            regex.test(s) || regex.test(device)
                        );
                        if (matchingSignals.length > 0 || regex.test(device)) {
                            return [device, regex.test(device) ? signals : matchingSignals] as [string, string[]];
                        }
                        return null;
                    })
                    .filter((d): d is [string, string[]] => d !== null);
            } catch {
                return [];
            }
        }

        return result;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [devices, signalSearchQuery.value, signalIsRegex.value, signalTypeFilter.value, signalTypes]);

    const toggleDevice = (device: string) => {
        const next = new Set(expandedDevices);
        if (next.has(device)) {
            next.delete(device);
        } else {
            next.add(device);
        }
        setExpandedDevices(next);
    };

    const isDeviceFullySelected = (device: string, signals: string[]) => {
        return signals.every(s => selectedSignals.value.includes(`${device}::${s}`));
    };

    const isDevicePartiallySelected = (device: string, signals: string[]) => {
        const selected = signals.filter(s => selectedSignals.value.includes(`${device}::${s}`));
        return selected.length > 0 && selected.length < signals.length;
    };

    const getDeviceSelectedCount = (device: string, signals: string[]) => {
        return signals.filter(s => selectedSignals.value.includes(`${device}::${s}`)).length;
    };

    const handleDeviceCheckbox = (device: string, signals: string[]) => {
        if (isDeviceFullySelected(device, signals)) {
            deselectAllSignalsForDevice(device);
        } else {
            selectAllSignalsForDevice(device);
        }
    };

    const handleSignalCheckbox = (device: string, signal: string) => {
        toggleSignal(device, signal);
    };

    const handleContextMenu = (e: MouseEvent, signalKey: string) => {
        e.preventDefault();
        setContextMenu({
            visible: true,
            x: e.clientX,
            y: e.clientY,
            signalKey
        });
    };

    const hideContextMenu = () => {
        setContextMenu({ ...contextMenu, visible: false });
    };

    const handleHideSignal = () => {
        if (contextMenu.signalKey) {
            const [device, signal] = contextMenu.signalKey.split('::');
            toggleSignal(device, signal);
        }
        hideContextMenu();
    };

    const handleShowOnly = () => {
        if (contextMenu.signalKey) {
            selectedSignals.value = [contextMenu.signalKey];
        }
        hideContextMenu();
    };

    // Auto-expand devices when searching
    useMemo(() => {
        if (signalSearchQuery.value) {
            setExpandedDevices(new Set(filteredDevices.map(([d]) => d)));
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [signalSearchQuery.value, filteredDevices]);

    const handleSavePreset = () => {
        if (presetName.trim()) {
            savePreset(presetName.trim());
            setPresetName('');
            setShowSaveDialog(false);
        }
    };

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
                        value={signalSearchQuery.value}
                        onInput={(e) => signalSearchQuery.value = (e.target as HTMLInputElement).value}
                    />
                    <button
                        class={`regex-toggle ${signalIsRegex.value ? 'active' : ''}`}
                        onClick={() => signalIsRegex.value = !signalIsRegex.value}
                        title="Regex Mode"
                    >.*</button>
                </div>
                <div class="filter-actions-bar">
                    <button class="action-btn" onClick={() => selectedSignals.value = []} title="Deselect All Signals">None</button>
                    <select
                        class="type-select"
                        value={signalTypeFilter.value}
                        onChange={(e) => signalTypeFilter.value = (e.target as HTMLSelectElement).value as SignalType | 'all'}
                    >
                        <option value="all">All Types</option>
                        <option value="boolean">Boolean</option>
                        <option value="string">String</option>
                        <option value="integer">Integer</option>
                    </select>
                </div>
                <div class="presets-bar">
                    <select
                        class="preset-select"
                        onChange={(e) => {
                            const val = (e.target as HTMLSelectElement).value;
                            if (val.startsWith('DELETE:')) {
                                deletePreset(val.replace('DELETE:', ''));
                                (e.target as HTMLSelectElement).value = "";
                                return;
                            }
                            const selected = filterPresets.value.find(p => p.name === val);
                            if (selected) loadPreset(selected);
                        }}
                        value=""
                    >
                        <option value="" disabled selected>Load Preset...</option>
                        {filterPresets.value.map(p => (
                            <optgroup key={p.name} label={p.name}>
                                <option value={p.name}>Load "{p.name}"</option>
                                <option value={`DELETE:${p.name}`}>Delete "{p.name}"</option>
                            </optgroup>
                        ))}
                    </select>
                    <button class="preset-btn" onClick={() => setShowSaveDialog(true)} title="Save Preset">+</button>
                </div>

                {showSaveDialog && (
                    <div class="preset-save-dialog">
                        <input
                            type="text"
                            placeholder="Preset name..."
                            value={presetName}
                            onInput={(e) => setPresetName((e.target as HTMLInputElement).value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleSavePreset()}
                        />
                        <button onClick={handleSavePreset}>Save</button>
                        <button onClick={() => setShowSaveDialog(false)}>Cancel</button>
                    </div>
                )}

                <div class="changed-filter-bar">
                    <label class="toggle-label">
                        <input
                            type="checkbox"
                            checked={showChangedInView.value}
                            onChange={(e) => showChangedInView.value = (e.target as HTMLInputElement).checked}
                        />
                        <span>Show signals with changes in view</span>
                    </label>
                </div>
            </div>
            <div class="signal-list">
                {filteredDevices.length === 0 ? (
                    <div class="empty-state">
                        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                            <path d="M3 12h4l3-9 4 18 3-9h4" />
                        </svg>
                        <p>
                            {signalSearchQuery.value
                                ? 'No matching signals.'
                                : 'No signals available.'}
                        </p>
                        {!signalSearchQuery.value && devices.length === 0 && (
                            <span class="hint">Load a log file to see available signals</span>
                        )}
                    </div>
                ) : (
                    filteredDevices.map(([device, signals]) => {
                        const isExpanded = expandedDevices.has(device);
                        const fullySelected = isDeviceFullySelected(device, signals);
                        const partiallySelected = isDevicePartiallySelected(device, signals);
                        const selectedCount = getDeviceSelectedCount(device, signals);

                        return (
                            <div class="device-group" key={device}>
                                <div class="device-header" onClick={() => toggleDevice(device)}>
                                    <div class="device-accent" style={{ backgroundColor: deviceColors.value.get(device) }} />
                                    <span class={`expand-icon ${isExpanded ? 'expanded' : ''}`}><ChevronRightIcon /></span>
                                    <input
                                        type="checkbox"
                                        class={partiallySelected ? 'indeterminate' : ''}
                                        checked={fullySelected}
                                        ref={(el) => { if (el) el.indeterminate = partiallySelected; }}
                                        onClick={(e) => { e.stopPropagation(); handleDeviceCheckbox(device, signals); }}
                                        onChange={() => { }}
                                    />
                                    <span class="device-name">{device}</span>
                                    <span class="device-count">{selectedCount}/{signals.length}</span>
                                </div>
                                {isExpanded && (
                                    <div class="signal-items">
                                        {signals.map(signal => {
                                            const isSelected = selectedSignals.value.includes(`${device}::${signal}`);
                                            const isFocused = focusedSignal.value === `${device}::${signal}`;
                                            return (
                                                <div
                                                    class={`signal-item ${isFocused ? 'focused' : ''}`}
                                                    key={signal}
                                                    onClick={() => focusedSignal.value = `${device}::${signal}`}
                                                    onContextMenu={(e) => handleContextMenu(e, `${device}::${signal}`)}
                                                >
                                                    <input
                                                        type="checkbox"
                                                        checked={isSelected}
                                                        onChange={(e) => {
                                                            e.stopPropagation();
                                                            handleSignalCheckbox(device, signal);
                                                        }}
                                                    />
                                                    <span class="signal-name">{signal}</span>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        );
                    })
                )}

                {contextMenu.visible && (
                    <div
                        class="context-menu"
                        style={{ left: contextMenu.x, top: contextMenu.y }}
                        onMouseLeave={hideContextMenu}
                    >
                        <div class="menu-item" onClick={handleHideSignal}>Hide Signal</div>
                        <div class="menu-item" onClick={handleShowOnly}>Show Only This</div>
                        <div class="menu-separator" />
                        <div class="menu-item danger" onClick={hideContextMenu}>Cancel</div>
                    </div>
                )}
            </div>

            <style>{`
                .signal-sidebar {
                    width: var(--sidebar-width, 280px);
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

                .type-filter-bar {
                    margin-top: var(--spacing-sm);
                }
                
                .filter-actions-bar {
                    display: flex;
                    gap: 6px;
                    margin-top: var(--spacing-sm);
                }

                .action-btn {
                    padding: 4px 8px;
                    background: var(--bg-primary);
                    border: 1px solid var(--border-color);
                    border-radius: var(--border-radius);
                    color: var(--text-secondary);
                    font-size: 11px;
                    cursor: pointer;
                    transition: all var(--transition-fast);
                }

                .action-btn:hover {
                    border-color: var(--primary-accent);
                    color: var(--text-primary);
                    background: var(--bg-hover);
                }

                .type-select {
                    width: 100%;
                    padding: 6px 8px;
                    font-size: 12px;
                    background: var(--bg-primary);
                    border: 1px solid var(--border-color);
                    border-radius: var(--border-radius);
                    color: var(--text-primary);
                    cursor: pointer;
                    outline: none;
                    transition: all var(--transition-fast);
                    flex: 1; /* Make it fill remaining space */
                }

                .type-select:hover {
                    border-color: var(--primary-accent);
                }

                .type-select:focus {
                    border-color: var(--primary-accent);
                    box-shadow: 0 0 0 3px rgba(77, 182, 226, 0.15);
                }

                .presets-bar {
                    display: flex;
                    gap: 4px;
                    margin-top: var(--spacing-sm);
                }

                .preset-select {
                    flex: 1;
                    font-size: 11px;
                    padding: 4px 6px;
                    background: var(--bg-primary);
                    border: 1px solid var(--border-color);
                    border-radius: 4px;
                    color: var(--text-primary);
                }

                .preset-btn {
                    padding: 4px 8px;
                    background: var(--bg-tertiary);
                    border: 1px solid var(--border-color);
                    border-radius: 4px;
                    color: var(--text-primary);
                    cursor: pointer;
                    font-size: 12px;
                }

                .preset-save-dialog {
                    display: flex;
                    gap: 4px;
                    margin-top: 4px;
                    padding: 4px;
                    background: var(--bg-tertiary);
                    border: 1px solid var(--border-color);
                    border-radius: 4px;
                }

                .preset-save-dialog input {
                    flex: 1;
                    font-size: 11px;
                    padding: 2px 4px;
                    background: var(--bg-primary);
                    border: 1px solid var(--border-color);
                    border-radius: 2px;
                    color: var(--text-primary);
                }

                .preset-save-dialog button {
                    font-size: 10px;
                    padding: 2px 4px;
                    cursor: pointer;
                }

                .changed-filter-bar {
                    margin-top: var(--spacing-sm);
                    padding-top: var(--spacing-sm);
                    border-top: 1px solid var(--border-color);
                }

                .toggle-label {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    font-size: 11px;
                    color: var(--text-secondary);
                    cursor: pointer;
                    user-select: none;
                }

                .toggle-label input {
                    width: 14px;
                    height: 14px;
                    accent-color: var(--primary-accent);
                }

                .signal-list {
                    flex: 1;
                    overflow-y: auto;
                }

                .device-group {
                    border-bottom: 1px solid var(--border-color);
                }

                .device-header {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    padding: 10px 12px;
                    cursor: pointer;
                    background: var(--bg-tertiary);
                    transition: background var(--transition-fast);
                }

                .device-header:hover {
                    background: var(--bg-hover);
                }

                .expand-icon {
                    font-size: 10px;
                    color: var(--text-muted);
                    transition: transform var(--transition-fast);
                }

                .expand-icon.expanded {
                    transform: rotate(90deg);
                }

                .device-header input[type="checkbox"] {
                    width: 16px;
                    height: 16px;
                    cursor: pointer;
                    accent-color: var(--primary-accent);
                    z-index: 1;
                }

                .device-accent {
                    width: 4px;
                    height: 20px;
                    border-radius: 2px;
                    flex-shrink: 0;
                }

                .device-name {
                    flex: 1;
                    font-size: 13px;
                    font-weight: 600;
                    color: var(--primary-accent);
                    white-space: nowrap;
                    overflow: hidden;
                    text-overflow: ellipsis;
                }

                .device-count {
                    font-size: 11px;
                    color: var(--text-muted);
                    font-weight: 500;
                }

                .signal-items {
                    padding: 4px 0;
                    background: var(--bg-primary);
                }

                .signal-item {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    padding: 6px 12px 6px 36px;
                    cursor: pointer;
                    transition: background var(--transition-fast);
                }

                .signal-item:hover {
                    background: var(--bg-hover);
                }

                .signal-item input[type="checkbox"] {
                    width: 14px;
                    height: 14px;
                    cursor: pointer;
                    accent-color: var(--primary-accent);
                }

                .signal-item .signal-name {
                    font-size: 12px;
                    color: var(--text-primary);
                    white-space: nowrap;
                    overflow: hidden;
                    text-overflow: ellipsis;
                }

                .signal-item.focused {
                    background: rgba(77, 182, 226, 0.1);
                    border-left: 2px solid var(--primary-accent);
                }

                .signal-item.focused .signal-name {
                    color: var(--primary-accent);
                    font-weight: 600;
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

                .context-menu {
                    position: fixed;
                    background: var(--bg-tertiary);
                    border: 1px solid var(--border-color);
                    border-radius: var(--border-radius);
                    padding: 4px;
                    min-width: 140px;
                    box-shadow: 0 4px 12px rgba(0,0,0,0.5);
                    z-index: 1000;
                }

                .menu-item {
                    padding: 8px 12px;
                    font-size: 12px;
                    color: var(--text-primary);
                    cursor: pointer;
                    border-radius: 2px;
                    transition: background 0.1s;
                }

                .menu-item:hover {
                    background: var(--bg-hover);
                    color: var(--primary-accent);
                }

                .menu-item.danger:hover {
                    color: var(--accent-error);
                }

                .menu-separator {
                    height: 1px;
                    background: var(--border-color);
                    margin: 4px 0;
                }
            `}</style>
        </div>
    );
}
