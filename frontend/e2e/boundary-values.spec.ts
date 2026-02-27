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
            test.skip(true, `Large fixture not found: ${fixturePath}. Run: python3 generate_log.py to create it.`)
            return
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

        // Wait for signals to be available in the sidebar
        await page.waitForTimeout(2000)
        
        // Select first device/signal from sidebar to enable chunk fetching
        // For large files, signals are not auto-selected
        const firstDeviceCheckbox = page.locator('.signal-sidebar .device-header input[type="checkbox"]').first()
        if (await firstDeviceCheckbox.isVisible({ timeout: 5000 }).catch(() => false)) {
            await firstDeviceCheckbox.click()
            console.log('Selected first device signals')
            // Wait for data to load after signal selection
            await page.waitForTimeout(2000)
        } else {
            console.log('No device checkbox found, signals may already be selected or sidebar not visible')
        }

        // Pan/zoom to trigger additional chunk loading (this should trigger boundaries)
        // Use wrapper for interactions since canvas has pointer-events issues
        const wrapper = page.locator('.waveform-canvas-wrapper')
        await expect(wrapper).toBeVisible({ timeout: 10000 })
        
        // Focus the wrapper first
        await wrapper.click({ position: { x: 400, y: 100 } })
        await page.waitForTimeout(500)

        console.log('Panning to trigger chunk fetch (using mouse drag)...')
        // Pan by dragging to trigger viewport change and chunk fetch
        const box = await wrapper.boundingBox()
        if (box) {
            await page.mouse.move(box.x + box.width / 2, box.y + 100)
            await page.mouse.down()
            await page.mouse.move(box.x + box.width / 2 + 200, box.y + 100, { steps: 10 })
            await page.mouse.up()
            await page.waitForTimeout(2000)
            
            // Pan back to trigger fetch in opposite direction
            await page.mouse.move(box.x + box.width / 2, box.y + 100)
            await page.mouse.down()
            await page.mouse.move(box.x + box.width / 2 - 400, box.y + 100, { steps: 10 })
            await page.mouse.up()
            await page.waitForTimeout(2000)
        }

        // Final zoom to trigger more fetches
        const canvasBox = await wrapper.boundingBox()
        if (canvasBox) {
            await page.mouse.move(canvasBox.x + canvasBox.width / 2, canvasBox.y + 100)
            await page.mouse.wheel(0, 100)
            await page.waitForTimeout(3000)
        }

        console.log(`Boundary requests made: ${boundaryRequests.length}`)
        boundaryRequests.forEach(req => console.log(`  ${req}`))

        // Verify that the chunk-boundaries endpoint was called
        expect(boundaryRequests.length, 'Expected chunk-boundaries endpoint to be called').toBeGreaterThan(0)
    })
})
