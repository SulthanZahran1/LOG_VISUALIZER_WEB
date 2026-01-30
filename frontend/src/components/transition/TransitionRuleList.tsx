/**
 * TransitionRuleList - Displays list of transition rules in sidebar
 */
import type { TransitionRule } from '../../stores/transitionStore';

interface TransitionRuleListProps {
    rules: TransitionRule[];
    selectedId: string | null;
    onSelect: (id: string | null) => void;
    onEdit: (rule: TransitionRule) => void;
    onDelete: (id: string) => void;
}

export function TransitionRuleList({ rules, selectedId, onSelect, onEdit, onDelete }: TransitionRuleListProps) {
    if (rules.length === 0) {
        return (
            <div class="rule-list-empty">
                <p>No rules defined yet.</p>
            </div>
        );
    }

    const getRuleTypeLabel = (type: string) => {
        switch (type) {
            case 'cycle': return 'Cycle Time';
            case 'a-to-b': return 'A→B';
            case 'value-populated': return 'Value Pop';
            default: return type;
        }
    };

    const formatDuration = (ms?: number) => {
        if (!ms) return '—';
        if (ms >= 60000) return `${(ms / 60000).toFixed(1)}m`;
        if (ms >= 1000) return `${(ms / 1000).toFixed(1)}s`;
        return `${ms}ms`;
    };

    return (
        <div class="rule-list">
            {rules.map(rule => (
                <div
                    key={rule.id}
                    class={`rule-item ${selectedId === rule.id ? 'selected' : ''} ${!rule.enabled ? 'disabled' : ''}`}
                    onClick={() => onSelect(selectedId === rule.id ? null : rule.id)}
                >
                    <div class="rule-header">
                        <span class="rule-name">{rule.name}</span>
                        <span class={`rule-type type-${rule.type}`}>{getRuleTypeLabel(rule.type)}</span>
                    </div>
                    <div class="rule-details">
                        <span class="rule-signal">{rule.startSignal}</span>
                        {rule.targetDuration && (
                            <span class="rule-target">
                                Target: {formatDuration(rule.targetDuration)}
                                {rule.tolerance && ` ±${formatDuration(rule.tolerance)}`}
                            </span>
                        )}
                    </div>
                    <div class="rule-actions">
                        <button
                            class="action-btn"
                            onClick={(e) => { e.stopPropagation(); onEdit(rule); }}
                            title="Edit"
                        >
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                            </svg>
                        </button>
                        <button
                            class="action-btn danger"
                            onClick={(e) => { e.stopPropagation(); onDelete(rule.id); }}
                            title="Delete"
                        >
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                            </svg>
                        </button>
                    </div>
                </div>
            ))}

            <style>{`
                .rule-list {
                    flex: 1;
                    overflow-y: auto;
                    padding: var(--spacing-sm);
                }

                .rule-list-empty {
                    padding: var(--spacing-lg);
                    text-align: center;
                    color: var(--text-muted);
                    font-size: 12px;
                }

                .rule-item {
                    background: var(--bg-primary);
                    border: 1px solid var(--border-color);
                    border-radius: 6px;
                    padding: var(--spacing-sm);
                    margin-bottom: var(--spacing-sm);
                    cursor: pointer;
                    transition: all 0.15s;
                }

                .rule-item:hover {
                    border-color: var(--primary-accent);
                }

                .rule-item.selected {
                    border-color: var(--primary-accent);
                    background: rgba(66, 133, 244, 0.1);
                }

                .rule-item.disabled {
                    opacity: 0.5;
                }

                .rule-header {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    margin-bottom: 4px;
                }

                .rule-name {
                    font-weight: 600;
                    font-size: 12px;
                    color: var(--text-primary);
                }

                .rule-type {
                    font-size: 10px;
                    padding: 2px 6px;
                    border-radius: 3px;
                    background: var(--bg-tertiary);
                    color: var(--text-secondary);
                }

                .rule-type.type-cycle { background: #34A853; color: white; }
                .rule-type.type-a-to-b { background: #4285F4; color: white; }
                .rule-type.type-value-populated { background: #FBBC04; color: #1a1a1a; }

                .rule-details {
                    display: flex;
                    flex-direction: column;
                    gap: 2px;
                    font-size: 11px;
                    color: var(--text-muted);
                }

                .rule-signal {
                    font-family: var(--font-mono);
                    color: var(--text-secondary);
                }

                .rule-target {
                    color: var(--text-muted);
                }

                .rule-actions {
                    display: flex;
                    gap: 4px;
                    margin-top: var(--spacing-sm);
                    padding-top: var(--spacing-sm);
                    border-top: 1px solid var(--border-color);
                }

                .action-btn {
                    background: transparent;
                    border: none;
                    padding: 4px;
                    cursor: pointer;
                    color: var(--text-muted);
                    border-radius: 3px;
                }

                .action-btn:hover {
                    background: var(--bg-tertiary);
                    color: var(--text-primary);
                }

                .action-btn.danger:hover {
                    background: rgba(234, 67, 53, 0.2);
                    color: #EA4335;
                }
            `}</style>
        </div>
    );
}
