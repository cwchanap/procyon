import { defineConfig, devices } from '@playwright/test';

const isCI = process.env.CI === 'true';
const shouldStartWebServer = process.env.PLAYWRIGHT_SKIP_WEB_SERVER !== '1';

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
	reporter: isCI ? 'dot' : [['list'], ['html', { open: 'never' }]],

	/* Shared settings for all the projects below. */
	use: {
		baseURL: 'http://localhost:3500',
		trace: 'on-first-retry',
		screenshot: 'only-on-failure',
	},

	/* Configure projects for Chrome only */
	projects: [
		{
			name: 'chromium',
			use: { ...devices['Desktop Chrome'] },
		},
	],

	/* Run dev servers automatically. Auth is handled via stubs in tests, so no
	 * real Google credentials are required at the playwright level. */
	webServer: shouldStartWebServer
		? [
				{
					command: 'sh -c "cd .. && cd web && bun run dev"',
					url: 'http://localhost:3500',
					reuseExistingServer: false,
					timeout: 120 * 1000,
					env: {
						PUBLIC_API_URL: 'http://localhost:3501/api',
						PUBLIC_GOOGLE_CLIENT_ID:
							process.env.PUBLIC_GOOGLE_CLIENT_ID || 'e2e-google-client-id',
						ASTRO_DISABLE_DEV_TOOLBAR: 'true',
					},
				},
				{
					command: 'sh -c "cd ../api && NODE_ENV=e2e bun --watch src/index.ts"',
					url: 'http://localhost:3501',
					reuseExistingServer: false,
					timeout: 120 * 1000,
					env: {
						NODE_ENV: 'e2e',
						GOOGLE_CLIENT_ID:
							process.env.GOOGLE_CLIENT_ID || 'e2e-google-client-id',
						JWT_SECRET:
							process.env.JWT_SECRET ||
							'e2e-jwt-secret-must-be-at-least-32-chars-long',
					},
				},
			]
		: undefined,
});
