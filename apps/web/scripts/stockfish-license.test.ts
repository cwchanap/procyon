import { describe, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import {
	STOCKFISH_CORRESPONDING_SOURCE_FILENAME,
	STOCKFISH_ENGINE_SOURCE_ARCHIVE,
	STOCKFISH_ENGINE_SOURCE_ARCHIVE_SHA256,
	STOCKFISH_ENGINE_UPSTREAM_COMMIT,
	STOCKFISH_ENGINE_UPSTREAM_TAG,
	STOCKFISH_JS_FILENAME,
	STOCKFISH_JS_PACKAGE_COMMIT,
	STOCKFISH_JS_SOURCE_ARCHIVE,
	STOCKFISH_JS_SOURCE_ARCHIVE_SHA256,
	STOCKFISH_LICENSE_FILENAME,
	STOCKFISH_WASM_FILENAME,
} from './stockfish-assets';

const REPO_ROOT = path.resolve(import.meta.dir, '../../..');
const COMPLIANCE_ROOT = path.join(REPO_ROOT, 'third_party/licenses/stockfish');
const COPYING_PATH = path.join(COMPLIANCE_ROOT, STOCKFISH_LICENSE_FILENAME);
const CORRESPONDING_SOURCE_PATH = path.join(
	COMPLIANCE_ROOT,
	STOCKFISH_CORRESPONDING_SOURCE_FILENAME
);
const JS_ARCHIVE_PATH = path.join(
	COMPLIANCE_ROOT,
	'source',
	STOCKFISH_JS_SOURCE_ARCHIVE
);
const ENGINE_ARCHIVE_PATH = path.join(
	COMPLIANCE_ROOT,
	'source',
	STOCKFISH_ENGINE_SOURCE_ARCHIVE
);
const NOTICES_PATH = path.join(REPO_ROOT, 'THIRD_PARTY_NOTICES.md');

const STOCKFISH_JS_UPSTREAM_REPO = 'https://github.com/nmrugg/stockfish.js';
const STOCKFISH_ENGINE_UPSTREAM_REPO =
	'https://github.com/official-stockfish/Stockfish';
const STOCKFISH_DISTRIBUTION_PATH = 'apps/web/public/vendor/stockfish/';

const STOCKFISH_JS_ARCHIVE_ROOT = `stockfish.js-${STOCKFISH_JS_PACKAGE_COMMIT}`;
const STOCKFISH_ENGINE_ARCHIVE_ROOT = 'Stockfish-sf_18';

function sha256File(filePath: string): string {
	return createHash('sha256')
		.update(Buffer.from(readFileSync(filePath)))
		.digest('hex');
}

async function listTarMembers(archivePath: string): Promise<string[]> {
	const proc = Bun.spawn({
		cmd: ['tar', '-tzf', archivePath],
		stdout: 'pipe',
		stderr: 'pipe',
	});
	const [exitCode, stdout, stderr] = await Promise.all([
		proc.exited,
		new Response(proc.stdout).text(),
		new Response(proc.stderr).text(),
	]);
	if (exitCode !== 0) {
		throw new Error(
			`tar -tzf failed for ${archivePath}: ${stderr || `exit ${exitCode}`}`
		);
	}
	return stdout
		.split('\n')
		.map(line => line.trim())
		.filter(Boolean);
}

describe('Stockfish license traceability', () => {
	test('keeps the copied GPL-3.0 license text', () => {
		expect(existsSync(COPYING_PATH)).toBe(true);

		const copyingText = readFileSync(COPYING_PATH, 'utf8');
		expect(copyingText).toContain('GNU GENERAL PUBLIC LICENSE');
		expect(copyingText).toContain('Version 3');
	});

	test('vendors exact corresponding-source archives beside the license', async () => {
		expect(existsSync(CORRESPONDING_SOURCE_PATH)).toBe(true);
		expect(existsSync(JS_ARCHIVE_PATH)).toBe(true);
		expect(existsSync(ENGINE_ARCHIVE_PATH)).toBe(true);

		expect(sha256File(JS_ARCHIVE_PATH)).toBe(
			STOCKFISH_JS_SOURCE_ARCHIVE_SHA256
		);
		expect(sha256File(ENGINE_ARCHIVE_PATH)).toBe(
			STOCKFISH_ENGINE_SOURCE_ARCHIVE_SHA256
		);

		const jsMembers = await listTarMembers(JS_ARCHIVE_PATH);
		expect(jsMembers).toContain(`${STOCKFISH_JS_ARCHIVE_ROOT}/build.js`);
		expect(jsMembers).toContain(`${STOCKFISH_JS_ARCHIVE_ROOT}/package.json`);
		expect(jsMembers).toContain(`${STOCKFISH_JS_ARCHIVE_ROOT}/src/Makefile`);
		expect(
			jsMembers.some(member =>
				member.startsWith(`${STOCKFISH_JS_ARCHIVE_ROOT}/src/`)
			)
		).toBe(true);

		const engineMembers = await listTarMembers(ENGINE_ARCHIVE_PATH);
		expect(engineMembers).toContain(
			`${STOCKFISH_ENGINE_ARCHIVE_ROOT}/src/Makefile`
		);
		expect(
			engineMembers.some(member =>
				member.startsWith(`${STOCKFISH_ENGINE_ARCHIVE_ROOT}/src/`)
			)
		).toBe(true);

		const correspondingSourceText = readFileSync(
			CORRESPONDING_SOURCE_PATH,
			'utf8'
		);
		expect(correspondingSourceText).toContain(STOCKFISH_JS_PACKAGE_COMMIT);
		expect(correspondingSourceText).toContain(STOCKFISH_ENGINE_UPSTREAM_TAG);
		expect(correspondingSourceText).toContain(STOCKFISH_JS_SOURCE_ARCHIVE);
		expect(correspondingSourceText).toContain(STOCKFISH_ENGINE_SOURCE_ARCHIVE);
		expect(correspondingSourceText).toContain(
			STOCKFISH_JS_SOURCE_ARCHIVE_SHA256
		);
		expect(correspondingSourceText).toContain(
			STOCKFISH_ENGINE_SOURCE_ARCHIVE_SHA256
		);
		expect(correspondingSourceText).toContain(STOCKFISH_JS_FILENAME);
		expect(correspondingSourceText).toContain(STOCKFISH_WASM_FILENAME);
	});

	test('documents Stockfish attribution and upstream references', () => {
		expect(existsSync(NOTICES_PATH)).toBe(true);

		const noticesText = readFileSync(NOTICES_PATH, 'utf8');
		expect(noticesText).toContain('Stockfish.js');
		expect(noticesText).toContain('Stockfish');
		expect(noticesText).toContain('18.0.8');
		expect(noticesText).toContain('GPL-3.0');
		expect(noticesText).toContain(STOCKFISH_JS_UPSTREAM_REPO);
		expect(noticesText).toContain(STOCKFISH_JS_PACKAGE_COMMIT);
		expect(noticesText).toContain(STOCKFISH_ENGINE_UPSTREAM_REPO);
		expect(noticesText).toContain(STOCKFISH_ENGINE_UPSTREAM_TAG);
		expect(noticesText).toContain(STOCKFISH_ENGINE_UPSTREAM_COMMIT);
		expect(noticesText).toContain(STOCKFISH_JS_FILENAME);
		expect(noticesText).toContain(STOCKFISH_WASM_FILENAME);
		expect(noticesText).toContain(STOCKFISH_DISTRIBUTION_PATH);
		expect(noticesText).toContain('third_party/licenses/stockfish/Copying.txt');
		expect(noticesText).toContain('/vendor/stockfish/');
		expect(noticesText).toContain('CorrespondingSource.txt');
	});

	test('states corresponding source is published with the binaries', () => {
		const noticesText = readFileSync(NOTICES_PATH, 'utf8');

		expect(noticesText).toMatch(/same origin/i);
		expect(noticesText).toMatch(/corresponding-source/i);
		expect(noticesText).toMatch(/HPA-187/i);
		expect(noticesText).toMatch(/release-checklist verification/i);
	});
});
