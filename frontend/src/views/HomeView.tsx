import { FileUpload } from '../components/file/FileUpload'
import { RecentFiles } from '../components/file/RecentFiles'
import { NavButton } from '../components/layout/NavButton'
import type { FileInfo } from '../models/types'
import { currentSession, type ViewType } from '../stores/logStore'

interface HomeViewProps {
    recentFiles: FileInfo[]
    onUploadSuccess: (file: FileInfo) => void
    onFileSelect: (file: FileInfo) => void
    onFileDelete: (id: string) => void
    onFileRename: (id: string, newName: string) => Promise<void>
    onOpenView: (viewType: ViewType) => void
}

export function HomeView({ recentFiles, onUploadSuccess, onFileSelect, onFileDelete, onFileRename, onOpenView }: HomeViewProps) {
    const handleNavigation = (view: ViewType) => {
        onOpenView(view);
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
                                <FileUpload onUploadSuccess={onUploadSuccess} />
                            </div>
                        </div>
                    </div>

                    <div class="main-column">
                        <div class="card recent-files-card">
                            <div class="card-header">
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
                                    <polyline points="13,2 13,9 20,9" />
                                </svg>
                                Recent Files
                            </div>
                            <div class="card-content">
                                <RecentFiles
                                    files={recentFiles}
                                    onFileSelect={onFileSelect}
                                    onFileDelete={onFileDelete}
                                    onFileRename={onFileRename}
                                />
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
                            onClick={() => { }}
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
