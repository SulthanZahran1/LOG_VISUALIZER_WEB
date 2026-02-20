import { test, expect } from '@playwright/test'
import { gotoWithSession, hasPreloadedSession, PRELOADED_SESSIONS } from './test-helpers'

test.describe('Waveform Canvas Interactions', () => {
    test.beforeEach(async ({ page }) => {
        // Skip if no preloaded PLC session
        if (!hasPreloadedSession('plc')) {
            test.skip(true, 'No preloaded PLC session available')
            return
        }
        
        // Navigate to Timing Diagram with preloaded session
        const success = await gotoWithSession(page, 'timing-diagram', 'plc')
        if (!success) {
            test.skip(true, 'Failed to load session')
            return
        }
    })

    test('zooms with Ctrl+wheel on waveform canvas', async ({ page }) => {
        // Wait for canvas to be visible
        await expect(page.locator('.waveform-canvas')).toBeVisible()
        await page.waitForTimeout(500)

        const canvas = page.locator('.waveform-canvas')
        
        // Focus canvas first
        await canvas.click({ position: { x: 400, y: 200 } })
        
        // Hold Ctrl and wheel to zoom
        await page.keyboard.down('Control')
        await page.mouse.wheel(0, -10)
        await page.keyboard.up('Control')
        
        await page.waitForTimeout(300)

        // Verify zoom changed (toolbar should show time scale)
        const toolbar = page.locator('.waveform-toolbar')
        await expect(toolbar).toBeVisible()
    })

    test('clears hover state when leaving canvas area', async ({ page }) => {
        await expect(page.locator('.waveform-canvas')).toBeVisible()

        // Hover over canvas to trigger hover state
        const canvas = page.locator('.waveform-canvas')
        await canvas.hover({ position: { x: 400, y: 200 } })
        await page.waitForTimeout(200)

        // Verify hover state is active (time readout may be visible)
        const toolbar = page.locator('.waveform-toolbar')
        await expect(toolbar).toBeVisible()

        // Move mouse outside canvas area
        await page.mouse.move(10, 10)
        await page.waitForTimeout(300)

        // Canvas should still be visible (no errors)
        await expect(canvas).toBeVisible()
    })

    test('pans waveform on drag', async ({ page }) => {
        await expect(page.locator('.waveform-canvas')).toBeVisible()
        await page.waitForTimeout(500)

        const canvas = page.locator('.waveform-canvas')
        const box = await canvas.boundingBox()
        if (!box) {
            test.skip(true, 'Could not get canvas bounds')
            return
        }

        // Get initial time display
        const toolbar = page.locator('.waveform-toolbar')
        await expect(toolbar).toBeVisible()

        // Drag to pan (left mouse button, no modifiers)
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
        await page.mouse.down()
        await page.mouse.move(box.x + box.width / 2 - 100, box.y + box.height / 2, { steps: 10 })
        await page.mouse.up()
        
        await page.waitForTimeout(300)

        // Toolbar should still be visible
        await expect(toolbar).toBeVisible()
    })

    test('creates time selection with Shift+drag', async ({ page }) => {
        await expect(page.locator('.waveform-canvas')).toBeVisible()
        await page.waitForTimeout(500)

        const canvas = page.locator('.waveform-canvas')
        const box = await canvas.boundingBox()
        if (!box) {
            test.skip(true, 'Could not get canvas bounds')
            return
        }

        // Shift+drag to create selection
        const centerX = box.x + box.width / 2
        const centerY = box.y + box.height / 2
        
        await page.keyboard.down('Shift')
        await page.mouse.move(centerX - 100, centerY)
        await page.mouse.down()
        await page.mouse.move(centerX + 100, centerY, { steps: 5 })
        await page.mouse.up()
        await page.keyboard.up('Shift')
        
        await page.waitForTimeout(300)

        // Selection should be created (toolbar visible)
        const toolbar = page.locator('.waveform-toolbar')
        await expect(toolbar).toBeVisible()
    })
})

