/**
 * TransitionRuleEditor - Modal for configuring a single transition definition
 */
import { useComputed, useSignal } from '@preact/signals';
import { useEffect } from 'preact/hooks';
import type { SignalType } from '../../models/types';
import type { TransitionConfig, RuleType, ConditionType } from '../../stores/transitionStore';
import { logEntries } from '../../stores/logStore';

interface TransitionRuleEditorProps {
    config: TransitionConfig | null;
    onSave: (config: TransitionConfig) => void;
    onClose: () => void;
}

interface ConditionOption {
    value: ConditionType;
    label: string;
}

function getConditionOptions(signalType?: SignalType): ConditionOption[] {
    if (signalType === 'boolean') {
        return [
            { value: 'equals', label: '=' },
            { value: 'not-equals', label: '≠' }
        ];
    }

    if (signalType === 'integer') {
        return [
            { value: 'equals', label: '=' },
            { value: 'not-equals', label: '≠' },
            { value: 'greater', label: '>' },
            { value: 'less', label: '<' }
        ];
    }

    return [
        { value: 'equals', label: '=' },
        { value: 'not-equals', label: '≠' },
        { value: 'not-empty', label: 'Not Empty' }
    ];
}

function parseTypedValue(value: string, signalType?: SignalType): string | number | boolean {
    if (signalType === 'boolean') {
        return value === 'true';
    }

    if (signalType === 'integer') {
        const num = parseFloat(value);
        return Number.isNaN(num) ? 0 : num;
    }

    return value;
}

