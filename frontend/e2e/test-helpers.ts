import { Page, expect } from '@playwright/test'
import * as path from 'path'
import * as fs from 'fs'
import { fileURLToPath } from 'url'

/**
 * Test Helpers for E2E Tests
 * 
 * Provides utilities to work with preloaded test fixtures.
 * Fixtures are loaded during global setup (see global-setup.ts)
 */

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Load session IDs from file (written by global setup)
function loadSessionData(): Record<string, string> {
    try {
        const sessionDataPath = path.join(__dirname, '.session-data.json')
        if (fs.existsSync(sessionDataPath)) {
            const data = fs.readFileSync(sessionDataPath, 'utf-8')
            return JSON.parse(data)
        }
    } catch (error) {
        console.warn('Failed to load session data:', error)
    }
    return {}
}

const sessionData = loadSessionData()

// Session IDs from global setup
export const PRELOADED_SESSIONS = {
    plc: sessionData['plc_debug'] || process.env.TEST_SESSION_PLC_DEBUG || '',
    mcs: sessionData['mcs_log'] || process.env.TEST_SESSION_MCS_LOG || '',
    csv: sessionData['csv_signal'] || process.env.TEST_SESSION_CSV_SIGNAL || '',
    tab: sessionData['plc_tab'] || process.env.TEST_SESSION_PLC_TAB || '',
}

