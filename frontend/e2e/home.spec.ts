import { test, expect } from '@playwright/test'

test.describe('Home Page', () => {
    test('loads successfully with all elements', async ({ page }) => {
        await page.goto('/')

        // Check page title
        await expect(page).toHaveTitle(/PLC/)

        // Check header elements
        await expect(page.locator('.app-title')).toContainText('PLC Log Visualizer')

        // Check Home tab is active
        await expect(page.locator('.tab-item.active')).toContainText('Home')

        // Check welcome section
        await expect(page.locator('.welcome-section h2')).toContainText('Welcome')

        // Check Log File card exists
        await expect(page.locator('.card-header')).toContainText('Log File')
    })

    test('has working navigation buttons', async ({ page }) => {
        await page.goto('/')

        // Check nav buttons exist
        await expect(page.locator('.nav-button')).toHaveCount(4)

        // Check buttons are disabled without a session
        const timingDiagram = page.locator('.nav-button').filter({ hasText: 'Timing Diagram' })
        await expect(timingDiagram).toBeDisabled()

        const logTable = page.locator('.nav-button').filter({ hasText: 'Log Table' })
        await expect(logTable).toBeDisabled()
    })

    test('has working status indicator', async ({ page }) => {
        await page.goto('/')

        // Wait for connection
        await expect(page.locator('.status-dot.connected')).toBeVisible({ timeout: 10000 })
        await expect(page.locator('.status-indicator')).toContainText('Connected')
    })

    test('has working help button', async ({ page }) => {
        await page.goto('/')

        // Click help button
        await page.locator('.header-btn').filter({ hasText: 'Help' }).click()

        // Check help modal opens
        await expect(page.locator('.help-modal')).toBeVisible()
        await expect(page.locator('.help-modal h2')).toContainText('Help')

        // Close modal
        await page.locator('.help-header button').click()
        await expect(page.locator('.help-modal')).not.toBeVisible()
    })
})

test.describe('File Upload', () => {
    test('has drag and drop zone', async ({ page }) => {
        await page.goto('/')

        await expect(page.locator('.drop-zone')).toBeVisible()
        await expect(page.locator('.drop-text')).toContainText('Drag & drop')
    })
})
