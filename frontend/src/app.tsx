import { useSignal } from '@preact/signals'
import { useEffect } from 'preact/hooks'
import { checkHealth, getRecentFiles, deleteFile } from './api/client'
import { LogTable } from './components/log/LogTable'
import { WaveformView } from './components/waveform/WaveformView'
import { SplitPane } from './components/layout/SplitPane'
import { currentSession, startParsing, logError, initLogStore, isSplitHorizontal, isSplitVertical, isSyncEnabled } from './stores/logStore'
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
  const activeTab = useSignal<'home' | 'log'>('home')
  const showHelp = useSignal(false)

  const fetchFiles = async () => {
    try {
      const files = await getRecentFiles()
      recentFiles.value = files
    } catch (err) {
      console.error('Failed to fetch recent files', err)
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
  }, [])

  const handleUploadSuccess = (file: FileInfo) => {
    recentFiles.value = [file, ...recentFiles.value]
  }

  const handleFileSelect = (file: FileInfo) => {
    startParsing(file.id)
    activeTab.value = 'log'
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
    activeTab.value = 'home'
    isSyncEnabled.value = false;
    isSplitHorizontal.value = false;
    isSplitVertical.value = false;
  }

  return (
    <div class="app-container">
      <header class="app-header">
        <div class="header-left">
          <h1 class="app-title">PLC Log Visualizer</h1>
        </div>

        <div class="header-center">
          <button class="header-btn sync-btn" disabled={!currentSession.value} onClick={handleSyncViews}>
            <span class="btn-icon">🔄</span> Sync Views
          </button>
          <button class="header-btn clear-btn" disabled={!currentSession.value} onClick={handleClearSession}>
            <span class="btn-icon">🗑️</span> Clear
          </button>
        </div>

        <div class="header-right">
          <button class="header-btn help-btn">Help</button>
          <div class="status-indicator">
            <span class={`status-dot ${status.value}`}></span>
            {status.value === 'connected' ? 'Connected' : 'Disconnected'}
          </div>
        </div>
      </header>

      <div class="app-tabs">
        <button
          class={`tab-item ${activeTab.value === 'home' ? 'active' : ''}`}
          onClick={() => activeTab.value = 'home'}
        >
          Home
        </button>
        {currentSession.value && (
          <button
            class={`tab-item ${activeTab.value === 'log' ? 'active' : ''} ${currentSession.value.status === 'parsing' ? 'parsing' : ''}`}
            onClick={() => activeTab.value = 'log'}
          >
            Log Viewer {currentSession.value.status === 'parsing' ? `(${Math.floor(currentSession.value.progress)}%)` : ''}
          </button>
        )}
      </div>

      <div class="app-breadcrumbs">
        <div class="breadcrumb-item">Workspace</div>
        <span class="breadcrumb-sep">/</span>
        <div class="breadcrumb-item active">
          {activeTab.value === 'home' ? 'Recent Files' : (currentSession.value ? `Session: ${currentSession.value.id.substring(0, 8)}` : 'Log Viewer')}
        </div>
      </div>

      <main class="app-main">
        {logError.value && (
          <div class="error-banner">
            Parsing Error: {logError.value}
            <button onClick={() => logError.value = null}>✕</button>
          </div>
        )}

        {(() => {
          const content = activeTab.value === 'home' ? (
            <HomeView
              recentFiles={recentFiles.value}
              onUploadSuccess={handleUploadSuccess}
              onFileSelect={handleFileSelect}
              onFileDelete={handleFileDelete}
            />
          ) : (
            <LogTable />
          );

          if ((isSplitHorizontal.value || isSplitVertical.value) && activeTab.value !== 'home') {
            return (
              <SplitPane direction={isSplitHorizontal.value ? 'horizontal' : 'vertical'} minSize={200}>
                {content}
                <WaveformView />
              </SplitPane>
            );
          }
          return content;
        })()}
        {showHelp.value && (
          <div class="help-overlay" onClick={() => showHelp.value = false}>
            <div class="help-modal" onClick={(e) => e.stopPropagation()}>
              <div class="help-header">
                <h2>PLC Log Visualizer Help</h2>
                <button onClick={() => showHelp.value = false}>✕</button>
              </div>
              <div class="help-content">
                <h3>Shortcuts</h3>
                <ul>
                  <li><strong>Ctrl + C:</strong> Copy selected rows</li>
                  <li><strong>Ctrl + Click:</strong> Individual selection</li>
                  <li><strong>Shift + Click:</strong> Range selection</li>
                </ul>
                <h3>View Controls</h3>
                <ul>
                  <li><strong>Sync Views:</strong> Synchronizes scroll position across all split panes.</li>
                  <li><strong>Clear:</strong> Closes the current session and resets the layout.</li>
                </ul>
                <h3>Filtering</h3>
                <ul>
                  <li><strong>Regex:</strong> Enable regular expression matching for searches.</li>
                  <li><strong>Changes Only:</strong> Only show entries where the value changed.</li>
                </ul>
              </div>
            </div>
          </div>
        )}
      </main>

      <footer class="app-footer">
        <div class="footer-left">
          <span>PLC Log Visualizer v0.1.0</span>
          <span class="footer-sep">|</span>
          <span>Phase 1 Completion</span>
        </div>
        {currentSession.value && (
          <div class="footer-right">
            <span>Session: {currentSession.value.id.substring(0, 8)}</span>
            <span class="footer-sep">|</span>
            <span>Status: {currentSession.value.status}</span>
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
        
        /* Professional Header */
        .app-header {
          height: 50px;
          background: #003D82; /* Industrial Blue */
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0 var(--spacing-lg);
          flex-shrink: 0;
          box-shadow: 0 2px 4px rgba(0,0,0,0.2);
          z-index: 10;
        }

        .app-title {
          font-size: 16px;
          font-weight: 700;
          color: white;
          margin: 0;
          letter-spacing: 0.5px;
        }

        .header-center {
          display: flex;
          gap: var(--spacing-md);
        }

        .header-btn {
          background: rgba(255,255,255,0.1);
          border: none;
          color: white;
          padding: 6px 14px;
          border-radius: 4px;
          font-size: 13px;
          font-weight: 600;
          display: flex;
          align-items: center;
          gap: 6px;
          transition: background 0.2s;
        }

        .header-btn:hover:not(:disabled) {
          background: rgba(255,255,255,0.2);
        }

        .header-btn:disabled {
          opacity: 0.4;
          cursor: not-allowed;
        }

        .sync-btn { background-color: #4285F4; }
        .clear-btn { background-color: #F44336; }
        .help-btn { background-color: #34A853; }

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
          color: rgba(255,255,255,0.8);
        }

        .status-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: #666;
        }
        .status-dot.connected { background: #4caf50; }
        .status-dot.error { background: #f44336; }

        /* Tabs Navigation */
        .app-tabs {
          height: 36px;
          background: var(--bg-secondary);
          display: flex;
          padding: 0 10px;
          border-bottom: 1px solid var(--border-color);
          flex-shrink: 0;
        }

        .tab-item {
          background: none;
          border: none;
          color: var(--text-secondary);
          padding: 0 20px;
          font-size: 13px;
          font-weight: 500;
          cursor: pointer;
          border-bottom: 2px solid transparent;
          transition: all 0.2s;
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .tab-item:hover {
          color: var(--text-primary);
          background: rgba(255,255,255,0.05);
        }

        .tab-item.active {
          color: var(--accent-primary);
          border-bottom-color: var(--accent-primary);
          background: rgba(255,255,255,0.08);
        }

        .tab-item.parsing {
          color: var(--accent-warning);
        }

        .app-main {
          flex: 1;
          overflow: hidden;
          background: var(--bg-main);
          display: flex;
          flex-direction: column;
        }

        .app-breadcrumbs {
          height: 24px;
          background: var(--bg-tertiary);
          border-bottom: 1px solid var(--border-color);
          display: flex;
          align-items: center;
          padding: 0 var(--spacing-md);
          font-size: 11px;
          color: var(--text-muted);
          flex-shrink: 0;
        }

        .breadcrumb-item.active {
          color: var(--text-secondary);
        }

        .breadcrumb-sep {
          margin: 0 8px;
          opacity: 0.5;
        }

        .btn-icon.active {
          color: var(--accent-primary) !important;
          background: rgba(77, 182, 226, 0.1) !important;
        }

        .help-overlay {
          position: fixed;
          top: 0; left: 0; right: 0; bottom: 0;
          background: rgba(0,0,0,0.7);
          backdrop-filter: blur(4px);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
        }

        .help-modal {
          background: var(--bg-secondary);
          border: 1px solid var(--border-color);
          border-radius: 8px;
          padding: 24px;
          width: 500px;
          max-width: 90%;
          box-shadow: 0 10px 30px rgba(0,0,0,0.5);
        }

        .help-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 20px;
          border-bottom: 1px solid var(--border-color);
          padding-bottom: 10px;
        }

        .help-header h2 { margin: 0; font-size: 18px; color: var(--accent-primary); }
        .help-header button { background: none; border: none; font-size: 20px; color: var(--text-muted); cursor: pointer; }

        .help-content h3 { font-size: 14px; margin-top: 15px; border-left: 3px solid var(--accent-primary); padding-left: 10px; }
        .help-content ul { padding-left: 20px; margin: 10px 0; }
        .help-content li { margin-bottom: 5px; font-size: 13px; color: var(--text-secondary); }
        .help-content strong { color: var(--text-primary); }

        .app-footer {
          height: 28px;
          background: var(--bg-tertiary);
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
        }

        .footer-sep {
          margin: 0 var(--spacing-sm);
          opacity: 0.3;
        }

        .parsing-progress {
          color: var(--accent-warning);
          margin-left: 4px;
        }
      `}</style>
    </div >
  )
}