function escapeRegex(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function getNavButtonByTitle(page: Page, title: string) {
    const titlePattern = new RegExp(`^${escapeRegex(title)}$`)
    return page
        .locator('.nav-grid button.nav-button')
        .filter({ has: page.locator('.nav-button-title', { hasText: titlePattern }) })
}

/**
 * Check if a preloaded session is available
 */
export function hasPreloadedSession(type: keyof typeof PRELOADED_SESSIONS): boolean {
    return !!PRELOADED_SESSIONS[type]
}

/**
 * Wait for session to be ready (status indicator shows ready)
 */
export async function waitForSessionReady(page: Page, timeout = 30000): Promise<boolean> {
    try {
        // First wait for the nav-grid to show session as loaded
        await expect(page.locator('.nav-grid[data-session-status="loaded"]')).toBeVisible({ timeout })
        return true
    } catch {
        // Alternative: check if Log Table button in Loaded panel is enabled
        const logTableButton = page.locator('.loaded-file-card button, [class*="loaded"] button').filter({ hasText: 'Log Table' })
        return await logTableButton.isVisible({ timeout: 2000 }).catch(() => false)
    }
}

/**
 * Upload a fixture file directly when preloaded session is not available
 */
async function uploadFixtureFile(page: Page, sessionType: keyof typeof PRELOADED_SESSIONS): Promise<boolean> {
    const fixtureMap = {
        plc: 'sample-plc.log',
        mcs: 'sample-mcs.log',
        csv: 'sample-csv.csv',
        tab: 'sample-tab.log'
    }
    
    const fixtureName = fixtureMap[sessionType]
    if (!fixtureName) return false
    
    const fixturePath = path.join(__dirname, 'fixtures', fixtureName)
    if (!fs.existsSync(fixturePath)) return false
    
    console.log(`[Test Helper] Uploading fixture ${fixtureName} directly...`)
    
    // Navigate to home page
    await page.goto('/')
    await expect(page.locator('.status-dot.connected')).toBeVisible({ timeout: 10000 })
    
    // Upload the file
    const fileInput = page.locator('input[type="file"]')
    await fileInput.setInputFiles(fixturePath)
    
    // Wait for parsing to complete (Ready badge appears)
    try {
        await expect(page.locator('.status-badge').filter({ hasText: 'Ready' }).first()).toBeVisible({ timeout: 30000 })
    } catch {
        // Try alternative selector for ready state
        await page.waitForTimeout(3000)
    }
    
    console.log(`[Test Helper] Fixture ${fixtureName} uploaded and parsed`)
    return true
}

/**
 * Navigate to a specific view with a preloaded session
 * Falls back to direct file upload if preloaded session fails
 */
export async function gotoWithSession(
    page: Page, 
    view: 'log-table' | 'timing-diagram' | 'map' | 'transitions',
    sessionType: keyof typeof PRELOADED_SESSIONS = 'plc'
): Promise<boolean> {
    const sessionId = PRELOADED_SESSIONS[sessionType]
    
    // Try preloaded session first if available
    if (sessionId) {
        try {
            // Navigate to home with session
            await page.goto(`/?session=${sessionId}`)
            await expect(page.locator('.status-dot.connected')).toBeVisible({ timeout: 10000 })
            
            // Wait for session to be fully loaded via data attribute (with shorter timeout)
            // If this fails, we'll fall back to direct upload
            const sessionLoaded = await page.locator('.nav-grid[data-session-status="loaded"]').isVisible({ timeout: 15000 })
            
            if (!sessionLoaded) {
                console.log('[Test Helper] Preloaded session not found or not ready, falling back to direct upload')
                throw new Error('Session not loaded')
            }
            
            // Wait for navigation buttons to be enabled (not disabled)
            const viewLabel = view === 'log-table' ? 'Log Table' :
                              view === 'timing-diagram' ? 'Timing Diagram' :
                              view === 'map' ? 'Map Viewer' : 'Transitions'
            
            // Try to click the navigation button, waiting for it to be enabled
            const navButton = getNavButtonByTitle(page, viewLabel)
            
            // Wait for button to be visible and not disabled
            await expect(navButton).toBeVisible({ timeout: 10000 })
            
            // Check if button is disabled and wait for it to become enabled
            let attempts = 0
            while (attempts < 30) {
                const isDisabled = await navButton.evaluate(el => (el as HTMLButtonElement).disabled).catch(() => true)
                if (!isDisabled) break
                await page.waitForTimeout(500)
                attempts++
            }
            
            // Click to navigate
            await navButton.click()
            
            // Verify the tab is active
            await expect(page.locator('.tab-item.active')).toContainText(viewLabel, { timeout: 10000 })
            
            return true
        } catch (error) {
            console.log(`[Test Helper] Preloaded session failed, falling back to direct upload`)
            // Fall through to direct upload
        }
    }
    
    // Fallback: upload file directly
    if (await uploadFixtureFile(page, sessionType)) {
        // Now navigate to the requested view
        const viewLabel = view === 'log-table' ? 'Log Table' :
                          view === 'timing-diagram' ? 'Timing Diagram' :
                          view === 'map' ? 'Map Viewer' : 'Transitions'
        
        const navButton = getNavButtonByTitle(page, viewLabel)
        await expect(navButton).toBeVisible({ timeout: 10000 })
        
        // Wait for button to be enabled
        let attempts = 0
        while (attempts < 30) {
            const isDisabled = await navButton.evaluate(el => (el as HTMLButtonElement).disabled).catch(() => true)
            if (!isDisabled) break
            await page.waitForTimeout(500)
            attempts++
        }
        
        await navButton.click()
        await expect(page.locator('.tab-item.active')).toContainText(viewLabel, { timeout: 10000 })
        return true
    }
    
    return false
}

/**
 * Ensure a file is loaded and Log Table is opened
 * Returns true if file is available and Log Table is opened, false otherwise
 */
export async function ensureFileLoaded(page: Page): Promise<boolean> {
    // First check if we have a preloaded PLC session
    if (PRELOADED_SESSIONS.plc) {
        try {
            await page.goto(`/?session=${PRELOADED_SESSIONS.plc}`)
            await expect(page.locator('.status-dot.connected')).toBeVisible({ timeout: 10000 })
            
            // Wait for session to be fully loaded via data attribute (with shorter timeout)
            const sessionLoaded = await page.locator('.nav-grid[data-session-status="loaded"]').isVisible({ timeout: 15000 })
            
            if (!sessionLoaded) {
                console.log('[Test Helper] Preloaded session not found in ensureFileLoaded, falling back')
                throw new Error('Session not loaded')
            }
            
            // Open Log Table view using the navigation button
            const logTableNavButton = getNavButtonByTitle(page, 'Log Table')
            if (await logTableNavButton.isVisible({ timeout: 5000 }).catch(() => false)) {
                // Wait for button to be enabled
                let attempts = 0
                while (attempts < 20) {
                    const isDisabled = await logTableNavButton.evaluate(el => (el as HTMLButtonElement).disabled).catch(() => true)
                    if (!isDisabled) break
                    await page.waitForTimeout(500)
                    attempts++
                }
                await logTableNavButton.click()
                await expect(page.locator('.tab-item.active')).toContainText('Log Table', { timeout: 10000 })
            }
            return true
        } catch (error) {
            console.log(`[Test Helper] Preloaded session failed in ensureFileLoaded, falling back: ${error}`)
            // Fall through to fallback
        }
    }
    
    // Fallback: upload file directly
    if (await uploadFixtureFile(page, 'plc')) {
        const logTableNavButton = getNavButtonByTitle(page, 'Log Table')
        if (await logTableNavButton.isVisible({ timeout: 5000 }).catch(() => false)) {
            let attempts = 0
            while (attempts < 20) {
                const isDisabled = await logTableNavButton.evaluate(el => (el as HTMLButtonElement).disabled).catch(() => true)
                if (!isDisabled) break
                await page.waitForTimeout(500)
                attempts++
            }
            await logTableNavButton.click()
            await expect(page.locator('.tab-item.active')).toContainText('Log Table', { timeout: 10000 })
        }
        return true
    }

    // Check if there's already a Log Table tab active (file already loaded and view open)
    const logTableTab = page.locator('.tab-item').filter({ hasText: 'Log Table' })
    if (await logTableTab.isVisible({ timeout: 2000 }).catch(() => false)) {
        // Make sure it's active
        const isActive = await logTableTab.evaluate(el => el.classList.contains('active')).catch(() => false)
        if (!isActive) {
            await logTableTab.click()
        }
        return true
    }
    
    // Try to use a recent file
    const recentFile = page.locator('.file-item').first()
    if (await recentFile.isVisible({ timeout: 2000 }).catch(() => false)) {
        await recentFile.click()
        
        // Wait for file to be loaded in the Loaded panel
        await page.waitForTimeout(1000)
        
        // Click the Log Table button in the Loaded panel (if available) or use nav button
        const loadedLogTableButton = page.locator('.loaded-file-card button, [class*="loaded"] button').filter({ hasText: 'Log Table' })
        const navLogTableButton = getNavButtonByTitle(page, 'Log Table')
        
        if (await loadedLogTableButton.isVisible({ timeout: 5000 }).catch(() => false)) {
            await loadedLogTableButton.click()
        } else if (await navLogTableButton.isVisible({ timeout: 5000 }).catch(() => false)) {
            // Wait for button to be enabled
            let attempts = 0
            while (attempts < 20) {
                const isDisabled = await navLogTableButton.evaluate(el => (el as HTMLButtonElement).disabled).catch(() => true)
                if (!isDisabled) break
                await page.waitForTimeout(500)
                attempts++
            }
            await navLogTableButton.click()
        }
        
        // Wait for Log Table to be visible
        await expect(page.locator('.tab-item').filter({ hasText: 'Log Table' })).toBeVisible({ timeout: 30000 })
        return true
    }
    
    return false
}

/**
 * Open Log Table view from current state
 * Assumes a file is already loaded
 */
export async function openLogTable(page: Page): Promise<void> {
    // Check if already open
    const logTableTab = page.locator('.tab-item').filter({ hasText: 'Log Table' })
    if (await logTableTab.isVisible({ timeout: 1000 }).catch(() => false)) {
        const isActive = await logTableTab.evaluate(el => el.classList.contains('active')).catch(() => false)
        if (isActive) return
        await logTableTab.click()
        return
    }
    
    // Try Loaded panel button first
    const loadedButton = page.locator('.loaded-file-card button, [class*="loaded"] button').filter({ hasText: 'Log Table' })
    if (await loadedButton.isVisible({ timeout: 3000 }).catch(() => false)) {
        await loadedButton.click()
    } else {
        // Use nav grid button
        const navButton = getNavButtonByTitle(page, 'Log Table')
        await expect(navButton).toBeVisible({ timeout: 5000 })
        
        // Wait for enabled
        let attempts = 0
        while (attempts < 20) {
            const isDisabled = await navButton.evaluate(el => (el as HTMLButtonElement).disabled).catch(() => true)
            if (!isDisabled) break
            await page.waitForTimeout(500)
            attempts++
        }
        await navButton.click()
    }
    
    await expect(page.locator('.tab-item.active')).toContainText('Log Table', { timeout: 10000 })
}

/**
 * Get session ID for a specific parser type
 */
export function getSessionId(type: keyof typeof PRELOADED_SESSIONS): string | undefined {
    return PRELOADED_SESSIONS[type] || undefined
}

/**
 * Skip test if no preloaded session available
 */
export function skipIfNoSession(
    test: any, 
    type: keyof typeof PRELOADED_SESSIONS
): boolean {
    if (!PRELOADED_SESSIONS[type]) {
        test.skip(true, `No preloaded ${type} session available`)
        return true
    }
    return false
}
