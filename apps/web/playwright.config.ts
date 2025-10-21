import { defineConfig, devices } from '@playwright/test';

/**
 * See https://playwright.dev/docs/test-configuration.
 */
export default defineConfig({
  testDir: './e2e',

  /* Run tests in files in parallel */
  fullyParallel: true,

  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,

  /* Retry on CI only */
  retries: process.env.CI ? 2 : 0,

  /* Opt out of parallel tests on CI. */
  workers: process.env.CI ? 1 : undefined,

  /* Reporter to use. See https://playwright.dev/docs/test-reporters */
  reporter: 'html',

  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
  use: {
    /* Base URL to use in actions like `await page.goto('/')`. */
    baseURL: 'http://localhost:3500',

    /* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
    trace: 'on-first-retry',

    /* Take screenshot on failure */
    screenshot: 'only-on-failure',
  },

  /* Configure projects for major browsers */
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },

    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },

    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },

    /* Test against mobile viewports. */
    {
      name: 'Mobile Chrome',
      use: { ...devices['Pixel 5'] },
    },
    {
      name: 'Mobile Safari',
      use: { ...devices['iPhone 12'] },
    },
  ],

  /* Run your local dev server before starting the tests */
  webServer: process.env.CI ? [
    {
      command: 'sh -c "cd .. && cd web && /opt/homebrew/bin/bun run dev"',
      url: 'http://localhost:3500',
      reuseExistingServer: false,
      timeout: 120 * 1000,
      env: {
        ASTRO_DISABLE_DEV_TOOLBAR: 'true',
        PATH: '/opt/homebrew/bin:' + process.env.PATH,
      },
    },
    {
      command: 'sh -c "cd ../api && NODE_ENV=development /opt/homebrew/bin/bun --watch src/index.ts"',
      url: 'http://localhost:3501',
      reuseExistingServer: false,
      timeout: 120 * 1000,
      env: {
        PATH: '/opt/homebrew/bin:' + process.env.PATH,
      },
    },
  ] : undefined,
});
