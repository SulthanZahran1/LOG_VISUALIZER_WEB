/**
 * TransitionView - Tact Time Analysis View
 * Displays configurable transition rules and calculated timing results
 */
import { useEffect } from 'preact/hooks';
import {
    transitionConfig,
    transitionStats,
    viewMode,
    resultFilter,
    isCalculating,
    initTransitionStore,
    calculateTransitions,
    setTransitionConfig,
    type TransitionConfig,
    type ViewMode
} from '../../stores/transitionStore';
import { currentSession } from '../../stores/logStore';
import { TransitionRuleEditor } from './TransitionRuleEditor';
import { TransitionTable } from './TransitionTable';
import { TransitionStats } from './TransitionStats';
import { TransitionTrend } from './TransitionTrend';
import { TransitionHistogram } from './TransitionHistogram';
import { useSignal } from '@preact/signals';

const VIEW_HELP_CONTENT: Record<ViewMode, { title: string; intuition: string; points: string[] }> = {
    table: {
        title: 'Table View',
        intuition: 'Use this when you need exact events and durations.',
        points: [
            'Each row is one detected transition in time order.',
            'Status helps spot outliers against your configured target/tolerance.',
            'Best view for auditing and exporting detailed records.'
        ]
    },
    stats: {
        title: 'Stats View',
        intuition: 'Use this to understand overall process stability.',
        points: [
            'Average and standard deviation summarize typical behavior and spread.',
            'Min/Max expose extreme fast/slow cycles.',
            'Target compliance shows how often process performance meets expectation.'
        ]
    },
    histogram: {
        title: 'Histogram View',
        intuition: 'Use this to see distribution shape at a glance.',
        points: [
            'Tall bars show the most frequent duration ranges.',
            'Wide spread indicates inconsistent timing.',
            'Target marker helps you judge where normal behavior sits versus goal.'
        ]
    },
    trend: {
        title: 'Trend View',
        intuition: 'Use this to track behavior over time.',
        points: [
            'Upward drift means cycle times are gradually getting slower.',
            'Step changes can indicate event/context shifts in production.',
            'Aggregation smooths noise so underlying trends are easier to read.'
        ]
    }
};