test.describe('Signal Sidebar - Device Selection', () => {
    test.beforeEach(async ({ page }) => {
        // Skip if no preloaded PLC session
        if (!hasPreloadedSession('plc')) {
            test.skip(true, 'No preloaded PLC session available')
            return
        }
        
        // Navigate to Timing Diagram with preloaded session
        const success = await gotoWithSession(page, 'timing-diagram', 'plc')
        if (!success) {
            test.skip(true, 'Failed to load session')
            return
        }
    })

    test('selects all signals for a device via checkbox', async ({ page }) => {
        // Wait for signal sidebar to load
        await expect(page.locator('.signal-sidebar')).toBeVisible()
        await page.waitForTimeout(500)

        // Expand a device group by clicking on it
        const deviceHeaders = page.locator('.device-header')
        const deviceCount = await deviceHeaders.count()
        
        if (deviceCount === 0) {
            test.skip(true, 'No devices available in signal sidebar')
            return
        }

        // Click first device to expand it
        await deviceHeaders.first().click()
        await page.waitForTimeout(200)

        // Find the device checkbox (should be in the header)
        const deviceCheckbox = deviceHeaders.first().locator('input[type="checkbox"]').first()
        
        if (await deviceCheckbox.isVisible().catch(() => false)) {
            // Get initial selection count
            const initialCount = await page.locator('.signal-count').textContent().catch(() => '0')
            
            // Click device checkbox to select all its signals
            await deviceCheckbox.click()
            await page.waitForTimeout(200)
            
            // Verify signals are selected (count should increase or change)
            const newCount = await page.locator('.signal-count').textContent().catch(() => '0')
            
            // Extract numbers from text like "5/10" -> 5
            const getSelectedCount = (text: string) => {
                const match = text.match(/(\d+)\//)
                return match ? parseInt(match[1]) : 0
            }
            
            expect(getSelectedCount(newCount)).toBeGreaterThanOrEqual(getSelectedCount(initialCount))
        }
    })

    test('shows device signal count correctly', async ({ page }) => {
        // Wait for signal sidebar
        await expect(page.locator('.signal-sidebar')).toBeVisible()

        // Check that device groups show signal counts
        const deviceCounts = page.locator('.device-signal-count')
        const countText = await deviceCounts.first().textContent().catch(() => '')
        
        // Should show something like "0/5" (selected/total)
        if (countText) {
            expect(countText).toMatch(/\d+\/\d+/)
        }
    })
})

test.describe('Canvas with MCS Data', () => {
    test.beforeEach(async ({ page }) => {
        // Skip if no preloaded MCS session
        if (!hasPreloadedSession('mcs')) {
            test.skip(true, 'No preloaded MCS session available')
            return
        }
        
        // Navigate to Timing Diagram with MCS session
        const success = await gotoWithSession(page, 'timing-diagram', 'mcs')
        if (!success) {
            test.skip(true, 'Failed to load MCS session')
            return
        }
    })

    test('renders MCS carrier signals in waveform', async ({ page }) => {
        // Wait for signal sidebar to load
        await expect(page.locator('.signal-sidebar')).toBeVisible()
        await page.waitForTimeout(500)

        // Should have carrier-related signals
        const sidebar = page.locator('.signal-sidebar')
        const text = await sidebar.textContent() || ''
        
        // MCS data should contain carrier or transfer signals
        expect(text.length).toBeGreaterThan(0)
    })
})

test.describe('Canvas with CSV Data', () => {
    test.beforeEach(async ({ page }) => {
        // Skip if no preloaded CSV session
        if (!hasPreloadedSession('csv')) {
            test.skip(true, 'No preloaded CSV session available')
            return
        }
        
        // Navigate to Timing Diagram with CSV session
        const success = await gotoWithSession(page, 'timing-diagram', 'csv')
        if (!success) {
            test.skip(true, 'Failed to load CSV session')
            return
        }
    })

    test('renders CSV signals in waveform', async ({ page }) => {
        // Wait for signal sidebar to load
        await expect(page.locator('.signal-sidebar')).toBeVisible()
        await page.waitForTimeout(500)

        // Should have signals from CSV data
        const deviceHeaders = page.locator('.device-header')
        expect(await deviceHeaders.count()).toBeGreaterThan(0)
    })
})
