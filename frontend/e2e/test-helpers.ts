import { Page, expect } from '@playwright/test'

/**
 * Test Helpers for E2E Tests
 * 
 * Provides utilities to work with preloaded test fixtures.
 * Fixtures are loaded during global setup (see global-setup.ts)
 */

// Session IDs from global setup
export const PRELOADED_SESSIONS = {
    plc: process.env.TEST_SESSION_PLC_DEBUG || '',
    mcs: process.env.TEST_SESSION_MCS_LOG || '',
    csv: process.env.TEST_SESSION_CSV_SIGNAL || '',
    tab: process.env.TEST_SESSION_PLC_TAB || '',
}

/**
 * Check if a preloaded session is available
 */
export function hasPreloadedSession(type: keyof typeof PRELOADED_SESSIONS): boolean {
    return !!PRELOADED_SESSIONS[type]
}

/**
 * Navigate to a specific view with a preloaded session
 */
export async function gotoWithSession(
    page: Page, 
    view: 'log-table' | 'timing-diagram' | 'map' | 'transitions',
    sessionType: keyof typeof PRELOADED_SESSIONS = 'plc'
): Promise<boolean> {
    const sessionId = PRELOADED_SESSIONS[sessionType]
    
    if (!sessionId) {
        return false
    }

    // Navigate to home with session
    await page.goto(`/?session=${sessionId}`)
    await expect(page.locator('.status-dot.connected')).toBeVisible({ timeout: 10000 })
    
    // Wait for session to be fully loaded
    await page.waitForTimeout(1000)

    // Navigate to specific view
    switch (view) {
        case 'log-table':
            await page.locator('.nav-grid .nav-button').filter({ hasText: 'Log Table' }).click()
            await expect(page.locator('.tab-item.active')).toContainText('Log Table', { timeout: 10000 })
            break
        case 'timing-diagram':
            await page.locator('.nav-grid .nav-button').filter({ hasText: 'Timing Diagram' }).click()
            await expect(page.locator('.tab-item.active')).toContainText('Timing Diagram', { timeout: 10000 })
            break
        case 'map':
            await page.locator('.nav-grid .nav-button').filter({ hasText: 'Map' }).click()
            await expect(page.locator('.tab-item.active')).toContainText('Map', { timeout: 10000 })
            break
        case 'transitions':
            await page.locator('.nav-grid .nav-button').filter({ hasText: 'Transitions' }).click()
            await expect(page.locator('.tab-item.active')).toContainText('Transitions', { timeout: 10000 })
            break
    }

    return true
}

/**
 * Ensure a file is loaded (either preloaded or from recent files)
 * Returns true if file is available, false otherwise
 */
export async function ensureFileLoaded(page: Page): Promise<boolean> {
    // First check if we have a preloaded PLC session
    if (PRELOADED_SESSIONS.plc) {
        await page.goto(`/?session=${PRELOADED_SESSIONS.plc}`)
        await expect(page.locator('.status-dot.connected')).toBeVisible({ timeout: 10000 })
        await page.waitForTimeout(500)
        return true
    }

    // Check if there's already a Log Table tab (file already loaded)
    const logTableTab = page.locator('.tab-item').filter({ hasText: 'Log Table' })
    if (await logTableTab.isVisible({ timeout: 2000 }).catch(() => false)) {
        return true
    }
    
    // Try to use a recent file
    const recentFile = page.locator('.file-item').first()
    if (await recentFile.isVisible({ timeout: 2000 }).catch(() => false)) {
        await recentFile.click()
        await expect(page.locator('.tab-item').filter({ hasText: 'Log Table' })).toBeVisible({ timeout: 30000 })
        return true
    }
    
    return false
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
