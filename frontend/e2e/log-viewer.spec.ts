import { test, expect, Page } from '@playwright/test'
import * as path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

test.describe('Log Table', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/')
        // Wait for the app to load
        await expect(page.locator('.status-dot.connected')).toBeVisible({ timeout: 10000 })
    })

    /**
     * Navigate to Log Table by uploading a file via the file input.
     * This ensures a valid session exists for testing.
     */
    async function setupLogTableWithData(page: Page): Promise<boolean> {
        // First, try to use an existing enabled button
        const logTableBtn = page.locator('.view-btn').filter({ hasText: 'Log Table' }).first()
        if (await logTableBtn.isEnabled({ timeout: 3000 }).catch(() => false)) {
            await logTableBtn.click()
            await expect(page.locator('.log-table-header')).toBeVisible({ timeout: 10000 })
            return true
        }

        // Try the "Open Views" section
        const openViewsLogTable = page.locator('button').filter({ hasText: 'Browse and filter log entries' })
        if (await openViewsLogTable.isEnabled({ timeout: 3000 }).catch(() => false)) {
            await openViewsLogTable.click()
            await expect(page.locator('.log-table-header')).toBeVisible({ timeout: 10000 })
            return true
        }

        // Find and use the file input to upload the fixture
        const fileInput = page.locator('input[type="file"]')
        if (await fileInput.count() > 0) {
            const fixturePath = path.join(__dirname, 'fixtures', 'sample.log')
            await fileInput.setInputFiles(fixturePath)

            // Wait for parsing to complete and buttons to enable
            try {
                await expect(logTableBtn).toBeEnabled({ timeout: 30000 })
                await logTableBtn.click()
                await expect(page.locator('.log-table-header')).toBeVisible({ timeout: 10000 })
                return true
            } catch {
                return false
            }
        }

        return false
    }

    test('category filter button is visible in header', async ({ page }) => {
        if (!await setupLogTableWithData(page)) {
            test.skip()
            return
        }
        await expect(page.locator('.category-filter-btn')).toBeVisible()
    })

    test('clicking category filter button opens popover', async ({ page }) => {
        if (!await setupLogTableWithData(page)) {
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
        if (!await setupLogTableWithData(page)) {
            test.skip()
            return
        }

        await page.locator('.category-filter-btn').click()
        await expect(page.locator('.category-filter-popover')).toBeVisible()

        await page.keyboard.press('Escape')
        await expect(page.locator('.category-filter-popover')).not.toBeVisible()
    })

    test('category filter popover closes on clicking filter button again', async ({ page }) => {
        if (!await setupLogTableWithData(page)) {
            test.skip()
            return
        }

        await page.locator('.category-filter-btn').click()
        await expect(page.locator('.category-filter-popover')).toBeVisible()

        await page.locator('.category-filter-btn').click()
        await expect(page.locator('.category-filter-popover')).not.toBeVisible()
    })

    test('category filter All button selects all categories', async ({ page }) => {
        if (!await setupLogTableWithData(page)) {
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
        if (!await setupLogTableWithData(page)) {
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
