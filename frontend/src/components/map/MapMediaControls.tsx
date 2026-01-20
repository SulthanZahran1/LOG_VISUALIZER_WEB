import {
    playbackTime, isPlaying, playbackSpeed, playbackStartTime, playbackEndTime,
    togglePlayback, skipForward, skipBackward, setPlaybackTime, setPlaybackSpeed,
    formatPlaybackTime
} from '../../stores/mapStore';
import { sortedBookmarks, jumpToBookmark } from '../../stores/bookmarkStore';
import { SkipBackIcon, PlayIcon, PauseIcon, SkipForwardIcon } from '../icons';
import './MapMediaControls.css';

const SPEED_OPTIONS = [0.5, 1, 2, 4, 10];

export function MapMediaControls() {
    const currentTime = playbackTime.value;
    const startTime = playbackStartTime.value;
    const endTime = playbackEndTime.value;
    const playing = isPlaying.value;
    const speed = playbackSpeed.value;

    // Calculate slider value (0-100)
    let sliderValue = 0;
    if (startTime !== null && endTime !== null && currentTime !== null && endTime > startTime) {
        sliderValue = ((currentTime - startTime) / (endTime - startTime)) * 100;
    }

    const handleSliderChange = (e: Event) => {
        const target = e.target as HTMLInputElement;
        const percent = parseFloat(target.value);
        if (startTime !== null && endTime !== null) {
            const newTime = startTime + (percent / 100) * (endTime - startTime);
            setPlaybackTime(newTime);
        }
    };

    const handleSpeedChange = (e: Event) => {
        const target = e.target as HTMLSelectElement;
        setPlaybackSpeed(parseFloat(target.value));
    };

    const hasData = startTime !== null && endTime !== null;

    return (
        <div class="map-media-controls">
            <div class="media-controls-row">
                {/* Skip Back */}
                <button
                    class="media-btn"
                    onClick={() => skipBackward(10)}
                    disabled={!hasData}
                    title="Skip back 10s"
                >
                    <SkipBackIcon size={14} /> 10s
                </button>

                {/* Play/Pause */}
                <button
                    class="media-btn play-btn"
                    onClick={togglePlayback}
                    disabled={!hasData}
                    title={playing ? 'Pause' : 'Play'}
                >
                    {playing ? <PauseIcon size={18} /> : <PlayIcon size={18} />}
                </button>

                {/* Skip Forward */}
                <button
                    class="media-btn"
                    onClick={() => skipForward(10)}
                    disabled={!hasData}
                    title="Skip forward 10s"
                >
                    10s <SkipForwardIcon size={14} />
                </button>

                {/* Speed Selector */}
                <select
                    class="speed-select"
                    value={speed}
                    onChange={handleSpeedChange}
                    disabled={!hasData}
                >
                    {SPEED_OPTIONS.map(s => (
                        <option key={s} value={s}>{s}x</option>
                    ))}
                </select>

                {/* Time Display */}
                <span class="time-display">
                    {formatPlaybackTime(currentTime)}
                    {endTime !== null && (
                        <span class="time-separator"> / {formatPlaybackTime(endTime)}</span>
                    )}
                </span>
            </div>

            {/* Timeline Slider */}
            <div class="timeline-row">
                <div class="timeline-container">
                    <input
                        type="range"
                        class="timeline-slider"
                        min="0"
                        max="100"
                        step="0.1"
                        value={sliderValue}
                        onInput={handleSliderChange}
                        disabled={!hasData}
                    />
                    {/* Bookmark markers on timeline */}
                    {hasData && sortedBookmarks.value.map(bookmark => {
                        const percent = ((bookmark.time - startTime!) / (endTime! - startTime!)) * 100;
                        if (percent < 0 || percent > 100) return null;
                        return (
                            <div
                                key={bookmark.id}
                                class="bookmark-marker"
                                style={{ left: `${percent}%` }}
                                onClick={() => jumpToBookmark(bookmark)}
                                title={bookmark.name}
                            />
                        );
                    })}
                </div>
            </div>

            {!hasData && (
                <div class="no-data-message">
                    Upload a log file to enable playback
                </div>
            )}
        </div>
    );
}
