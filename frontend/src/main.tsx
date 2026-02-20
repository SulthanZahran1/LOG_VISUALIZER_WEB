import { render } from 'preact'
import './index.css'
import { App } from './app.tsx'
import { initLogEffects } from './stores/logStore'
import { initWaveformEffects } from './stores/waveformStore'
import { initMapEffects } from './stores/mapStore'

// Initialize store effects for reactive data fetching
initLogEffects()
initWaveformEffects()
initMapEffects()

render(<App />, document.getElementById('app')!)
