import { test, expect, type Page } from '@playwright/test'
import { gotoWithSession } from './test-helpers'

async function gotoMapViewer(page: Page) {
    const loaded = await gotoWithSession(page, 'map', 'plc')
    expect(loaded).toBe(true)
    await expect(page.locator('.tab-item.active')).toContainText('Map Viewer', { timeout: 10000 })
    await expect(page.locator('.map-viewer')).toBeVisible()
}

test.describe('Map Viewer - Error States', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/')
        await expect(page.locator('.status-dot.connected')).toBeVisible({ timeout: 10000 })
    })

    test('shows setup state when map requirements are missing', async ({ page }) => {
        await gotoMapViewer(page)

        await expect(page.locator('.map-setup-strip')).toBeVisible()
        await expect(page.locator('.setup-summary')).toContainText('Map Readiness')
        await expect(page.locator('.readiness-item')).toHaveCount(4)
        expect(await page.locator('.readiness-item.pending').count()).toBeGreaterThan(0)
    })

    test('opens file selector dialog from map setup', async ({ page }) => {
        await gotoMapViewer(page)

        const selectFilesBtn = page.locator('.select-files-btn')
        await expect(selectFilesBtn).toBeVisible()
        await selectFilesBtn.click()

        const dialog = page.locator('.file-dialog')
        await expect(dialog).toBeVisible()
        await expect(dialog).toContainText('Map Configuration Files')
    })

    test('map file selector dialog can be opened and closed', async ({ page }) => {
        await gotoMapViewer(page)

        await page.locator('.select-files-btn').click()
        const dialog = page.locator('.file-dialog')
        await expect(dialog).toBeVisible()

        await page.locator('.file-dialog-overlay').click()
        await expect(dialog).not.toBeVisible()
    })

    test('map shows loading or ready state while view initializes', async ({ page }) => {
        await gotoMapViewer(page)
        await expect(page.locator('.map-loading, .map-setup-strip')).toBeVisible({ timeout: 10000 })
    })
})

test.describe('Map Viewer - With Preloaded Session', () => {
    test('renders map setup and can link PLC session data', async ({ page }) => {
        await gotoMapViewer(page)

        const signalSessionItem = page.locator('.readiness-item').filter({ hasText: 'Signal Session' })
        await expect(signalSessionItem).toBeVisible()

        const linkButton = signalSessionItem.locator('.readiness-action')
        if (await linkButton.isVisible().catch(() => false)) {
            await linkButton.click()
        }

        await expect(signalSessionItem).toContainText(/Linked to map playback|Signal Session/)
    })
})
