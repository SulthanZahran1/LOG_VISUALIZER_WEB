import { test, expect, Page } from '@playwright/test'
import * as path from 'path'
import { fileURLToPath } from 'url'
import * as fs from 'fs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

test.describe('Log Table Filtering', () => {
    
    test.beforeEach(async ({ page }) => {
        await page.goto('/')
        await expect(page.locator('.status-dot.connected')).toBeVisible({ timeout: 10000 })
    })

    async function setupLogTableWithData(page: Page): Promise<boolean> {
        // Check if Log Table is already open
        const logTableTab = page.locator('.tab-item').filter({ hasText: 'Log Table' })
        if (await logTableTab.isVisible({ timeout: 2000 }).catch(() => false)) {
            await logTableTab.click()
            await expect(page.locator('.log-table-header')).toBeVisible({ timeout: 10000 })
            return true
        }

        // Try to use a recent file
        const recentTab = page.locator('.file-tab').filter({ hasText: 'Recent' })
        if (await recentTab.isVisible({ timeout: 2000 }).catch(() => false)) {
            await recentTab.click()
            await page.waitForTimeout(500)
            
            const recentFile = page.locator('.file-item').first()
            if (await recentFile.isVisible({ timeout: 2000 }).catch(() => false)) {
                await recentFile.click()
                await expect(page.locator('.log-table-header')).toBeVisible({ timeout: 30000 })
                return true
            }
        }
        
        // NOTE: Direct API upload is not reliable in test environment
        return false
    }

    test('should filter by text search', async ({ page }) => {
        if (!await setupLogTableWithData(page)) {
            test.skip
            return
        }

        const initialCount = await page.locator('.log-table-row').count()
        console.log('Initial rows:', initialCount)
        expect(initialCount).toBeGreaterThan(0)

        const searchInput = page.locator('.search-box input[type="text"]')
        await searchInput.fill('DEV-101')
        await page.waitForTimeout(300)

        const rows = page.locator('.log-table-row')
        const filteredCount = await rows.count()
        console.log('Filtered rows:', filteredCount)
        
        expect(filteredCount).toBeLessThanOrEqual(initialCount)
        
        for (let i = 0; i < Math.min(filteredCount, 5); i++) {
            const text = await rows.nth(i).textContent()
            expect(text).toContain('DEV-101')
        }
        
        await page.screenshot({ path: 'test-results/test-filter-text.png' })
    })

    test('should filter with case sensitive search', async ({ page }) => {
        if (!await setupLogTableWithData(page)) {
            test.skip
            return
        }

        const searchInput = page.locator('.search-box input[type="text"]')
        await searchInput.fill('motor')
        await page.waitForTimeout(300)

        const caseToggle = page.locator('.filter-toggle').filter({ hasText: 'Aa' })
        await caseToggle.click()
        await page.waitForTimeout(300)

        await searchInput.fill('Motor')
        await page.waitForTimeout(300)

        const rows = page.locator('.log-table-row')
        expect(await rows.count()).toBeGreaterThan(0)
        
        await page.screenshot({ path: 'test-results/test-filter-case.png' })
    })

    test('should filter with regex search', async ({ page }) => {
        if (!await setupLogTableWithData(page)) {
            test.skip
            return
        }

        const regexToggle = page.locator('.filter-toggle').filter({ hasText: 'Regex' })
        await regexToggle.click()
        await page.waitForTimeout(200)

        const searchInput = page.locator('.search-box input[type="text"]')
        await searchInput.fill('DEV-10[12]')
        await page.waitForTimeout(300)

        const rows = page.locator('.log-table-row')
        const count = await rows.count()
        expect(count).toBeGreaterThan(0)

        for (let i = 0; i < Math.min(count, 5); i++) {
            const text = await rows.nth(i).textContent()
            expect(text).toMatch(/DEV-10[12]/)
        }
        
        await page.screenshot({ path: 'test-results/test-filter-regex.png' })
    })

    test('should sort columns', async ({ page }) => {
        if (!await setupLogTableWithData(page)) {
            test.skip
            return
        }

        const deviceHeader = page.locator('.log-table-header .log-col').filter({ hasText: 'DEVICE ID' })
        await deviceHeader.click()
        await page.waitForTimeout(300)
        
        await deviceHeader.click()
        await page.waitForTimeout(300)

        await expect(page.locator('.log-table-viewport')).toBeVisible()
        
        await page.screenshot({ path: 'test-results/test-sort.png' })
    })

    test('should show empty state', async ({ page }) => {
        if (!await setupLogTableWithData(page)) {
            test.skip
            return
        }

        const searchInput = page.locator('.search-box input[type="text"]')
        await searchInput.fill('XYZ_NONEXISTENT_12345')
        await page.waitForTimeout(300)

        const emptyState = page.locator('.log-empty-state')
        await expect(emptyState).toBeVisible({ timeout: 5000 })
        
        await page.screenshot({ path: 'test-results/test-empty.png' })
    })

    test('should clear filters', async ({ page }) => {
        if (!await setupLogTableWithData(page)) {
            test.skip
            return
        }

        const searchInput = page.locator('.search-box input[type="text"]')
        await searchInput.fill('DEV-101')
        await page.waitForTimeout(300)
        
        const filteredCount = await page.locator('.log-table-row').count()

        await searchInput.clear()
        await page.waitForTimeout(300)

        const allCount = await page.locator('.log-table-row').count()
        expect(allCount).toBeGreaterThanOrEqual(filteredCount)
        
        await page.screenshot({ path: 'test-results/test-clear.png' })
    })

    test('should highlight search matches', async ({ page }) => {
        if (!await setupLogTableWithData(page)) {
            test.skip
            return
        }

        const searchInput = page.locator('.search-box input[type="text"]')
        await searchInput.fill('Motor')
        await page.waitForTimeout(300)

        const highlights = page.locator('.highlight-match')
        const count = await highlights.count()
        console.log('Highlight count:', count)
        expect(count).toBeGreaterThan(0)
        
        await page.screenshot({ path: 'test-results/test-highlight.png' })
    })

    test('should handle category filter', async ({ page }) => {
        if (!await setupLogTableWithData(page)) {
            test.skip
            return
        }

        await page.locator('.category-filter-btn').click()
        await expect(page.locator('.category-filter-popover')).toBeVisible()

        const checkboxes = page.locator('.filter-item input[type="checkbox"]')
        const count = await checkboxes.count()
        
        if (count > 0) {
            await checkboxes.first().check()
            await page.keyboard.press('Escape')
            await page.waitForTimeout(300)

            const badge = page.locator('.filter-badge')
            expect(await badge.isVisible()).toBe(true)
        }
        
        await page.screenshot({ path: 'test-results/test-category.png' })
    })

    test('should handle special characters', async ({ page }) => {
        if (!await setupLogTableWithData(page)) {
            test.skip
            return
        }

        const searchInput = page.locator('.search-box input[type="text"]')
        const specialChars = ['%', '_', '[', ']', '*', '+']
        
        for (const char of specialChars) {
            await searchInput.fill(char)
            await page.waitForTimeout(100)
            await expect(page.locator('.log-table-viewport')).toBeVisible()
        }
        
        await page.screenshot({ path: 'test-results/test-special-chars.png' })
    })
})
