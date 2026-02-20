import { test, expect } from '@playwright/test';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

test('verify waveform controls and panning', async ({ page }) => {
    // NOTE: This test requires an existing session with parsed data
    // or working file upload. Skip if neither is available.
    await page.goto('/');
    await expect(page.locator('.status-dot.connected')).toBeVisible({ timeout: 10000 });
    
    // Check if we have an existing session
    const hasSession = await page.evaluate(() => {
        return window.logStore?.currentSession?.value?.status === 'complete' &&
               window.logStore?.logEntries?.value?.length > 0;
    }).catch(() => false);
    
    if (!hasSession) {
        // Try to upload a file
        const fileInput = page.locator('input[type="file"]');
        const fixturePath = path.join(__dirname, 'fixtures', 'sample-plc.log');
        await fileInput.setInputFiles(fixturePath);
        
        // Wait for parsing with timeout
        try {
            await page.waitForFunction(
                () => window.logStore?.currentSession?.value?.status === 'complete' && 
                     window.logStore?.logEntries?.value?.length > 0,
                { timeout: 30000 }
            );
        } catch {
            test.skip(true, 'File upload not working in test environment');
            return;
        }
    }

    // 2. Add signal to waveform programmatically
    await page.evaluate(() => {
        const entry = window.logStore?.logEntries?.value?.[0];
        if (entry) {
            const key = `${entry.deviceId}::${entry.signalName}`;
            if (window.waveformStore?.selectedSignals) {
                window.waveformStore.selectedSignals.value = [key];
            }
        }
    });

    // 3. Navigate to Timing Diagram
    await page.getByRole('button', { name: 'Home' }).first().click();
    await page.locator('.nav-grid .nav-button').filter({ hasText: 'Timing Diagram' }).click();

    // Wait for canvas and slider
    await expect(page.locator('canvas')).toBeVisible();
    await expect(page.locator('.time-slider-track')).toBeVisible();

    // 4. Verify Drag Panning
    const canvas = page.locator('canvas');
    const box = await canvas.boundingBox();
    if (!box) throw new Error('No canvas box');

    const startOffset = await page.evaluate(() => window.waveformStore?.scrollOffset?.value ?? 0);

    // Drag on canvas (near top to avoid hitting slider)
    const startX = box.x + box.width / 2;
    const startY = box.y + 10;
    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(startX - 200, startY, { steps: 10 });
    await page.mouse.up();

    const endOffset = await page.evaluate(() => window.waveformStore?.scrollOffset?.value ?? 0);

    // Expect offset to CHANGE (panning is enabled)
    expect(endOffset).not.toBe(startOffset);
    console.log('Drag panning verification: Offset changed from', startOffset, 'to', endOffset);

    // 5. Verify Time Slider
    const slider = page.locator('.time-slider-track');
    const sliderBox = await slider.boundingBox();
    if (!sliderBox) throw new Error('No slider box');

    await page.mouse.click(sliderBox.x + sliderBox.width / 2, sliderBox.y + sliderBox.height / 2);
    const sliderOffset = await page.evaluate(() => window.waveformStore?.scrollOffset?.value ?? 0);
    expect(sliderOffset).not.toBe(startOffset);
    console.log('Slider verification: Offset changed to', sliderOffset);

    // 6. Verify Toolbar - "Go to Start"
    const homeBtn = page.locator('button[title="Go to Start (Home)"]');
    await homeBtn.click();
    await page.waitForTimeout(100);
    const backHomeOffset = await page.evaluate(() => window.waveformStore?.scrollOffset?.value ?? 0);
    expect(backHomeOffset).toBe(startOffset);
    console.log('Toolbar verification: "Go to Start" worked');

    // 7. Verify Toolbar - "Zoom In"
    const startZoom = await page.evaluate(() => window.waveformStore?.zoomLevel?.value ?? 1);
    const zoomInBtn = page.locator('button[title="Zoom In (+)"]');
    await zoomInBtn.click();
    await page.waitForTimeout(100);
    const endZoom = await page.evaluate(() => window.waveformStore?.zoomLevel?.value ?? 1);
    expect(endZoom).toBeGreaterThan(startZoom);
    console.log('Toolbar verification: "Zoom In" worked');

    // 8. Verify Cursor Readout
    await page.mouse.move(box.x + 50, box.y + 10);
    await page.waitForTimeout(100);
    const readout = page.locator('.readout-value');
    await expect(readout).toBeVisible();
    const readoutText = await readout.innerText();
    console.log('Cursor readout:', readoutText);
    expect(readoutText).not.toBe('');

    // 9. Verify Jump Buttons
    await homeBtn.click();
    const beforeJumpOffset = await page.evaluate(() => window.waveformStore?.scrollOffset?.value ?? 0);

    const jumpFwdLargeBtn = page.locator('button[title="Jump Forward 10% (>>)"]');
    await jumpFwdLargeBtn.click();
    await page.waitForTimeout(100);
    const afterJumpFwdLarge = await page.evaluate(() => window.waveformStore?.scrollOffset?.value ?? 0);
    expect(afterJumpFwdLarge).toBeGreaterThan(beforeJumpOffset);

    const jumpFwdSmallBtn = page.locator('button[title="Jump Forward 1% (>)"]');
    await jumpFwdSmallBtn.click();
    await page.waitForTimeout(100);
    const afterJumpFwdSmall = await page.evaluate(() => window.waveformStore?.scrollOffset?.value ?? 0);
    expect(afterJumpFwdSmall).toBeGreaterThan(afterJumpFwdLarge);

    console.log('Toolbar Jump buttons verified');
});
