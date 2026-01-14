import { FileUpload } from '../components/file/FileUpload'
import { RecentFiles } from '../components/file/RecentFiles'
import { NavButton } from '../components/layout/NavButton'
import type { FileInfo } from '../models/types'
import { currentSession, isSplitVertical, activeTab } from '../stores/logStore'

interface HomeViewProps {
    recentFiles: FileInfo[]
    onUploadSuccess: (file: FileInfo) => void
    onFileSelect: (file: FileInfo) => void
    onFileDelete: (id: string) => void
}

export function HomeView({ recentFiles, onUploadSuccess, onFileSelect, onFileDelete }: HomeViewProps) {
    const handleNavigation = (view: string) => {
        if (view === 'waveform' || view === 'log') {
            activeTab.value = 'log';
            if (view === 'waveform') {
                isSplitVertical.value = true;
            } else {
                isSplitVertical.value = false;
            }
        }
    };

    return (
        <div class="home-layout">
            <div class="home-container">
                <div class="welcome-section">
                    <h2>Welcome to PLC Log Visualizer</h2>
                    <p>Upload a log file or select from recent files to get started</p>
                </div>

                <div class="card log-file-card">
                    <div class="card-header">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                            <polyline points="14,2 14,8 20,8" />
                            <line x1="16" y1="13" x2="8" y2="13" />
                            <line x1="16" y1="17" x2="8" y2="17" />
                        </svg>
                        Log File
                    </div>
                    <div class="card-content">
                        <div class="upload-section">
                            <FileUpload onUploadSuccess={onUploadSuccess} />
                        </div>
                        <div class="recent-section">
                            <RecentFiles
                                files={recentFiles}
                                onFileSelect={onFileSelect}
                                onFileDelete={onFileDelete}
                            />
                        </div>
                    </div>
                </div>

                <div class="nav-section">
                    <h3>Quick Actions</h3>
                    <div class="nav-grid">
                        <NavButton
                            title="Timing Diagram"
                            icon="waveform"
                            description="Visualize signal changes over time"
                            disabled={!currentSession.value}
                            onClick={() => handleNavigation('waveform')}
                        />
                        <NavButton
                            title="Log Table"
                            icon="table"
                            description="Browse and filter log entries"
                            disabled={!currentSession.value}
                            onClick={() => handleNavigation('log')}
                        />
                        <NavButton
                            title="Map Viewer"
                            icon="map"
                            description="View carrier positions"
                            disabled={true}
                            onClick={() => handleNavigation('map')}
                        />
                        <NavButton
                            title="Transitions"
                            icon="chart"
                            description="Analyze signal intervals"
                            disabled={true}
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
                    max-width: 900px;
                    width: 100%;
                    display: flex;
                    flex-direction: column;
                    gap: var(--spacing-xl);
                }

                .welcome-section {
                    text-align: center;
                    padding: var(--spacing-lg) 0;
                }

                .welcome-section h2 {
                    font-size: 24px;
                    font-weight: 600;
                    color: var(--text-primary);
                    margin: 0 0 var(--spacing-sm) 0;
                }

                .welcome-section p {
                    font-size: 14px;
                    color: var(--text-muted);
                    margin: 0;
                }

                .log-file-card {
                    padding: 0;
                    overflow: hidden;
                }

                .card-header {
                    background: var(--bg-tertiary);
                    padding: var(--spacing-md) var(--spacing-lg);
                    border-bottom: 1px solid var(--border-color);
                    font-weight: 600;
                    font-size: 14px;
                    display: flex;
                    align-items: center;
                    gap: var(--spacing-sm);
                    color: var(--text-primary);
                }

                .card-header svg {
                    color: var(--primary-accent);
                }

                .card-content {
                    display: flex;
                    min-height: 300px;
                }

                .upload-section {
                    flex: 1.2;
                    border-right: 1px solid var(--border-color);
                    padding: var(--spacing-xl);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    background: var(--bg-primary);
                }

                .recent-section {
                    flex: 1;
                    display: flex;
                    flex-direction: column;
                    background: var(--bg-secondary);
                    overflow: hidden;
                }

                .nav-section h3 {
                    font-size: 11px;
                    text-transform: uppercase;
                    letter-spacing: 0.5px;
                    color: var(--text-muted);
                    margin: 0 0 var(--spacing-md) 0;
                    font-weight: 600;
                }

                .nav-grid {
                    display: grid;
                    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
                    gap: var(--spacing-md);
                }
            `}</style>
        </div>
    )
}
