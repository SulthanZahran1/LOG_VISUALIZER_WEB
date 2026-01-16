import { useEffect, useState } from 'preact/hooks';
import { MapCanvas } from '../components/map/MapCanvas';
import { MapFileSelector } from '../components/map/MapFileSelector';
import { FileUpload } from '../components/file/FileUpload';
import { uploadMapLayout } from '../api/client';
import { fetchMapLayout, fetchMapRules, mapLayout, mapRules } from '../stores/mapStore';

export function MapViewer() {
    const [initialized, setInitialized] = useState(false);

    useEffect(() => {
        const init = async () => {
            await Promise.all([fetchMapLayout(), fetchMapRules()]);
            setInitialized(true);
        };
        init();
    }, []);

    const handleUploadSuccess = async () => {
        await fetchMapLayout();
    };

    const handleFilesChanged = () => {
        // Refresh data when files change
    };

    if (!initialized) {
        return (
            <div class="view-container">
                <div class="map-loading">Loading...</div>
            </div>
        );
    }

    return (
        <div class="view-container">
            {!mapLayout.value?.objects || Object.keys(mapLayout.value.objects).length === 0 ? (
                <div class="map-placeholder">
                    <h2>No Map Loaded</h2>
                    <p>Upload a conveyor map XML file to get started.</p>
                    <div class="upload-container">
                        <FileUpload
                            onUploadSuccess={handleUploadSuccess}
                            uploadFn={uploadMapLayout}
                            accept=".xml"
                            maxSize={50 * 1024 * 1024} // 50MB for maps
                        />
                    </div>
                    <p class="hint">You'll also need a YAML rules file for carrier tracking.</p>
                </div>
            ) : (
                <>
                    <div class="map-toolbar">
                        <div class="toolbar-left">
                            <h3>{mapLayout.value.name || 'Conveyor Map'}</h3>
                            {!mapRules.value?.rules?.length && (
                                <span class="rules-warning">⚠️ No rules loaded</span>
                            )}
                        </div>
                        <MapFileSelector onFilesChanged={handleFilesChanged} />
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
                    padding: var(--spacing-xl);
                }
                .upload-container {
                    width: 100%;
                    max-width: 500px;
                }
                .map-toolbar {
                    padding: var(--spacing-sm) var(--spacing-md);
                    background: var(--bg-secondary);
                    border-bottom: 1px solid var(--border-color);
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                }
                .map-toolbar h3 {
                    margin: 0;
                    font-size: 14px;
                    font-weight: 600;
                    color: var(--text-primary);
                }
                
                /* Sidebar overlay for recent maps when no map is loaded */
                .recent-maps-sidebar {
                    position: absolute;
                    bottom: 0;
                    left: 0;
                    width: 300px;
                    top: 0;
                    background: var(--bg-secondary);
                    border-right: 1px solid var(--border-color);
                    z-index: 10;
                    display: ${mapLayout.value ? 'none' : 'flex'}; 
                    flex-direction: column;
                }
            `}</style>
        </div>
    );
}
