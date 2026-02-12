import { useSignal } from '@preact/signals';
import { useState, useCallback } from 'preact/hooks';
import {
    colorSettings,
    toggleColorCoding,
    setColorMode,
    updateSettings,
    addCategoryColor,
    removeCategoryColor,
    toggleCategoryColor,
    addSignalPattern,
    updateSignalPattern,
    removeSignalPattern,
    addValueSeverityRule,
    updateValueSeverityRule,
    removeValueSeverityRule,
    resetToDefaults,
    type ColorCodingMode,
    type SignalPatternRule,
    type ValueSeverityRule,
} from '../../stores/colorCodingStore';
import { availableCategories } from '../../stores/logStore';
import { PaletteIcon, PlusIcon, TrashIcon, RefreshIcon, CheckIcon, XIcon, SettingsIcon, ChevronDownIcon, ChevronRightIcon } from '../icons';
import './ColorCodingSettings.css';

const MODE_OPTIONS: { value: ColorCodingMode; label: string; description: string }[] = [
    { value: 'none', label: 'None', description: 'No color coding' },
    { value: 'category', label: 'By Category', description: 'Color based on log entry category' },
    { value: 'signalPattern', label: 'By Signal Pattern', description: 'Color based on signal name patterns' },
    { value: 'valueSeverity', label: 'By Value Severity', description: 'Color based on value content keywords' },
    { value: 'signalType', label: 'By Signal Type', description: 'Color based on boolean/integer/string type' },
    { value: 'device', label: 'By Device', description: 'Unique color per device ID' },
];

const SEVERITY_OPTIONS = [
    { value: 'error', label: 'Error', color: '#f85149' },
    { value: 'warning', label: 'Warning', color: '#d29922' },
    { value: 'info', label: 'Info', color: '#58a6ff' },
    { value: 'success', label: 'Success', color: '#3fb950' },
];

