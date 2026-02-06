import { test, expect } from '@playwright/test'
import * as path from 'path'
import { fileURLToPath } from 'url'
import fs from 'fs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

test.describe('Boundary Values API', () => {
    // Increase timeout for large file operations
    test.setTimeout(300000) // 5 minutes

    test('should call chunk-boundaries endpoint for large files in server-side mode', async ({ page }) => {
        // Use the large test file in the project root (1.19M lines, triggers server-side mode)
        const fixturePath = path.resolve(__dirname, '../../large_test.log')

        // Verify file exists
        if (!fs.existsSync(fixturePath)) {
            throw new Error(`Fixture not found: ${fixturePath}. Create large_test.log with >100k entries.`)
        }

        const stats = fs.statSync(fixturePath)
        console.log(`Uploading file of size: ${(stats.size / (1024 * 1024)).toFixed(2)} MB`)

        // Collect network requests to verify boundary endpoint is called
        const boundaryRequests: string[] = []
        page.on('request', req => {
            if (req.url().includes('chunk-boundaries')) {
                boundaryRequests.push(req.url())
            }
        })

        // Collect console logs to verify isLarge=true and rendering usage
        const consoleLogs: string[] = []
        page.on('console', msg => {
            const text = msg.text()
            if (text.includes('[waveformStore]') ||
                text.includes('isLarge') ||
                text.includes('[drawBooleanSignal]') ||
                text.includes('[drawStateSignal]') ||
                text.includes('Using beforeBoundary')) {
                consoleLogs.push(text)
            }
        })

        await page.goto('/')

        // Wait for connection
        await expect(page.locator('.status-dot.connected')).toBeVisible({ timeout: 10000 })

        // Upload the large file
        const fileInput = page.locator('input[type="file"]')
        await fileInput.setInputFiles(fixturePath)

        // Wait for the file to be parsed (shown as 'Ready' in the file list)
        const readyBadge = page.locator('text=Ready').first()
        await expect(readyBadge).toBeVisible({ timeout: 300000 })

        console.log('Upload and parsing complete. Navigating to Timing Diagram...')

        // Click on the Timing Diagram in the OPEN VIEWS section (use text match)
        await page.getByText('Timing Diagram', { exact: true }).first().click()

        // Wait for timing view to load (canvas should appear)
        await expect(page.locator('canvas').first()).toBeVisible({ timeout: 30000 })
        console.log('Timing Diagram loaded')

        // The signals should be auto-selected for large files
        // Wait for data to load and check console logs
        await page.waitForTimeout(3000)

        // Pan/zoom to trigger additional chunk loading (this should trigger boundaries)
        const canvas = page.locator('canvas').first()
        await canvas.click() // Focus the canvas

        console.log('Panning to trigger before boundaries (using keyboard)...')
        for (let i = 0; i < 10; i++) {
            await page.keyboard.press('ArrowRight')
            await page.waitForTimeout(100)
        }

        // Wait for potential re-fetch
        await page.waitForTimeout(3000)

        // Final zoom to be sure
        const box = await canvas.boundingBox()
        if (box) {
            await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
            await page.mouse.wheel(0, 100)
            await page.waitForTimeout(3000)
        }

        console.log(`Boundary requests made: ${boundaryRequests.length}`)
        boundaryRequests.forEach(req => console.log(`  ${req}`))

        // Verify that the chunk-boundaries endpoint was called
        expect(boundaryRequests.length, 'Expected chunk-boundaries endpoint to be called').toBeGreaterThan(0)
    })
})
