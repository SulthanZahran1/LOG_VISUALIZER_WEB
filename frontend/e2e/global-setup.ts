import { request } from '@playwright/test'
import * as path from 'path'
import * as fs from 'fs'
import { fileURLToPath } from 'url'
import { startDockerBackend, stopDockerBackend } from './docker-setup'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const FIXTURES = [
    { name: 'sample-plc.log', parser: 'plc_debug' },
    { name: 'sample-mcs.log', parser: 'mcs_log' },
    { name: 'sample-csv.csv', parser: 'csv_signal' },
    { name: 'sample-tab.log', parser: 'plc_tab' },
]

const BACKEND_URL = 'http://localhost:8089'

async function globalSetup() {
    console.log('\n========================================')
    console.log('  E2E Test Setup')
    console.log('========================================\n')
    
    // Start Docker backend
    await startDockerBackend()
    
    // Load fixtures
    console.log('🔄 Preloading test fixtures...\n')
    
    const apiContext = await request.newContext({
        baseURL: BACKEND_URL,
        timeout: 60000,
    })

    const loadedFixtures: string[] = []
    const failedFixtures: string[] = []

    for (const fixture of FIXTURES) {
        const fixturePath = path.join(__dirname, 'fixtures', fixture.name)
        
        if (!fs.existsSync(fixturePath)) {
            console.log(`⚠️  Fixture not found: ${fixture.name}`)
            failedFixtures.push(fixture.name)
            continue
        }

        try {
            // Read file and convert to base64
            const fileContent = fs.readFileSync(fixturePath, 'utf-8')
            const base64Content = Buffer.from(fileContent).toString('base64')
            
            // Upload file
            const uploadResponse = await apiContext.post('/api/files/upload', {
                data: { 
                    name: `test-${fixture.name}`, 
                    data: base64Content 
                }
            })

            if (!uploadResponse.ok()) {
                console.log(`⚠️  Failed to upload ${fixture.name}: ${uploadResponse.status()}`)
                failedFixtures.push(fixture.name)
                continue
            }

            const uploadData = await uploadResponse.json()
            
            // Parse file
            const parseResponse = await apiContext.post('/api/parse', {
                data: { fileId: uploadData.id }
            })

            if (!parseResponse.ok()) {
                console.log(`⚠️  Failed to parse ${fixture.name}: ${parseResponse.status()}`)
                failedFixtures.push(fixture.name)
                continue
            }

            const parseData = await parseResponse.json()
            
            // Wait for parsing to complete
            let status = parseData.status
            let attempts = 0
            const maxAttempts = 30
            
            while (status !== 'complete' && attempts < maxAttempts) {
                await new Promise(resolve => setTimeout(resolve, 1000))
                const statusResponse = await apiContext.get(`/api/parse/${parseData.id}/status`)
                const statusData = await statusResponse.json()
                status = statusData.status
                attempts++
            }

            if (status === 'complete') {
                console.log(`✅ Loaded: ${fixture.name} (session: ${parseData.id})`)
                loadedFixtures.push(fixture.name)
                
                // Store session ID for tests to use
                process.env[`TEST_SESSION_${fixture.parser.toUpperCase()}`] = parseData.id
            } else {
                console.log(`⚠️  Parsing timeout for ${fixture.name}`)
                failedFixtures.push(fixture.name)
            }

        } catch (error) {
            console.log(`⚠️  Error loading ${fixture.name}: ${error}`)
            failedFixtures.push(fixture.name)
        }
    }

    await apiContext.dispose()

    // Write session IDs to file so tests can read them
    // (environment variables from global setup don't propagate to test workers)
    const sessionData: Record<string, string> = {}
    for (const fixture of FIXTURES) {
        const envKey = `TEST_SESSION_${fixture.parser.toUpperCase()}`
        const sessionId = process.env[envKey]
        if (sessionId) {
            sessionData[fixture.parser] = sessionId
        }
    }
    
    const sessionDataPath = path.join(__dirname, '.session-data.json')
    fs.writeFileSync(sessionDataPath, JSON.stringify(sessionData, null, 2))

    console.log('\n📊 Setup Summary:')
    console.log(`   ✅ Loaded: ${loadedFixtures.length} fixtures`)
    console.log(`   ❌ Failed: ${failedFixtures.length} fixtures`)
    
    if (loadedFixtures.length > 0) {
        console.log(`\n   Loaded fixtures:`)
        loadedFixtures.forEach(f => console.log(`     - ${f}`))
    }
    
    console.log('\n========================================\n')

    // Register teardown
    return async () => {
        stopDockerBackend()
    }
}

export default globalSetup
