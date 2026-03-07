import { useEffect, useRef, useState } from 'preact/hooks';
import {
    mapLayout,
    mapRules,
    activeRulesId,
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
    loadMap,
    loadRules,
} from '../../stores/mapStore';
import { currentSession } from '../../stores/logStore';
import { uploadMapLayout, uploadMapRules, uploadCarrierLog } from '../../api/client';
import type { FileInfo } from '../../models/types';
import { CheckIcon } from '../icons';

import './MapFileSelector.css';

interface MapFileSelectorProps {
    onFilesChanged?: () => void;
    openDialogRequest?: MapDialogRequest | null;
    onUseCurrentSession?: () => Promise<void>;
}

export type MapDialogSection = 'xml' | 'yaml' | 'signal' | 'carrier';

export interface MapDialogRequest {
    key: number;
    section?: MapDialogSection;
}

export function MapFileSelector({ onFilesChanged, openDialogRequest, onUseCurrentSession }: MapFileSelectorProps) {
    const [showDialog, setShowDialog] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [carrierError, setCarrierError] = useState<string | null>(null);
    const [highlightedSection, setHighlightedSection] = useState<MapDialogSection | null>(null);
    const xmlSectionRef = useRef<HTMLDivElement>(null);
    const yamlSectionRef = useRef<HTMLDivElement>(null);
    const signalSectionRef = useRef<HTMLDivElement>(null);
    const carrierSectionRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        fetchRecentMapFiles();
        fetchCarrierLog();
    }, []);

    useEffect(() => {
        if (!openDialogRequest || openDialogRequest.key <= 0) {
            return;
        }
        setShowDialog(true);
        setHighlightedSection(openDialogRequest.section ?? null);
    }, [openDialogRequest]);

    useEffect(() => {
        if (!showDialog || !highlightedSection) {
            return;
        }
        const sectionRef =
            highlightedSection === 'xml'
                ? xmlSectionRef
                : highlightedSection === 'yaml'
                    ? yamlSectionRef
                    : highlightedSection === 'signal'
                        ? signalSectionRef
                        : carrierSectionRef;
        sectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, [showDialog, highlightedSection]);

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

    const handleSelectXML = async (file: FileInfo) => {
        try {
            await loadMap(file.id);
            setShowDialog(false);
            setHighlightedSection(null);
            onFilesChanged?.();
        } catch (err) {
            console.error('Failed to activate XML layout:', err);
        }
    };

    const handleSelectYAML = async (file: FileInfo) => {
        try {
            await loadRules(file.id);
            setShowDialog(false);
            setHighlightedSection(null);
            onFilesChanged?.();
        } catch (err) {
            console.error('Failed to activate YAML rules:', err);
        }
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
    const currentMapId = mapLayout.value?.id || null;
    const currentRulesId = activeRulesId.value;
    const currentSignalLog = signalLogSessionId.value
        ? `${signalLogFileName.value || 'Session'} (${signalLogEntryCount.value})`
        : 'No signal log';

    const handleUseCurrentSession = async () => {
        if (!onUseCurrentSession) {
            return;
        }
        await onUseCurrentSession();
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
                onClick={() => {
                    setShowDialog(true);
                    setHighlightedSection(null);
                }}
                disabled={uploading}
            >
                {uploading ? 'Uploading...' : 'Select Files'}
            </button>

            {showDialog && (
                <div className="file-dialog-overlay" onClick={() => {
                    setShowDialog(false);
                    setHighlightedSection(null);
                }}>
                    <div className="file-dialog" onClick={e => e.stopPropagation()}>
                        <h3>Map Configuration Files</h3>

                        <div
                            ref={xmlSectionRef}
                            className={`file-section ${highlightedSection === 'xml' ? 'focus-target' : ''}`}
                        >
                            <h4>XML Layout File</h4>
                            <p className="section-hint">Select a file below to activate it as the current layout.</p>
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
                                            className={`file-item ${currentMapId === file.id ? 'active' : ''}`}
                                            onClick={() => handleSelectXML(file)}
                                        >
                                            <span>{file.name}</span>
                                            {currentMapId === file.id && <span className="active-pill">Active</span>}
                                        </button>
                                    ))
                                ) : (
                                    !recentFilesLoading.value && <div className="no-files">No XML files uploaded</div>
                                )}
                            </div>
                        </div>

                        <div
                            ref={yamlSectionRef}
                            className={`file-section ${highlightedSection === 'yaml' ? 'focus-target' : ''}`}
                        >
                            <h4>YAML Rules File</h4>
                            <p className="section-hint">Select a file below to activate it for map coloring/tracking rules.</p>
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
                                            className={`file-item ${currentRulesId === file.id ? 'active' : ''}`}
                                            onClick={() => handleSelectYAML(file)}
                                        >
                                            <span>{file.name}</span>
                                            {currentRulesId === file.id && <span className="active-pill">Active</span>}
                                        </button>
                                    ))
                                ) : (
                                    !recentFilesLoading.value && <div className="no-files">No YAML files uploaded</div>
                                )}
                            </div>
                        </div>

                        <div
                            ref={signalSectionRef}
                            className={`file-section ${highlightedSection === 'signal' ? 'focus-target' : ''}`}
                        >
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
                                    <CheckIcon size={14} /> Linked: {signalLogEntryCount.value} entries
                                </div>
                            )}
                        </div>

                        <div
                            ref={carrierSectionRef}
                            className={`file-section ${highlightedSection === 'carrier' ? 'focus-target' : ''}`}
                        >
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
                                    <CheckIcon size={14} /> Loaded: {carrierLogInfo.value.entryCount} entries
                                </div>
                            )}
                        </div>

                        <button className="close-btn" onClick={() => {
                            setShowDialog(false);
                            setHighlightedSection(null);
                        }}>
                            Close
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
