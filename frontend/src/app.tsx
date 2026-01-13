import { useSignal } from '@preact/signals'
import { useEffect } from 'preact/hooks'
import { checkHealth } from './api/client'

/**
 * Main App Shell
 * PLC Log Visualizer - Industrial Dark Theme
 */
export function App() {
  const status = useSignal<'checking' | 'connected' | 'error'>('checking')
  const errorMessage = useSignal<string | null>(null)

  useEffect(() => {
    checkHealth()
      .then(() => {
        status.value = 'connected'
      })
      .catch((err) => {
        status.value = 'error'
        errorMessage.value = err.message || 'Failed to connect to backend'
      })
  }, [])

  return (
    <div class="app-container">
      <header class="app-header">
        <h1 class="app-title">PLC Log Visualizer</h1>
        <div class="status-indicator">
          {status.value === 'checking' && (
            <span class="status-checking">⏳ Connecting...</span>
          )}
          {status.value === 'connected' && (
            <span class="status-connected">✓ Backend Connected</span>
          )}
          {status.value === 'error' && (
            <span class="status-error">✗ {errorMessage.value}</span>
          )}
        </div>
      </header>

      <main class="app-main">
        <div class="welcome-panel">
          <h2>Welcome to PLC Log Visualizer</h2>
          <p>Upload a PLC log file to get started.</p>

          <div class="drop-zone">
            <div class="drop-zone-content">
              <span class="drop-icon">📁</span>
              <p>Drag & drop a log file here</p>
              <p class="drop-hint">or click to browse</p>
            </div>
          </div>
        </div>
      </main>

      <footer class="app-footer">
        <span>PLC Log Visualizer v0.1.0</span>
        <span class="footer-sep">|</span>
        <span>Phase 1 Scaffold</span>
      </footer>

      <style>{`
        .app-container {
          display: flex;
          flex-direction: column;
          height: 100%;
        }
        
        .app-header {
          height: var(--header-height);
          background: var(--bg-secondary);
          border-bottom: 1px solid var(--border-color);
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0 var(--spacing-lg);
        }
        
        .app-title {
          font-size: 18px;
          font-weight: 600;
          color: var(--text-primary);
          margin: 0;
        }
        
        .status-indicator {
          font-size: 13px;
        }
        
        .status-checking { color: var(--accent-warning); }
        .status-connected { color: var(--accent-success); }
        .status-error { color: var(--accent-error); }
        
        .app-main {
          flex: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: var(--spacing-xl);
        }
        
        .welcome-panel {
          text-align: center;
          max-width: 500px;
        }
        
        .welcome-panel h2 {
          font-size: 24px;
          font-weight: 500;
          margin-bottom: var(--spacing-sm);
          color: var(--text-primary);
        }
        
        .welcome-panel p {
          color: var(--text-secondary);
          margin-bottom: var(--spacing-lg);
        }
        
        .drop-zone {
          border: 2px dashed var(--border-light);
          border-radius: 8px;
          padding: var(--spacing-xl);
          cursor: pointer;
          transition: all var(--transition-normal);
        }
        
        .drop-zone:hover {
          border-color: var(--accent-primary);
          background: var(--bg-hover);
        }
        
        .drop-zone-content {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: var(--spacing-sm);
        }
        
        .drop-icon {
          font-size: 48px;
        }
        
        .drop-hint {
          font-size: 12px;
          color: var(--text-muted);
          margin: 0;
        }
        
        .app-footer {
          height: var(--status-bar-height);
          background: var(--bg-tertiary);
          border-top: 1px solid var(--border-color);
          display: flex;
          align-items: center;
          padding: 0 var(--spacing-md);
          font-size: 12px;
          color: var(--text-muted);
        }
        
        .footer-sep {
          margin: 0 var(--spacing-sm);
        }
      `}</style>
    </div>
  )
}
