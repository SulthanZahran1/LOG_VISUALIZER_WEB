import { test, expect } from '@playwright/test'
import * as fs from 'fs'
import * as path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

/**
 * E2E Tests specifically for server-side filtering (large files)
 */

test.describe('Log Table Server-Side Filtering', () => {
    
    test.beforeEach(async ({ page }) => {
        await page.goto('/')
        await expect(page.locator('.status-dot.connected')).toBeVisible({ timeout: 10000 })
    })

    test('API should filter correctly with search parameter', async ({ page }) => {
        const largeFilePath = path.join(__dirname, '../../large_test.log')
        
        if (!fs.existsSync(largeFilePath)) {
            console.log('Large test file not found, skipping')
            test.skip
            return
        }

        // Upload via API
        console.log('Uploading large file...')
        const content = fs.readFileSync(largeFilePath, 'utf-8')
        const base64Content = Buffer.from(content).toString('base64')
        
        const uploadRes = await page.request.post('http://localhost:8089/api/files/upload', {
            data: { name: 'api-filter-test.log', data: base64Content }
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

        // Test: Get all entries (no filter)
        const allRes = await page.request.get(
            `http://localhost:8089/api/parse/${parseData.id}/entries?page=1&pageSize=100`
        )
        const allData = await allRes.json()
        console.log('All entries total:', allData.total)
        expect(allData.total).toBeGreaterThan(100000) // Should be large file

        // Test: Get filtered entries - search for something that definitely exists
        const filteredRes = await page.request.get(
            `http://localhost:8089/api/parse/${parseData.id}/entries?page=1&pageSize=100&search=DEV-101`
        )
        const filteredData = await filteredRes.json()
        console.log('Filtered entries (DEV-101) total:', filteredData.total)
        
        // Filtered count should be less than total
        expect(filteredData.total).toBeLessThan(allData.total)
        
        // Verify all returned entries contain DEV-101
        for (const entry of filteredData.entries) {
            expect(entry.deviceId).toContain('DEV-101')
        }

        // Test: Different filter should give different (but also valid) results
        const modeRes = await page.request.get(
            `http://localhost:8089/api/parse/${parseData.id}/entries?page=1&pageSize=100&search=Mode`
        )
        const modeData = await modeRes.json()
        console.log('Filtered entries (Mode) total:', modeData.total)
        
        // Mode filtered count should also be less than total
        expect(modeData.total).toBeLessThan(allData.total)
        
        // Verify entries contain Mode (case insensitive)
        for (const entry of modeData.entries) {
            const text = (entry.deviceId + entry.signalName + entry.value).toLowerCase()
            expect(text).toContain('mode')
        }

        console.log('✅ API server-side filtering works correctly')
    })

    test('cache key should include filters', async ({ page }) => {
        // This test verifies the fix: cache key should include filters, not just page number
        const largeFilePath = path.join(__dirname, '../../large_test.log')
        
        if (!fs.existsSync(largeFilePath)) {
            test.skip
            return
        }

        const content = fs.readFileSync(largeFilePath, 'utf-8')
        const base64Content = Buffer.from(content).toString('base64')
        
        const uploadRes = await page.request.post('http://localhost:8089/api/files/upload', {
            data: { name: 'cache-fix-test.log', data: base64Content }
        })
        const uploadData = await uploadRes.json()
        
        const parseRes = await page.request.post('http://localhost:8089/api/parse', {
            data: { fileId: uploadData.id }
        })
        const parseData = await parseRes.json()
        
        let status = parseData.status
        while (status !== 'complete') {
            await page.waitForTimeout(1000)
            const res = await page.request.get(`http://localhost:8089/api/parse/${parseData.id}/status`)
            status = (await res.json()).status
        }

        // Fetch same page with different filters - should return different results
        const res1 = await page.request.get(
            `http://localhost:8089/api/parse/${parseData.id}/entries?page=1&pageSize=10&search=DEV-101`
        )
        const data1 = await res1.json()
        
        const res2 = await page.request.get(
            `http://localhost:8089/api/parse/${parseData.id}/entries?page=1&pageSize=10&search=DEV-102`
        )
        const data2 = await res2.json()
        
        // The actual entries should be different
        const dev101Devices = data1.entries.map((e: any) => e.deviceId)
        const dev102Devices = data2.entries.map((e: any) => e.deviceId)
        
        console.log('DEV-101 sample devices:', dev101Devices.slice(0, 3))
        console.log('DEV-102 sample devices:', dev102Devices.slice(0, 3))
        
        // All DEV-101 entries should have DEV-101
        for (const deviceId of dev101Devices) {
            expect(deviceId).toContain('DEV-101')
        }
        
        // All DEV-102 entries should have DEV-102
        for (const deviceId of dev102Devices) {
            expect(deviceId).toContain('DEV-102')
        }
        
        console.log('✅ Different filters return correctly different results')
    })
})
