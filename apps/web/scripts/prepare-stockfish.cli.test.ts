import { afterEach, describe, expect, test } from 'bun:test';
import { rm, stat } from 'node:fs/promises';
import path from 'node:path';
import {
	STOCKFISH_CORRESPONDING_SOURCE_FILENAME,
	STOCKFISH_ENGINE_SOURCE_ARCHIVE,
	STOCKFISH_JS_FILENAME,
	STOCKFISH_JS_SOURCE_ARCHIVE,
	STOCKFISH_LICENSE_FILENAME,
	STOCKFISH_PUBLIC_DIRECTORY,
	STOCKFISH_WASM_FILENAME,
} from './stockfish-assets';

const WEB_ROOT = path.resolve(import.meta.dir, '..');
const PUBLIC_VENDOR = path.join(WEB_ROOT, 'public', STOCKFISH_PUBLIC_DIRECTORY);

describe('prepare-stockfish CLI', () => {
	afterEach(async () => {
		await rm(PUBLIC_VENDOR, { recursive: true, force: true });
	});

	test('publishes binaries and corresponding-source materials via import.meta.main', async () => {
		const proc = Bun.spawn({
			cmd: ['bun', 'run', 'scripts/prepare-stockfish.ts'],
			cwd: WEB_ROOT,
			stdout: 'pipe',
			stderr: 'pipe',
		});
		const [exitCode, stdout, stderr] = await Promise.all([
			proc.exited,
			new Response(proc.stdout).text(),
			new Response(proc.stderr).text(),
		]);

		expect(stderr.trim()).toBe('');
		expect(exitCode).toBe(0);
		expect(stdout).toContain(STOCKFISH_JS_FILENAME);
		expect(stdout).toContain(STOCKFISH_WASM_FILENAME);
		expect(stdout).toContain(STOCKFISH_PUBLIC_DIRECTORY);

		await expect(
			stat(path.join(PUBLIC_VENDOR, STOCKFISH_JS_FILENAME))
		).resolves.toBeDefined();
		await expect(
			stat(path.join(PUBLIC_VENDOR, STOCKFISH_WASM_FILENAME))
		).resolves.toBeDefined();
		await expect(
			stat(path.join(PUBLIC_VENDOR, STOCKFISH_LICENSE_FILENAME))
		).resolves.toBeDefined();
		await expect(
			stat(path.join(PUBLIC_VENDOR, STOCKFISH_CORRESPONDING_SOURCE_FILENAME))
		).resolves.toBeDefined();
		await expect(
			stat(path.join(PUBLIC_VENDOR, 'source', STOCKFISH_JS_SOURCE_ARCHIVE))
		).resolves.toBeDefined();
		await expect(
			stat(path.join(PUBLIC_VENDOR, 'source', STOCKFISH_ENGINE_SOURCE_ARCHIVE))
		).resolves.toBeDefined();
	});
});