export function TransitionRuleEditor({ config, onSave, onClose }: TransitionRuleEditorProps) {
    const isEditing = !!config;

    // Form state
    const name = useSignal(config?.name ?? '');
    const type = useSignal<RuleType>(config?.type ?? 'cycle');
    const enabled = useSignal(config?.enabled ?? true);

    const startDeviceId = useSignal(config?.startDeviceId ?? '');
    const startSignalName = useSignal(config?.startSignalName ?? '');
    const startCondition = useSignal<ConditionType>(config?.startCondition ?? 'equals');
    const startValue = useSignal<string>(String(config?.startValue ?? 'true'));

    const endDeviceId = useSignal(config?.endDeviceId ?? '');
    const endSignalName = useSignal(config?.endSignalName ?? '');
    const endCondition = useSignal<ConditionType>(config?.endCondition ?? 'equals');
    const endValue = useSignal<string>(String(config?.endValue ?? 'true'));

    const targetDuration = useSignal(config?.targetDuration ? String(config.targetDuration / 1000) : '');
    const tolerance = useSignal(config?.tolerance ? String(config.tolerance / 1000) : '');

    // Build device -> signal -> type catalog from currently loaded log entries
    const signalCatalog = useComputed(() => {
        const byDevice = new Map<string, Map<string, SignalType>>();

        for (const entry of logEntries.value) {
            const deviceSignals = byDevice.get(entry.deviceId) || new Map<string, SignalType>();
            if (!deviceSignals.has(entry.signalName)) {
                deviceSignals.set(entry.signalName, entry.signalType);
            }
            byDevice.set(entry.deviceId, deviceSignals);
        }

        return byDevice;
    });

    const availableDevices = useComputed(() => {
        return Array.from(signalCatalog.value.keys()).sort();
    });

    const startSignalOptions = useComputed(() => {
        if (!startDeviceId.value) return [] as Array<{ name: string; type: SignalType }>;

        const deviceSignals = signalCatalog.value.get(startDeviceId.value);
        if (!deviceSignals) return [] as Array<{ name: string; type: SignalType }>;

        return Array.from(deviceSignals.entries())
            .map(([name, type]) => ({ name, type }))
            .sort((a, b) => a.name.localeCompare(b.name));
    });

    const endSignalOptions = useComputed(() => {
        if (!endDeviceId.value) return [] as Array<{ name: string; type: SignalType }>;

        const deviceSignals = signalCatalog.value.get(endDeviceId.value);
        if (!deviceSignals) return [] as Array<{ name: string; type: SignalType }>;

        return Array.from(deviceSignals.entries())
            .map(([name, type]) => ({ name, type }))
            .sort((a, b) => a.name.localeCompare(b.name));
    });

    const startSignalType = useComputed(() => {
        const signal = startSignalOptions.value.find(s => s.name === startSignalName.value);
        return signal?.type;
    });

    const endSignalType = useComputed(() => {
        const signal = endSignalOptions.value.find(s => s.name === endSignalName.value);
        return signal?.type;
    });

    // Keep signal selection valid when device changes.
    useEffect(() => {
        if (!startSignalOptions.value.some(s => s.name === startSignalName.value)) {
            startSignalName.value = '';
        }
    }, [startDeviceId.value, startSignalOptions.value]);

    useEffect(() => {
        if (!endSignalOptions.value.some(s => s.name === endSignalName.value)) {
            endSignalName.value = '';
        }
    }, [endDeviceId.value, endSignalOptions.value]);

    // Keep condition valid when signal type changes.
    useEffect(() => {
        const allowed = getConditionOptions(startSignalType.value);
        if (!allowed.some(option => option.value === startCondition.value)) {
            startCondition.value = allowed[0]?.value ?? 'equals';
        }
    }, [startSignalType.value]);

    useEffect(() => {
        const allowed = getConditionOptions(endSignalType.value);
        if (!allowed.some(option => option.value === endCondition.value)) {
            endCondition.value = allowed[0]?.value ?? 'equals';
        }
    }, [endSignalType.value]);

    const handleSubmit = (e: Event) => {
        e.preventDefault();

        const configData: TransitionConfig = {
            name: name.value || 'Transition Config',
            type: type.value,
            enabled: enabled.value,
            startDeviceId: startDeviceId.value,
            startSignalName: startSignalName.value,
            startCondition: startCondition.value,
            startValue: parseTypedValue(startValue.value, startSignalType.value),
            endDeviceId: type.value === 'a-to-b' ? endDeviceId.value : undefined,
            endSignalName: type.value === 'a-to-b' ? endSignalName.value : undefined,
            endCondition: type.value === 'a-to-b' ? endCondition.value : undefined,
            endValue: type.value === 'a-to-b' ? parseTypedValue(endValue.value, endSignalType.value) : undefined,
            targetDuration: targetDuration.value ? parseFloat(targetDuration.value) * 1000 : undefined,
            tolerance: tolerance.value ? parseFloat(tolerance.value) * 1000 : undefined
        };

        onSave(configData);
    };

    const renderValueInput = (
        value: string,
        setValue: (next: string) => void,
        ariaLabel: string,
        signalType?: SignalType
    ) => {
        if (signalType === 'boolean') {
            return (
                <select aria-label={ariaLabel} value={value} onChange={(e) => setValue((e.target as HTMLSelectElement).value)}>
                    <option value="true">true</option>
                    <option value="false">false</option>
                </select>
            );
        }

        if (signalType === 'integer') {
            return (
                <input
                    aria-label={ariaLabel}
                    type="number"
                    value={value}
                    onInput={(e) => setValue((e.target as HTMLInputElement).value)}
                    placeholder="0"
                />
            );
        }

        return (
            <input
                aria-label={ariaLabel}
                type="text"
                value={value}
                onInput={(e) => setValue((e.target as HTMLInputElement).value)}
                placeholder="value"
            />
        );
    };

    return (
        <div class="modal-overlay" onClick={onClose}>
            <div class="modal-content" onClick={(e) => e.stopPropagation()}>
                <div class="modal-header">
                    <h2>{isEditing ? 'Edit Configuration' : 'Configure Transition'}</h2>
                    <button class="close-btn" onClick={onClose}>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M18 6L6 18M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                <form onSubmit={handleSubmit}>
                    <div class="form-group">
                        <label>Name</label>
                        <input
                            type="text"
                            value={name.value}
                            onInput={(e) => name.value = (e.target as HTMLInputElement).value}
                            placeholder="e.g., Cycle Time Config"
                        />
                    </div>

                    <div class="form-group">
                        <label>Transition Type</label>
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
                                <label>Device</label>
                                <select
                                    aria-label="Start Device"
                                    required
                                    value={startDeviceId.value}
                                    onChange={(e) => startDeviceId.value = (e.target as HTMLSelectElement).value}
                                >
                                    <option value="">Select device...</option>
                                    {availableDevices.value.map(device => (
                                        <option key={device} value={device}>{device}</option>
                                    ))}
                                </select>
                            </div>
                            <div class="form-group">
                                <label>Signal</label>
                                <select
                                    aria-label="Start Signal"
                                    required
                                    value={startSignalName.value}
                                    disabled={!startDeviceId.value}
                                    onChange={(e) => startSignalName.value = (e.target as HTMLSelectElement).value}
                                >
                                    <option value="">Select signal...</option>
                                    {startSignalOptions.value.map(signal => (
                                        <option key={signal.name} value={signal.name}>{signal.name}</option>
                                    ))}
                                </select>
                            </div>
                            {type.value !== 'value-populated' && (
                                <>
                                    <div class="form-group condition-select">
                                        <label>Condition</label>
                                        <select
                                            aria-label="Start Condition"
                                            value={startCondition.value}
                                            onChange={(e) => startCondition.value = (e.target as HTMLSelectElement).value as ConditionType}
                                        >
                                            {getConditionOptions(startSignalType.value).map(option => (
                                                <option key={option.value} value={option.value}>{option.label}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div class="form-group">
                                        <label>Value</label>
                                        {renderValueInput(startValue.value, (next) => startValue.value = next, 'Start Value', startSignalType.value)}
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
                                    <label>Device</label>
                                    <select
                                        aria-label="End Device"
                                        required
                                        value={endDeviceId.value}
                                        onChange={(e) => endDeviceId.value = (e.target as HTMLSelectElement).value}
                                    >
                                        <option value="">Select device...</option>
                                        {availableDevices.value.map(device => (
                                            <option key={device} value={device}>{device}</option>
                                        ))}
                                    </select>
                                </div>
                                <div class="form-group">
                                    <label>Signal</label>
                                    <select
                                        aria-label="End Signal"
                                        required
                                        value={endSignalName.value}
                                        disabled={!endDeviceId.value}
                                        onChange={(e) => endSignalName.value = (e.target as HTMLSelectElement).value}
                                    >
                                        <option value="">Select signal...</option>
                                        {endSignalOptions.value.map(signal => (
                                            <option key={signal.name} value={signal.name}>{signal.name}</option>
                                        ))}
                                    </select>
                                </div>
                                <div class="form-group condition-select">
                                    <label>Condition</label>
                                    <select
                                        aria-label="End Condition"
                                        value={endCondition.value}
                                        onChange={(e) => endCondition.value = (e.target as HTMLSelectElement).value as ConditionType}
                                    >
                                        {getConditionOptions(endSignalType.value).map(option => (
                                            <option key={option.value} value={option.value}>{option.label}</option>
                                        ))}
                                    </select>
                                </div>
                                <div class="form-group">
                                    <label>Value</label>
                                    {renderValueInput(endValue.value, (next) => endValue.value = next, 'End Value', endSignalType.value)}
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
                            Configuration Enabled
                        </label>
                    </div>

                    <div class="modal-actions">
                        <button type="button" class="cancel-btn" onClick={onClose}>
                            Cancel
                        </button>
                        <button type="submit" class="save-btn">
                            {isEditing ? 'Save Configuration' : 'Apply Configuration'}
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
                        width: 640px;
                        max-width: 95vw;
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

                    .condition-row,
                    .target-row {
                        display: flex;
                        flex-wrap: wrap;
                        gap: var(--spacing-md);
                    }

                    .condition-row .form-group {
                        flex: 1 1 140px;
                        margin-bottom: 0;
                    }

                    .condition-row .condition-select {
                        flex: 0 0 110px;
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
