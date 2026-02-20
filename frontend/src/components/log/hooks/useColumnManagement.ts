/**
 * useColumnManagement Hook
 * 
 * Manages column state including ordering, resizing, and drag-drop reordering.
 */
import { useSignal } from '@preact/signals';
import { useCallback } from 'preact/hooks';

export type ColumnKey = 'timestamp' | 'deviceId' | 'signalName' | 'category' | 'value' | 'type';

export interface ColumnDef {
    key: ColumnKey;
    id: string;
    label: string;
    sortable: boolean;
    resizable: boolean;
}

export const DEFAULT_COLUMNS: ColumnDef[] = [
    { key: 'timestamp', id: 'ts', label: 'TIMESTAMP', sortable: true, resizable: true },
    { key: 'deviceId', id: 'dev', label: 'DEVICE ID', sortable: true, resizable: true },
    { key: 'signalName', id: 'sig', label: 'SIGNAL NAME', sortable: true, resizable: true },
    { key: 'category', id: 'cat', label: 'CATEGORY', sortable: true, resizable: true },
    { key: 'value', id: 'val', label: 'VALUE', sortable: false, resizable: true },
    { key: 'type', id: 'type', label: 'TYPE', sortable: false, resizable: false },
];

export const DEFAULT_COLUMN_ORDER: ColumnKey[] = ['timestamp', 'deviceId', 'signalName', 'category', 'value', 'type'];

export const DEFAULT_COLUMN_WIDTHS: Record<string, number> = {
    ts: 220,
    dev: 180,
    sig: 250,
    cat: 120,
    val: 150,
    type: 100
};

export interface ColumnManagementState {
    /** Current column order */
    columnOrder: ColumnKey[];
    /** Current column widths */
    columnWidths: Record<string, number>;
    /** Currently dragged column */
    draggedColumn: ColumnKey | null;
    /** Column being dragged over */
    dragOverColumn: ColumnKey | null;
}

export interface ColumnManagementActions {
    /** Start dragging a column */
    handleDragStart: (colKey: ColumnKey, e: DragEvent) => void;
    /** End dragging */
    handleDragEnd: (e: DragEvent) => void;
    /** Handle drag over */
    handleDragOver: (colKey: ColumnKey, e: DragEvent) => void;
    /** Handle drag leave */
    handleDragLeave: () => void;
    /** Handle drop */
    handleDrop: (targetColKey: ColumnKey, e: DragEvent) => void;
    /** Resize a column */
    handleResize: (colId: string, e: MouseEvent) => void;
    /** Get column width */
    getColumnWidth: (colId: string) => number;
    /** Check if column is being dragged */
    isDragging: (colKey: ColumnKey) => boolean;
    /** Check if column is being dragged over */
    isDragOver: (colKey: ColumnKey) => boolean;
    /** Reset to defaults */
    resetToDefaults: () => void;
}

/**
 * Hook for managing column state
 */
export function useColumnManagement(
    initialOrder: ColumnKey[] = DEFAULT_COLUMN_ORDER,
    initialWidths: Record<string, number> = DEFAULT_COLUMN_WIDTHS
): {
    state: ColumnManagementState;
    actions: ColumnManagementActions;
} {
    const columnOrder = useSignal<ColumnKey[]>([...initialOrder]);
    const columnWidths = useSignal<Record<string, number>>({ ...initialWidths });
    const draggedColumn = useSignal<ColumnKey | null>(null);
    const dragOverColumn = useSignal<ColumnKey | null>(null);

    const handleDragStart = useCallback((colKey: ColumnKey, e: DragEvent) => {
        draggedColumn.value = colKey;
        e.dataTransfer!.effectAllowed = 'move';
        e.dataTransfer!.setData('text/plain', colKey);
        const target = e.target as HTMLElement;
        target.classList.add('dragging');
    }, []);

    const handleDragEnd = useCallback((e: DragEvent) => {
        const target = e.target as HTMLElement;
        target.classList.remove('dragging');
        draggedColumn.value = null;
        dragOverColumn.value = null;
    }, []);

    const handleDragOver = useCallback((colKey: ColumnKey, e: DragEvent) => {
        e.preventDefault();
        e.dataTransfer!.dropEffect = 'move';
        if (draggedColumn.value && draggedColumn.value !== colKey) {
            dragOverColumn.value = colKey;
        }
    }, []);

    const handleDragLeave = useCallback(() => {
        dragOverColumn.value = null;
    }, []);

    const handleDrop = useCallback((targetColKey: ColumnKey, e: DragEvent) => {
        e.preventDefault();
        const sourceColKey = e.dataTransfer!.getData('text/plain') as ColumnKey;

        if (sourceColKey && sourceColKey !== targetColKey) {
            const newOrder = [...columnOrder.value];
            const sourceIdx = newOrder.indexOf(sourceColKey);
            const targetIdx = newOrder.indexOf(targetColKey);

            if (sourceIdx !== -1 && targetIdx !== -1) {
                newOrder.splice(sourceIdx, 1);
                newOrder.splice(targetIdx, 0, sourceColKey);
                columnOrder.value = newOrder;
            }
        }

        draggedColumn.value = null;
        dragOverColumn.value = null;
    }, []);

    const handleResize = useCallback((colId: string, e: MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        const startX = e.clientX;
        const startWidth = columnWidths.value[colId];

        const onMouseMove = (moveEvent: MouseEvent) => {
            const delta = moveEvent.clientX - startX;
            columnWidths.value = {
                ...columnWidths.value,
                [colId]: Math.max(50, startWidth + delta)
            };
        };

        const onMouseUp = () => {
            window.removeEventListener('mousemove', onMouseMove);
            window.removeEventListener('mouseup', onMouseUp);
        };

        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup', onMouseUp);
    }, []);

    const getColumnWidth = useCallback((colId: string): number => {
        return columnWidths.value[colId] ?? 100;
    }, []);

    const isDragging = useCallback((colKey: ColumnKey): boolean => {
        return draggedColumn.value === colKey;
    }, []);

    const isDragOver = useCallback((colKey: ColumnKey): boolean => {
        return dragOverColumn.value === colKey;
    }, []);

    const resetToDefaults = useCallback(() => {
        columnOrder.value = [...initialOrder];
        columnWidths.value = { ...initialWidths };
    }, [initialOrder, initialWidths]);

    const state: ColumnManagementState = {
        columnOrder: columnOrder.value,
        columnWidths: columnWidths.value,
        draggedColumn: draggedColumn.value,
        dragOverColumn: dragOverColumn.value
    };

    const actions: ColumnManagementActions = {
        handleDragStart,
        handleDragEnd,
        handleDragOver,
        handleDragLeave,
        handleDrop,
        handleResize,
        getColumnWidth,
        isDragging,
        isDragOver,
        resetToDefaults
    };

    return { state, actions };
}

export default useColumnManagement;