export function ColorCodingSettings() {
    const [activeTab, setActiveTab] = useState<ColorCodingMode>('category');
    const isOpen = useSignal(false);

    const settings = colorSettings.value;

    const handleModeChange = (mode: ColorCodingMode) => {
        setColorMode(mode);
        setActiveTab(mode);
    };

    const togglePanel = useCallback(() => {
        isOpen.value = !isOpen.value;
    }, [isOpen]);

    return (
        <div className="color-coding-settings">
            <button
                className={`btn-color-coding ${settings.enabled ? 'active' : ''}`}
                onClick={togglePanel}
                title="Color Coding Settings"
            >
                <PaletteIcon size={16} />
                <span>Colors</span>
                {settings.enabled && <span className="indicator-dot" />}
            </button>

            {isOpen.value && (
                <div className="color-coding-panel">
                    <div className="panel-header">
                        <div className="panel-title">
                            <PaletteIcon size={18} />
                            <span>Color Coding</span>
                        </div>
                        <button className="btn-close" onClick={togglePanel}>
                            <XIcon size={16} />
                        </button>
                    </div>

                    <div className="panel-content">
                        {/* Enable/Disable Toggle */}
                        <label className="toggle-row">
                            <input
                                type="checkbox"
                                checked={settings.enabled}
                                onChange={toggleColorCoding}
                            />
                            <span className="toggle-label">Enable Color Coding</span>
                        </label>

                        {settings.enabled && (
                            <>
                                {/* Mode Selection */}
                                <div className="section">
                                    <div className="section-title">Color Mode</div>
                                    <div className="mode-options">
                                        {MODE_OPTIONS.map((mode) => (
                                            <label
                                                key={mode.value}
                                                className={`mode-option ${settings.mode === mode.value ? 'active' : ''}`}
                                            >
                                                <input
                                                    type="radio"
                                                    name="colorMode"
                                                    value={mode.value}
                                                    checked={settings.mode === mode.value}
                                                    onChange={() => handleModeChange(mode.value)}
                                                />
                                                <span className="mode-label">{mode.label}</span>
                                                <span className="mode-desc">{mode.description}</span>
                                            </label>
                                        ))}
                                    </div>
                                </div>

                                {/* Settings for each mode */}
                                {settings.mode === 'category' && <CategorySettings />}
                                {settings.mode === 'signalPattern' && <SignalPatternSettings />}
                                {settings.mode === 'valueSeverity' && <ValueSeveritySettings />}
                                {settings.mode === 'signalType' && <SignalTypeSettings />}
                                {settings.mode === 'device' && <DeviceSettings />}

                                {/* General Options */}
                                <div className="section">
                                    <div className="section-title">Display Options</div>
                                    <div className="option-rows">
                                        <label className="option-row">
                                            <input
                                                type="checkbox"
                                                checked={settings.applyToRow}
                                                onChange={(e) => updateSettings({ applyToRow: (e.target as HTMLInputElement).checked })}
                                            />
                                            <span>Apply color to entire row</span>
                                        </label>
                                        <label className="option-row">
                                            <input
                                                type="checkbox"
                                                checked={settings.applyToValue}
                                                onChange={(e) => updateSettings({ applyToValue: (e.target as HTMLInputElement).checked })}
                                            />
                                            <span>Apply color to value cells</span>
                                        </label>
                                        <label className="option-row">
                                            <input
                                                type="checkbox"
                                                checked={settings.alternatingRows}
                                                onChange={(e) => updateSettings({ alternatingRows: (e.target as HTMLInputElement).checked })}
                                            />
                                            <span>Alternating row colors</span>
                                        </label>
                                    </div>
                                    {settings.applyToRow && (
                                        <div className="slider-row">
                                            <span>Row opacity</span>
                                            <input
                                                type="range"
                                                min="0.05"
                                                max="0.3"
                                                step="0.01"
                                                value={settings.rowOpacity}
                                                onChange={(e) => updateSettings({ rowOpacity: parseFloat((e.target as HTMLInputElement).value) })}
                                            />
                                            <span>{Math.round(settings.rowOpacity * 100)}%</span>
                                        </div>
                                    )}
                                </div>

                                {/* Reset Button */}
                                <button className="btn-reset" onClick={resetToDefaults}>
                                    <RefreshIcon size={14} />
                                    Reset to Defaults
                                </button>
                            </>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}

function CategorySettings() {
    const [newCategory, setNewCategory] = useState('');
    const [newColor, setNewColor] = useState('#58a6ff');
    const categories = availableCategories.value;
    const settings = colorSettings.value;

    const handleAdd = () => {
        if (newCategory.trim()) {
            addCategoryColor(newCategory.trim(), newColor);
            setNewCategory('');
        }
    };

    return (
        <div className="section">
            <div className="section-title">Category Colors</div>
            <div className="category-list">
                {settings.categoryColors.map((cat) => (
                    <div key={cat.category} className={`category-item ${cat.enabled ? '' : 'disabled'}`}>
                        <label className="category-checkbox">
                            <input
                                type="checkbox"
                                checked={cat.enabled}
                                onChange={() => toggleCategoryColor(cat.category)}
                            />
                        </label>
                        <div
                            className="color-preview"
                            style={{ backgroundColor: cat.color }}
                        />
                        <span className="category-name">{cat.category}</span>
                        <input
                            type="color"
                            value={cat.color}
                            onChange={(e) => addCategoryColor(cat.category, (e.target as HTMLInputElement).value)}
                            className="color-picker-small"
                        />
                        <button
                            className="btn-icon-small"
                            onClick={() => removeCategoryColor(cat.category)}
                            title="Remove"
                        >
                            <TrashIcon size={14} />
                        </button>
                    </div>
                ))}
            </div>

            {/* Available categories from data */}
            {categories.length > 0 && (
                <div className="available-categories">
                    <div className="sub-title">Available in data:</div>
                    <div className="category-chips">
                        {categories.map((cat) => {
                            const exists = settings.categoryColors.some(c => c.category === cat);
                            if (exists) return null;
                            return (
                                <button
                                    key={cat}
                                    className="category-chip"
                                    onClick={() => addCategoryColor(cat || '(Uncategorized)', '#8b949e')}
                                >
                                    <PlusIcon size={12} />
                                    {cat || '(Uncategorized)'}
                                </button>
                            );
                        })}
                    </div>
                </div>
            )}

            <div className="add-row">
                <input
                    type="text"
                    placeholder="New category..."
                    value={newCategory}
                    onChange={(e) => setNewCategory((e.target as HTMLInputElement).value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
                />
                <input
                    type="color"
                    value={newColor}
                    onChange={(e) => setNewColor((e.target as HTMLInputElement).value)}
                    className="color-picker"
                />
                <button className="btn-add" onClick={handleAdd}>
                    <PlusIcon size={14} />
                </button>
            </div>
        </div>
    );
}

function SignalPatternSettings() {
    const [isAdding, setIsAdding] = useState(false);
    const [newPattern, setNewPattern] = useState<Partial<SignalPatternRule>>({
        name: '',
        pattern: '',
        isRegex: true,
        color: '#58a6ff',
        enabled: true,
    });

    const settings = colorSettings.value;

    const handleAdd = () => {
        if (newPattern.name?.trim() && newPattern.pattern?.trim()) {
            addSignalPattern({
                name: newPattern.name.trim(),
                pattern: newPattern.pattern.trim(),
                isRegex: newPattern.isRegex || false,
                color: newPattern.color || '#58a6ff',
                enabled: true,
            });
            setNewPattern({
                name: '',
                pattern: '',
                isRegex: true,
                color: '#58a6ff',
                enabled: true,
            });
            setIsAdding(false);
        }
    };

    return (
        <div className="section">
            <div className="section-title">Signal Pattern Rules</div>
            <div className="pattern-list">
                {settings.signalPatterns.map((pattern) => (
                    <div key={pattern.id} className={`pattern-item ${pattern.enabled ? '' : 'disabled'}`}>
                        <label className="pattern-checkbox">
                            <input
                                type="checkbox"
                                checked={pattern.enabled}
                                onChange={() => updateSignalPattern(pattern.id, { enabled: !pattern.enabled })}
                            />
                        </label>
                        <div
                            className="color-preview"
                            style={{ backgroundColor: pattern.color }}
                        />
                        <div className="pattern-info">
                            <div className="pattern-name">{pattern.name}</div>
                            <div className="pattern-regex">
                                {pattern.isRegex ? 'Regex: ' : 'Contains: '}
                                <code>{pattern.pattern}</code>
                            </div>
                        </div>
                        <input
                            type="color"
                            value={pattern.color}
                            onChange={(e) => updateSignalPattern(pattern.id, { color: (e.target as HTMLInputElement).value })}
                            className="color-picker-small"
                        />
                        <button
                            className="btn-icon-small"
                            onClick={() => removeSignalPattern(pattern.id)}
                            title="Remove"
                        >
                            <TrashIcon size={14} />
                        </button>
                    </div>
                ))}
            </div>

            {isAdding ? (
                <div className="add-form">
                    <input
                        type="text"
                        placeholder="Rule name..."
                        value={newPattern.name}
                        onChange={(e) => setNewPattern({ ...newPattern, name: (e.target as HTMLInputElement).value })}
                    />
                    <input
                        type="text"
                        placeholder={newPattern.isRegex ? 'Regular expression...' : 'Text pattern...'}
                        value={newPattern.pattern}
                        onChange={(e) => setNewPattern({ ...newPattern, pattern: (e.target as HTMLInputElement).value })}
                    />
                    <label className="checkbox-label">
                        <input
                            type="checkbox"
                            checked={newPattern.isRegex}
                            onChange={(e) => setNewPattern({ ...newPattern, isRegex: (e.target as HTMLInputElement).checked })}
                        />
                        Use Regular Expression
                    </label>
                    <div className="form-actions">
                        <input
                            type="color"
                            value={newPattern.color}
                            onChange={(e) => setNewPattern({ ...newPattern, color: (e.target as HTMLInputElement).value })}
                            className="color-picker"
                        />
                        <button className="btn-confirm" onClick={handleAdd}>
                            <CheckIcon size={14} />
                        </button>
                        <button className="btn-cancel" onClick={() => setIsAdding(false)}>
                            <XIcon size={14} />
                        </button>
                    </div>
                </div>
            ) : (
                <button className="btn-add-new" onClick={() => setIsAdding(true)}>
                    <PlusIcon size={14} />
                    Add Pattern Rule
                </button>
            )}
        </div>
    );
}

function ValueSeveritySettings() {
    const [isAdding, setIsAdding] = useState(false);
    const [newRule, setNewRule] = useState<Partial<ValueSeverityRule>>({
        keyword: '',
        severity: 'info',
        enabled: true,
    });

    const settings = colorSettings.value;

    const handleAdd = () => {
        if (newRule.keyword?.trim()) {
            addValueSeverityRule({
                keyword: newRule.keyword.trim(),
                severity: newRule.severity || 'info',
                enabled: true,
            });
            setNewRule({ keyword: '', severity: 'info', enabled: true });
            setIsAdding(false);
        }
    };

    return (
        <div className="section">
            <div className="section-title">Value Severity Keywords</div>
            <div className="severity-list">
                {settings.valueSeverityRules.map((rule) => (
                    <div key={rule.id} className={`severity-item ${rule.enabled ? '' : 'disabled'}`}>
                        <label className="severity-checkbox">
                            <input
                                type="checkbox"
                                checked={rule.enabled}
                                onChange={() => updateValueSeverityRule(rule.id, { enabled: !rule.enabled })}
                            />
                        </label>
                        <div
                            className="severity-badge"
                            style={{ backgroundColor: SEVERITY_OPTIONS.find(s => s.value === rule.severity)?.color }}
                        >
                            {rule.severity}
                        </div>
                        <code className="keyword">{rule.keyword}</code>
                        <button
                            className="btn-icon-small"
                            onClick={() => removeValueSeverityRule(rule.id)}
                            title="Remove"
                        >
                            <TrashIcon size={14} />
                        </button>
                    </div>
                ))}
            </div>

            {isAdding ? (
                <div className="add-form">
                    <input
                        type="text"
                        placeholder="Keyword..."
                        value={newRule.keyword}
                        onChange={(e) => setNewRule({ ...newRule, keyword: (e.target as HTMLInputElement).value })}
                        onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
                    />
                    <select
                        value={newRule.severity}
                        onChange={(e) => setNewRule({ ...newRule, severity: (e.target as HTMLSelectElement).value as ValueSeverityRule['severity'] })}
                    >
                        {SEVERITY_OPTIONS.map((opt) => (
                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                        ))}
                    </select>
                    <div className="form-actions">
                        <button className="btn-confirm" onClick={handleAdd}>
                            <CheckIcon size={14} />
                        </button>
                        <button className="btn-cancel" onClick={() => setIsAdding(false)}>
                            <XIcon size={14} />
                        </button>
                    </div>
                </div>
            ) : (
                <button className="btn-add-new" onClick={() => setIsAdding(true)}>
                    <PlusIcon size={14} />
                    Add Keyword Rule
                </button>
            )}
        </div>
    );
}

function SignalTypeSettings() {
    const settings = colorSettings.value;

    return (
        <div className="section">
            <div className="section-title">Signal Type Colors</div>
            <div className="type-color-list">
                <div className="type-color-item">
                    <span className="type-label">Boolean True</span>
                    <div className="type-preview" style={{ color: settings.booleanTrueColor }}>
                        TRUE
                    </div>
                    <input
                        type="color"
                        value={settings.booleanTrueColor}
                        onChange={(e) => updateSettings({ booleanTrueColor: (e.target as HTMLInputElement).value })}
                        className="color-picker"
                    />
                </div>
                <div className="type-color-item">
                    <span className="type-label">Boolean False</span>
                    <div className="type-preview" style={{ color: settings.booleanFalseColor }}>
                        FALSE
                    </div>
                    <input
                        type="color"
                        value={settings.booleanFalseColor}
                        onChange={(e) => updateSettings({ booleanFalseColor: (e.target as HTMLInputElement).value })}
                        className="color-picker"
                    />
                </div>
                <div className="type-color-item">
                    <span className="type-label">Integer</span>
                    <div className="type-preview" style={{ color: settings.integerColor }}>
                        12345
                    </div>
                    <input
                        type="color"
                        value={settings.integerColor}
                        onChange={(e) => updateSettings({ integerColor: (e.target as HTMLInputElement).value })}
                        className="color-picker"
                    />
                </div>
                <div className="type-color-item">
                    <span className="type-label">String</span>
                    <div className="type-preview" style={{ color: settings.stringColor }}>
                        "text"
                    </div>
                    <input
                        type="color"
                        value={settings.stringColor}
                        onChange={(e) => updateSettings({ stringColor: (e.target as HTMLInputElement).value })}
                        className="color-picker"
                    />
                </div>
            </div>
        </div>
    );
}

function DeviceSettings() {
    const settings = colorSettings.value;

    return (
        <div className="section">
            <div className="section-title">Device Color Settings</div>
            <p className="section-desc">
                Device colors are generated automatically based on the device ID hash.
                Adjust the saturation and lightness to control the color appearance.
            </p>
            <div className="slider-row">
                <span>Saturation</span>
                <input
                    type="range"
                    min="20"
                    max="100"
                    value={settings.deviceColorSaturation}
                    onChange={(e) => updateSettings({ deviceColorSaturation: parseInt((e.target as HTMLInputElement).value) })}
                />
                <span>{settings.deviceColorSaturation}%</span>
            </div>
            <div className="slider-row">
                <span>Lightness</span>
                <input
                    type="range"
                    min="20"
                    max="70"
                    value={settings.deviceColorLightness}
                    onChange={(e) => updateSettings({ deviceColorLightness: parseInt((e.target as HTMLInputElement).value) })}
                />
                <span>{settings.deviceColorLightness}%</span>
            </div>
            <div className="device-preview">
                <span className="preview-label">Preview:</span>
                <div className="device-chips">
                    {['DeviceA', 'DeviceB', 'Motor1', 'PLC_01', 'Sensor_X'].map((device) => (
                        <div
                            key={device}
                            className="device-chip"
                            style={{
                                backgroundColor: (() => {
                                    let hash = 0;
                                    for (let i = 0; i < device.length; i++) {
                                        hash = device.charCodeAt(i) + ((hash << 5) - hash);
                                    }
                                    const hue = Math.abs(hash % 360);
                                    return `hsl(${hue}, ${settings.deviceColorSaturation}%, ${settings.deviceColorLightness}%)`;
                                })()
                            }}
                        >
                            {device}
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
