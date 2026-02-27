import { test, expect } from '@playwright/test'
import { ensureFileLoaded, openLogTable } from './test-helpers'

test.describe('Transition View', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/')
        // Wait for the app to load
        await expect(page.locator('.status-dot.connected')).toBeVisible({ timeout: 10000 })
    })

    test('Transitions button is visible and disabled without session', async ({ page }) => {
        // Find the Transitions nav button
        const transitionsBtn = page.locator('.nav-grid .nav-button').filter({ hasText: 'Transitions' })
        await expect(transitionsBtn).toBeVisible()

        // Should be disabled without a session
        await expect(transitionsBtn).toHaveAttribute('disabled', '')
    })

    test('can navigate to Transition View after loading file', async ({ page }) => {
        // Ensure file is loaded using helper
        if (!await ensureFileLoaded(page)) {
            test.skip(true, 'No file available for testing')
            return
        }

        // Navigate to Home
        await page.locator('.tab-item').filter({ hasText: 'Home' }).click()

        // Click Transitions button
        const transitionsBtn = page.locator('.nav-grid .nav-button').filter({ hasText: 'Transitions' })
        await expect(transitionsBtn).not.toHaveAttribute('disabled', '')
        await transitionsBtn.click()

        // Check that Transitions tab appears
        await expect(page.locator('.tab-item').filter({ hasText: 'Transitions' })).toBeVisible()

        // Check transition view loaded
        await expect(page.locator('.transition-view')).toBeVisible()
        await expect(page.locator('.transition-sidebar')).toBeVisible()
    })

    test('shows empty state with add rule button when no rules', async ({ page }) => {
        if (!await ensureFileLoaded(page)) {
            test.skip(true, 'No file available for testing')
            return
        }

        // Navigate to Transitions
        await page.locator('.tab-item').filter({ hasText: 'Home' }).click()
        await page.locator('.nav-grid .nav-button').filter({ hasText: 'Transitions' }).click()

        await expect(page.locator('.transition-view')).toBeVisible()

        // Check for empty state with "No Transition Rules" message
        await expect(page.locator('.empty-state')).toBeVisible()
        await expect(page.locator('.empty-state')).toContainText('No Transition Rules')

        // Should have Add Rule button
        await expect(page.locator('.empty-state .primary-btn')).toBeVisible()
    })

    test('can open rule editor from empty state', async ({ page }) => {
        if (!await ensureFileLoaded(page)) {
            test.skip(true, 'No file available for testing')
            return
        }

        await page.locator('.tab-item').filter({ hasText: 'Home' }).click()
        await page.locator('.nav-grid .nav-button').filter({ hasText: 'Transitions' }).click()

        // Click Add Rule in empty state
        await page.locator('.empty-state .primary-btn').click()

        // Modal should appear
        await expect(page.locator('.modal-overlay')).toBeVisible()
        await expect(page.locator('.modal-header')).toContainText('Create Transition Rule')

        // Form should have name input (first input in form)
        await expect(page.locator('.form-group input[type="text"]').first()).toBeVisible()

        // Form should have rule type selector (radio group)
        await expect(page.locator('.radio-group')).toBeVisible()
    })

    test('can create a cycle time rule', async ({ page }) => {
        if (!await ensureFileLoaded(page)) {
            test.skip(true, 'No file available for testing')
            return
        }

        await page.locator('.tab-item').filter({ hasText: 'Home' }).click()
        await page.locator('.nav-grid .nav-button').filter({ hasText: 'Transitions' }).click()

        // Click Add Rule in empty state
        await page.locator('.empty-state .primary-btn').click()

        // Fill in rule details
        await page.locator('.form-group input[type="text"]').first().fill('Test Cycle Time Rule')
        
        // Select cycle time rule type (radio button)
        await page.locator('.radio-option').filter({ hasText: 'Cycle Time' }).click()

        // Fill in start signal (second select in form)
        const startSignalSelect = page.locator('fieldset').first().locator('select').first()
        await startSignalSelect.selectOption({ index: 1 })  // Select first available signal

        // Submit the form
        await page.locator('.modal-footer .primary-btn').click()

        // Rule should appear in the list
        await expect(page.locator('.rule-item')).toHaveCount(1)
        await expect(page.locator('.rule-item')).toContainText('Test Cycle Time Rule')
    })

    test('view mode tabs are visible and clickable', async ({ page }) => {
        if (!await ensureFileLoaded(page)) {
            test.skip(true, 'No file available for testing')
            return
        }

        await page.locator('.tab-item').filter({ hasText: 'Home' }).click()
        await page.locator('.nav-grid .nav-button').filter({ hasText: 'Transitions' }).click()

        // Check for view mode tabs
        const tableTab = page.locator('.view-tab').filter({ hasText: 'Table' })
        const chartTab = page.locator('.view-tab').filter({ hasText: 'Chart' })
        const statsTab = page.locator('.view-tab').filter({ hasText: 'Stats' })

        await expect(tableTab).toBeVisible()
        await expect(chartTab).toBeVisible()
        await expect(statsTab).toBeVisible()

        // Click on Chart tab
        await chartTab.click()
        await expect(chartTab).toHaveClass(/active/)

        // Click on Stats tab
        await statsTab.click()
        await expect(statsTab).toHaveClass(/active/)

        // Back to Table tab
        await tableTab.click()
        await expect(tableTab).toHaveClass(/active/)
    })

    test('can add rule from sidebar add button', async ({ page }) => {
        if (!await ensureFileLoaded(page)) {
            test.skip(true, 'No file available for testing')
            return
        }

        await page.locator('.tab-item').filter({ hasText: 'Home' }).click()
        await page.locator('.nav-grid .nav-button').filter({ hasText: 'Transitions' }).click()

        // Click Add Rule button in sidebar (not empty state)
        await page.locator('.transition-sidebar .icon-btn').click()

        // Modal should appear
        await expect(page.locator('.modal-overlay')).toBeVisible()
        await expect(page.locator('.modal-header')).toContainText('Create Transition Rule')
    })

    test('can close rule editor with cancel', async ({ page }) => {
        if (!await ensureFileLoaded(page)) {
            test.skip(true, 'No file available for testing')
            return
        }

        await page.locator('.tab-item').filter({ hasText: 'Home' }).click()
        await page.locator('.nav-grid .nav-button').filter({ hasText: 'Transitions' }).click()

        // Open rule editor
        await page.locator('.empty-state .primary-btn').click()
        await expect(page.locator('.modal-overlay')).toBeVisible()

        // Click Cancel
        await page.locator('.modal-actions .cancel-btn').click()

        // Modal should close
        await expect(page.locator('.modal-overlay')).not.toBeVisible()
    })

    test('filter dropdown is visible in toolbar', async ({ page }) => {
        if (!await ensureFileLoaded(page)) {
            test.skip(true, 'No file available for testing')
            return
        }

        await page.locator('.tab-item').filter({ hasText: 'Home' }).click()
        await page.locator('.nav-grid .nav-button').filter({ hasText: 'Transitions' }).click()

        // Check for filter dropdown
        const filterDropdown = page.locator('.filter-controls select')
        await expect(filterDropdown).toBeVisible()

        // Filter dropdown should have options
        const options = await filterDropdown.locator('option').count()
        expect(options).toBeGreaterThan(0)
    })
})
