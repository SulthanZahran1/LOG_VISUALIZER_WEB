/**
 * SelectionToolbar Component
 * 
 * Shows when rows are selected, provides copy and clear actions.
 */
import { CopyIcon, XIcon } from '../../icons';

export interface SelectionToolbarProps {
  /** Number of selected rows */
  selectedCount: number;
  /** Callback to copy selected rows */
  onCopy: () => void;
  /** Callback to clear selection */
  onClear: () => void;
}

/**
 * Toolbar for selection actions
 */
export function SelectionToolbar({
  selectedCount,
  onCopy,
  onClear
}: SelectionToolbarProps) {
  const handleCopy = () => {
    onCopy();
  };

  const handleClear = () => {
    onClear();
  };

  return (
    <div 
      className="selection-toolbar"
      role="toolbar"
      aria-label="Selection actions"
    >
      <span className="selection-count">
        {selectedCount} row{selectedCount !== 1 ? 's' : ''} selected
      </span>
      
      <div className="selection-actions">
        <button
          className="btn-icon"
          onClick={handleCopy}
          title="Copy to clipboard (Ctrl+C)"
          aria-label="Copy selected rows"
        >
          <CopyIcon />
          <span>Copy</span>
        </button>
        
        <button
          className="btn-icon"
          onClick={handleClear}
          title="Clear selection"
          aria-label="Clear selection"
        >
          <XIcon />
          <span>Clear</span>
        </button>
      </div>
    </div>
  );
}

export default SelectionToolbar;
