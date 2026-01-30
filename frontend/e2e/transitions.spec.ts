import { test, expect } from '@playwright/test'

test.describe('Transition View', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/')
        // Wait for the app to load
        await expect(page.locator('.status-dot.connected')).toBeVisible({ timeout: 10000 })
    })

    test('Transitions button is visible and disabled without session', async ({ page }) => {
        // Find the Transitions nav button
        const transitionsBtn = page.locator('.nav-grid button').filter({ hasText: 'Transitions' })
        await expect(transitionsBtn).toBeVisible()

        // Should be disabled without a session
        await expect(transitionsBtn).toHaveAttribute('disabled', '')
    })

    test('can navigate to Transition View after loading file', async ({ page }) => {
        // Load a recent file if available
        const recentFile = page.locator('.file-item').first()

        if (await recentFile.isVisible()) {
            await recentFile.click()

            // Wait for session to be ready
            await expect(page.locator('.tab-item').filter({ hasText: 'Log Table' })).toBeVisible({ timeout: 10000 })

            // Navigate to Home
            await page.locator('.tab-item').filter({ hasText: 'Home' }).click()

            // Click Transitions button
            const transitionsBtn = page.locator('.nav-grid button').filter({ hasText: 'Transitions' })
            await expect(transitionsBtn).not.toHaveAttribute('disabled', '')
            await transitionsBtn.click()

            // Check that Transitions tab appears
            await expect(page.locator('.tab-item').filter({ hasText: 'Transitions' })).toBeVisible()

            // Check transition view loaded
            await expect(page.locator('.transition-view')).toBeVisible()
            await expect(page.locator('.transition-sidebar')).toBeVisible()
        }
    })

    test('shows empty state with add rule button when no rules', async ({ page }) => {
        const recentFile = page.locator('.file-item').first()

        if (await recentFile.isVisible()) {
            await recentFile.click()
            await expect(page.locator('.tab-item').filter({ hasText: 'Log Table' })).toBeVisible({ timeout: 10000 })

            // Navigate to Transitions
            await page.locator('.tab-item').filter({ hasText: 'Home' }).click()
            await page.locator('.nav-grid button').filter({ hasText: 'Transitions' }).click()

            await expect(page.locator('.transition-view')).toBeVisible()

            // Check for empty state with "No Transition Rules" message
            await expect(page.locator('.empty-state')).toBeVisible()
            await expect(page.locator('.empty-state')).toContainText('No Transition Rules')

            // Should have Add Rule button
            await expect(page.locator('.empty-state .primary-btn')).toBeVisible()
        }
    })

    test('can open rule editor from empty state', async ({ page }) => {
        const recentFile = page.locator('.file-item').first()

        if (await recentFile.isVisible()) {
            await recentFile.click()
            await expect(page.locator('.tab-item').filter({ hasText: 'Log Table' })).toBeVisible({ timeout: 10000 })

            await page.locator('.tab-item').filter({ hasText: 'Home' }).click()
            await page.locator('.nav-grid button').filter({ hasText: 'Transitions' }).click()

            // Click Add Rule in empty state
            await page.locator('.empty-state .primary-btn').click()

            // Modal should appear
            await expect(page.locator('.modal-overlay')).toBeVisible()
            await expect(page.locator('.modal-header')).toContainText('Create Transition Rule')

            // Form should have name input
            await expect(page.locator('.form-group input#rule-name')).toBeVisible()

            // Form should have rule type selector
            await expect(page.locator('.form-group select#rule-type')).toBeVisible()
        }
    })

    test('can create a cycle time rule', async ({ page }) => {
        const recentFile = page.locator('.file-item').first()

        if (await recentFile.isVisible()) {
            await recentFile.click()
            await expect(page.locator('.tab-item').filter({ hasText: 'Log Table' })).toBeVisible({ timeout: 10000 })

            await page.locator('.tab-item').filter({ hasText: 'Home' }).click()
            await page.locator('.nav-grid button').filter({ hasText: 'Transitions' }).click()

            // Click Add Rule
            await page.locator('.empty-state .primary-btn').click()
            await expect(page.locator('.modal-overlay')).toBeVisible()

            // Fill in rule details
            await page.locator('#rule-name').fill('Test Cycle Rule')

            // Select Cycle Time type
            await page.locator('#rule-type').selectOption('cycle')

            // Select a signal (if available)
            const signalSelect = page.locator('#start-signal')
            if (await signalSelect.locator('option').count() > 1) {
                await signalSelect.selectOption({ index: 1 })
            }

            // Set condition
            await page.locator('#start-condition').selectOption('equals')
            await page.locator('#start-value').fill('true')

            // Save the rule
            await page.locator('.save-btn').click()

            // Modal should close
            await expect(page.locator('.modal-overlay')).not.toBeVisible()

            // Rule should appear in list
            await expect(page.locator('.rule-item')).toBeVisible()
            await expect(page.locator('.rule-item')).toContainText('Test Cycle Rule')
        }
    })

    test('view mode tabs are visible and clickable', async ({ page }) => {
        const recentFile = page.locator('.file-item').first()

        if (await recentFile.isVisible()) {
            await recentFile.click()
            await expect(page.locator('.tab-item').filter({ hasText: 'Log Table' })).toBeVisible({ timeout: 10000 })

            await page.locator('.tab-item').filter({ hasText: 'Home' }).click()
            await page.locator('.nav-grid button').filter({ hasText: 'Transitions' }).click()

            await expect(page.locator('.view-toolbar')).toBeVisible()

            // Check all view mode tabs exist
            await expect(page.locator('.view-tab').filter({ hasText: 'Table' })).toBeVisible()
            await expect(page.locator('.view-tab').filter({ hasText: 'Stats' })).toBeVisible()
            await expect(page.locator('.view-tab').filter({ hasText: 'Histogram' })).toBeVisible()
            await expect(page.locator('.view-tab').filter({ hasText: 'Trend' })).toBeVisible()

            // Table should be active by default
            await expect(page.locator('.view-tab').filter({ hasText: 'Table' })).toHaveClass(/active/)

            // Click Stats tab
            await page.locator('.view-tab').filter({ hasText: 'Stats' }).click()
            await expect(page.locator('.view-tab').filter({ hasText: 'Stats' })).toHaveClass(/active/)
        }
    })

    test('can add rule from sidebar add button', async ({ page }) => {
        const recentFile = page.locator('.file-item').first()

        if (await recentFile.isVisible()) {
            await recentFile.click()
            await expect(page.locator('.tab-item').filter({ hasText: 'Log Table' })).toBeVisible({ timeout: 10000 })

            await page.locator('.tab-item').filter({ hasText: 'Home' }).click()
            await page.locator('.nav-grid button').filter({ hasText: 'Transitions' }).click()

            // Click add button in sidebar header
            await page.locator('.sidebar-header .icon-btn').click()

            // Modal should appear
            await expect(page.locator('.modal-overlay')).toBeVisible()
            await expect(page.locator('.modal-header')).toContainText('Create Transition Rule')
        }
    })

    test('can close rule editor with cancel', async ({ page }) => {
        const recentFile = page.locator('.file-item').first()

        if (await recentFile.isVisible()) {
            await recentFile.click()
            await expect(page.locator('.tab-item').filter({ hasText: 'Log Table' })).toBeVisible({ timeout: 10000 })

            await page.locator('.tab-item').filter({ hasText: 'Home' }).click()
            await page.locator('.nav-grid button').filter({ hasText: 'Transitions' }).click()

            await page.locator('.sidebar-header .icon-btn').click()
            await expect(page.locator('.modal-overlay')).toBeVisible()

            // Click cancel
            await page.locator('.cancel-btn').click()

            // Modal should close
            await expect(page.locator('.modal-overlay')).not.toBeVisible()
        }
    })

    test('filter dropdown is visible in toolbar', async ({ page }) => {
        const recentFile = page.locator('.file-item').first()

        if (await recentFile.isVisible()) {
            await recentFile.click()
            await expect(page.locator('.tab-item').filter({ hasText: 'Log Table' })).toBeVisible({ timeout: 10000 })

            await page.locator('.tab-item').filter({ hasText: 'Home' }).click()
            await page.locator('.nav-grid button').filter({ hasText: 'Transitions' }).click()

            // Filter dropdown should be visible
            await expect(page.locator('.filter-controls select')).toBeVisible()

            // Should have filter options
            await expect(page.locator('.filter-controls select option[value="all"]')).toBeVisible()
            await expect(page.locator('.filter-controls select option[value="ok"]')).toBeVisible()
            await expect(page.locator('.filter-controls select option[value="above"]')).toBeVisible()
            await expect(page.locator('.filter-controls select option[value="below"]')).toBeVisible()
        }
    })
})
