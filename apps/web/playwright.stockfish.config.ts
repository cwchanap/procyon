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
		// Astro static preview uses sirv and ignores user Vite plugins, so
		// *.tar.gz would get Content-Encoding: gzip. Serve dist with correct
		// archive metadata instead (see scripts/stockfish-assets-preview-server.ts).
		command:
			'bun run build && bun run scripts/stockfish-assets-preview-server.ts 3510',
		env: {
			PUBLIC_GOOGLE_CLIENT_ID: 'verification-only',
		},
		port: 3510,
		reuseExistingServer: false,
		timeout: 120_000,
	},
});
