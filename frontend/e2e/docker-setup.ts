import { execSync, spawn } from 'child_process'
import * as path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const COMPOSE_FILE = path.join(__dirname, 'docker-compose.e2e.yml')
const BACKEND_URL = 'http://localhost:8089'

/**
 * Check if backend is already running and healthy
 */
async function isBackendRunning(): Promise<boolean> {
    try {
        const response = await fetch(`${BACKEND_URL}/api/health`, { 
            signal: AbortSignal.timeout(2000) 
        })
        return response.ok
    } catch {
        return false
    }
}

/**
 * Start Docker Compose for E2E tests
 */
export async function startDockerBackend(): Promise<void> {
    console.log('🐳 Starting Docker backend for E2E tests...\n')
    
    try {
        // Check if already running via Docker
        const result = execSync('docker ps --filter "name=cim_visualizer_e2e" --format "{{.Names}}"', { 
            encoding: 'utf-8',
            stdio: ['pipe', 'pipe', 'pipe']
        })
        
        if (result.includes('cim_visualizer_e2e')) {
            console.log('✅ Docker backend already running')
            
            // Wait for it to be healthy
            let attempts = 0
            while (attempts < 30) {
                if (await isBackendRunning()) {
                    console.log('✅ Backend is healthy\n')
                    return
                }
                await sleep(1000)
                attempts++
            }
            
            throw new Error('Backend container exists but not responding')
        }
        
        // Start fresh
        console.log('Building and starting backend container...')
        execSync(`docker compose -f ${COMPOSE_FILE} up -d --build`, {
            stdio: 'inherit',
            cwd: __dirname
        })
        
        // Wait for healthcheck
        console.log('\n⏳ Waiting for backend to be healthy...')
        let attempts = 0
        while (attempts < 60) {
            if (await isBackendRunning()) {
                console.log('✅ Backend is healthy\n')
                return
            }
            process.stdout.write('.')
            await sleep(1000)
            attempts++
        }
        
        throw new Error('Backend failed to become healthy within 60 seconds')
        
    } catch (error) {
        console.error('\n❌ Failed to start Docker backend:', error)
        throw error
    }
}

/**
 * Stop Docker Compose after tests
 */
export function stopDockerBackend(): void {
    console.log('\n🛑 Stopping Docker backend...')
    
    try {
        execSync(`docker compose -f ${COMPOSE_FILE} down -v`, {
            stdio: 'inherit',
            cwd: __dirname
        })
        console.log('✅ Docker backend stopped\n')
    } catch (error) {
        console.error('⚠️  Error stopping Docker backend:', error)
    }
}

function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
}
