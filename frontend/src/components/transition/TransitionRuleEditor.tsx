/**
 * TransitionRuleEditor - Modal for creating/editing transition rules
 */
import { useSignal, useComputed } from '@preact/signals';
import type { TransitionRule, RuleType, ConditionType } from '../../stores/transitionStore';
import { logEntries } from '../../stores/logStore';

interface TransitionRuleEditorProps {
    rule: TransitionRule | null;
    onSave: (rule: Omit<TransitionRule, 'id'> | TransitionRule) => void;
    onClose: () => void;
}

export function TransitionRuleEditor({ rule, onSave, onClose }: TransitionRuleEditorProps) {
    const isEditing = !!rule;

    // Form state
    const name = useSignal(rule?.name ?? '');
    const type = useSignal<RuleType>(rule?.type ?? 'cycle');
    const enabled = useSignal(rule?.enabled ?? true);

    const startSignal = useSignal(rule?.startSignal ?? '');
    const startCondition = useSignal<ConditionType>(rule?.startCondition ?? 'equals');
    const startValue = useSignal<string>(String(rule?.startValue ?? 'true'));

    const endSignal = useSignal(rule?.endSignal ?? '');
    const endCondition = useSignal<ConditionType>(rule?.endCondition ?? 'equals');
    const endValue = useSignal<string>(String(rule?.endValue ?? 'true'));

    const targetDuration = useSignal(rule?.targetDuration ? String(rule.targetDuration / 1000) : '');
    const tolerance = useSignal(rule?.tolerance ? String(rule.tolerance / 1000) : '');

    // Get available signals from log entries
    const availableSignals = useComputed(() => {
        const signals = new Set<string>();
        for (const entry of logEntries.value) {
            signals.add(`${entry.deviceId}::${entry.signalName}`);
        }
        return Array.from(signals).sort();
    });

    const handleSubmit = (e: Event) => {
        e.preventDefault();

        const ruleData: Omit<TransitionRule, 'id'> = {
            name: name.value || 'Unnamed Rule',
            type: type.value,
            enabled: enabled.value,
            startSignal: startSignal.value,
            startCondition: startCondition.value,
            startValue: parseValue(startValue.value),
            endSignal: type.value === 'a-to-b' ? endSignal.value : undefined,
            endCondition: type.value === 'a-to-b' ? endCondition.value : undefined,
            endValue: type.value === 'a-to-b' ? parseValue(endValue.value) : undefined,
            targetDuration: targetDuration.value ? parseFloat(targetDuration.value) * 1000 : undefined,
            tolerance: tolerance.value ? parseFloat(tolerance.value) * 1000 : undefined
        };

        if (isEditing && rule) {
            onSave({ ...ruleData, id: rule.id });
        } else {
            onSave(ruleData);
        }
    };

    const parseValue = (val: string): string | number | boolean => {
        if (val === 'true') return true;
        if (val === 'false') return false;
        const num = parseFloat(val);
        if (!isNaN(num)) return num;
        return val;
    };

    return (
        <div class="modal-overlay" onClick={onClose}>
            <div class="modal-content" onClick={(e) => e.stopPropagation()}>
                <div class="modal-header">
                    <h2>{isEditing ? 'Edit Rule' : 'Create Transition Rule'}</h2>
                    <button class="close-btn" onClick={onClose}>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M18 6L6 18M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                <form onSubmit={handleSubmit}>
                    <div class="form-group">
                        <label>Rule Name</label>
                        <input
                            type="text"
                            value={name.value}
                            onInput={(e) => name.value = (e.target as HTMLInputElement).value}
                            placeholder="e.g., Cycle Time"
                        />
                    </div>

                    <div class="form-group">
                        <label>Rule Type</label>
                        <div class="radio-group">
                            <label class={`radio-option ${type.value === 'cycle' ? 'selected' : ''}`}>
                                <input
                                    type="radio"
                                    name="type"
                                    value="cycle"
                                    checked={type.value === 'cycle'}
                                    onChange={() => type.value = 'cycle'}
                                />
                                <span class="radio-label">
                                    <strong>Cycle Time (A→A)</strong>
                                    <small>Time between consecutive occurrences</small>
                                </span>
                            </label>
                            <label class={`radio-option ${type.value === 'a-to-b' ? 'selected' : ''}`}>
                                <input
                                    type="radio"
                                    name="type"
                                    value="a-to-b"
                                    checked={type.value === 'a-to-b'}
                                    onChange={() => type.value = 'a-to-b'}
                                />
                                <span class="radio-label">
                                    <strong>A→B Transition</strong>
                                    <small>Time from Signal A to Signal B</small>
                                </span>
                            </label>
                            <label class={`radio-option ${type.value === 'value-populated' ? 'selected' : ''}`}>
                                <input
                                    type="radio"
                                    name="type"
                                    value="value-populated"
                                    checked={type.value === 'value-populated'}
                                    onChange={() => type.value = 'value-populated'}
                                />
                                <span class="radio-label">
                                    <strong>Value Populated</strong>
                                    <small>Time until string gets a value</small>
                                </span>
                            </label>
                        </div>
                    </div>

                    <fieldset class="condition-fieldset">
                        <legend>{type.value === 'a-to-b' ? 'Start Condition' : 'Signal Condition'}</legend>
                        <div class="condition-row">
                            <div class="form-group">
                                <label>Signal</label>
                                <select
                                    value={startSignal.value}
                                    onChange={(e) => startSignal.value = (e.target as HTMLSelectElement).value}
                                >
                                    <option value="">Select signal...</option>
                                    {availableSignals.value.map(sig => (
                                        <option key={sig} value={sig}>{sig}</option>
                                    ))}
                                </select>
                            </div>
                            {type.value !== 'value-populated' && (
                                <>
                                    <div class="form-group condition-select">
                                        <label>Condition</label>
                                        <select
                                            value={startCondition.value}
                                            onChange={(e) => startCondition.value = (e.target as HTMLSelectElement).value as ConditionType}
                                        >
                                            <option value="equals">=</option>
                                            <option value="not-equals">≠</option>
                                            <option value="greater">&gt;</option>
                                            <option value="less">&lt;</option>
                                        </select>
                                    </div>
                                    <div class="form-group">
                                        <label>Value</label>
                                        <input
                                            type="text"
                                            value={startValue.value}
                                            onInput={(e) => startValue.value = (e.target as HTMLInputElement).value}
                                            placeholder="true"
                                        />
                                    </div>
                                </>
                            )}
                        </div>
                    </fieldset>

                    {type.value === 'a-to-b' && (
                        <fieldset class="condition-fieldset">
                            <legend>End Condition</legend>
                            <div class="condition-row">
                                <div class="form-group">
                                    <label>Signal</label>
                                    <select
                                        value={endSignal.value}
                                        onChange={(e) => endSignal.value = (e.target as HTMLSelectElement).value}
                                    >
                                        <option value="">Select signal...</option>
                                        {availableSignals.value.map(sig => (
                                            <option key={sig} value={sig}>{sig}</option>
                                        ))}
                                    </select>
                                </div>
                                <div class="form-group condition-select">
                                    <label>Condition</label>
                                    <select
                                        value={endCondition.value}
                                        onChange={(e) => endCondition.value = (e.target as HTMLSelectElement).value as ConditionType}
                                    >
                                        <option value="equals">=</option>
                                        <option value="not-equals">≠</option>
                                        <option value="greater">&gt;</option>
                                        <option value="less">&lt;</option>
                                    </select>
                                </div>
                                <div class="form-group">
                                    <label>Value</label>
                                    <input
                                        type="text"
                                        value={endValue.value}
                                        onInput={(e) => endValue.value = (e.target as HTMLInputElement).value}
                                        placeholder="true"
                                    />
                                </div>
                            </div>
                        </fieldset>
                    )}

                    <fieldset class="condition-fieldset">
                        <legend>Target Time (Optional)</legend>
                        <div class="target-row">
                            <div class="form-group">
                                <label>Target (seconds)</label>
                                <input
                                    type="number"
                                    step="0.1"
                                    value={targetDuration.value}
                                    onInput={(e) => targetDuration.value = (e.target as HTMLInputElement).value}
                                    placeholder="45"
                                />
                            </div>
                            <div class="form-group">
                                <label>Tolerance ± (seconds)</label>
                                <input
                                    type="number"
                                    step="0.1"
                                    value={tolerance.value}
                                    onInput={(e) => tolerance.value = (e.target as HTMLInputElement).value}
                                    placeholder="5"
                                />
                            </div>
                        </div>
                    </fieldset>

                    <div class="form-group checkbox-group">
                        <label>
                            <input
                                type="checkbox"
                                checked={enabled.value}
                                onChange={(e) => enabled.value = (e.target as HTMLInputElement).checked}
                            />
                            Rule Enabled
                        </label>
                    </div>

                    <div class="modal-actions">
                        <button type="button" class="cancel-btn" onClick={onClose}>
                            Cancel
                        </button>
                        <button type="submit" class="save-btn">
                            {isEditing ? 'Update Rule' : 'Create Rule'}
                        </button>
                    </div>
                </form>

                <style>{`
                    .modal-overlay {
                        position: fixed;
                        inset: 0;
                        background: rgba(0, 0, 0, 0.6);
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        z-index: 1000;
                    }

                    .modal-content {
                        background: var(--bg-secondary);
                        border: 1px solid var(--border-color);
                        border-radius: 8px;
                        width: 480px;
                        max-width: 90vw;
                        max-height: 90vh;
                        overflow-y: auto;
                    }

                    .modal-header {
                        display: flex;
                        align-items: center;
                        justify-content: space-between;
                        padding: var(--spacing-md) var(--spacing-lg);
                        border-bottom: 1px solid var(--border-color);
                    }

                    .modal-header h2 {
                        margin: 0;
                        font-size: 16px;
                        font-weight: 600;
                        color: var(--text-primary);
                    }

                    .close-btn {
                        background: transparent;
                        border: none;
                        cursor: pointer;
                        color: var(--text-muted);
                        padding: 4px;
                    }

                    .close-btn:hover {
                        color: var(--text-primary);
                    }

                    form {
                        padding: var(--spacing-lg);
                    }

                    .form-group {
                        margin-bottom: var(--spacing-md);
                    }

                    .form-group label {
                        display: block;
                        font-size: 12px;
                        font-weight: 500;
                        color: var(--text-secondary);
                        margin-bottom: 4px;
                    }

                    .form-group input[type="text"],
                    .form-group input[type="number"],
                    .form-group select {
                        width: 100%;
                        padding: 8px 10px;
                        background: var(--bg-primary);
                        border: 1px solid var(--border-color);
                        border-radius: 4px;
                        color: var(--text-primary);
                        font-size: 13px;
                    }

                    .form-group input:focus,
                    .form-group select:focus {
                        outline: none;
                        border-color: var(--primary-accent);
                    }

                    .radio-group {
                        display: flex;
                        flex-direction: column;
                        gap: 8px;
                    }

                    .radio-option {
                        display: flex;
                        align-items: flex-start;
                        gap: 10px;
                        padding: 10px;
                        background: var(--bg-primary);
                        border: 1px solid var(--border-color);
                        border-radius: 6px;
                        cursor: pointer;
                        transition: all 0.15s;
                    }

                    .radio-option:hover {
                        border-color: var(--primary-accent);
                    }

                    .radio-option.selected {
                        border-color: var(--primary-accent);
                        background: rgba(66, 133, 244, 0.1);
                    }

                    .radio-option input {
                        margin-top: 2px;
                    }

                    .radio-label {
                        display: flex;
                        flex-direction: column;
                    }

                    .radio-label strong {
                        font-size: 13px;
                        color: var(--text-primary);
                    }

                    .radio-label small {
                        font-size: 11px;
                        color: var(--text-muted);
                        margin-top: 2px;
                    }

                    .condition-fieldset {
                        border: 1px solid var(--border-color);
                        border-radius: 6px;
                        padding: var(--spacing-md);
                        margin-bottom: var(--spacing-md);
                    }

                    .condition-fieldset legend {
                        font-size: 12px;
                        font-weight: 500;
                        color: var(--text-secondary);
                        padding: 0 8px;
                    }

                    .condition-row, .target-row {
                        display: flex;
                        gap: var(--spacing-md);
                    }

                    .condition-row .form-group {
                        flex: 1;
                        margin-bottom: 0;
                    }

                    .condition-row .condition-select {
                        flex: 0 0 80px;
                    }

                    .target-row .form-group {
                        flex: 1;
                        margin-bottom: 0;
                    }

                    .checkbox-group label {
                        display: flex;
                        align-items: center;
                        gap: 8px;
                        font-size: 13px;
                        cursor: pointer;
                    }

                    .modal-actions {
                        display: flex;
                        justify-content: flex-end;
                        gap: var(--spacing-sm);
                        margin-top: var(--spacing-lg);
                        padding-top: var(--spacing-md);
                        border-top: 1px solid var(--border-color);
                    }

                    .cancel-btn {
                        background: transparent;
                        border: 1px solid var(--border-color);
                        border-radius: 4px;
                        padding: 8px 16px;
                        color: var(--text-secondary);
                        font-size: 13px;
                        cursor: pointer;
                    }

                    .cancel-btn:hover {
                        background: var(--bg-tertiary);
                    }

                    .save-btn {
                        background: var(--primary-accent);
                        border: none;
                        border-radius: 4px;
                        padding: 8px 16px;
                        color: white;
                        font-size: 13px;
                        cursor: pointer;
                    }

                    .save-btn:hover {
                        filter: brightness(1.1);
                    }
                `}</style>
            </div>
        </div>
    );
}
