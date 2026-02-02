import { test, expect, Page } from '@playwright/test'

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

    /**
     * Navigate to Log Table using any available method.
     * Returns true if navigation succeeded, false otherwise.
     */
    async function navigateToLogTable(page: Page): Promise<boolean> {
        // First, try enabled view-btn in LoadedFileCard
        const logTableBtn = page.locator('.view-btn').filter({ hasText: 'Log Table' }).first()
        if (await logTableBtn.isEnabled({ timeout: 3000 }).catch(() => false)) {
            await logTableBtn.click()
            await expect(page.locator('.log-table-header')).toBeVisible({ timeout: 10000 })
            return true
        }

        // Try the "Open Views" section's "Log Table" button (only if enabled)
        const openViewsLogTable = page.locator('button').filter({ hasText: 'Browse and filter log entries' })
        if (await openViewsLogTable.isEnabled({ timeout: 3000 }).catch(() => false)) {
            await openViewsLogTable.click()
            await expect(page.locator('.log-table-header')).toBeVisible({ timeout: 10000 })
            return true
        }

        // Cannot navigate - no valid session
        return false
    }

    test('category filter button is visible in header', async ({ page }) => {
        if (!await navigateToLogTable(page)) {
            test.skip()
            return
        }
        await expect(page.locator('.category-filter-btn')).toBeVisible()
    })

    test('clicking category filter button opens popover', async ({ page }) => {
        if (!await navigateToLogTable(page)) {
            test.skip()
            return
        }

        await page.locator('.category-filter-btn').click()
        await expect(page.locator('.category-filter-popover')).toBeVisible()
        await expect(page.locator('.popover-header')).toContainText('Filter by Category')
        await expect(page.locator('.popover-btn').filter({ hasText: 'All' })).toBeVisible()
        await expect(page.locator('.popover-btn').filter({ hasText: 'Clear' })).toBeVisible()
    })

    test('category filter popover closes on escape', async ({ page }) => {
        if (!await navigateToLogTable(page)) {
            test.skip()
            return
        }

        await page.locator('.category-filter-btn').click()
        await expect(page.locator('.category-filter-popover')).toBeVisible()

        await page.keyboard.press('Escape')
        await expect(page.locator('.category-filter-popover')).not.toBeVisible()
    })

    test('category filter popover closes on clicking filter button again', async ({ page }) => {
        if (!await navigateToLogTable(page)) {
            test.skip()
            return
        }

        await page.locator('.category-filter-btn').click()
        await expect(page.locator('.category-filter-popover')).toBeVisible()

        await page.locator('.category-filter-btn').click()
        await expect(page.locator('.category-filter-popover')).not.toBeVisible()
    })

    test('category filter All button selects all categories', async ({ page }) => {
        if (!await navigateToLogTable(page)) {
            test.skip()
            return
        }

        await page.locator('.category-filter-btn').click()
        await expect(page.locator('.category-filter-popover')).toBeVisible()

        await page.locator('.popover-btn').filter({ hasText: 'All' }).click()

        const checkboxes = page.locator('.filter-item input[type="checkbox"]')
        const count = await checkboxes.count()

        if (count > 0) {
            await expect(page.locator('.category-filter-btn.active')).toBeVisible()
        }
    })

    test('category filter Clear button clears all selections', async ({ page }) => {
        if (!await navigateToLogTable(page)) {
            test.skip()
            return
        }

        await page.locator('.category-filter-btn').click()
        await expect(page.locator('.category-filter-popover')).toBeVisible()

        await page.locator('.popover-btn').filter({ hasText: 'All' }).click()
        await page.locator('.popover-btn').filter({ hasText: 'Clear' }).click()

        await expect(page.locator('.filter-badge')).not.toBeVisible()
    })
})
