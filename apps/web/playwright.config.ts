import { defineConfig, devices } from '@playwright/test';

const isCI = process.env.CI === 'true';

/**
 * See https://playwright.dev/docs/test-configuration.
 */
export default defineConfig({
  testDir: './e2e',

  /* Run tests in files in parallel */
  fullyParallel: true,

  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: isCI,

  /* Retry on CI only */
  retries: isCI ? 2 : 0,

  /* Opt out of parallel tests by using a single worker. */
  workers: 1,

  /* Reporter to use. HTML is still generated but never auto-served locally. */
  reporter: isCI ? 'dot' : [
    ['list'],
    ['html', { open: 'never' }],
  ],

  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
  use: {
    /* Base URL to use in actions like `await page.goto('/')`. */
    baseURL: 'http://localhost:3500',

    /* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
    trace: 'on-first-retry',

    /* Take screenshot on failure */
    screenshot: 'only-on-failure',
  },

  /* Configure projects for Chrome only */
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  /* Run dev servers automatically only on CI; locally assume they're already running */
  webServer: isCI ? [
    {
      command: 'sh -c "cd .. && cd web && bun run dev"',
      url: 'http://localhost:3500',
      reuseExistingServer: false,
      timeout: 120 * 1000,
      env: {
        ASTRO_DISABLE_DEV_TOOLBAR: 'true',
      },
    },
    {
      command: 'sh -c "cd ../api && NODE_ENV=development bun --watch src/index.ts"',
      url: 'http://localhost:3501',
      reuseExistingServer: false,
      timeout: 120 * 1000,
    },
  ] : undefined,
});
