import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export default function globalSetup(): void {
	const __dirname = path.dirname(fileURLToPath(import.meta.url));
	const scriptPath = path.resolve(
		__dirname,
		'../../../scripts/create-e2e-supabase-user.js'
	);

	const result = spawnSync('node', [scriptPath], {
		env: process.env,
		stdio: 'inherit',
	});

	if (result.status !== 0) {
		throw new Error('Failed to create E2E Supabase user.');
	}
}
