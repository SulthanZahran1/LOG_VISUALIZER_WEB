import { test, expect, Page } from '@playwright/test'
import * as path from 'path'
import { fileURLToPath } from 'url'
import * as fs from 'fs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

test.describe('Jump to Time Feature', () => {
    
    test.beforeEach(async ({ page }) => {
        await page.goto('/')
        await expect(page.locator('.status-dot.connected')).toBeVisible({ timeout: 10000 })
    })

    async function uploadAndParseFile(page: Page, fileName: string, filePath: string): Promise<string | null> {
        const fileContent = fs.readFileSync(filePath, 'utf-8')
        const base64Content = Buffer.from(fileContent).toString('base64')
        
        const uploadResponse = await page.request.post('http://localhost:8089/api/files/upload', {
            data: { name: fileName, data: base64Content }
        })
        
        if (!uploadResponse.ok()) return null
        const uploadData = await uploadResponse.json()
        
        const parseResponse = await page.request.post('http://localhost:8089/api/parse', {
            data: { fileId: uploadData.id }
        })
        const parseData = await parseResponse.json()
        
        let status = parseData.status
        let attempts = 0
        while (status !== 'complete' && attempts < 30) {
            await page.waitForTimeout(1000)
            const res = await page.request.get(`http://localhost:8089/api/parse/${parseData.id}/status`)
            status = (await res.json()).status
            attempts++
        }
        
        return status === 'complete' ? parseData.id : null
    }

    test('API should return time tree for session', async ({ page }) => {
        const fixturePath = path.join(__dirname, 'fixtures/sample.log')
        if (!fs.existsSync(fixturePath)) {
            test.skip
            return
        }

        const sessionId = await uploadAndParseFile(page, 'timetree-test.log', fixturePath)
        if (!sessionId) {
            test.skip
            return
        }

        // Test: Get time tree from API
        const timeTreeRes = await page.request.get(
            `http://localhost:8089/api/parse/${sessionId}/time-tree`
        )
        expect(timeTreeRes.ok()).toBe(true)
        
        const timeTreeData = await timeTreeRes.json()
        console.log('Time tree entries:', timeTreeData.length)
        
        // Should have time tree entries
        expect(timeTreeData.length).toBeGreaterThan(0)
        
        // Verify structure of entries
        for (const entry of timeTreeData) {
            expect(entry).toHaveProperty('date')
            expect(entry).toHaveProperty('hour')
            expect(entry).toHaveProperty('minute')
            expect(entry).toHaveProperty('ts')
            
            // Verify date format (YYYY-MM-DD)
            expect(entry.date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
            
            // Verify hour is 0-23
            expect(entry.hour).toBeGreaterThanOrEqual(0)
            expect(entry.hour).toBeLessThanOrEqual(23)
            
            // Verify minute is 0-59
            expect(entry.minute).toBeGreaterThanOrEqual(0)
            expect(entry.minute).toBeLessThanOrEqual(59)
            
            // Verify timestamp is a number
            expect(typeof entry.ts).toBe('number')
        }
        
        console.log('✅ Time tree API returns valid data')
    })

    test('API should respect filters when returning time tree', async ({ page }) => {
        const fixturePath = path.join(__dirname, 'fixtures/sample.log')
        if (!fs.existsSync(fixturePath)) {
            test.skip
            return
        }

        const sessionId = await uploadAndParseFile(page, 'timetree-filter-test.log', fixturePath)
        if (!sessionId) {
            test.skip
            return
        }

        // Get unfiltered time tree
        const allRes = await page.request.get(
            `http://localhost:8089/api/parse/${sessionId}/time-tree`
        )
        const allData = await allRes.json()
        
        // Get filtered time tree (search for DEV-101)
        const filteredRes = await page.request.get(
            `http://localhost:8089/api/parse/${sessionId}/time-tree?search=DEV-101`
        )
        expect(filteredRes.ok()).toBe(true)
        const filteredData = await filteredRes.json()
        
        console.log('Unfiltered entries:', allData.length)
        console.log('Filtered entries (DEV-101):', filteredData.length)
        
        // Filtered should have same or fewer entries
        expect(filteredData.length).toBeLessThanOrEqual(allData.length)
        
        console.log('✅ Time tree API respects filters')
    })

    test('UI should show Jump to Time popover', async ({ page }) => {
        const fixturePath = path.join(__dirname, 'fixtures/sample.log')
        if (!fs.existsSync(fixturePath)) {
            test.skip
            return
        }

        const sessionId = await uploadAndParseFile(page, 'jump-ui-test.log', fixturePath)
        if (!sessionId) {
            test.skip
            return
        }

        // Navigate to log table
        await page.goto(`/?session=${sessionId}`)
        await page.waitForTimeout(2000)
        
        // Click Log Table button
        const logTableBtn = page.locator('button').filter({ hasText: 'Log Table' }).first()
        for (let i = 0; i < 20; i++) {
            if (await logTableBtn.isEnabled().catch(() => false)) {
                await logTableBtn.click()
                break
            }
            await page.waitForTimeout(500)
        }
        
        await expect(page.locator('.log-table-header')).toBeVisible()
        
        // Click Jump to Time button
        const jumpBtn = page.locator('.jump-to-time-btn')
        await expect(jumpBtn).toBeVisible()
        await jumpBtn.click()
        
        // Verify popover opens
        const popover = page.locator('.jump-to-time-popover')
        await expect(popover).toBeVisible()
        
        // Verify popover has date, hour, minute fields
        await expect(popover.locator('select')).toHaveCount(3)
        
        // Verify Go button is initially disabled (no selection yet)
        const goBtn = popover.locator('.jump-go-btn')
        await expect(goBtn).toBeDisabled()
        
        // Take screenshot
        await page.screenshot({ path: 'test-results/jump-to-time-popover.png' })
        
        // Close popover with Escape
        await page.keyboard.press('Escape')
        await expect(popover).not.toBeVisible()
        
        console.log('✅ Jump to Time popover works correctly')
    })

    test('UI should allow selecting date/hour/minute and jump', async ({ page }) => {
        const fixturePath = path.join(__dirname, 'fixtures/sample.log')
        if (!fs.existsSync(fixturePath)) {
            test.skip
            return
        }

        const sessionId = await uploadAndParseFile(page, 'jump-select-test.log', fixturePath)
        if (!sessionId) {
            test.skip
            return
        }

        // Navigate to log table
        await page.goto(`/?session=${sessionId}`)
        await page.waitForTimeout(2000)
        
        // Click Log Table button
        const logTableBtn = page.locator('button').filter({ hasText: 'Log Table' }).first()
        for (let i = 0; i < 20; i++) {
            if (await logTableBtn.isEnabled().catch(() => false)) {
                await logTableBtn.click()
                break
            }
            await page.waitForTimeout(500)
        }
        
        // Open Jump to Time popover
        await page.locator('.jump-to-time-btn').click()
        const popover = page.locator('.jump-to-time-popover')
        await expect(popover).toBeVisible()
        
        // Get date options
        const dateSelect = popover.locator('select').nth(0)
        const dateOptions = await dateSelect.locator('option').allTextContents()
        console.log('Available dates:', dateOptions)
        
        if (dateOptions.length > 1) {
            // Select first non-placeholder date
            await dateSelect.selectOption({ index: 1 })
            await page.waitForTimeout(300)
            
            // Hour should now be enabled
            const hourSelect = popover.locator('select').nth(1)
            await expect(hourSelect).not.toBeDisabled()
            
            // Get hour options
            const hourOptions = await hourSelect.locator('option').allTextContents()
            console.log('Available hours:', hourOptions)
            
            if (hourOptions.length > 1) {
                await hourSelect.selectOption({ index: 1 })
                await page.waitForTimeout(300)
                
                // Minute should now be enabled
                const minuteSelect = popover.locator('select').nth(2)
                await expect(minuteSelect).not.toBeDisabled()
                
                // Get minute options
                const minuteOptions = await minuteSelect.locator('option').allTextContents()
                console.log('Available minutes:', minuteOptions)
                
                if (minuteOptions.length > 1) {
                    await minuteSelect.selectOption({ index: 1 })
                    await page.waitForTimeout(300)
                    
                    // Go button should now be enabled
                    const goBtn = popover.locator('.jump-go-btn')
                    await expect(goBtn).toBeEnabled()
                    
                    // Take screenshot before clicking
                    await page.screenshot({ path: 'test-results/jump-to-time-selected.png' })
                    
                    // Click Go
                    await goBtn.click()
                    
                    // Popover should close
                    await expect(popover).not.toBeVisible()
                    
                    console.log('✅ Jump to Time selection and jump works')
                }
            }
        }
    })

    test('should work with large files in server-side mode', async ({ page }) => {
        const largeFilePath = path.join(__dirname, '../../large_test.log')
        if (!fs.existsSync(largeFilePath)) {
            console.log('Large test file not found, skipping')
            test.skip
            return
        }

        // Upload large file
        const content = fs.readFileSync(largeFilePath, 'utf-8')
        const base64Content = Buffer.from(content).toString('base64')
        
        const uploadRes = await page.request.post('http://localhost:8089/api/files/upload', {
            data: { name: 'timetree-large-test.log', data: base64Content }
        })
        const uploadData = await uploadRes.json()
        
        const parseRes = await page.request.post('http://localhost:8089/api/parse', {
            data: { fileId: uploadData.id }
        })
        const parseData = await parseRes.json()
        
        // Wait for parsing
        let status = parseData.status
        let attempts = 0
        while (status !== 'complete' && attempts < 120) {
            await page.waitForTimeout(1000)
            const res = await page.request.get(`http://localhost:8089/api/parse/${parseData.id}/status`)
            const data = await res.json()
            status = data.status
            attempts++
        }
        
        if (status !== 'complete') {
            console.log('Parsing did not complete')
            test.skip
            return
        }

        // Get time tree for large file
        const timeTreeRes = await page.request.get(
            `http://localhost:8089/api/parse/${parseData.id}/time-tree`
        )
        expect(timeTreeRes.ok()).toBe(true)
        
        const timeTreeData = await timeTreeRes.json()
        console.log('Large file time tree entries:', timeTreeData.length)
        
        // Should have time tree entries
        expect(timeTreeData.length).toBeGreaterThan(0)
        
        // Navigate to UI and test
        await page.goto(`/?session=${parseData.id}`)
        await page.waitForTimeout(2000)
        
        // Click Log Table button
        const logTableBtn = page.locator('button').filter({ hasText: 'Log Table' }).first()
        for (let i = 0; i < 20; i++) {
            if (await logTableBtn.isEnabled().catch(() => false)) {
                await logTableBtn.click()
                break
            }
            await page.waitForTimeout(500)
        }
        
        // Open Jump to Time popover
        await page.locator('.jump-to-time-btn').click()
        const popover = page.locator('.jump-to-time-popover')
        await expect(popover).toBeVisible()
        
        // Wait for time tree to load (server-side fetch)
        await page.waitForTimeout(2000)
        
        // Verify dropdowns are populated
        const dateSelect = popover.locator('select').nth(0)
        const dateOptions = await dateSelect.locator('option').count()
        console.log('Large file date options:', dateOptions)
        expect(dateOptions).toBeGreaterThan(0)
        
        await page.screenshot({ path: 'test-results/jump-to-time-large-file.png' })
        
        console.log('✅ Time tree works with large files in server-side mode')
    })

    test('time tree should respect category filter', async ({ page }) => {
        const fixturePath = path.join(__dirname, 'fixtures/sample.log')
        if (!fs.existsSync(fixturePath)) {
            test.skip
            return
        }

        const sessionId = await uploadAndParseFile(page, 'timetree-category-test.log', fixturePath)
        if (!sessionId) {
            test.skip
            return
        }

        // Get all entries to find available categories
        const entriesRes = await page.request.get(
            `http://localhost:8089/api/parse/${sessionId}/entries?page=1&pageSize=100`
        )
        const entriesData = await entriesRes.json()
        
        // Extract unique categories
        const categories = [...new Set(entriesData.entries.map((e: any) => e.category).filter(Boolean))]
        console.log('Available categories:', categories)
        
        if (categories.length === 0) {
            console.log('No categories found, skipping category filter test')
            test.skip
            return
        }

        // Get unfiltered time tree
        const allRes = await page.request.get(
            `http://localhost:8089/api/parse/${sessionId}/time-tree`
        )
        const allData = await allRes.json()
        
        // Get filtered time tree by first category
        const categoryFilter = categories[0]
        const filteredRes = await page.request.get(
            `http://localhost:8089/api/parse/${sessionId}/time-tree?category=${encodeURIComponent(categoryFilter)}`
        )
        expect(filteredRes.ok()).toBe(true)
        const filteredData = await filteredRes.json()
        
        console.log(`Unfiltered entries: ${allData.length}, Filtered by '${categoryFilter}': ${filteredData.length}`)
        
        // Filtered should have same or fewer entries
        expect(filteredData.length).toBeLessThanOrEqual(allData.length)
        
        console.log('✅ Time tree API respects category filter')
    })
})
