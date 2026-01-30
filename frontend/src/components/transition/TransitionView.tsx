/**
 * TransitionView - Tact Time Analysis View
 * Displays configurable transition rules and calculated timing results
 */
import { useEffect } from 'preact/hooks';
import {
    transitionRules,
    statisticsByRule,
    viewMode,
    resultFilter,
    selectedRuleId,
    isCalculating,
    initTransitionStore,
    calculateTransitions,
    addRule,
    updateRule,
    deleteRule,
    selectRule,
    type TransitionRule,
    type ViewMode
} from '../../stores/transitionStore';
import { currentSession } from '../../stores/logStore';
import { TransitionRuleList } from './TransitionRuleList';
import { TransitionRuleEditor } from './TransitionRuleEditor';
import { TransitionTable } from './TransitionTable';
import { TransitionStats } from './TransitionStats';
import { TransitionTrend } from './TransitionTrend';
import { TransitionHistogram } from './TransitionHistogram';
import { useSignal } from '@preact/signals';

export function TransitionView() {
    const showEditor = useSignal(false);
    const editingRule = useSignal<TransitionRule | null>(null);

    useEffect(() => {
        initTransitionStore();
    }, []);

    // Recalculate when session completes
    useEffect(() => {
        if (currentSession.value?.status === 'complete') {
            calculateTransitions();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const handleAddRule = () => {
        editingRule.value = null;
        showEditor.value = true;
    };

    const handleEditRule = (rule: TransitionRule) => {
        editingRule.value = rule;
        showEditor.value = true;
    };

    const handleSaveRule = (rule: Omit<TransitionRule, 'id'> | TransitionRule) => {
        if ('id' in rule) {
            // Update existing rule
            updateRule(rule.id, rule);
        } else {
            // Add new rule
            addRule(rule);
        }
        showEditor.value = false;
        editingRule.value = null;
        // Recalculate after saving
        if (currentSession.value?.status === 'complete') {
            calculateTransitions();
        }
    };

    const handleDeleteRule = (id: string) => {
        deleteRule(id);
    };

    const handleCloseEditor = () => {
        showEditor.value = false;
        editingRule.value = null;
    };

    const setViewMode = (mode: ViewMode) => {
        viewMode.value = mode;
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

        if (transitionRules.value.length === 0) {
            return (
                <div class="empty-state">
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <path d="M12 5v14M5 12h14" />
                    </svg>
                    <h3>No Transition Rules</h3>
                    <p>Create a rule to start measuring tact times.</p>
                    <button class="primary-btn" onClick={handleAddRule}>
                        Add Rule
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
                return <TransitionStats stats={statisticsByRule.value} />;
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
            <div class="transition-sidebar">
                <div class="sidebar-header">
                    <h3>Transition Rules</h3>
                    <button class="icon-btn" onClick={handleAddRule} title="Add Rule">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M12 5v14M5 12h14" />
                        </svg>
                    </button>
                </div>
                <TransitionRuleList
                    rules={transitionRules.value}
                    selectedId={selectedRuleId.value}
                    onSelect={selectRule}
                    onEdit={handleEditRule}
                    onDelete={handleDeleteRule}
                />
            </div>

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

                    <div class="filter-controls">
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

                <div class="view-content">
                    {renderContent()}
                </div>
            </div>

            {showEditor.value && (
                <TransitionRuleEditor
                    rule={editingRule.value}
                    onSave={handleSaveRule}
                    onClose={handleCloseEditor}
                />
            )}

            <style>{`
                .transition-view {
                    display: flex;
                    height: 100%;
                    background: var(--bg-primary);
                }

                .transition-sidebar {
                    width: 280px;
                    flex-shrink: 0;
                    background: var(--bg-secondary);
                    border-right: 1px solid var(--border-color);
                    display: flex;
                    flex-direction: column;
                }

                .sidebar-header {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    padding: var(--spacing-md);
                    border-bottom: 1px solid var(--border-color);
                }

                .sidebar-header h3 {
                    margin: 0;
                    font-size: 13px;
                    font-weight: 600;
                    color: var(--text-primary);
                }

                .icon-btn {
                    background: transparent;
                    border: 1px solid var(--border-color);
                    border-radius: 4px;
                    padding: 4px;
                    cursor: pointer;
                    color: var(--text-secondary);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                }

                .icon-btn:hover {
                    background: var(--bg-tertiary);
                    color: var(--primary-accent);
                }

                .transition-main {
                    flex: 1;
                    display: flex;
                    flex-direction: column;
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

                .filter-controls select {
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
