import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
	testDir: './e2e',
	fullyParallel: false,
	workers: 1,
	reporter: [['list']],
	use: {
		baseURL: 'http://127.0.0.1:3510',
		trace: 'on-first-retry',
	},
	projects: [
		{
			name: 'chromium',
			use: { ...devices['Desktop Chrome'] },
		},
	],
	webServer: {
		command: 'bun run build && bunx astro preview --host 127.0.0.1 --port 3510',
		env: {
			PUBLIC_GOOGLE_CLIENT_ID: 'verification-only',
		},
		port: 3510,
		reuseExistingServer: false,
		timeout: 120_000,
	},
});
