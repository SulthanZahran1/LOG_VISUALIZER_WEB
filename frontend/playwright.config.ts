import { defineConfig, devices } from '@playwright/test'

/**
 * Playwright E2E Test Configuration
 * @see https://playwright.dev/docs/test-configuration
 */
export default defineConfig({
    testDir: './e2e',
    fullyParallel: false, // Run tests sequentially for stability
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 2 : 1, // Retry once locally, twice in CI
    workers: 1, // Single worker to avoid conflicts
    reporter: [['html'], ['list']], // List reporter for better visibility
    timeout: 60000, // 60 second timeout per test
    // Use simple setup (expects backend already running)
    // For Docker setup, use: globalSetup: './e2e/global-setup.ts'
    globalSetup: './e2e/global-setup-simple.ts',

    use: {
        baseURL: 'http://localhost:5173',
        trace: 'on-first-retry',
        screenshot: 'only-on-failure',
        viewport: { width: 1280, height: 720 },
        actionTimeout: 10000, // 10 seconds for actions
        navigationTimeout: 15000, // 15 seconds for navigation
    },

    projects: [
        {
            name: 'chromium',
            use: { 
                ...devices['Desktop Chrome'],
                launchOptions: {
                    args: ['--disable-gpu', '--no-sandbox'],
                },
            },
        },
    ],

    /* 
     * NOTE: Backend must be running separately before tests.
     * Start backend with: cd ../backend && go run cmd/server/main.go
     * Then run tests: npm run test:e2e
     * 
     * This webServer config only starts the frontend dev server.
     */
    webServer: {
        command: 'npm run dev',
        url: 'http://localhost:5173',
        reuseExistingServer: true, // Always reuse existing servers
        timeout: 60 * 1000,
    },
})
