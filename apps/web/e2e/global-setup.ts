import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export default function globalSetup(): void {
	const __dirname = path.dirname(fileURLToPath(import.meta.url));
	const apiDir = path.resolve(__dirname, '../../../apps/api');

	// Run database migrations to ensure schema is up to date
	try {
		execSync('bun run db:migrate', {
			cwd: apiDir,
			env: process.env,
			stdio: 'inherit',
		});
	} catch {
		// migrations may fail if already applied
	}

	// Seed a test user directly via the API's test-claim endpoint.
	// This replaces the old Supabase user creation since auth is now Google-only.
	const apiBase = process.env.PUBLIC_API_URL || 'http://localhost:3501/api';
	const testEmail =
		process.env.E2E_TEST_USER_EMAIL || 'test-procyon@cwchanap.dev';
	const testUsername =
		process.env.E2E_TEST_USER_USERNAME || testEmail.split('@')[0];

	// Start the API server if it's not already running, then seed the user
	// by making a test-claim login request which will create the user in D1.
	// The API server is already started by Playwright's webServer config.
	try {
		const claimPayload = JSON.stringify({
			sub: `e2e-${testEmail}`,
			email: testEmail,
			emailVerified: true,
			name: testUsername,
		});
		const token = `test-claim:${claimPayload}`;

		// Wait for API to be ready
		let retries = 30;
		while (retries > 0) {
			try {
				const response = execSync(
					`curl -s -o /dev/null -w "%{http_code}" -X POST "${apiBase}/auth/google" -H "Content-Type: application/json" -d '${JSON.stringify({ id_token: token })}'`,
					{ env: process.env, timeout: 5000 }
				)
					.toString()
					.trim();

				if (response === '200') {
					console.log('E2E test user seeded successfully');
					return;
				}
				console.log(`Seed attempt returned ${response}, retrying...`);
			} catch {
				// API not ready yet
			}
			retries--;
			execSync('sleep 2', { stdio: 'ignore' });
		}

		console.error('Failed to seed E2E test user after 30 retries');
		// Don't fail — the test user will be created on first login attempt
	} catch (error) {
		console.error('E2E seed error (non-fatal):', error);
	}
}
