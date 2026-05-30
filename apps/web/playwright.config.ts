import { defineConfig, devices } from '@playwright/test';
import { execSync } from 'node:child_process';

const isCI = process.env.CI === 'true';
const shouldStartWebServer = process.env.PLAYWRIGHT_SKIP_WEB_SERVER !== '1';

type SupabaseEnv = {
  url: string;
  anonKey: string;
  serviceRoleKey: string;
};

function normalizeEnvValue(value?: string): string {
  if (!value) return '';
  return value.trim().replace(/^["']+|["']+$/g, '');
}

function parseSupabaseEnvFromCli(): SupabaseEnv | null {
  try {
    const raw = execSync('supabase status -o env', {
      stdio: ['ignore', 'pipe', 'ignore'],
    }).toString();

    const findValue = (key: string): string => {
      const match = raw.match(new RegExp(`^${key}=(.*)$`, 'm'));
      return normalizeEnvValue(match?.[1]);
    };

    const url = findValue('API_URL');
    const anonKey = findValue('ANON_KEY');
    const serviceRoleKey = findValue('SERVICE_ROLE_KEY');

    if (
      url &&
      anonKey &&
      serviceRoleKey &&
      url !== 'null' &&
      anonKey !== 'null' &&
      serviceRoleKey !== 'null'
    ) {
      return { url, anonKey, serviceRoleKey };
    }
  } catch {
    // ignore CLI failures and fall back to env
  }

  return null;
}

function resolveSupabaseEnv(): SupabaseEnv | null {
  const envUrl = normalizeEnvValue(
    process.env.SUPABASE_URL ?? process.env.PUBLIC_SUPABASE_URL
  );
  const envAnon = normalizeEnvValue(
    process.env.SUPABASE_ANON_KEY ?? process.env.PUBLIC_SUPABASE_ANON_KEY
  );
  const envService = normalizeEnvValue(process.env.SUPABASE_SERVICE_ROLE_KEY);

  if (!isCI) {
    const cliEnv = parseSupabaseEnvFromCli();
    if (cliEnv) {
      return cliEnv;
    }
  }

  if (envUrl && envAnon && envService) {
    return {
      url: envUrl,
      anonKey: envAnon,
      serviceRoleKey: envService,
    };
  }

  const cliEnv = parseSupabaseEnvFromCli();
  if (cliEnv) {
    return cliEnv;
  }

  return null;
}

// Resolve Supabase env only when starting dev servers.
// E2E tests authenticate via test-claims against /api/auth/google, so Supabase
// is not required for listing tests or running against already-started servers.
let supabaseEnv: SupabaseEnv | null = null;

if (shouldStartWebServer) {
  supabaseEnv = resolveSupabaseEnv();
  if (supabaseEnv) {
    process.env.SUPABASE_URL = supabaseEnv.url;
    process.env.SUPABASE_ANON_KEY = supabaseEnv.anonKey;
    process.env.SUPABASE_SERVICE_ROLE_KEY = supabaseEnv.serviceRoleKey;
  }
}

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

  /* Run dev servers automatically */
  webServer: shouldStartWebServer ? [
    {
      command: 'sh -c "cd .. && cd web && bun run dev"',
      url: 'http://localhost:3500',
      reuseExistingServer: false,
      timeout: 120 * 1000,
      env: {
        PUBLIC_API_URL: 'http://localhost:3501/api',
        PUBLIC_GOOGLE_CLIENT_ID: 'test-client-id.apps.googleusercontent.com',
        ASTRO_DISABLE_DEV_TOOLBAR: 'true',
      },
    },
    {
      command: 'sh -c "cd ../api && NODE_ENV=e2e bun --watch src/index.ts"',
      url: 'http://localhost:3501/health',
      reuseExistingServer: false,
      timeout: 120 * 1000,
      env: {
        NODE_ENV: 'e2e',
        JWT_SECRET: 'e2e-test-secret-must-be-at-least-32-chars-long',
        ...(supabaseEnv ? {
          SUPABASE_URL: supabaseEnv.url,
          SUPABASE_ANON_KEY: supabaseEnv.anonKey,
          SUPABASE_SERVICE_ROLE_KEY: supabaseEnv.serviceRoleKey,
        } : {}),
      },
    },
  ] : undefined,
});
