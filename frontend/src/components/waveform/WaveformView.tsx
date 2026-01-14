import { useSignal } from '@preact/signals';
import { useEffect, useRef } from 'preact/hooks';
import { SignalSidebar } from './SignalSidebar';
import { WaveformCanvas } from './WaveformCanvas';
import { viewRange, viewportWidth, isDragging, updateWaveformEntries } from '../../stores/waveformStore';
import { currentSession } from '../../stores/logStore';

export function WaveformView() {
    const containerRef = useRef<HTMLDivElement>(null);
    const lastX = useSignal(0);

    useEffect(() => {
        if (!viewRange.value && currentSession.value) {
            // Default range: first 10 seconds or something visible
            // We should ideally get this from the session or first poll
            viewRange.value = { start: 0, end: 10000 };
        }

        const handleResize = () => {
            if (containerRef.current) {
                viewportWidth.value = containerRef.current.clientWidth - 250; // Sidebar width
            }
        };

        const observer = new ResizeObserver(handleResize);
        if (containerRef.current) observer.observe(containerRef.current);

        handleResize();
        updateWaveformEntries();

        return () => observer.disconnect();
    }, []);

    const handleMouseDown = (e: MouseEvent) => {
        isDragging.value = true;
        lastX.value = e.clientX;
    };

    const handleMouseMove = (e: MouseEvent) => {
        if (!isDragging.value || !viewRange.value) return;

        const dx = e.clientX - lastX.value;
        lastX.value = e.clientX;

        const duration = viewRange.value.end - viewRange.value.start;
        const msPerPixel = duration / viewportWidth.value;
        const msShift = dx * msPerPixel;

        viewRange.value = {
            start: viewRange.value.start - msShift,
            end: viewRange.value.end - msShift
        };

        updateWaveformEntries();
    };

    const handleMouseUp = () => {
        isDragging.value = false;
    };

    const handleWheel = (e: WheelEvent) => {
        e.preventDefault();
        if (!viewRange.value) return;

        const factor = e.deltaY > 0 ? 1.1 : 0.9;
        const duration = viewRange.value.end - viewRange.value.start;
        const newDuration = duration * factor;
        const diff = newDuration - duration;

        // Simple zoom around center for now
        viewRange.value = {
            start: viewRange.value.start - diff / 2,
            end: viewRange.value.end + diff / 2
        };

        updateWaveformEntries();
    };

    return (
        <div class="waveform-view" ref={containerRef} onMouseUp={handleMouseUp} onMouseLeave={handleMouseUp}>
            <SignalSidebar />
            <div
                class="waveform-content"
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onWheel={handleWheel}
            >
                <TimeAxis />
                <WaveformCanvas />
            </div>

            <style>{`
                .waveform-view {
                    display: flex;
                    flex: 1;
                    height: 100%;
                    background: var(--bg-main);
                    overflow: hidden;
                    user-select: none;
                }

                .waveform-content {
                    flex: 1;
                    overflow: auto;
                    display: flex;
                    flex-direction: column;
                    position: relative;
                }
            `}</style>
        </div>
    );
}

function TimeAxis() {
    return (
        <div class="time-axis">
            {/* TODO: Add time ticks here */}
            <style>{`
                .time-axis {
                    height: 24px;
                    background: var(--bg-tertiary);
                    border-bottom: 1px solid var(--border-color);
                    flex-shrink: 0;
                }
            `}</style>
        </div>
    );
}
