import { useSignal } from '@preact/signals';
import type { ComponentChildren } from 'preact';
import { useRef, useEffect } from 'preact/hooks';

interface SplitPaneProps {
    direction?: 'horizontal' | 'vertical';
    children: [ComponentChildren, ComponentChildren];
    minSize?: number;
    initialSize?: number;
}

export function SplitPane({ direction = 'horizontal', children, minSize = 100, initialSize }: SplitPaneProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const size = useSignal(initialSize || 500);
    const isDragging = useSignal(false);

    const handleMouseDown = (e: MouseEvent) => {
        e.preventDefault();
        isDragging.value = true;
    };

    useEffect(() => {
        if (!isDragging.value) return;

        const onMouseMove = (e: MouseEvent) => {
            if (!containerRef.current) return;
            const rect = containerRef.current.getBoundingClientRect();

            let newSize: number;
            if (direction === 'horizontal') {
                newSize = e.clientX - rect.left;
            } else {
                newSize = e.clientY - rect.top;
            }

            size.value = Math.max(minSize, newSize);
        };

        const onMouseUp = () => {
            isDragging.value = false;
        };

        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup', onMouseUp);
        return () => {
            window.removeEventListener('mousemove', onMouseMove);
            window.removeEventListener('mouseup', onMouseUp);
        };
    }, [isDragging.value, direction, minSize]);

    return (
        <div
            ref={containerRef}
            class={`split-pane ${direction} ${isDragging.value ? 'dragging' : ''}`}
            style={{ display: 'flex', width: '100%', height: '100%', flexDirection: direction === 'horizontal' ? 'row' : 'column' }}
        >
            <div class="pane pane-1" style={{ [direction === 'horizontal' ? 'width' : 'height']: `${size.value}px`, flexShrink: 0 }}>
                {children[0]}
            </div>

            <div
                class="split-divider"
                onMouseDown={handleMouseDown}
                style={{
                    [direction === 'horizontal' ? 'width' : 'height']: '4px',
                    cursor: direction === 'horizontal' ? 'col-resize' : 'row-resize',
                    background: isDragging.value ? 'var(--accent-primary)' : 'var(--border-color)',
                    zIndex: 10
                }}
            />

            <div class="pane pane-2" style={{ flex: 1, overflow: 'hidden' }}>
                {children[1]}
            </div>

            <style>{`
        .split-pane {
          flex: 1;
        }
        .split-divider {
          transition: background 0.2s;
        }
        .split-divider:hover {
          background: var(--accent-primary) !important;
        }
        .pane {
          overflow: hidden;
          position: relative;
        }
      `}</style>
        </div>
    );
}
