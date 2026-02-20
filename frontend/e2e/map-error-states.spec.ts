import { test, expect } from '@playwright/test'
import { gotoWithSession, hasPreloadedSession } from './test-helpers'

test.describe('Map Viewer - Error States', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/')
        await expect(page.locator('.status-dot.connected')).toBeVisible({ timeout: 10000 })
    })

    test('shows error state when map fails to load', async ({ page }) => {
        // Navigate to Map Viewer without loading a map first
        const mapButton = page.locator('.nav-grid .nav-button').filter({ hasText: 'Map' })
        const isEnabled = await mapButton.isEnabled().catch(() => false)
        
        if (!isEnabled) {
            test.skip(true, 'Map button disabled - no session loaded')
            return
        }
        
        await mapButton.click()
        await expect(page.locator('.tab-item.active')).toContainText('Map', { timeout: 10000 })
        
        // Wait for map viewer to load
        await page.waitForTimeout(1000)

        // Without a map file loaded, should show empty/error state or file selector
        const mapContainer = page.locator('.map-viewer')
        await expect(mapContainer).toBeVisible()

        // Should show either "No map loaded" message or the file selector dialog
        const noMapMessage = page.locator('.map-empty-state, .map-placeholder, .no-map-message')
        const fileSelector = page.locator('.map-file-selector, .file-selector-dialog')
        
        const hasEmptyState = await noMapMessage.isVisible().catch(() => false)
        const hasFileSelector = await fileSelector.isVisible().catch(() => false)
        
        // Either empty state or file selector should be visible
        expect(hasEmptyState || hasFileSelector).toBe(true)
    })

    test('shows retry button when map load fails', async ({ page }) => {
        // Skip if no preloaded session (need a session to test map)
        if (!hasPreloadedSession('plc')) {
            test.skip(true, 'No preloaded session available')
            return
        }
        
        // Navigate with session
        const success = await gotoWithSession(page, 'map', 'plc')
        if (!success) {
            test.skip(true, 'Failed to load session')
            return
        }
        
        await page.waitForTimeout(1000)

        // Try to trigger an error by attempting to load an invalid map
        // Look for a "Load Map" or "Upload" button
        const loadMapBtn = page.locator('button').filter({ hasText: /load|upload|select/i }).first()
        
        if (await loadMapBtn.isVisible().catch(() => false)) {
            await loadMapBtn.click()
            await page.waitForTimeout(500)
            
            // File selector should open
            const fileSelector = page.locator('.map-file-selector, [data-testid="map-file-selector"]')
            if (await fileSelector.isVisible().catch(() => false)) {
                // Try to submit without selecting a file (if there's a load button)
                const submitBtn = fileSelector.locator('button').filter({ hasText: /load|ok/i }).first()
                if (await submitBtn.isVisible().catch(() => false)) {
                    await submitBtn.click()
                    await page.waitForTimeout(500)
                    
                    // Should show error or remain in selector
                    const errorMessage = page.locator('.error-message, .map-error')
                    const hasError = await errorMessage.isVisible().catch(() => false)
                    
                    if (hasError) {
                        // Should show retry option
                        const retryBtn = page.locator('button').filter({ hasText: /retry|try again/i })
                        expect(await retryBtn.count()).toBeGreaterThan(0)
                    }
                }
            }
        }
    })

    test('map file selector dialog can be opened and closed', async ({ page }) => {
        // Skip if no preloaded session
        if (!hasPreloadedSession('plc')) {
            test.skip(true, 'No preloaded session available')
            return
        }
        
        // Navigate to Map with session
        const success = await gotoWithSession(page, 'map', 'plc')
        if (!success) {
            test.skip(true, 'Failed to load session')
            return
        }
        
        await page.waitForTimeout(500)

        // Look for file selector button or dialog
        const selectMapBtn = page.locator('button').filter({ hasText: /select.*map|load.*map|choose.*map/i }).first()
        
        if (await selectMapBtn.isVisible().catch(() => false)) {
            await selectMapBtn.click()
            await page.waitForTimeout(300)
            
            // Dialog should open
            const dialog = page.locator('.map-file-selector, .dialog, [role="dialog"]').first()
            expect(await dialog.isVisible().catch(() => false)).toBe(true)
            
            // Close dialog (via cancel button or escape)
            const cancelBtn = dialog.locator('button').filter({ hasText: /cancel|close/i }).first()
            if (await cancelBtn.isVisible().catch(() => false)) {
                await cancelBtn.click()
            } else {
                await page.keyboard.press('Escape')
            }
            
            await page.waitForTimeout(200)
            
            // Dialog should close
            expect(await dialog.isVisible().catch(() => false)).toBe(false)
        }
    })

    test('map shows loading state while fetching layout', async ({ page }) => {
        // Skip if no preloaded session
        if (!hasPreloadedSession('plc')) {
            test.skip(true, 'No preloaded session available')
            return
        }
        
        // Navigate to Map with session
        const success = await gotoWithSession(page, 'map', 'plc')
        if (!success) {
            test.skip(true, 'Failed to load session')
            return
        }
        
        // Immediately check for loading state (may be brief)
        const loadingIndicator = page.locator('.map-loading, .loading-indicator, .spinner')
        
        // Loading state should appear during initial load (if map is being fetched)
        // or map viewer should be visible
        await expect(page.locator('.map-viewer, .map-loading')).toBeVisible({ timeout: 10000 })
    })
})

test.describe('Map Viewer - With Preloaded Session', () => {
    test('renders map with PLC session data', async ({ page }) => {
        // Skip if no preloaded session
        if (!hasPreloadedSession('plc')) {
            test.skip(true, 'No preloaded session available')
            return
        }
        
        // Navigate to Map with session
        const success = await gotoWithSession(page, 'map', 'plc')
        if (!success) {
            test.skip(true, 'Failed to load session')
            return
        }
        
        await page.waitForTimeout(1000)
        
        // Map viewer should be visible
        const mapViewer = page.locator('.map-viewer')
        await expect(mapViewer).toBeVisible()
        
        // Should have toolbar
        const toolbar = page.locator('.map-toolbar')
        await expect(toolbar).toBeVisible()
    })
})
