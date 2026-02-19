/**
 * CategoryFilterPopover Component
 * 
 * A popover for filtering log entries by category.
 * Shows a searchable list of categories with checkboxes.
 */
import { useState, useRef, useEffect } from 'preact/hooks';
import { SearchIcon, CloseIcon } from '../../icons';

export interface CategoryFilterPopoverProps {
  /** Available categories */
  categories: string[];
  /** Currently selected categories */
  selectedCategories: Set<string>;
  /** Callback when a category is toggled */
  onToggle: (category: string) => void;
  /** Callback to clear all selections */
  onClearAll: () => void;
  /** Callback to select all categories */
  onSelectAll: () => void;
  /** Callback when popover should close */
  onClose: () => void;
  /** Position offset for the popover */
  position?: { top: number; left: number };
}

/**
 * Category filter popover with search and multi-select
 */
export function CategoryFilterPopover({
  categories,
  selectedCategories,
  onToggle,
  onClearAll,
  onSelectAll,
  onClose,
  position
}: CategoryFilterPopoverProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const popoverRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Focus search input on mount
  useEffect(() => {
    searchInputRef.current?.focus();
  }, []);

  // Close on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [onClose]);

  // Filter categories by search query
  const filteredCategories = searchQuery.trim() === ''
    ? categories
    : categories.filter(cat =>
        cat.toLowerCase().includes(searchQuery.toLowerCase())
      );

  const handleToggle = (category: string) => {
    onToggle(category);
  };

  const handleClearAll = () => {
    onClearAll();
  };

  const handleSelectAll = () => {
    onSelectAll();
  };

  const selectedCount = selectedCategories.size;
  const totalCount = categories.length;

  return (
    <div
      ref={popoverRef}
      className="category-filter-popover"
      style={position ? { top: position.top, left: position.left } : undefined}
      role="dialog"
      aria-label="Category filter"
    >
      {/* Header */}
      <div className="popover-header">
        <h4>Filter Categories</h4>
        <button 
          className="close-btn" 
          onClick={onClose}
          aria-label="Close filter"
        >
          <CloseIcon />
        </button>
      </div>

      {/* Search */}
      <div className="popover-search">
        <SearchIcon />
        <input
          ref={searchInputRef}
          type="text"
          placeholder="Search categories..."
          value={searchQuery}
          onInput={(e) => setSearchQuery((e.target as HTMLInputElement).value)}
          aria-label="Search categories"
        />
      </div>

      {/* Actions */}
      <div className="popover-actions">
        <button 
          className="btn-text"
          onClick={handleSelectAll}
          disabled={selectedCount === totalCount}
        >
          Select All
        </button>
        <button 
          className="btn-text"
          onClick={handleClearAll}
          disabled={selectedCount === 0}
        >
          Clear All
        </button>
      </div>

      {/* Selection count */}
      {selectedCount > 0 && (
        <div className="popover-count">
          {selectedCount} of {totalCount} selected
        </div>
      )}

      {/* Category list */}
      <div className="popover-list" role="list">
        {filteredCategories.map(category => {
          const isSelected = selectedCategories.has(category);
          return (
            <label 
              key={category} 
              className="category-item"
              role="listitem"
            >
              <input
                type="checkbox"
                checked={isSelected}
                onChange={() => handleToggle(category)}
                aria-label={`Filter by ${category}`}
              />
              <span className="category-name">{category}</span>
              {isSelected && (
                <span className="check-indicator">✓</span>
              )}
            </label>
          );
        })}

        {filteredCategories.length === 0 && (
          <div className="no-results">
            No categories found matching "{searchQuery}"
          </div>
        )}
      </div>
    </div>
  );
}

export default CategoryFilterPopover;
