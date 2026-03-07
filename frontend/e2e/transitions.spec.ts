import { test, expect, type Page } from '@playwright/test'
import { ensureFileLoaded } from './test-helpers'

function transitionsNavButton(page: Page) {
    return page
        .locator('.nav-grid .nav-button')
        .filter({ has: page.locator('.nav-button-title', { hasText: /^Transitions$/ }) })
}

async function gotoTransitions(page: Page) {
    await page.locator('.tab-item').filter({ hasText: 'Home' }).click()
    await transitionsNavButton(page).click()
    await expect(page.locator('.tab-item.active')).toContainText('Transitions')
    await expect(page.locator('.transition-view')).toBeVisible()
}

async function closeEditorIfOpen(page: Page) {
    const modal = page.locator('.modal-overlay')
    if (await modal.isVisible().catch(() => false)) {
        const cancelBtn = modal.locator('.cancel-btn')
        if (await cancelBtn.isVisible().catch(() => false)) {
            await cancelBtn.click()
        } else {
            await page.keyboard.press('Escape')
        }
        await expect(modal).not.toBeVisible()
    }
}

async function openEditor(page: Page) {
    const modal = page.locator('.modal-overlay')
    if (await modal.isVisible().catch(() => false)) {
        return
    }

    const configureFromEmpty = page.locator('.empty-state .primary-btn').filter({ hasText: /^Configure$/ })
    if (await configureFromEmpty.isVisible().catch(() => false)) {
        await configureFromEmpty.click()
    } else {
        await page.locator('.configure-btn').click()
    }

    await expect(modal).toBeVisible()
}

test.describe('Transition View', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/')
        await expect(page.locator('.status-dot.connected')).toBeVisible({ timeout: 10000 })
    })

    test('Transitions button is visible and disabled without session', async ({ page }) => {
        const button = transitionsNavButton(page)
        await expect(button).toBeVisible()
        await expect(button).toHaveAttribute('disabled', '')
    })

    test('can navigate to Transition View after loading file', async ({ page }) => {
        if (!await ensureFileLoaded(page)) {
            test.skip(true, 'No file available for testing')
            return
        }

        await gotoTransitions(page)
        await expect(page.locator('.view-toolbar')).toBeVisible()
        await expect(page.locator('.configure-btn')).toBeVisible()
    })

    test('shows configure empty state before a rule is saved', async ({ page }) => {
        if (!await ensureFileLoaded(page)) {
            test.skip(true, 'No file available for testing')
            return
        }

        await gotoTransitions(page)
        await closeEditorIfOpen(page)

        await expect(page.locator('.empty-state')).toBeVisible()
        await expect(page.locator('.empty-state')).toContainText('Configure Transition')
        await expect(page.locator('.empty-state .primary-btn').filter({ hasText: /^Configure$/ })).toBeVisible()
    })

    test('can open rule editor from empty state', async ({ page }) => {
        if (!await ensureFileLoaded(page)) {
            test.skip(true, 'No file available for testing')
            return
        }

        await gotoTransitions(page)
        await closeEditorIfOpen(page)
        await openEditor(page)

        await expect(page.locator('.modal-header h2')).toContainText('Configure Transition')
        await expect(page.locator('.radio-group')).toBeVisible()
    })

    test('can create a cycle time rule', async ({ page }) => {
        if (!await ensureFileLoaded(page)) {
            test.skip(true, 'No file available for testing')
            return
        }

        await gotoTransitions(page)
        await openEditor(page)

        const startDevice = page.locator('select[aria-label="Start Device"]')
        await startDevice.selectOption({ index: 1 })

        const startSignal = page.locator('select[aria-label="Start Signal"]')
        await expect(startSignal).toBeEnabled()
        await startSignal.selectOption({ index: 1 })

        await page.locator('.save-btn').click()

        await expect(page.locator('.modal-overlay')).not.toBeVisible()
        await expect(page.locator('.config-summary')).toBeVisible()
    })

    test('view mode tabs are visible and clickable', async ({ page }) => {
        if (!await ensureFileLoaded(page)) {
            test.skip(true, 'No file available for testing')
            return
        }

        await gotoTransitions(page)

        const tableTab = page.locator('.view-tab').filter({ hasText: /^Table$/ })
        const statsTab = page.locator('.view-tab').filter({ hasText: /^Stats$/ })
        const histogramTab = page.locator('.view-tab').filter({ hasText: /^Histogram$/ })
        const trendTab = page.locator('.view-tab').filter({ hasText: /^Trend$/ })

        await expect(tableTab).toBeVisible()
        await expect(statsTab).toBeVisible()
        await expect(histogramTab).toBeVisible()
        await expect(trendTab).toBeVisible()

        await histogramTab.click()
        await expect(histogramTab).toHaveClass(/active/)

        await trendTab.click()
        await expect(trendTab).toHaveClass(/active/)

        await statsTab.click()
        await expect(statsTab).toHaveClass(/active/)
    })

    test('can open rule editor from toolbar configure button', async ({ page }) => {
        if (!await ensureFileLoaded(page)) {
            test.skip(true, 'No file available for testing')
            return
        }

        await gotoTransitions(page)
        await closeEditorIfOpen(page)
        await page.locator('.configure-btn').click()

        await expect(page.locator('.modal-overlay')).toBeVisible()
        await expect(page.locator('.modal-header h2')).toContainText(/Configure|Edit Configuration/)
    })

    test('can close rule editor with cancel', async ({ page }) => {
        if (!await ensureFileLoaded(page)) {
            test.skip(true, 'No file available for testing')
            return
        }

        await gotoTransitions(page)
        await openEditor(page)

        await page.locator('.modal-actions .cancel-btn').click()
        await expect(page.locator('.modal-overlay')).not.toBeVisible()
    })

    test('result filter dropdown is visible in toolbar', async ({ page }) => {
        if (!await ensureFileLoaded(page)) {
            test.skip(true, 'No file available for testing')
            return
        }

        await gotoTransitions(page)

        const filterDropdown = page.locator('.toolbar-right select')
        await expect(filterDropdown).toBeVisible()
        expect(await filterDropdown.locator('option').count()).toBeGreaterThanOrEqual(4)
    })
})
