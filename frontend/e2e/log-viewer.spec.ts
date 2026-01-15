import { test, expect } from '@playwright/test'

test.describe('Log Table', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/')
        // Wait for the app to load
        await expect(page.locator('.status-dot.connected')).toBeVisible({ timeout: 10000 })
    })

    test('can switch to log viewer tab when session exists', async ({ page }) => {
        // First, we need to load a file to create a session
        // Check if there's a recent file to click
        const recentFile = page.locator('.file-item').first()

        if (await recentFile.isVisible()) {
            await recentFile.click()

            // Wait for Log Table tab to appear
            await expect(page.locator('.tab-item').filter({ hasText: 'Log Table' })).toBeVisible({ timeout: 5000 })

            // Click on Log Table tab
            await page.locator('.tab-item').filter({ hasText: 'Log Table' }).click()

            // Check that log table is visible
            await expect(page.locator('.log-table-container')).toBeVisible()
        }
    })

    test('log table has all expected columns', async ({ page }) => {
        // Load a recent file if available
        const recentFile = page.locator('.file-item').first()

        if (await recentFile.isVisible()) {
            await recentFile.click()
            await page.locator('.tab-item').filter({ hasText: 'Log Table' }).click()

            // Wait for header
            await expect(page.locator('.log-table-header')).toBeVisible()

            // Check columns
            await expect(page.locator('.log-table-header')).toContainText('TIMESTAMP')
            await expect(page.locator('.log-table-header')).toContainText('DEVICE ID')
            await expect(page.locator('.log-table-header')).toContainText('SIGNAL NAME')
            await expect(page.locator('.log-table-header')).toContainText('VALUE')
            await expect(page.locator('.log-table-header')).toContainText('TYPE')
        }
    })

    test('toolbar has filter options', async ({ page }) => {
        const recentFile = page.locator('.file-item').first()

        if (await recentFile.isVisible()) {
            await recentFile.click()
            await page.locator('.tab-item').filter({ hasText: 'Log Table' }).click()

            // Check filter elements
            await expect(page.locator('.search-box input')).toBeVisible()
            await expect(page.locator('.filter-toggle').filter({ hasText: 'Regex' })).toBeVisible()
            await expect(page.locator('.type-filter')).toBeVisible()
        }
    })

    test('can toggle split view', async ({ page }) => {
        const recentFile = page.locator('.file-item').first()

        if (await recentFile.isVisible()) {
            await recentFile.click()
            await page.locator('.tab-item').filter({ hasText: 'Log Table' }).click()

            // Find and click vertical split button
            const splitBtn = page.locator('.btn-icon').filter({ hasText: '◴' })
            if (await splitBtn.isVisible()) {
                await splitBtn.click()

                // Check that waveform view appears
                await expect(page.locator('.waveform-view')).toBeVisible()
                await expect(page.locator('.signal-sidebar')).toBeVisible()
            }
        }
    })
})
