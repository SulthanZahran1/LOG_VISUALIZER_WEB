import { defineConfig, devices } from '@playwright/test'

/**
 * Playwright E2E Test Configuration for Log Table Tests
 * Extended timeout for large file operations
 */
export default defineConfig({
    testDir: '.',
    fullyParallel: false, // Run sequentially to avoid server overload
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 1 : 0,
    workers: 1, // Single worker for log table tests
    reporter: [['html', { open: 'never' }], ['list']],

    // Longer timeout for large file operations
    timeout: 600000, // 10 minutes for server-side tests
    expect: {
        timeout: 30000, // 30 seconds for assertions
    },

    use: {
        baseURL: 'http://localhost:5173',
        trace: 'on-first-retry',
        screenshot: 'only-on-failure',
        video: 'retain-on-failure',
        // Slow down operations slightly for stability
        actionTimeout: 30000,
        navigationTimeout: 30000,
    },

    projects: [
        {
            name: 'chromium',
            use: { ...devices['Desktop Chrome'] },
        },
    ],

    // Don't auto-start web server - assume it's already running
    // This allows running against an already-started server
})
