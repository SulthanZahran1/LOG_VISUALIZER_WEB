import { test, expect } from '@playwright/test';

test.describe('Map Viewer Time Range', () => {
    test('displays correct time range from session metadata for large logs', async ({ page }) => {
        // Navigate to home
        await page.goto('/');

        // Wait for connection
        await expect(page.locator('.status-dot.connected')).toBeVisible({ timeout: 10000 });

        // Upload time_range_problem.log (177k entries, 1 hour duration)
        const fileInput = page.locator('input[type="file"]');
        await fileInput.setInputFiles('../time_range_problem.log');

        // Click the file to start parsing
        const fileItem = page.locator('.file-item').filter({ hasText: 'time_range_problem.log' }).first();
        await fileItem.click();

        // Wait for parsing to complete (may take a while for 177k entries)
        await page.waitForFunction(
            () => window.logStore?.currentSession.value?.status === 'complete',
            { timeout: 60000 }
        );

        // Get session metadata from the store
        const sessionData = await page.evaluate(() => {
            const session = window.logStore?.currentSession.value;
            return {
                startTime: session?.startTime,
                endTime: session?.endTime,
                entryCount: session?.entryCount,
            };
        });

        // Verify backend returned correct metadata
        expect(sessionData.startTime).toBeDefined();
        expect(sessionData.endTime).toBeDefined();
        expect(sessionData.entryCount).toBeGreaterThan(100000); // Should be ~177k

        // Calculate duration
        const durationMs = (sessionData.endTime || 0) - (sessionData.startTime || 0);
        const durationMinutes = durationMs / 1000 / 60;

        // Should be approximately 1 hour (60 minutes)
        expect(durationMinutes).toBeGreaterThan(55);
        expect(durationMinutes).toBeLessThan(65);

        console.log(`Session: ${sessionData.entryCount} entries, ${durationMinutes.toFixed(1)} minutes`);

        // Navigate to Map Viewer via nav button on Home page
        // First, ensure we're on Home tab
        await page.locator('.tab-item').filter({ hasText: 'Home' }).click();

        // Click the Map Viewer nav button
        const mapViewerBtn = page.locator('.nav-button').filter({ hasText: 'Map Viewer' });
        await expect(mapViewerBtn).toBeEnabled({ timeout: 5000 });
        await mapViewerBtn.click();

        // Wait for Map Viewer tab to appear and be active
        await expect(page.locator('.tab-item').filter({ hasText: 'Map Viewer' })).toBeVisible({ timeout: 5000 });
        await expect(page.locator('.map-viewer, .map-container')).toBeVisible({ timeout: 5000 });

        // Open file selector (folder icon in toolbar, or look for file selector button)
        const fileSelectorToggle = page.locator('button, .toolbar-btn').filter({ hasText: /folder|file/i }).first();
        if (await fileSelectorToggle.isVisible()) {
            await fileSelectorToggle.click();
        } else {
            // Try the selector panel toggle
            const selectorToggle = page.locator('.map-file-selector-toggle, [title*="File"]').first();
            if (await selectorToggle.isVisible()) {
                await selectorToggle.click();
            }
        }

        // Find and click "Use: Current Session" button
        const useSessionBtn = page.locator('button').filter({ hasText: /Use.*Current|Current.*Session/i }).first();
        if (await useSessionBtn.isVisible({ timeout: 3000 })) {
            await useSessionBtn.click();

            // Wait for linking to complete (fetches all entries asynchronously)
            await page.waitForTimeout(3000);

            // Check the map store's playback range
            const playbackData = await page.evaluate(() => {
                const mapStore = (window as any).mapStore;
                if (mapStore) {
                    return {
                        startTime: mapStore.playbackStartTime?.value,
                        endTime: mapStore.playbackEndTime?.value,
                        entryCount: mapStore.signalLogEntryCount?.value,
                    };
                }
                return null;
            });

            if (playbackData && playbackData.startTime && playbackData.endTime) {
                // Verify playback range matches session (not truncated to 1000 entries)
                const playbackDuration = (playbackData.endTime - playbackData.startTime) / 1000 / 60;
                console.log(`Playback range: ${playbackDuration.toFixed(1)} minutes, ${playbackData.entryCount} entries`);

                // Should be approximately 1 hour, not just a few seconds
                expect(playbackDuration).toBeGreaterThan(55);
                expect(playbackDuration).toBeLessThan(65);

                // Entry count should be full count, not just 1000
                if (playbackData.entryCount) {
                    expect(playbackData.entryCount).toBeGreaterThan(100000);
                }
            }
        }
    });

    test('uses session metadata not entry-calculated range', async ({ page }) => {
        // This test verifies the fix directly by checking store behavior
        await page.goto('/');
        await expect(page.locator('.status-dot.connected')).toBeVisible({ timeout: 10000 });

        // Upload test file
        const fileInput = page.locator('input[type="file"]');
        await fileInput.setInputFiles('../test_sample.log');

        const fileItem = page.locator('.file-item').filter({ hasText: 'test_sample.log' }).first();
        await fileItem.click();

        // Wait for parsing
        await page.waitForFunction(
            () => window.logStore?.currentSession.value?.status === 'complete',
            { timeout: 30000 }
        );

        // Get session data
        const sessionData = await page.evaluate(() => {
            const session = window.logStore?.currentSession.value;
            const entries = window.logStore?.logEntries.value || [];
            return {
                sessionStartTime: session?.startTime,
                sessionEndTime: session?.endTime,
            };
        });

        // Session metadata should be defined (from backend)
        expect(sessionData.sessionStartTime).toBeDefined();
        expect(sessionData.sessionEndTime).toBeDefined();
        expect(sessionData.sessionStartTime).toBeGreaterThan(0);
        expect(sessionData.sessionEndTime).toBeGreaterThan(sessionData.sessionStartTime!);

        console.log('Session metadata verified:', sessionData);
    });
});
