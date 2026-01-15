import { useRef } from 'preact/hooks';
import { MapCanvas } from '../components/map/MapCanvas';
import { uploadMapLayout } from '../api/client';
import { fetchMapLayout, mapLayout } from '../stores/mapStore';

export function MapViewer() {
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleUploadClick = () => {
        fileInputRef.current?.click();
    };

    const handleFileChange = async (e: any) => {
        const file = e.target.files?.[0];
        if (!file) return;

        try {
            await uploadMapLayout(file);
            await fetchMapLayout();
        } catch (err) {
            console.error('Failed to upload map', err);
            alert('Failed to upload map: ' + err);
        }
    };

    return (
        <div class="view-container">
            {!mapLayout.value && (
                <div class="map-placeholder">
                    <h2>No Map Loaded</h2>
                    <p>Upload a conveyor map XML file to get started.</p>
                    <button class="primary-btn" onClick={handleUploadClick}>
                        Upload Map XML
                    </button>
                    <input
                        type="file"
                        ref={fileInputRef}
                        style={{ display: 'none' }}
                        accept=".xml"
                        onChange={handleFileChange}
                    />
                </div>
            )}
            {mapLayout.value && (
                <>
                    <div class="map-toolbar">
                        <button class="secondary-btn" onClick={handleUploadClick}>
                            Change Map
                        </button>
                    </div>
                    <MapCanvas />
                </>
            )}
            <style>{`
                .view-container {
                    display: flex;
                    flex-direction: column;
                    height: 100%;
                    width: 100%;
                    position: relative;
                }
                .map-placeholder {
                    flex: 1;
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: center;
                    gap: var(--spacing-md);
                    color: var(--text-secondary);
                }
                .map-toolbar {
                    padding: var(--spacing-sm);
                    background: var(--bg-secondary);
                    border-bottom: 1px solid var(--border-color);
                    display: flex;
                    justify-content: flex-end;
                }
                .primary-btn {
                    background: var(--primary-accent);
                    color: white;
                    border: none;
                    padding: 8px 16px;
                    border-radius: 4px;
                    cursor: pointer;
                    font-weight: 600;
                }
                .secondary-btn {
                    background: var(--bg-elevated);
                    color: var(--text-primary);
                    border: 1px solid var(--border-color);
                    padding: 4px 12px;
                    border-radius: 4px;
                    cursor: pointer;
                    font-size: 12px;
                }
            `}</style>
        </div>
    );
}
