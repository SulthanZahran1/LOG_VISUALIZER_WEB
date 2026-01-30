import { useState } from 'preact/hooks';
import { FileUpload } from '../components/file/FileUpload'
import { RecentFiles } from '../components/file/RecentFiles'
import { LoadedFileCard } from '../components/file/LoadedFileCard'
import { NavButton } from '../components/layout/NavButton'
import type { FileInfo } from '../models/types'
import { currentSession, type ViewType } from '../stores/logStore'

interface HomeViewProps {
    recentFiles: FileInfo[]
    onUploadSuccess: (file: FileInfo) => void
    onFileSelect: (file: FileInfo) => void
    onFileMerge?: (files: FileInfo[]) => void
    onFileDelete: (id: string) => void
    onFileRename: (id: string, newName: string) => Promise<void>
    onOpenView: (viewType: ViewType) => void
    onClearSession?: () => void
}

type FileTabType = 'loaded' | 'recent';

export function HomeView({
    recentFiles,
    onUploadSuccess,
    onFileSelect,
    onFileMerge,
    onFileDelete,
    onFileRename,
    onOpenView,
    onClearSession
}: HomeViewProps) {
    // Default to 'loaded' tab when a session exists, otherwise 'recent'
    const [activeFileTab, setActiveFileTab] = useState<FileTabType>(
        currentSession.value ? 'loaded' : 'recent'
    );

    const handleNavigation = (view: ViewType) => {
        onOpenView(view);
    };

    const handleFileSelect = (file: FileInfo) => {
        onFileSelect(file);
        // Switch to loaded tab after selecting a file
        setActiveFileTab('loaded');
    };

    const handleUnload = () => {
        if (onClearSession) {
            onClearSession();
        }
        setActiveFileTab('recent');
    };

    // When a file is uploaded, switch to loaded tab
    const handleUploadSuccess = (file: FileInfo) => {
        onUploadSuccess(file);
        setActiveFileTab('loaded');
    };

    return (
        <div class="home-layout">
            <div class="home-container">
                <div class="top-section">
                    <div class="sidebar-column">
                        <div class="card upload-card">
                            <div class="card-header">
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                                    <polyline points="14,2 14,8 20,8" />
                                </svg>
                                Log File
                            </div>
                            <div class="card-content">
                                <FileUpload onUploadSuccess={handleUploadSuccess} />
                            </div>
                        </div>
                    </div>

                    <div class="main-column">
                        <div class="card files-card">
                            <div class="files-tabs">
                                <button
                                    class={`file-tab ${activeFileTab === 'loaded' ? 'active' : ''}`}
                                    onClick={() => setActiveFileTab('loaded')}
                                >
                                    <span class={`tab-indicator ${currentSession.value ? 'has-session' : ''}`}></span>
                                    Loaded
                                </button>
                                <button
                                    class={`file-tab ${activeFileTab === 'recent' ? 'active' : ''}`}
                                    onClick={() => setActiveFileTab('recent')}
                                >
                                    Recent
                                    {recentFiles.length > 0 && (
                                        <span class="tab-count">{recentFiles.length}</span>
                                    )}
                                </button>
                            </div>
                            <div class="files-content">
                                {activeFileTab === 'loaded' ? (
                                    <LoadedFileCard
                                        recentFiles={recentFiles}
                                        onOpenView={handleNavigation}
                                        onUnload={handleUnload}
                                    />
                                ) : (
                                    <RecentFiles
                                        files={recentFiles}
                                        onFileSelect={handleFileSelect}
                                        onFileDelete={onFileDelete}
                                        onFileRename={onFileRename}
                                        multiSelect={!!onFileMerge}
                                        onMultiSelect={onFileMerge}
                                        multiSelectLabel="Merge & Visualize"
                                        hideIcon
                                        title=""
                                    />
                                )}
                            </div>
                        </div>
                    </div>
                </div>

                <div class="nav-section">
                    <h3>Open Views</h3>
                    <div class="nav-grid">
                        <NavButton
                            title="Timing Diagram"
                            icon="waveform"
                            description="Visualize signal changes over time"
                            color="#4285F4"
                            disabled={!currentSession.value}
                            onClick={() => handleNavigation('waveform')}
                        />
                        <NavButton
                            title="Log Table"
                            icon="table"
                            description="Browse and filter log entries"
                            color="#34A853"
                            disabled={!currentSession.value}
                            onClick={() => handleNavigation('log-table')}
                        />
                        <NavButton
                            title="Map Viewer"
                            icon="map"
                            description="View carrier positions"
                            color="#FBBC04"
                            disabled={!currentSession.value}
                            onClick={() => handleNavigation('map-viewer')}
                        />
                        <NavButton
                            title="Transitions"
                            icon="chart"
                            description="Analyze signal intervals"
                            color="#EA4335"
                            disabled={!currentSession.value}
                            onClick={() => handleNavigation('transitions')}
                        />
                    </div>
                </div>
            </div>

            <style>{`
                .home-layout {
                    flex: 1;
                    display: flex;
                    justify-content: center;
                    padding: var(--spacing-xl);
                    overflow-y: auto;
                    background: var(--bg-primary);
                }

                .home-container {
                    max-width: 1000px;
                    width: 100%;
                    display: flex;
                    flex-direction: column;
                    gap: var(--spacing-xl);
                }

                .top-section {
                    display: flex;
                    gap: var(--spacing-lg);
                    height: 320px;
                }

                .sidebar-column {
                    flex: 4;
                    display: flex;
                }

                .main-column {
                    flex: 6;
                    display: flex;
                }

                .card {
                    flex: 1;
                    display: flex;
                    flex-direction: column;
                    background: var(--bg-secondary);
                    border: 1px solid var(--border-color);
                    border-radius: var(--card-radius);
                    overflow: hidden;
                }

                .card-header {
                    background: var(--bg-tertiary);
                    padding: var(--spacing-md) var(--spacing-lg);
                    border-bottom: 1px solid var(--border-color);
                    font-weight: 600;
                    font-size: 13px;
                    display: flex;
                    align-items: center;
                    gap: var(--spacing-sm);
                    color: var(--text-primary);
                }

                .card-header svg {
                    color: var(--primary-accent);
                }

                .card-content {
                    flex: 1;
                    padding: var(--spacing-md);
                    overflow-y: auto;
                }

                .upload-card .card-content {
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    background: var(--bg-primary);
                }

                /* Files Card with Tabs */
                .files-card {
                    flex: 1;
                    display: flex;
                    flex-direction: column;
                }

                .files-tabs {
                    display: flex;
                    background: var(--bg-tertiary);
                    border-bottom: 1px solid var(--border-color);
                }

                .file-tab {
                    flex: 1;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    gap: var(--spacing-sm);
                    padding: var(--spacing-md);
                    background: none;
                    border: none;
                    color: var(--text-muted);
                    font-size: 13px;
                    font-weight: 500;
                    cursor: pointer;
                    transition: all var(--transition-fast);
                    position: relative;
                }

                .file-tab:hover {
                    color: var(--text-secondary);
                    background: rgba(255, 255, 255, 0.03);
                }

                .file-tab.active {
                    color: var(--text-primary);
                    background: var(--bg-secondary);
                }

                .file-tab.active::after {
                    content: '';
                    position: absolute;
                    bottom: -1px;
                    left: 0;
                    right: 0;
                    height: 2px;
                    background: var(--primary-accent);
                }

                .tab-indicator {
                    width: 8px;
                    height: 8px;
                    border-radius: 50%;
                    background: var(--text-muted);
                    opacity: 0.3;
                }

                .tab-indicator.has-session {
                    background: var(--accent-success);
                    opacity: 1;
                    box-shadow: 0 0 6px var(--accent-success);
                }

                .tab-count {
                    background: var(--bg-primary);
                    padding: 2px 6px;
                    border-radius: 10px;
                    font-size: 11px;
                    color: var(--text-muted);
                }

                .file-tab.active .tab-count {
                    background: var(--bg-tertiary);
                    color: var(--text-secondary);
                }

                .files-content {
                    flex: 1;
                    overflow-y: auto;
                }

                .nav-section h3 {
                    font-size: 11px;
                    text-transform: uppercase;
                    letter-spacing: 0.5px;
                    color: var(--text-muted);
                    margin: 0 0 var(--spacing-md) 0;
                    font-weight: 600;
                    padding-left: 4px;
                }

                .nav-grid {
                    display: grid;
                    grid-template-columns: repeat(2, 1fr);
                    gap: var(--spacing-lg);
                    background: var(--bg-secondary);
                    padding: var(--spacing-lg);
                    border: 1px solid var(--border-color);
                    border-radius: var(--card-radius);
                }
            `}</style>
        </div>
    )
}
