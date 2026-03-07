import { useEffect, useState } from 'preact/hooks';
import { MapCanvas } from '../components/map/MapCanvas';
import { MapFileSelector, type MapDialogRequest, type MapDialogSection } from '../components/map/MapFileSelector';
import { MapFollowControls } from '../components/map/MapFollowControls';
import { CarrierPanel } from '../components/map/CarrierPanel';
import { FileUpload } from '../components/file/FileUpload';
import { RecentFiles } from '../components/file/RecentFiles';
import { uploadMapLayout } from '../api/client';
import type { FileInfo } from '../models/types';
import { AlertTriangleIcon, MapIcon } from '../components/icons';
import { currentSession, logEntries, useServerSide, fetchAllEntries, openView } from '../stores/logStore';
import {
    fetchMapLayout, fetchMapRules, mapLayout, mapRules,
    activeRulesId, signalLogSessionId, carrierLogInfo, linkSignalLogSession,
    carrierTrackingEnabled, toggleCarrierTracking, canEnableRules,
    recentMapFiles, fetchRecentMapFiles, loadMap,
    defaultMaps, fetchDefaultMaps, loadDefaultMapByName
} from '../stores/mapStore';

export function MapViewer() {
    const [initialized, setInitialized] = useState(false);
    const [dialogRequest, setDialogRequest] = useState<MapDialogRequest | null>(null);

    useEffect(() => {
        const init = async () => {
            await Promise.all([
                fetchMapLayout(),
                fetchMapRules(),
                fetchRecentMapFiles(),
                fetchDefaultMaps()
            ]);
            setInitialized(true);
        };
        init();
    }, []);

    const handleUploadSuccess = async () => {
        await fetchMapLayout();
        await fetchRecentMapFiles();
    };

    const requestFileDialog = (section: MapDialogSection) => {
        setDialogRequest(prev => ({
            key: (prev?.key || 0) + 1,
            section
        }));
    };

    const handleFilesChanged = () => {
        // Refresh data when files change
        fetchRecentMapFiles();
    };

    const handleRecentMapSelect = async (file: FileInfo) => {
        await loadMap(file.id);
    };

    const handleDefaultMapSelect = async (name: string) => {
        await loadDefaultMapByName(name);
    };

    const handleUseCurrentSession = async () => {
        if (!currentSession.value || currentSession.value.status !== 'complete') return;

        const sessionId = currentSession.value.id;
        const sessionName = currentSession.value.fileId || 'Unnamed session';
        const startTime = currentSession.value.startTime;
        const endTime = currentSession.value.endTime;
        const totalCount = currentSession.value.entryCount;

        // Link with currently available entries for immediate feedback.
        await linkSignalLogSession(
            sessionId,
            sessionName,
            logEntries.value,
            startTime,
            endTime,
            totalCount
        );

        // Load full client-side history when available.
        if (!useServerSide.value) {
            try {
                const allEntries = await fetchAllEntries(sessionId);
                await linkSignalLogSession(
                    sessionId,
                    sessionName,
                    allEntries,
                    startTime,
                    endTime,
                    totalCount
                );
            } catch (err) {
                console.error('Failed to load full session data for map:', err);
            }
        }
    };

    const hasMapLayout = !!mapLayout.value?.objects && Object.keys(mapLayout.value.objects).length > 0;
    const hasRules = !!activeRulesId.value;
    const hasSignalSession = !!signalLogSessionId.value;
    const hasCarrierLog = carrierLogInfo.value?.loaded === true;
    const sessionReady = currentSession.value?.status === 'complete';

    const checklistItems = [
        {
            key: 'layout',
            label: 'Layout XML',
            ready: hasMapLayout,
            detail: mapLayout.value?.name || 'No layout selected',
            actionLabel: 'Select Layout',
            onAction: () => requestFileDialog('xml')
        },
        {
            key: 'rules',
            label: 'Rules YAML',
            ready: hasRules,
            detail: mapRules.value?.name || 'No rules selected',
            actionLabel: 'Select Rules',
            onAction: () => requestFileDialog('yaml')
        },
        {
            key: 'signals',
            label: 'Signal Session',
            ready: hasSignalSession,
            detail: hasSignalSession
                ? 'Linked to map playback'
                : (sessionReady ? 'Current session can be linked' : 'No completed parse session'),
            actionLabel: sessionReady ? 'Link Current Session' : 'Go to Home',
            onAction: sessionReady ? handleUseCurrentSession : () => openView('home')
        },
        {
            key: 'carrier',
            label: 'Carrier Log',
            ready: hasCarrierLog,
            detail: hasCarrierLog ? 'Carrier tracking data loaded' : 'No carrier log loaded',
            actionLabel: 'Upload Carrier Log',
            onAction: () => requestFileDialog('carrier')
        }
    ] as const;

    const readyCount = checklistItems.filter(item => item.ready).length;

    if (!initialized) {
        return (
            <div class="view-container">
                <div class="map-loading">Loading...</div>
            </div>
        );
    }

    return (
        <div class="view-container map-viewer">
            <div class="map-setup-strip">
                <div class="setup-summary">
                    <strong>Map Readiness</strong>
                    <span>{readyCount}/4 ready</span>
                </div>
                <div class="readiness-list">
                    {checklistItems.map(item => (
                        <div key={item.key} class={`readiness-item ${item.ready ? 'ready' : 'pending'}`}>
                            <div class="readiness-main">
                                <span class={`readiness-dot ${item.ready ? 'ready' : 'pending'}`}></span>
                                <span class="readiness-label">{item.label}</span>
                            </div>
                            <span class="readiness-detail">{item.detail}</span>
                            {!item.ready && (
                                <button
                                    class="readiness-action"
                                    onClick={() => void item.onAction()}
                                >
                                    {item.actionLabel}
                                </button>
                            )}
                        </div>
                    ))}
                </div>
                <MapFileSelector
                    onFilesChanged={handleFilesChanged}
                    openDialogRequest={dialogRequest}
                    onUseCurrentSession={handleUseCurrentSession}
                />
            </div>

            {!hasMapLayout ? (
                <div class="map-placeholder">
                    <h2>Select a Map</h2>

                    {/* Default Maps Section */}
                    {defaultMaps.value.length > 0 && (
                        <div class="default-maps-section">
                            <p class="section-label">Default Maps</p>
                            <div class="default-maps-grid">
                                {defaultMaps.value.map(map => (
                                    <button
                                        key={map.id}
                                        class="default-map-card"
                                        onClick={() => handleDefaultMapSelect(map.name)}
                                    >
                                        <MapIcon size={24} />
                                        <span class="map-name">{map.name.replace('.xml', '')}</span>
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Divider */}
                    {defaultMaps.value.length > 0 && (
                        <div class="divider-or">
                            <span>or upload your own</span>
                        </div>
                    )}

                    {/* Upload Section */}
                    <div class="upload-container">
                        <FileUpload
                            onUploadSuccess={handleUploadSuccess}
                            uploadFn={uploadMapLayout}
                            accept=".xml"
                            maxSize={50 * 1024 * 1024} // 50MB for maps
                        />
                    </div>

                    {/* Recent Maps Section */}
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
                .map-setup-strip {
                    display: grid;
                    grid-template-columns: minmax(300px, 1fr) auto;
                    gap: var(--spacing-md);
                    padding: var(--spacing-sm) var(--spacing-md);
                    background: var(--bg-secondary);
                    border-bottom: 1px solid var(--border-color);
                    align-items: center;
                }
                .setup-summary {
                    display: flex;
                    align-items: center;
                    gap: var(--spacing-sm);
                    font-size: 0.8rem;
                    color: var(--text-secondary);
                    margin-bottom: 0.35rem;
                }
                .setup-summary strong {
                    color: var(--text-primary);
                    font-size: 0.88rem;
                }
                .readiness-list {
                    display: grid;
                    grid-template-columns: repeat(4, minmax(0, 1fr));
                    gap: 0.5rem;
                    min-width: 0;
                }
                .readiness-item {
                    border: 1px solid var(--border-color);
                    border-radius: 6px;
                    padding: 0.45rem 0.55rem;
                    background: var(--bg-primary);
                    display: flex;
                    flex-direction: column;
                    gap: 0.25rem;
                    min-width: 0;
                }
                .readiness-item.ready {
                    border-color: rgba(63, 185, 80, 0.45);
                }
                .readiness-main {
                    display: flex;
                    align-items: center;
                    gap: 0.45rem;
                }
                .readiness-dot {
                    width: 8px;
                    height: 8px;
                    border-radius: 50%;
                    flex-shrink: 0;
                }
                .readiness-dot.ready {
                    background: var(--accent-success);
                    box-shadow: 0 0 4px var(--accent-success);
                }
                .readiness-dot.pending {
                    background: var(--text-muted);
                }
                .readiness-label {
                    font-size: 0.78rem;
                    font-weight: 600;
                    color: var(--text-primary);
                    white-space: nowrap;
                    overflow: hidden;
                    text-overflow: ellipsis;
                }
                .readiness-detail {
                    font-size: 0.72rem;
                    color: var(--text-muted);
                    white-space: nowrap;
                    overflow: hidden;
                    text-overflow: ellipsis;
                }
                .readiness-action {
                    margin-top: 0.15rem;
                    font-size: 0.72rem;
                    border: 1px solid var(--border-color);
                    background: var(--bg-tertiary);
                    color: var(--text-secondary);
                    border-radius: 4px;
                    padding: 0.2rem 0.45rem;
                    cursor: pointer;
                    align-self: flex-start;
                }
                .readiness-action:hover {
                    border-color: var(--primary-accent);
                    color: var(--primary-accent);
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
                
                /* Default Maps Picker */
                .default-maps-section {
                    width: 100%;
                    max-width: 600px;
                    margin-bottom: var(--spacing-md);
                }
                .section-label {
                    font-size: 0.85rem;
                    color: var(--text-tertiary);
                    margin-bottom: var(--spacing-sm);
                    text-transform: uppercase;
                    letter-spacing: 0.05em;
                }
                .default-maps-grid {
                    display: grid;
                    grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
                    gap: var(--spacing-md);
                }
                .default-map-card {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: center;
                    gap: var(--spacing-sm);
                    padding: var(--spacing-lg);
                    background: var(--bg-secondary);
                    border: 1px solid var(--border-color);
                    border-radius: var(--card-radius);
                    cursor: pointer;
                    transition: all 0.2s ease;
                }
                .default-map-card:hover {
                    background: var(--bg-tertiary);
                    border-color: var(--accent-primary);
                    transform: translateY(-2px);
                }
                .default-map-card .map-name {
                    font-size: 0.9rem;
                    font-weight: 500;
                    color: var(--text-primary);
                    text-align: center;
                    word-break: break-word;
                }
                .divider-or {
                    display: flex;
                    align-items: center;
                    width: 100%;
                    max-width: 500px;
                    margin: var(--spacing-md) 0;
                    color: var(--text-tertiary);
                    font-size: 0.8rem;
                }
                .divider-or::before,
                .divider-or::after {
                    content: '';
                    flex: 1;
                    height: 1px;
                    background: var(--border-color);
                }
                .divider-or span {
                    padding: 0 var(--spacing-md);
                }
                @media (max-width: 1200px) {
                    .map-setup-strip {
                        grid-template-columns: 1fr;
                    }
                    .readiness-list {
                        grid-template-columns: repeat(2, minmax(0, 1fr));
                    }
                }
                @media (max-width: 720px) {
                    .readiness-list {
                        grid-template-columns: 1fr;
                    }
                }
            `}</style>

        </div>
    );
}
