import { test, expect } from '@playwright/test'
import * as path from 'path'
import { fileURLToPath } from 'url'
import fs from 'fs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

test.describe('Large File Upload & Parsing (1.7GB)', () => {
    // Increase timeout to 10 minutes for the whole test
    test.setTimeout(600000)

    test('should successfully upload and parse a 1.7GB log file', async ({ page }) => {
        await page.goto('/')

        // Wait for connection
        await expect(page.locator('.status-dot.connected')).toBeVisible({ timeout: 10000 })

        const fixturePath = path.join(__dirname, 'fixtures', 'large_sample.log')

        // Verify file exists
        if (!fs.existsSync(fixturePath)) {
            test.skip(true, `Large fixture not found: ${fixturePath}. Run: python3 generate_log.py to create it.`)
            return
        }

        const stats = fs.statSync(fixturePath)
        console.log(`Uploading file of size: ${(stats.size / (1024 * 1024 * 1024)).toFixed(2)} GB`)

        // Find and use the file input to upload the large fixture
        const fileInput = page.locator('input[type="file"]')
        await fileInput.setInputFiles(fixturePath)

        // Wait for progress indicator to show up
        // Based on uploadOptimized.ts, we should see stages like 'reading', 'encoding', 'compressing', 'uploading'
        const progressOverlay = page.locator('.upload-progress-overlay, .progress-overlay, .parsing-overlay')
        // We'll wait for the "Log Table" button to be enabled which signifies completion
        const logTableBtn = page.locator('.view-btn').filter({ hasText: 'Log Table' }).first()

        console.log('Upload started, waiting for completion...')

        // This might take several minutes
        await expect(logTableBtn).toBeEnabled({ timeout: 600000 })

        console.log('Upload and parsing complete. Navigating to Log Table...')
        await logTableBtn.click()

        // Verify we are in the Log Table and see data
        await expect(page.locator('.log-table-header')).toBeVisible({ timeout: 30000 })

        // Check if we have rows
        const rows = page.locator('.log-table-row')
        await expect(rows.first()).toBeVisible({ timeout: 30000 })

        const rowCount = await rows.count()
        console.log(`Log Table visible with ${rowCount} rows on first page.`)

        expect(rowCount).toBeGreaterThan(0)
    })
})
