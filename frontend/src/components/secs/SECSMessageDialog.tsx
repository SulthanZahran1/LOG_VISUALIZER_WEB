/**
 * SECSMessageDialog Component
 *
 * Modal dialog that displays the full parsed SECS-II message content.
 * Shows header fields and a recursive SML body tree.
 */
import { useEffect, useRef } from 'preact/hooks';
import type { LogEntry } from '../../models/types';
import { parseSECSValue, type SECSMessageData, type SECSNode } from '../../utils/secsLog';
import './SECSMessageDialog.css';

export interface SECSMessageDialogProps {
    /** Whether the dialog is open */
    isOpen: boolean;
    /** Close handler */
    onClose: () => void;
    /** The log entry to display */
    entry: LogEntry | null;
}

/**
 * Render a single SECS data node recursively as a tree item.
 */
function SECSNodeTree({ node, depth }: { node: SECSNode; depth: number }) {
    const indent = depth * 24;
    const typeBadgeClass = `secs-type-badge secs-type-${node.type.toLowerCase()}`;

    return (
        <div className="secs-tree-item" style={{ marginLeft: `${indent}px` }}>
            <div className="secs-tree-row">
                <span className={typeBadgeClass}>{node.type}</span>
                {node.name && <span className="secs-tree-name">{node.name}</span>}
                <span className="secs-tree-count">[{node.count}]</span>
                {node.value !== undefined && node.value !== '' && (
                    <span className="secs-tree-value">= {node.value}</span>
                )}
            </div>
            {node.items && node.items.length > 0 && (
                <div className="secs-tree-children">
                    {node.items.map((child, i) => (
                        <SECSNodeTree key={`${child.type}-${child.name || ''}-${i}`} node={child} depth={depth + 1} />
                    ))}
                </div>
            )}
        </div>
    );
}

export function SECSMessageDialog({ isOpen, onClose, entry }: SECSMessageDialogProps) {
    const dialogRef = useRef<HTMLDivElement>(null);
    const msgData: SECSMessageData | null = entry ? parseSECSValue(entry.value) : null;

    // Close on Escape key
    useEffect(() => {
        if (!isOpen) return;
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, onClose]);

    // Close on backdrop click
    const handleBackdropClick = (e: MouseEvent) => {
        if (dialogRef.current && !dialogRef.current.contains(e.target as Node)) {
            onClose();
        }
    };

    if (!isOpen || !entry || !msgData) return null;

    return (
        <div className="secs-dialog-overlay" onClick={handleBackdropClick}>
            <div className="secs-dialog" ref={dialogRef}>
                <div className="secs-dialog-header">
                    <h3 className="secs-dialog-title">
                        SECS-II Message: {msgData.streamFunction}
                        <span className={`secs-direction-badge secs-direction-${msgData.direction.toLowerCase()}`}>
                            {msgData.direction}
                        </span>
                    </h3>
                    <button className="secs-dialog-close" onClick={onClose} aria-label="Close dialog">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <line x1="18" y1="6" x2="6" y2="18" />
                            <line x1="6" y1="6" x2="18" y2="18" />
                        </svg>
                    </button>
                </div>

                <div className="secs-dialog-body">
                    {/* Header Fields */}
                    <div className="secs-field-grid">
                        <div className="secs-field">
                            <span className="secs-field-label">Timestamp</span>
                            <span className="secs-field-value">{msgData.timestamp || new Date(entry.timestamp).toISOString()}</span>
                        </div>
                        <div className="secs-field">
                            <span className="secs-field-label">Direction</span>
                            <span className="secs-field-value">{msgData.direction}</span>
                        </div>
                        <div className="secs-field">
                            <span className="secs-field-label">Stream/Function</span>
                            <span className="secs-field-value">{msgData.streamFunction}</span>
                        </div>
                        <div className="secs-field">
                            <span className="secs-field-label">System Byte</span>
                            <span className="secs-field-value">{msgData.systemByte || 'N/A'}</span>
                        </div>
                        {msgData.waitBit !== undefined && (
                            <div className="secs-field">
                                <span className="secs-field-label">Wait Bit (W)</span>
                                <span className="secs-field-value">{msgData.waitBit ? 'Yes' : 'No'}</span>
                            </div>
                        )}
                        {msgData.ceid !== undefined && (
                            <div className="secs-field">
                                <span className="secs-field-label">CEID</span>
                                <span className="secs-field-value">{msgData.ceid}</span>
                            </div>
                        )}
                        <div className="secs-field secs-field-full">
                            <span className="secs-field-label">Description</span>
                            <span className="secs-field-value">{msgData.messageDesc}</span>
                        </div>
                    </div>

                    {/* SML Body Tree */}
                    <div className="secs-body-section">
                        <h4 className="secs-body-title">SML Body Tree</h4>
                        <div className="secs-tree-container">
                            <SECSNodeTree node={msgData.body} depth={0} />
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default SECSMessageDialog;
