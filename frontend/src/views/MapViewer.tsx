import { useEffect, useState } from 'preact/hooks';
import { MapCanvas } from '../components/map/MapCanvas';
import { MapFileSelector } from '../components/map/MapFileSelector';
import { MapFollowControls } from '../components/map/MapFollowControls';
import { CarrierPanel } from '../components/map/CarrierPanel';
import { FileUpload } from '../components/file/FileUpload';
import { RecentFiles } from '../components/file/RecentFiles';
import { uploadMapLayout } from '../api/client';
import type { FileInfo } from '../models/types';
import { AlertTriangleIcon } from '../components/icons';
import {
    fetchMapLayout, fetchMapRules, mapLayout, mapRules,
    carrierTrackingEnabled, toggleCarrierTracking, canEnableRules,
    recentMapFiles, fetchRecentMapFiles, loadMap
} from '../stores/mapStore';

export function MapViewer() {
    const [initialized, setInitialized] = useState(false);

    useEffect(() => {
        const init = async () => {
            await Promise.all([fetchMapLayout(), fetchMapRules(), fetchRecentMapFiles()]);
            setInitialized(true);
        };
        init();
    }, []);

    const handleUploadSuccess = async () => {
        await fetchMapLayout();
        await fetchRecentMapFiles();
    };

    const handleFilesChanged = () => {
        // Refresh data when files change
        fetchRecentMapFiles();
    };

    const handleRecentMapSelect = async (file: FileInfo) => {
        await loadMap(file.id);
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
                    {recentMapFiles.value?.xmlFiles && recentMapFiles.value.xmlFiles.length > 0 && (
                        <div class="recent-maps-container">
                            <RecentFiles
                                files={recentMapFiles.value.xmlFiles}
                                onFileSelect={handleRecentMapSelect}
                                title="Recent Layouts"
                                className="map-recent-files"
                                hideIcon={true}
                            />
                        </div>
                    )}
                    <p class="hint">You'll also need a YAML rules file for carrier tracking.</p>
                </div>
            ) : (
                <>
                    <div class="map-toolbar">
                        <div class="toolbar-left">
                            <h3>{mapLayout.value.name || 'Conveyor Map'}</h3>
                            {!mapRules.value?.rules?.length && (
                                <span class="rules-warning"><AlertTriangleIcon size={14} /> No rules loaded</span>
                            )}
                        </div>
                        <div class="toolbar-center">
                            <button
                                class={`tracking-toggle ${carrierTrackingEnabled.value ? 'active' : ''}`}
                                onClick={toggleCarrierTracking}
                                disabled={!canEnableRules.value}
                                title={!canEnableRules.value ? 'Load XML Layout and YAML Rules to enable tracking' : ''}
                            >
                                <><span class={`status-dot ${carrierTrackingEnabled.value ? 'on' : 'off'}`} /> Tracking {carrierTrackingEnabled.value ? 'ON' : 'OFF'}</>
                            </button>
                            {carrierTrackingEnabled.value && <MapFollowControls />}
                        </div>
                        <MapFileSelector onFilesChanged={handleFilesChanged} />
                    </div>
                    <MapCanvas />
                    <CarrierPanel />
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
                .recent-maps-container {
                    width: 100%;
                    max-width: 500px;
                    margin-top: var(--spacing-lg);
                    border: 1px solid var(--border-color);
                    border-radius: var(--card-radius);
                    background: var(--bg-secondary);
                    max-height: 200px;
                    overflow: hidden;
                }
                .map-recent-files {
                    height: 100%;
                    max-height: 200px;
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
                .toolbar-center {
                    display: flex;
                    gap: 0.5rem;
                }
                .tracking-toggle {
                    padding: 0.4rem 0.8rem;
                    background: var(--bg-tertiary);
                    border: 1px solid var(--border-color);
                    border-radius: 4px;
                    color: var(--text-secondary);
                    cursor: pointer;
                    font-size: 0.85rem;
                    transition: all 0.2s;
                }
                .tracking-toggle:hover {
                    background: var(--bg-quaternary);
                }
                .tracking-toggle.active {
                    background: rgba(144, 238, 144, 0.2);
                    border-color: #90EE90;
                    color: #90EE90;
                }
                .rules-warning {
                    font-size: 0.85rem;
                    margin-left: 1rem;
                    color: #FFA500;
                    display: flex;
                    align-items: center;
                    gap: 4px;
                }
                .status-dot {
                    display: inline-block;
                    width: 8px;
                    height: 8px;
                    border-radius: 50%;
                    margin-right: 4px;
                }
                .status-dot.on {
                    background: #90EE90;
                    box-shadow: 0 0 4px #90EE90;
                }
                .status-dot.off {
                    background: #6e7681;
                }
            `}</style>
        </div>
    );
}