export function TransitionView() {
    const showEditor = useSignal(false);
    const editingConfig = useSignal<TransitionConfig | null>(null);
    const showHelp = useSignal(false);

    useEffect(() => {
        editingConfig.value = null;
        if (!transitionConfig.value) {
            // First visit: no config yet — reset to clean state and auto-open
            // the editor so the user can configure immediately.
            initTransitionStore();
            showEditor.value = !!currentSession.value;
        }
        // Returning via tab switch: preserve existing config and results.
    }, []);

    // Re-query the backend whenever the config or session changes.
    useEffect(() => {
        if (currentSession.value?.status === 'complete' && transitionConfig.value) {
            void calculateTransitions();
        }
    }, [
        currentSession.value?.id,
        currentSession.value?.status,
        transitionConfig.value
    ]);

    const handleOpenConfig = () => {
        editingConfig.value = transitionConfig.value;
        showEditor.value = true;
    };

    const handleSaveConfig = (config: TransitionConfig) => {
        setTransitionConfig(config);
        showEditor.value = false;
        editingConfig.value = null;
        // Recalculate after saving
        if (currentSession.value?.status === 'complete') {
            calculateTransitions();
        }
    };

    const handleCloseEditor = () => {
        showEditor.value = false;
        editingConfig.value = null;
    };

    const setViewMode = (mode: ViewMode) => {
        viewMode.value = mode;
    };

    const activeHelp = VIEW_HELP_CONTENT[viewMode.value];

    const formatCondition = (condition: string, value: string | number | boolean) => {
        const condMap: Record<string, string> = {
            'equals': '=', 'not-equals': '≠', 'greater': '>', 'less': '<', 'not-empty': '≠ empty'
        };
        const op = condMap[condition] ?? condition;
        return condition === 'not-empty' ? op : `${op} ${String(value)}`;
    };

    const renderConfigSummary = () => {
        const cfg = transitionConfig.value;
        if (!cfg) return null;

        const typeLabel: Record<string, string> = {
            'cycle': 'Cycle', 'a-to-b': 'A → B', 'value-populated': 'Value Populated'
        };

        const formatDuration = (ms: number) => {
            if (ms >= 60000) return `${(ms / 60000).toFixed(1)}m`;
            if (ms >= 1000) return `${(ms / 1000).toFixed(1)}s`;
            return `${ms}ms`;
        };

        return (
            <div class="config-summary">
                <span class="config-type-badge">{typeLabel[cfg.type] ?? cfg.type}</span>
                <div class="config-conditions">
                    <span class="config-signal">
                        <span class="config-label">Start</span>
                        <span class="config-device">{cfg.startDeviceId}</span>
                        <span class="config-sep">·</span>
                        <span class="config-signal-name">{cfg.startSignalName}</span>
                        <span class="config-cond">{formatCondition(cfg.startCondition, cfg.startValue)}</span>
                    </span>
                    {cfg.type === 'a-to-b' && cfg.endDeviceId && cfg.endSignalName && (
                        <>
                            <span class="config-arrow">→</span>
                            <span class="config-signal">
                                <span class="config-label">End</span>
                                <span class="config-device">{cfg.endDeviceId}</span>
                                <span class="config-sep">·</span>
                                <span class="config-signal-name">{cfg.endSignalName}</span>
                                <span class="config-cond">{formatCondition(cfg.endCondition!, cfg.endValue!)}</span>
                            </span>
                        </>
                    )}
                </div>
                {cfg.targetDuration !== undefined && (
                    <span class="config-target">
                        Target {formatDuration(cfg.targetDuration)}
                        {cfg.tolerance ? ` ±${formatDuration(cfg.tolerance)}` : ''}
                    </span>
                )}
            </div>
        );
    };

    const renderContent = () => {
        if (!currentSession.value) {
            return (
                <div class="empty-state">
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <path d="M12 8v4l3 3" />
                        <circle cx="12" cy="12" r="9" />
                    </svg>
                    <h3>No Log File Loaded</h3>
                    <p>Upload a log file from the Home view to analyze transitions.</p>
                </div>
            );
        }

        if (!transitionConfig.value) {
            return (
                <div class="empty-state">
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <path d="M12 5v14M5 12h14" />
                    </svg>
                    <h3>Configure Transition</h3>
                    <p>This transition view starts with a fresh single configuration.</p>
                    <button class="primary-btn" onClick={handleOpenConfig}>
                        Configure
                    </button>
                </div>
            );
        }

        if (isCalculating.value) {
            return (
                <div class="empty-state">
                    <div class="spinner" />
                    <p>Calculating transitions...</p>
                </div>
            );
        }

        switch (viewMode.value) {
            case 'table':
                return <TransitionTable />;
            case 'stats':
                return <TransitionStats stats={transitionStats.value} />;
            case 'histogram':
                return <TransitionHistogram />;
            case 'trend':
                return <TransitionTrend />;
            default:
                return <TransitionTable />;
        }
    };

    return (
        <div class="transition-view">
            <div class="transition-main">
                <div class="view-toolbar">
                    <div class="view-tabs">
                        <button
                            class={`view-tab ${viewMode.value === 'table' ? 'active' : ''}`}
                            onClick={() => setViewMode('table')}
                        >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <rect x="3" y="3" width="18" height="18" rx="2" />
                                <path d="M3 9h18M9 3v18" />
                            </svg>
                            Table
                        </button>
                        <button
                            class={`view-tab ${viewMode.value === 'stats' ? 'active' : ''}`}
                            onClick={() => setViewMode('stats')}
                        >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M18 20V10M12 20V4M6 20v-6" />
                            </svg>
                            Stats
                        </button>
                        <button
                            class={`view-tab ${viewMode.value === 'histogram' ? 'active' : ''}`}
                            onClick={() => setViewMode('histogram')}
                        >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <rect x="4" y="14" width="4" height="6" />
                                <rect x="10" y="8" width="4" height="12" />
                                <rect x="16" y="4" width="4" height="16" />
                            </svg>
                            Histogram
                        </button>
                        <button
                            class={`view-tab ${viewMode.value === 'trend' ? 'active' : ''}`}
                            onClick={() => setViewMode('trend')}
                        >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M3 12h4l3-9 4 18 3-9h4" />
                            </svg>
                            Trend
                        </button>
                    </div>

                    <div class="toolbar-right">
                        <div class="view-help">
                            <button
                                class="help-btn"
                                title={`Help: ${activeHelp.title}`}
                                aria-label={`Help for ${activeHelp.title}`}
                                onClick={() => showHelp.value = !showHelp.value}
                            >
                                ?
                            </button>
                            {showHelp.value && (
                                <div class="help-popover" role="dialog" aria-label={`${activeHelp.title} intuition`}>
                                    <div class="help-header">
                                        <h4>{activeHelp.title}</h4>
                                        <button
                                            class="help-close-btn"
                                            aria-label="Close help"
                                            onClick={() => showHelp.value = false}
                                        >
                                            ×
                                        </button>
                                    </div>
                                    <p>{activeHelp.intuition}</p>
                                    <ul>
                                        {activeHelp.points.map(point => (
                                            <li key={point}>{point}</li>
                                        ))}
                                    </ul>
                                </div>
                            )}
                        </div>
                        <button class="configure-btn" onClick={handleOpenConfig}>
                            {transitionConfig.value ? 'Edit Configuration' : 'Configure Transition'}
                        </button>
                        <select
                            value={resultFilter.value}
                            onChange={(e) => resultFilter.value = (e.target as HTMLSelectElement).value as 'all' | 'ok' | 'above' | 'below'}
                        >
                            <option value="all">All Results</option>
                            <option value="ok">Within Target</option>
                            <option value="above">Above Target</option>
                            <option value="below">Below Target</option>
                        </select>
                    </div>
                </div>

                <div class={`view-content${viewMode.value === 'table' ? ' view-content--flush' : ''}`}>
                    {renderConfigSummary()}
                    {renderContent()}
                </div>
            </div>

            {showEditor.value && (
                <TransitionRuleEditor
                    config={editingConfig.value}
                    onSave={handleSaveConfig}
                    onClose={handleCloseEditor}
                />
            )}

            <style>{`
                .transition-view {
                    height: 100%;
                    background: var(--bg-primary);
                }

                .transition-main {
                    display: flex;
                    flex-direction: column;
                    height: 100%;
                    min-width: 0;
                }

                .view-toolbar {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    padding: var(--spacing-sm) var(--spacing-md);
                    background: var(--bg-secondary);
                    border-bottom: 1px solid var(--border-color);
                }

                .view-tabs {
                    display: flex;
                    gap: 4px;
                }

                .view-tab {
                    display: flex;
                    align-items: center;
                    gap: 6px;
                    padding: 6px 12px;
                    background: transparent;
                    border: 1px solid transparent;
                    border-radius: 4px;
                    color: var(--text-secondary);
                    font-size: 12px;
                    cursor: pointer;
                    transition: all 0.15s;
                }

                .view-tab:hover {
                    background: var(--bg-tertiary);
                    color: var(--text-primary);
                }

                .view-tab.active {
                    background: var(--primary-accent);
                    color: white;
                    border-color: var(--primary-accent);
                }

                .toolbar-right {
                    display: flex;
                    align-items: center;
                    gap: var(--spacing-sm);
                }

                .view-help {
                    position: relative;
                }

                .help-btn {
                    background: transparent;
                    border: 1px solid transparent;
                    color: var(--text-secondary);
                    cursor: pointer;
                    font-size: 14px;
                    font-weight: 700;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    border-radius: 4px;
                    width: 32px;
                    height: 32px;
                    transition: all 0.15s;
                }

                .help-btn:hover {
                    background: var(--bg-tertiary);
                    color: var(--text-primary);
                    border-color: var(--border-color);
                }

                .help-popover {
                    position: absolute;
                    right: 0;
                    top: calc(100% + 8px);
                    z-index: 20;
                    width: min(360px, calc(100vw - 32px));
                    background: var(--bg-primary);
                    border: 1px solid var(--border-color);
                    border-radius: 8px;
                    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.28);
                    padding: 12px;
                }

                .help-header {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    margin-bottom: 8px;
                }

                .help-header h4 {
                    margin: 0;
                    font-size: 13px;
                    color: var(--text-primary);
                }

                .help-close-btn {
                    background: transparent;
                    border: none;
                    color: var(--text-muted);
                    cursor: pointer;
                    font-size: 16px;
                    line-height: 1;
                    padding: 0 4px;
                }

                .help-close-btn:hover {
                    color: var(--text-primary);
                }

                .help-popover p {
                    margin: 0 0 8px 0;
                    font-size: 12px;
                    color: var(--text-secondary);
                }

                .help-popover ul {
                    margin: 0;
                    padding-left: 18px;
                    color: var(--text-secondary);
                    font-size: 12px;
                    display: flex;
                    flex-direction: column;
                    gap: 6px;
                }

                .configure-btn {
                    background: transparent;
                    border: 1px solid var(--border-color);
                    border-radius: 4px;
                    padding: 6px 10px;
                    color: var(--text-secondary);
                    font-size: 12px;
                    cursor: pointer;
                }

                .configure-btn:hover {
                    background: var(--bg-tertiary);
                    color: var(--text-primary);
                }

                .toolbar-right select {
                    background: var(--bg-primary);
                    border: 1px solid var(--border-color);
                    border-radius: 4px;
                    padding: 6px 8px;
                    color: var(--text-primary);
                    font-size: 12px;
                }

                .view-content {
                    flex: 1;
                    overflow: auto;
                    padding: var(--spacing-md);
                    display: flex;
                    flex-direction: column;
                    gap: var(--spacing-md);
                }

                /* Table tab: no padding, content fills edge-to-edge like LogTable */
                .view-content--flush {
                    padding: 0;
                    gap: 0;
                    overflow: hidden;
                }

                .view-content--flush .config-summary {
                    margin: var(--spacing-sm) var(--spacing-md);
                    flex-shrink: 0;
                }

                /* Let .log-table-container grow into the remaining flex space */
                .view-content--flush .log-table-container {
                    flex: 1;
                    min-height: 0;
                    height: auto;
                }

                .config-summary {
                    display: flex;
                    align-items: center;
                    gap: var(--spacing-sm);
                    padding: 6px 10px;
                    background: var(--bg-secondary);
                    border: 1px solid var(--border-color);
                    border-radius: 6px;
                    flex-shrink: 0;
                    flex-wrap: wrap;
                }

                .config-type-badge {
                    font-size: 10px;
                    font-weight: 700;
                    text-transform: uppercase;
                    letter-spacing: 0.05em;
                    color: var(--primary-accent);
                    background: rgba(77, 182, 226, 0.1);
                    border: 1px solid rgba(77, 182, 226, 0.3);
                    border-radius: 4px;
                    padding: 2px 6px;
                    flex-shrink: 0;
                }

                .config-conditions {
                    display: flex;
                    align-items: center;
                    gap: var(--spacing-sm);
                    flex-wrap: wrap;
                    flex: 1;
                    min-width: 0;
                }

                .config-signal {
                    display: flex;
                    align-items: center;
                    gap: 5px;
                    font-size: 12px;
                    min-width: 0;
                }

                .config-label {
                    font-size: 10px;
                    font-weight: 600;
                    color: var(--text-muted);
                    text-transform: uppercase;
                    letter-spacing: 0.04em;
                    flex-shrink: 0;
                }

                .config-device {
                    font-family: var(--font-mono);
                    font-size: 11px;
                    color: var(--text-secondary);
                    overflow: hidden;
                    text-overflow: ellipsis;
                    white-space: nowrap;
                }

                .config-sep {
                    color: var(--text-muted);
                    flex-shrink: 0;
                }

                .config-signal-name {
                    font-family: var(--font-mono);
                    font-size: 12px;
                    font-weight: 600;
                    color: var(--text-primary);
                    flex-shrink: 0;
                }

                .config-cond {
                    font-family: var(--font-mono);
                    font-size: 11px;
                    color: var(--text-secondary);
                    background: var(--bg-tertiary);
                    border-radius: 3px;
                    padding: 1px 5px;
                    flex-shrink: 0;
                }

                .config-arrow {
                    color: var(--text-muted);
                    font-size: 12px;
                    flex-shrink: 0;
                }

                .config-target {
                    font-size: 11px;
                    font-family: var(--font-mono);
                    color: var(--text-secondary);
                    background: var(--bg-tertiary);
                    border-radius: 4px;
                    padding: 2px 7px;
                    flex-shrink: 0;
                    margin-left: auto;
                }

                .empty-state {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: center;
                    height: 100%;
                    color: var(--text-muted);
                    text-align: center;
                }

                .empty-state svg {
                    margin-bottom: var(--spacing-md);
                    opacity: 0.5;
                }

                .empty-state h3 {
                    margin: 0 0 var(--spacing-sm) 0;
                    color: var(--text-secondary);
                }

                .empty-state p {
                    margin: 0 0 var(--spacing-lg) 0;
                }

                .primary-btn {
                    background: var(--primary-accent);
                    border: none;
                    border-radius: 4px;
                    padding: 8px 16px;
                    color: white;
                    font-size: 13px;
                    cursor: pointer;
                }

                .primary-btn:hover {
                    filter: brightness(1.1);
                }

                .spinner {
                    width: 32px;
                    height: 32px;
                    border: 3px solid var(--border-color);
                    border-top-color: var(--primary-accent);
                    border-radius: 50%;
                    animation: spin 0.8s linear infinite;
                    margin-bottom: var(--spacing-md);
                }

                @keyframes spin {
                    to { transform: rotate(360deg); }
                }
            `}</style>
        </div>
    );
}
