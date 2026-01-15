import type { JSX } from 'preact';

interface NavButtonProps {

    title: string;
    icon: 'waveform' | 'table' | 'map' | 'chart';
    description?: string;
    onClick: () => void;
    active?: boolean;
    disabled?: boolean;
    color?: string;
}

const icons = {
    waveform: (
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 12h4l3-9 4 18 3-9h4" />
        </svg>
    ),
    table: (
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
            <line x1="3" y1="9" x2="21" y2="9" />
            <line x1="3" y1="15" x2="21" y2="15" />
            <line x1="9" y1="3" x2="9" y2="21" />
        </svg>
    ),
    map: (
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="1,6 1,22 8,18 16,22 23,18 23,2 16,6 8,2 1,6" />
            <line x1="8" y1="2" x2="8" y2="18" />
            <line x1="16" y1="6" x2="16" y2="22" />
        </svg>
    ),
    chart: (
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="20" x2="18" y2="10" />
            <line x1="12" y1="20" x2="12" y2="4" />
            <line x1="6" y1="20" x2="6" y2="14" />
        </svg>
    ),
};

export function NavButton({ title, icon, description, onClick, active, disabled, color }: NavButtonProps) {
    return (
        <button
            class={`nav-button ${active ? 'active' : ''} ${disabled ? 'disabled' : ''}`}
            onClick={onClick}
            disabled={disabled}
            style={color ? { '--primary-accent': color } as JSX.CSSProperties : {}}
        >
            <div class="nav-button-icon">
                {icons[icon]}
            </div>
            <div class="nav-button-text">
                <div class="nav-button-title">{title}</div>
                {description && <div class="nav-button-desc">{description}</div>}
            </div>

            <style>{`
                .nav-button {
                    display: flex;
                    align-items: center;
                    gap: var(--spacing-md);
                    width: 100%;
                    padding: var(--spacing-md) var(--spacing-lg);
                    background: var(--bg-secondary);
                    border: 1px solid var(--border-color);
                    border-radius: var(--card-radius);
                    transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
                    text-align: left;
                    cursor: pointer;
                }

                .nav-button:hover:not(:disabled) {
                    background: var(--bg-tertiary);
                    border-color: var(--primary-accent);
                    transform: translateY(-2px);
                    box-shadow: 0 4px 20px rgba(77, 182, 226, 0.15);
                }

                .nav-button:active:not(:disabled) {
                    transform: translateY(0);
                }

                .nav-button.active {
                    background: var(--bg-tertiary);
                    border-color: var(--primary-accent);
                    box-shadow: 0 0 0 3px rgba(77, 182, 226, 0.15);
                }

                .nav-button:disabled {
                    opacity: 0.4;
                    cursor: not-allowed;
                }

                .nav-button-icon {
                    width: 48px;
                    height: 48px;
                    background: var(--bg-primary);
                    border-radius: var(--border-radius);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    color: var(--primary-accent);
                    transition: all 0.2s;
                    flex-shrink: 0;
                }

                .nav-button:hover:not(:disabled) .nav-button-icon {
                    background: rgba(77, 182, 226, 0.15);
                    color: var(--accent-hover);
                    transform: scale(1.05);
                }

                .nav-button-text {
                    display: flex;
                    flex-direction: column;
                    gap: 2px;
                    min-width: 0;
                }

                .nav-button-title {
                    font-size: 14px;
                    font-weight: 600;
                    color: var(--text-primary);
                }

                .nav-button-desc {
                    font-size: 12px;
                    color: var(--text-muted);
                    white-space: nowrap;
                    overflow: hidden;
                    text-overflow: ellipsis;
                }

                .nav-button:hover:not(:disabled) .nav-button-title {
                    color: var(--primary-accent);
                }
            `}</style>
        </button>
    );
}
