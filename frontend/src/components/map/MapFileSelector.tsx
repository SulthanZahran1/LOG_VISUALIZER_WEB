import { useEffect, useState } from 'preact/hooks';
import {
    mapLayout,
    mapRules,
    recentMapFiles,
    recentFilesLoading,
    fetchMapLayout,
    fetchMapRules,
    fetchRecentMapFiles,
    carrierLogInfo,
    carrierLogFileName,
    fetchCarrierLog,
    signalLogSessionId,
    signalLogFileName,
    signalLogEntryCount,
    linkSignalLogSession,
} from '../../stores/mapStore';
import { currentSession, logEntries } from '../../stores/logStore';
import { uploadMapLayout, uploadMapRules, uploadCarrierLog } from '../../api/client';
import type { FileInfo } from '../../models/types';

import './MapFileSelector.css';

interface MapFileSelectorProps {
    onFilesChanged?: () => void;
}

export function MapFileSelector({ onFilesChanged }: MapFileSelectorProps) {
    const [showDialog, setShowDialog] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [carrierError, setCarrierError] = useState<string | null>(null);

    useEffect(() => {
        fetchRecentMapFiles();
        fetchCarrierLog();
    }, []);

    const handleUploadXML = async (e: Event) => {
        const input = e.target as HTMLInputElement;
        if (!input.files?.length) return;

        setUploading(true);
        try {
            await uploadMapLayout(input.files[0]);
            await fetchMapLayout();
            await fetchRecentMapFiles();
            onFilesChanged?.();
        } catch (err) {
            console.error('Failed to upload XML:', err);
        } finally {
            setUploading(false);
            input.value = '';
        }
    };

    const handleUploadYAML = async (e: Event) => {
        const input = e.target as HTMLInputElement;
        if (!input.files?.length) return;

        setUploading(true);
        try {
            await uploadMapRules(input.files[0]);
            await fetchMapRules();
            await fetchRecentMapFiles();
            onFilesChanged?.();
        } catch (err) {
            console.error('Failed to upload YAML:', err);
        } finally {
            setUploading(false);
            input.value = '';
        }
    };

    const handleSelectXML = async (_file: FileInfo) => {
        // For now, just re-fetch the layout (the backend uses the most recently uploaded)
        // In a full implementation, we'd add an endpoint to set active map by ID
        setShowDialog(false);
        await fetchMapLayout();
        onFilesChanged?.();
    };

    const handleSelectYAML = async (_file: FileInfo) => {
        // Similar - for now just re-fetch
        setShowDialog(false);
        await fetchMapRules();
        onFilesChanged?.();
    };

    const handleUploadCarrierLog = async (e: Event) => {
        const input = e.target as HTMLInputElement;
        if (!input.files?.length) return;

        setUploading(true);
        setCarrierError(null);
        try {
            const result = await uploadCarrierLog(input.files[0]);
            carrierLogFileName.value = result.fileName;
            await fetchCarrierLog();
            onFilesChanged?.();
        } catch (err) {
            const msg = err instanceof Error ? err.message : 'Upload failed';
            setCarrierError(msg);
            console.error('Failed to upload carrier log:', err);
        } finally {
            setUploading(false);
            input.value = '';
        }
    };

    const currentXML = mapLayout.value?.name || 'No XML loaded';
    const currentYAML = mapRules.value?.name || 'No rules loaded';
    const currentSignalLog = signalLogSessionId.value
        ? `${signalLogFileName.value || 'Session'} (${signalLogEntryCount.value})`
        : 'No signal log';

    const handleUseCurrentSession = () => {
        if (!currentSession.value || currentSession.value.status !== 'complete') return;
        linkSignalLogSession(
            currentSession.value.id,
            currentSession.value.fileId || 'Unnamed session',
            logEntries.value,
            currentSession.value.startTime,  // From backend session metadata
            currentSession.value.endTime     // From backend session metadata
        );
    };

    const sessionAvailable = currentSession.value?.status === 'complete';

    return (
        <div className="map-file-selector">
            <div className="file-status">
                <span className="file-label" title={currentXML}>
                    <strong>Layout:</strong> {currentXML}
                </span>
                <span className="file-label" title={currentYAML}>
                    <strong>Rules:</strong> {currentYAML}
                </span>
                <span className="file-label" title={currentSignalLog}>
                    <strong>Signals:</strong> {currentSignalLog}
                </span>
            </div>

            <button
                className="select-files-btn"
                onClick={() => setShowDialog(true)}
                disabled={uploading}
            >
                {uploading ? 'Uploading...' : 'Select Files'}
            </button>

            {showDialog && (
                <div className="file-dialog-overlay" onClick={() => setShowDialog(false)}>
                    <div className="file-dialog" onClick={e => e.stopPropagation()}>
                        <h3>Map Configuration Files</h3>

                        <div className="file-section">
                            <h4>XML Layout File</h4>
                            <input
                                type="file"
                                accept=".xml"
                                onChange={handleUploadXML}
                                id="xml-upload"
                                style={{ display: 'none' }}
                            />
                            <label htmlFor="xml-upload" className="upload-btn">
                                Upload New XML
                            </label>

                            <div className="recent-files">
                                {recentFilesLoading.value && <div className="loading">Loading...</div>}
                                {recentMapFiles.value?.xmlFiles?.length ? (
                                    recentMapFiles.value.xmlFiles.map(file => (
                                        <button
                                            key={file.id}
                                            className="file-item"
                                            onClick={() => handleSelectXML(file)}
                                        >
                                            {file.name}
                                        </button>
                                    ))
                                ) : (
                                    !recentFilesLoading.value && <div className="no-files">No XML files uploaded</div>
                                )}
                            </div>
                        </div>

                        <div className="file-section">
                            <h4>YAML Rules File</h4>
                            <input
                                type="file"
                                accept=".yaml,.yml"
                                onChange={handleUploadYAML}
                                id="yaml-upload"
                                style={{ display: 'none' }}
                            />
                            <label htmlFor="yaml-upload" className="upload-btn">
                                Upload New YAML
                            </label>

                            <div className="recent-files">
                                {recentFilesLoading.value && <div className="loading">Loading...</div>}
                                {recentMapFiles.value?.yamlFiles?.length ? (
                                    recentMapFiles.value.yamlFiles.map(file => (
                                        <button
                                            key={file.id}
                                            className="file-item"
                                            onClick={() => handleSelectYAML(file)}
                                        >
                                            {file.name}
                                        </button>
                                    ))
                                ) : (
                                    !recentFilesLoading.value && <div className="no-files">No YAML files uploaded</div>
                                )}
                            </div>
                        </div>

                        <div className="file-section">
                            <h4>Signal Log (PLC)</h4>
                            <p className="section-hint">Use your loaded log session for time-based coloring</p>
                            <button
                                className={`use-session-btn ${sessionAvailable ? '' : 'disabled'}`}
                                onClick={handleUseCurrentSession}
                                disabled={!sessionAvailable}
                            >
                                {sessionAvailable
                                    ? `Use: ${currentSession.value?.fileId || 'Current Session'}`
                                    : 'No session loaded'}
                            </button>
                            {signalLogSessionId.value && (
                                <div className="signal-log-info">
                                    ✓ Linked: {signalLogEntryCount.value} entries
                                </div>
                            )}
                        </div>

                        <div className="file-section">
                            <h4>Carrier Log (MCS Format)</h4>
                            <p className="section-hint">Upload an MCS/AMHS log for carrier tracking</p>
                            <input
                                type="file"
                                accept=".log,.txt"
                                onChange={handleUploadCarrierLog}
                                id="carrier-upload"
                                style={{ display: 'none' }}
                            />
                            <label htmlFor="carrier-upload" className="upload-btn">
                                Upload Carrier Log
                            </label>
                            {carrierError && (
                                <div className="error-message">{carrierError}</div>
                            )}
                            {carrierLogInfo.value?.loaded && (
                                <div className="carrier-info">
                                    ✓ Loaded: {carrierLogInfo.value.entryCount} entries
                                </div>
                            )}
                        </div>

                        <button className="close-btn" onClick={() => setShowDialog(false)}>
                            Close
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
