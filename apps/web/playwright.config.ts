import { defineConfig, devices } from '@playwright/test';
import { execSync } from 'node:child_process';

const isCI = process.env.CI === 'true';
const shouldStartWebServer = process.env.PLAYWRIGHT_SKIP_WEB_SERVER !== '1';

type SupabaseEnv = {
  url: string;
  anonKey: string;
  serviceRoleKey: string;
};

function resolveSupabaseEnv(): SupabaseEnv {
  const envUrl = process.env.SUPABASE_URL ?? process.env.PUBLIC_SUPABASE_URL;
  const envAnon =
    process.env.SUPABASE_ANON_KEY ?? process.env.PUBLIC_SUPABASE_ANON_KEY;
  const envService = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (envUrl && envAnon && envService) {
    return {
      url: envUrl,
      anonKey: envAnon,
      serviceRoleKey: envService,
    };
  }

  try {
    const raw = execSync('supabase status --output json', {
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    const status = JSON.parse(raw.toString()) as {
      api_url?: string;
      anon_key?: string;
      service_role_key?: string;
    };

    if (!status.api_url || !status.anon_key || !status.service_role_key) {
      throw new Error('Supabase status missing required keys.');
    }

    return {
      url: status.api_url,
      anonKey: status.anon_key,
      serviceRoleKey: status.service_role_key,
    };
  } catch (error) {
    throw new Error(
      'Supabase env is missing. Start local Supabase with `supabase start` or set SUPABASE_URL, SUPABASE_ANON_KEY, and SUPABASE_SERVICE_ROLE_KEY.'
    );
  }
}

const supabaseEnv = resolveSupabaseEnv();
process.env.SUPABASE_URL = supabaseEnv.url;
process.env.SUPABASE_ANON_KEY = supabaseEnv.anonKey;
process.env.SUPABASE_SERVICE_ROLE_KEY = supabaseEnv.serviceRoleKey;
process.env.PUBLIC_SUPABASE_URL = supabaseEnv.url;
process.env.PUBLIC_SUPABASE_ANON_KEY = supabaseEnv.anonKey;

/**
 * See https://playwright.dev/docs/test-configuration.
 */
export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/global-setup.ts',

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

  /* Run dev servers automatically; relies on local Supabase for auth */
  webServer: shouldStartWebServer ? [
    {
      command: 'sh -c "cd .. && cd web && bun run dev"',
      url: 'http://localhost:3500',
      reuseExistingServer: false,
      timeout: 120 * 1000,
      env: {
        SUPABASE_URL: supabaseEnv.url,
        SUPABASE_ANON_KEY: supabaseEnv.anonKey,
        PUBLIC_SUPABASE_URL: supabaseEnv.url,
        PUBLIC_SUPABASE_ANON_KEY: supabaseEnv.anonKey,
        PUBLIC_API_URL: 'http://localhost:3501/api',
        ASTRO_DISABLE_DEV_TOOLBAR: 'true',
      },
    },
    {
      command: 'sh -c "cd ../api && NODE_ENV=development bun --watch src/index.ts"',
      url: 'http://localhost:3501',
      reuseExistingServer: false,
      timeout: 120 * 1000,
      env: {
        NODE_ENV: 'development',
        SUPABASE_URL: supabaseEnv.url,
        SUPABASE_ANON_KEY: supabaseEnv.anonKey,
        SUPABASE_SERVICE_ROLE_KEY: supabaseEnv.serviceRoleKey,
      },
    },
  ] : undefined,
});
