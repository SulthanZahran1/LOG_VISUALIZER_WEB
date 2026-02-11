# State Management Patterns

## Store Architecture

Each store follows this pattern:

```typescript
// stores/exampleStore.ts
import { signal, computed, batch } from '@preact/signals';
import type { SomeType } from '../models/types';

// ==================== State ====================
export const items = signal<SomeType[]>([]);
export const loading = signal(false);
export const error = signal<string | null>(null);

// ==================== Computed ====================
export const itemCount = computed(() => items.value.length);

export const filteredItems = computed(() => {
    // Derived state that auto-updates
    return items.value.filter(i => i.active);
});

// ==================== Actions ====================
export function setItems(newItems: SomeType[]) {
    items.value = newItems;
}

export async function loadItems(sessionId: string) {
    loading.value = true;
    error.value = null;
    
    try {
        const data = await api.getItems(sessionId);
        items.value = data;
    } catch (err) {
        error.value = err instanceof Error ? err.message : 'Failed to load';
    } finally {
        loading.value = false;
    }
}

export function updateItem(id: string, updates: Partial<SomeType>) {
    items.value = items.value.map(item => 
        item.id === id ? { ...item, ...updates } : item
    );
}

// Batch updates for multiple changes
export function reset() {
    batch(() => {
        items.value = [];
        loading.value = false;
        error.value = null;
    });
}
```

## Using Stores in Components

### Basic Usage

```typescript
import { useSignal } from '@preact/signals';
import { items, loading, loadItems } from '../stores/exampleStore';

function MyComponent({ sessionId }: { sessionId: string }) {
    // Subscribe to signals
    const itemsList = useSignal(items);
    const isLoading = useSignal(loading);
    
    useEffect(() => {
        loadItems(sessionId);
    }, [sessionId]);
    
    if (isLoading.value) return <div>Loading...</div>;
    
    return <div>{itemsList.value.length} items</div>;
}
```

### Accessing Without useSignal (One-time read)

```typescript
// For event handlers or callbacks - won't trigger re-render
function handleClick() {
    console.log('Current count:', items.value.length);
}
```

## Cross-Store Communication

```typescript
// stores/storeA.ts
import { signal } from '@preact/signals';
export const selectedId = signal<string>('');

// stores/storeB.ts
import { computed } from '@preact/signals';
import { selectedId } from './storeA';

// Computed that reacts to another store
export const selectedItem = computed(() => {
    return items.value.find(i => i.id === selectedId.value);
});
```

## Store Testing

```typescript
// stores/exampleStore.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { items, loading, loadItems, setItems } from './exampleStore';

describe('exampleStore', () => {
    beforeEach(() => {
        // Reset state before each test
        items.value = [];
        loading.value = false;
        error.value = null;
    });
    
    it('should update items', () => {
        setItems([{ id: '1', name: 'Test' }]);
        expect(items.value).toHaveLength(1);
    });
    
    it('should handle loading state', async () => {
        const promise = loadItems('session-1');
        expect(loading.value).toBe(true);
        await promise;
        expect(loading.value).toBe(false);
    });
});
```

## Existing Stores Reference

| Store | Purpose | Key Signals |
|-------|---------|-------------|
| `logStore` | Log table state | `entries`, `filters`, `selectedRows`, `filteredEntries`, `currentSession`, `useServerSide` |
| `waveformStore` | Waveform view | `viewport`, `signals`, `zoom`, `selectedTime` |
| `mapStore` | Map viewer | `layout`, `playbackTime`, `carriers`, `isPlaying` |
| `bookmarkStore` | Cross-view bookmarks | `bookmarks`, `syncEnabled` |
| `selectionStore` | Cross-view selection | `selectedSignal` |
| `transitionStore` | Transition analysis | `rules`, `stats` |
