import { useRef, useState, useEffect, useCallback } from 'preact/hooks';
import { currentSession } from '../../stores/logStore';
import { scrollOffset, zoomLevel, viewportWidth } from '../../stores/waveformStore';

export function TimeSlider() {
    const sliderRef = useRef<HTMLDivElement>(null);
    const [isDragging, setIsDragging] = useState(false);

    const session = currentSession.value;
    const totalDuration = (session && session.endTime && session.startTime) ? session.endTime - session.startTime : 1;
    const viewDuration = (viewportWidth.value / zoomLevel.value);

    // Calculate thumb position and size
    // Clamp values to ensure safe rendering
    const safeTotal = Math.max(totalDuration, 1);
    const thumbSizePct = Math.min(Math.max((viewDuration / safeTotal) * 100, 1), 100);

    // Default to 0 if no session
    const startTime = session?.startTime || 0;
    const relativeOffset = scrollOffset.value - startTime;
    const thumbLeftPct = Math.min(Math.max((relativeOffset / safeTotal) * 100, 0), 100 - thumbSizePct);

    const handleMouseDown = (e: MouseEvent) => {
        if (!sliderRef.current) return;

        setIsDragging(true);
        updateFromMouse(e.clientX);
    };

    const updateFromMouse = useCallback((clientX: number) => {
        if (!sliderRef.current || !session || session.startTime === undefined || session.endTime === undefined) return;

        const rect = sliderRef.current.getBoundingClientRect();
        const pct = (clientX - rect.left) / rect.width;

        // Calculate max scroll position
        const maxScroll = session.endTime - viewDuration;

        // Calculate target start time from mouse position percentage
        const targetStart = session.startTime + (pct * totalDuration);
        const safeStart = Math.max(session.startTime, Math.min(targetStart, maxScroll));

        scrollOffset.value = safeStart;
    }, [session, totalDuration, viewDuration]);

    useEffect(() => {
        const handleWindowMouseMove = (e: MouseEvent) => {
            if (isDragging) {
                e.preventDefault();
                updateFromMouse(e.clientX);
            }
        };

        const handleWindowMouseUp = () => {
            setIsDragging(false);
        };

        if (isDragging) {
            window.addEventListener('mousemove', handleWindowMouseMove);
            window.addEventListener('mouseup', handleWindowMouseUp);
        }

        return () => {
            window.removeEventListener('mousemove', handleWindowMouseMove);
            window.removeEventListener('mouseup', handleWindowMouseUp);
        };
    }, [isDragging, updateFromMouse]);

    const isDisabled = !session || session.startTime === undefined || session.endTime === undefined;

    return (
        <div class="time-slider-container">
            <div
                ref={sliderRef}
                class={`time-slider-track ${isDisabled ? 'disabled' : ''}`}
                onMouseDown={isDisabled ? undefined : handleMouseDown}
            >
                {!isDisabled && (
                    <div
                        class="time-slider-thumb"
                        style={{
                            left: `${thumbLeftPct}%`,
                            width: `${thumbSizePct}%`
                        }}
                    />
                )}
            </div>
            <style>{`
                .time-slider-container {
                    height: 16px;
                    background: var(--bg-tertiary);
                    border-top: 1px solid var(--border-color);
                    display: flex;
                    align-items: center;
                    padding: 0 4px;
                    flex-shrink: 0;
                }
                
                .time-slider-track {
                    flex: 1;
                    height: 8px;
                    background: var(--bg-secondary);
                    border-radius: 4px;
                    position: relative;
                    cursor: pointer;
                    overflow: hidden;
                    transition: opacity 0.2s;
                }

                .time-slider-track.disabled {
                    opacity: 0.3;
                    pointer-events: none;
                    cursor: not-allowed;
                }
                
                .time-slider-thumb {
                    position: absolute;
                    top: 0;
                    height: 100%;
                    background: var(--primary-accent);
                    border-radius: 4px;
                    opacity: 0.8;
                    pointer-events: none;
                }

                .time-slider-track:hover .time-slider-thumb {
                    opacity: 1;
                }
            `}</style>
        </div>
    );
}
