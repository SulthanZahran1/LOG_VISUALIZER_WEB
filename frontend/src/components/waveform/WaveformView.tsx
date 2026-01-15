import { SignalSidebar } from './SignalSidebar';
import { WaveformCanvas } from './WaveformCanvas';
import { WaveformToolbar } from './WaveformToolbar';
import { TimeSlider } from './TimeSlider';

export function WaveformView() {
    return (
        <div class="waveform-view">
            <WaveformToolbar />
            <div class="waveform-main">
                <SignalSidebar />
                <div class="waveform-content">
                    <WaveformCanvas />
                    <TimeSlider />
                </div>
            </div>

            <style>{`
                .waveform-view {
                    display: flex;
                    flex-direction: column;
                    flex: 1;
                    height: 100%;
                    background: var(--bg-primary);
                    overflow: hidden;
                    user-select: none;
                }

                .waveform-main {
                    display: flex;
                    flex: 1;
                    overflow: hidden;
                }

                .waveform-content {
                    flex: 1;
                    overflow: hidden;
                    display: flex;
                    flex-direction: column;
                    position: relative;
                    background: var(--bg-primary);
                }
            `}</style>
        </div>
    );
}
