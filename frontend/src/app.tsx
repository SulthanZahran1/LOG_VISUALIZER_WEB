import { useSignal } from '@preact/signals'
import { useEffect } from 'preact/hooks'
import { checkHealth, getRecentFiles, deleteFile } from './api/client'
import { LogTable } from './components/log/LogTable'
import { WaveformView } from './components/waveform/WaveformView'
import { currentSession, startParsing, logError, initLogStore, isSyncEnabled, activeTab, openViews, openView, closeView, type ViewType } from './stores/logStore'
import { HomeView } from './views/HomeView'
import type { FileInfo } from './models/types'

/**
 * Main App Shell
 * PLC Log Visualizer - Industrial Dark Theme
 */
export function App() {
  const status = useSignal<'checking' | 'connected' | 'error'>('checking')
  const errorMessage = useSignal<string | null>(null)
  const recentFiles = useSignal<FileInfo[]>([])
  const showHelp = useSignal(false)

  const fetchFiles = async () => {
    try {
      const files = await getRecentFiles()
      recentFiles.value = files || []
    } catch (err) {
      console.error('Failed to fetch recent files', err)
      recentFiles.value = []
    }
  }

  useEffect(() => {
    checkHealth()
      .then(() => {
        status.value = 'connected'
        fetchFiles()
        initLogStore()
      })
      .catch((err) => {
        status.value = 'error'
        errorMessage.value = err.message || 'Failed to connect to backend'
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleUploadSuccess = (file: FileInfo) => {
    recentFiles.value = [file, ...recentFiles.value]
  }

  const handleFileSelect = (file: FileInfo) => {
    startParsing(file.id)
    openView('log-table')
  }

  const handleFileDelete = async (id: string) => {
    try {
      await deleteFile(id)
      recentFiles.value = recentFiles.value.filter(f => f.id !== id)
    } catch (err) {
      console.error('Failed to delete file', err)
    }
  }

  const handleSyncViews = () => {
    isSyncEnabled.value = !isSyncEnabled.value;
  }

  const handleClearSession = () => {
    currentSession.value = null
    // Close all views except home
    openViews.value = ['home'];
    activeTab.value = 'home'
    isSyncEnabled.value = false;
  }

  const handleOpenView = (viewType: ViewType) => {
    openView(viewType);
  }

  const handleCloseView = (viewType: ViewType) => {
    closeView(viewType);
  }

  const getViewLabel = (viewType: ViewType): string => {
    switch (viewType) {
      case 'home': return 'Home';
      case 'log-table': return 'Log Table';
      case 'waveform': return 'Timing Diagram';
      case 'map-viewer': return 'Map Viewer';
      default: return viewType;
    }
  }

  const getViewIcon = (viewType: ViewType) => {
    switch (viewType) {
      case 'home':
        return <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />;
      case 'log-table':
        return <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14,2 14,8 20,8" /></>;
      case 'waveform':
        return <path d="M3 12h4l3-9 4 18 3-9h4" />;
      case 'map-viewer':
        return <><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M3 9h18M9 3v18" /></>;
      default:
        return null;
    }
  }

  return (
    <div class="app-container">
      <header class="app-header">
        <div class="header-left">
          <div class="app-logo">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <path d="M3 12h4l3-9 4 18 3-9h4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <h1 class="app-title">PLC Log Visualizer</h1>
        </div>

        <div class="header-center">
          <button
            class={`header-btn ${isSyncEnabled.value ? 'active' : ''}`}
            disabled={!currentSession.value}
            onClick={handleSyncViews}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M23 4v6h-6M1 20v-6h6" />
              <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
            </svg>
            Sync
          </button>
          <button class="header-btn header-btn-danger" disabled={!currentSession.value} onClick={handleClearSession}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="3,6 5,6 21,6" />
              <path d="M19,6v14a2,2 0 0,1-2,2H7a2,2 0 0,1-2-2V6m3,0V4a2,2 0 0,1,2-2h4a2,2 0 0,1,2,2v2" />
            </svg>
            Clear
          </button>
        </div>

        <div class="header-right">
          <button class="header-btn header-btn-help" onClick={() => showHelp.value = true}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
            Help
          </button>
          <div class="status-indicator">
            <span class={`status-dot ${status.value}`}></span>
            {status.value === 'connected' ? 'Connected' : status.value === 'error' ? 'Error' : 'Checking...'}
          </div>
        </div>
      </header>

      <div class="app-tabs">
        {openViews.value.map(viewType => (
          <button
            key={viewType}
            class={`tab-item ${activeTab.value === viewType ? 'active' : ''} ${viewType !== 'home' && currentSession.value?.status === 'parsing' ? 'parsing' : ''}`}
            onClick={() => activeTab.value = viewType}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              {getViewIcon(viewType)}
            </svg>
            {getViewLabel(viewType)}
            {viewType !== 'home' && currentSession.value?.status === 'parsing' && (
              <span class="parsing-badge">{Math.floor(currentSession.value.progress)}%</span>
            )}
            {viewType !== 'home' && (
              <span
                class="tab-close"
                onClick={(e) => { e.stopPropagation(); handleCloseView(viewType); }}
              >
                ×
              </span>
            )}
          </button>
        ))}
      </div>

      <main class="app-main">
        {logError.value && (
          <div class="error-banner">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            Parsing Error: {logError.value}
            <button onClick={() => logError.value = null}>✕</button>
          </div>
        )}

        {activeTab.value === 'home' && (
          <HomeView
            recentFiles={recentFiles.value}
            onUploadSuccess={handleUploadSuccess}
            onFileSelect={handleFileSelect}
            onFileDelete={handleFileDelete}
            onOpenView={handleOpenView}
          />
        )}
        {activeTab.value === 'log-table' && <LogTable />}
        {activeTab.value === 'waveform' && <WaveformView />}

        {showHelp.value && (
          <div class="help-overlay" onClick={() => showHelp.value = false}>
            <div class="help-modal" onClick={(e) => e.stopPropagation()}>
              <div class="help-header">
                <h2>PLC Log Visualizer Help</h2>
                <button onClick={() => showHelp.value = false}>✕</button>
              </div>
              <div class="help-content">
                <h3>Keyboard Shortcuts</h3>
                <ul>
                  <li><kbd>Ctrl</kbd> + <kbd>C</kbd> — Copy selected rows</li>
                  <li><kbd>Ctrl</kbd> + Click — Individual selection</li>
                  <li><kbd>Shift</kbd> + Click — Range selection</li>
                </ul>
                <h3>View Controls</h3>
                <ul>
                  <li><strong>Sync Views:</strong> Synchronizes scroll position across split panes.</li>
                  <li><strong>Clear:</strong> Closes the current session and resets layout.</li>
                </ul>
                <h3>Waveform View</h3>
                <ul>
                  <li>Right-click log entries → <strong>Add to Waveform</strong></li>
                  <li><kbd>Ctrl</kbd> + Scroll — Zoom in/out</li>
                  <li>Drag — Pan the timeline</li>
                </ul>
              </div>
            </div>
          </div>
        )}
      </main>

      <footer class="app-footer">
        <div class="footer-left">
          <span>PLC Log Visualizer v0.1.0</span>
          <span class="footer-sep">•</span>
          <span>Phase 2</span>
        </div>
        {currentSession.value && (
          <div class="footer-right">
            <span class="session-id">Session: {currentSession.value.id.substring(0, 8)}</span>
            <span class="footer-sep">•</span>
            <span class={`session-status status-${currentSession.value.status}`}>
              {currentSession.value.status}
            </span>
          </div>
        )}
      </footer>

      <style>{`
        .app-container {
          display: flex;
          flex-direction: column;
          height: 100vh;
          width: 100vw;
          overflow: hidden;
          background: var(--bg-primary);
          color: var(--text-primary);
        }
        
        /* === HEADER === */
        .app-header {
          height: var(--header-height);
          background: linear-gradient(135deg, #1a1f2e 0%, #0d1117 100%);
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0 var(--spacing-lg);
          flex-shrink: 0;
          border-bottom: 1px solid var(--border-color);
        }

        .header-left {
          display: flex;
          align-items: center;
          gap: var(--spacing-md);
        }

        .app-logo {
          width: 36px;
          height: 36px;
          background: linear-gradient(135deg, var(--primary-accent), #3fb950);
          border-radius: 8px;
          display: flex;
          align-items: center;
          justify-content: center;
          color: white;
        }

        .app-title {
          font-size: 16px;
          font-weight: 600;
          color: var(--text-primary);
          margin: 0;
          letter-spacing: -0.02em;
        }

        .header-center {
          display: flex;
          gap: var(--spacing-sm);
        }

        .header-btn {
          background: var(--bg-elevated);
          border: 1px solid var(--border-color);
          color: var(--text-secondary);
          padding: 6px 12px;
          border-radius: var(--border-radius);
          font-size: 12px;
          font-weight: 500;
          display: flex;
          align-items: center;
          gap: 6px;
          transition: all var(--transition-fast);
        }

        .header-btn:hover:not(:disabled) {
          background: var(--bg-hover);
          color: var(--text-primary);
          border-color: var(--border-light);
        }

        .header-btn:disabled {
          opacity: 0.4;
          cursor: not-allowed;
        }

        .header-btn.active {
          background: rgba(77, 182, 226, 0.15);
          border-color: var(--primary-accent);
          color: var(--primary-accent);
        }

        .header-btn-danger:hover:not(:disabled) {
          background: rgba(248, 81, 73, 0.15);
          border-color: var(--accent-error);
          color: var(--accent-error);
        }

        .header-btn-help:hover:not(:disabled) {
          background: rgba(63, 185, 80, 0.15);
          border-color: var(--accent-success);
          color: var(--accent-success);
        }

        .header-right {
          display: flex;
          align-items: center;
          gap: var(--spacing-lg);
        }

        .status-indicator {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 12px;
          color: var(--text-muted);
        }

        .status-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: var(--text-muted);
        }
        .status-dot.connected { background: var(--accent-success); box-shadow: 0 0 8px var(--accent-success); }
        .status-dot.error { background: var(--accent-error); box-shadow: 0 0 8px var(--accent-error); }
        .status-dot.checking { background: var(--accent-warning); animation: pulse 1s infinite; }

        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }

        /* === TABS === */
        .app-tabs {
          height: 40px;
          background: var(--bg-secondary);
          display: flex;
          padding: 0 var(--spacing-md);
          border-bottom: 1px solid var(--border-color);
          flex-shrink: 0;
        }

        .tab-item {
          background: none;
          border: none;
          color: var(--text-muted);
          padding: 0 var(--spacing-md);
          font-size: 13px;
          font-weight: 500;
          cursor: pointer;
          border-bottom: 2px solid transparent;
          transition: all var(--transition-fast);
          display: flex;
          align-items: center;
          gap: 8px;
          margin-bottom: -1px;
        }

        .tab-item:hover {
          color: var(--text-secondary);
          background: var(--bg-tertiary);
        }

        .tab-item.active {
          color: var(--primary-accent);
          border-bottom-color: var(--primary-accent);
        }

        .tab-item.parsing .parsing-badge {
          background: var(--accent-warning);
          color: var(--bg-primary);
          font-size: 10px;
          padding: 2px 6px;
          border-radius: 10px;
          font-weight: 600;
        }

        .tab-close {
          margin-left: 4px;
          width: 16px;
          height: 16px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 4px;
          font-size: 14px;
          color: var(--text-muted);
          transition: all var(--transition-fast);
        }

        .tab-close:hover {
          background: rgba(248, 81, 73, 0.3);
          color: var(--accent-error);
        }

        /* === MAIN === */
        .app-main {
          flex: 1;
          overflow: hidden;
          background: var(--bg-primary);
          display: flex;
          flex-direction: column;
          position: relative;
        }

        .error-banner {
          background: rgba(248, 81, 73, 0.15);
          border: 1px solid var(--accent-error);
          color: var(--accent-error);
          padding: var(--spacing-sm) var(--spacing-md);
          display: flex;
          align-items: center;
          gap: var(--spacing-sm);
          font-size: 13px;
        }

        .error-banner button {
          background: none;
          border: none;
          color: var(--accent-error);
          margin-left: auto;
          cursor: pointer;
          padding: 4px;
        }

        /* === HELP MODAL === */
        .help-overlay {
          position: fixed;
          top: 0; left: 0; right: 0; bottom: 0;
          background: rgba(0, 0, 0, 0.75);
          backdrop-filter: blur(4px);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: var(--z-modal);
        }

        .help-modal {
          background: var(--bg-secondary);
          border: 1px solid var(--border-color);
          border-radius: var(--card-radius);
          padding: 0;
          width: 500px;
          max-width: 90%;
          box-shadow: var(--shadow-lg);
          overflow: hidden;
        }

        .help-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: var(--spacing-md) var(--spacing-lg);
          background: var(--bg-tertiary);
          border-bottom: 1px solid var(--border-color);
        }

        .help-header h2 { 
          margin: 0; 
          font-size: 16px; 
          color: var(--text-primary);
          font-weight: 600;
        }
        
        .help-header button { 
          background: none; 
          border: none; 
          font-size: 18px; 
          color: var(--text-muted); 
          cursor: pointer;
          padding: 4px 8px;
          border-radius: 4px;
        }
        
        .help-header button:hover {
          background: var(--bg-hover);
          color: var(--text-primary);
        }

        .help-content {
          padding: var(--spacing-lg);
        }

        .help-content h3 { 
          font-size: 12px; 
          text-transform: uppercase;
          letter-spacing: 0.5px;
          color: var(--text-muted);
          margin: var(--spacing-md) 0 var(--spacing-sm);
          padding-bottom: var(--spacing-xs);
          border-bottom: 1px solid var(--border-color);
        }
        
        .help-content h3:first-child {
          margin-top: 0;
        }

        .help-content ul { 
          list-style: none;
          padding: 0;
          margin: 0;
        }
        
        .help-content li { 
          padding: var(--spacing-sm) 0;
          font-size: 13px; 
          color: var(--text-secondary);
          display: flex;
          gap: var(--spacing-sm);
        }
        
        .help-content kbd {
          background: var(--bg-tertiary);
          border: 1px solid var(--border-color);
          border-radius: 4px;
          padding: 2px 6px;
          font-family: var(--font-mono);
          font-size: 11px;
          color: var(--text-primary);
        }

        .help-content strong { 
          color: var(--text-primary); 
        }

        /* === FOOTER === */
        .app-footer {
          height: var(--status-bar-height);
          background: var(--bg-secondary);
          border-top: 1px solid var(--border-color);
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0 var(--spacing-md);
          font-size: 11px;
          color: var(--text-muted);
          flex-shrink: 0;
        }
        
        .footer-left, .footer-right {
          display: flex;
          align-items: center;
          gap: var(--spacing-sm);
        }

        .footer-sep {
          opacity: 0.3;
        }

        .session-status {
          text-transform: uppercase;
          font-size: 10px;
          font-weight: 600;
          letter-spacing: 0.5px;
        }

        .session-status.status-complete { color: var(--accent-success); }
        .session-status.status-parsing { color: var(--accent-warning); }
        .session-status.status-error { color: var(--accent-error); }
      `}</style>
    </div>
  )
}
