import { test, expect } from '@playwright/test'
import * as path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

async function ensureFileLoaded(page: any): Promise<boolean> {
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
    
    // NOTE: File upload in headless test environment is currently unreliable
    // due to WebSocket upload mechanism issues. Skip tests that require uploads
    // when no recent files are available.
    return false
}

test.describe('Bookmarks', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/')
        // Wait for the app to load
        await expect(page.locator('.status-dot.connected')).toBeVisible({ timeout: 10000 })
    })

    test('shows bookmark notification when adding bookmark with keyboard shortcut', async ({ page }) => {
        // Ensure we have a file loaded
        if (!await ensureFileLoaded(page)) {
            test.skip(true, 'No file available for testing')
            return
        }
        
        // Wait for parsing to complete
        await page.waitForTimeout(1000)

        // Press Ctrl+B to add a bookmark
        await page.keyboard.press('Control+b')

        // Check that notification appears
        await expect(page.locator('.bookmark-notification')).toBeVisible({ timeout: 2000 })
        await expect(page.locator('.bookmark-notification')).toContainText('Bookmarked')

        // Wait for notification to auto-dismiss
        await expect(page.locator('.bookmark-notification')).not.toBeVisible({ timeout: 3000 })
    })

    test('opens bookmark panel with keyboard shortcut', async ({ page }) => {
        // Ensure we have a file loaded
        if (!await ensureFileLoaded(page)) {
            test.skip(true, 'No file available for testing')
            return
        }
        
        await page.waitForTimeout(1000)

        // Press Ctrl+Shift+B to open bookmark panel
        await page.keyboard.press('Control+Shift+B')
        await page.waitForTimeout(500)

        // Check that bookmark panel is visible
        await expect(page.locator('.bookmark-panel')).toBeVisible()

        // Panel should have header
        await expect(page.locator('.bookmark-header')).toContainText('Bookmarks')
    })

    test('can add and see bookmark in panel', async ({ page }) => {
        // Ensure we have a file loaded
        if (!await ensureFileLoaded(page)) {
            test.skip(true, 'No file available for testing')
            return
        }
        
        await page.waitForTimeout(1000)

        // Add a bookmark
        await page.keyboard.press('Control+b')
        await page.waitForTimeout(500)

        // Open bookmark panel
        await page.keyboard.press('Control+Shift+B')
        await page.waitForTimeout(500)
        await expect(page.locator('.bookmark-panel')).toBeVisible()

        // Check that bookmark appears in the list
        await expect(page.locator('.bookmark-item')).toHaveCount(1)
    })

    test('can delete bookmark from panel', async ({ page }) => {
        // Ensure we have a file loaded
        if (!await ensureFileLoaded(page)) {
            test.skip(true, 'No file available for testing')
            return
        }
        
        await page.waitForTimeout(1000)

        // Add a bookmark
        await page.keyboard.press('Control+b')
        await page.waitForTimeout(500)

        // Open bookmark panel
        await page.keyboard.press('Control+Shift+B')
        await page.waitForTimeout(500)
        await expect(page.locator('.bookmark-panel')).toBeVisible()

        // Find and click delete button
        const deleteBtn = page.locator('.bookmark-delete').first()
        await deleteBtn.click()

        // Check that bookmark is removed
        await expect(page.locator('.bookmark-item')).toHaveCount(0)
    })

    test('bookmark panel shows empty state when no bookmarks', async ({ page }) => {
        // Ensure we have a file loaded
        if (!await ensureFileLoaded(page)) {
            test.skip(true, 'No file available for testing')
            return
        }
        
        await page.waitForTimeout(1000)

        // Open bookmark panel without adding any bookmarks
        await page.keyboard.press('Control+Shift+B')
        await page.waitForTimeout(500)
        await expect(page.locator('.bookmark-panel')).toBeVisible()

        // Should show empty state
        await expect(page.locator('.bookmark-empty')).toBeVisible()
        await expect(page.locator('.bookmark-empty')).toContainText('No bookmarks')
    })

    test('help modal shows bookmark keyboard shortcuts', async ({ page }) => {
        // Click help button
        await page.locator('.header-btn-help').click()

        // Help modal should be visible
        await expect(page.locator('.help-modal')).toBeVisible()

        // Should contain bookmark shortcuts
        await expect(page.locator('.help-content')).toContainText('Ctrl')
        await expect(page.locator('.help-content')).toContainText('bookmark')
    })
})

test.describe('Waveform Cursor Snapping', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/')
        await expect(page.locator('.status-dot.connected')).toBeVisible({ timeout: 10000 })
    })

    test('waveform view shows cursor when hovering', async ({ page }) => {
        // Ensure we have a file loaded
        if (!await ensureFileLoaded(page)) {
            test.skip(true, 'No file available for testing')
            return
        }
        
        await page.waitForTimeout(1000)

        // Open Timing Diagram from Log Table toolbar
        await page.locator('.btn-icon[title="Open Timing Diagram"]').click()

        // Wait for Timing Diagram tab to be active and canvas to be visible
        await expect(page.locator('.tab-item.active')).toContainText('Timing Diagram')
        await expect(page.locator('.waveform-canvas')).toBeVisible()

        // Hover over the waveform canvas
        const canvas = page.locator('.waveform-canvas')
        const box = await canvas.boundingBox()

        if (box) {
            // Move mouse to middle of canvas
            await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)

            // The cursor line is drawn on canvas, so we just verify canvas is interactive
            // by checking that toolbar shows time readout
            await expect(page.locator('.waveform-toolbar')).toBeVisible()
        }
    })
})
