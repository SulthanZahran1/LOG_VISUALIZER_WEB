import { test, expect } from '@playwright/test';

test('verify waveform controls and disabled panning', async ({ page }) => {
    // 1. Setup: Upload and parse file
    await page.goto('/');
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles('../test_sample.log');

    // Click the file in Recent Files to start parsing
    const fileItem = page.locator('.file-item').filter({ hasText: 'test_sample.log' }).first();
    await fileItem.click();

    // Wait for Log Table to populate (parsing complete)
    await page.waitForFunction(() => window.logStore && window.logStore.currentSession.value?.status === 'complete' && window.logStore.logEntries.value.length > 0);

    // 2. Add signal to waveform programmatically
    await page.evaluate(() => {
        const entry = window.logStore.logEntries.value[0];
        if (entry) {
            const key = `${entry.deviceId}::${entry.signalName}`;
            window.waveformStore.selectedSignals.value = [key];
        }
    });

    // 3. Navigate to Timing Diagram
    await page.getByRole('button', { name: 'Home' }).first().click();
    await page.locator('.nav-button').filter({ hasText: 'Timing Diagram' }).click();

    // Wait for canvas and slider
    await expect(page.locator('canvas')).toBeVisible();
    await expect(page.locator('.time-slider-track')).toBeVisible();

    // 4. Verify Drag Panning is DISABLED
    const canvas = page.locator('canvas');
    const box = await canvas.boundingBox();
    if (!box) throw new Error('No canvas box');

    const startOffset = await page.evaluate(() => window.waveformStore.scrollOffset.value);

    // Drag on canvas (near top to avoid hitting slider)
    if (box) {
        const startX = box.x + box.width / 2;
        const startY = box.y + 10;
        await page.mouse.move(startX, startY);
        await page.mouse.down();
        await page.mouse.move(startX - 200, startY, { steps: 10 }); // Drag left
        await page.mouse.up();
    }

    const endOffset = await page.evaluate(() => window.waveformStore.scrollOffset.value);

    // Expect NO change (or extremely negligible floating point noise, but should be identical if logic removed)
    expect(endOffset).toBe(startOffset);
    console.log('Drag panning verification: Offset remained', startOffset);

    // 5. Verify Time Slider
    const slider = page.locator('.time-slider-track');
    const sliderBox = await slider.boundingBox();
    if (!sliderBox) throw new Error('No slider box');

    // Click in the middle of the slider
    await page.mouse.click(sliderBox.x + sliderBox.width / 2, sliderBox.y + sliderBox.height / 2);

    const sliderOffset = await page.evaluate(() => window.waveformStore.scrollOffset.value);

    // Expect change
    expect(sliderOffset).not.toBe(startOffset);
    console.log('Slider verification: Offset changed to', sliderOffset);

    // 6. Verify Toolbar - "Go to Start"
    const homeBtn = page.locator('button[title="Go to Start (Home)"]');
    await homeBtn.click();

    // Allow slight delay for signal propagation
    await page.waitForTimeout(100);

    const backHomeOffset = await page.evaluate(() => window.waveformStore.scrollOffset.value);
    // Allow small tolerance if floating point
    // Logic sets it exactly to session.startTime, so exact match expected
    expect(backHomeOffset).toBe(startOffset);
    console.log('Toolbar verification: "Go to Start" worked');

    // 7. Verify Toolbar - "Zoom In"
    const startZoom = await page.evaluate(() => window.waveformStore.zoomLevel.value);
    const zoomInBtn = page.locator('button[title="Zoom In (+)"]');
    await zoomInBtn.click();

    await page.waitForTimeout(100);
    const endZoom = await page.evaluate(() => window.waveformStore.zoomLevel.value);

    expect(endZoom).toBeGreaterThan(startZoom);
    console.log('Toolbar verification: "Zoom In" worked');

    // 8. Verify Cursor Readout (Hover)
    // Move mouse to canvas
    if (box) {
        await page.mouse.move(box.x + 50, box.y + 10);
        await page.waitForTimeout(100);
        // Check readout text
        const readout = page.locator('.readout-value');
        await expect(readout).toBeVisible();
        const readoutText = await readout.innerText();
        console.log('Cursor readout:', readoutText);
        expect(readoutText).not.toBe('');
    }

    // 9. Verify Jump Buttons
    // Reset to start
    await homeBtn.click();
    const beforeJumpOffset = await page.evaluate(() => window.waveformStore.scrollOffset.value);

    // Jump Forward Large
    const jumpFwdLargeBtn = page.locator('button[title="Jump Forward 10% (>>)"]');
    await jumpFwdLargeBtn.click();
    await page.waitForTimeout(100);
    const afterJumpFwdLarge = await page.evaluate(() => window.waveformStore.scrollOffset.value);
    expect(afterJumpFwdLarge).toBeGreaterThan(beforeJumpOffset);

    // Jump Forward Small
    const jumpFwdSmallBtn = page.locator('button[title="Jump Forward 1% (>)"]');
    await jumpFwdSmallBtn.click();
    await page.waitForTimeout(100);
    const afterJumpFwdSmall = await page.evaluate(() => window.waveformStore.scrollOffset.value);
    expect(afterJumpFwdSmall).toBeGreaterThan(afterJumpFwdLarge);

    console.log('Toolbar Jump buttons verified');
});
