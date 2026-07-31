import { describe, expect, test } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import {
	STOCKFISH_CORRESPONDING_SOURCE_FILENAME,
	STOCKFISH_ENGINE_SOURCE_ARCHIVE,
	STOCKFISH_ENGINE_UPSTREAM_COMMIT,
	STOCKFISH_ENGINE_UPSTREAM_TAG,
	STOCKFISH_JS_FILENAME,
	STOCKFISH_JS_PACKAGE_COMMIT,
	STOCKFISH_JS_SOURCE_ARCHIVE,
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

describe('Stockfish license traceability', () => {
	test('keeps the copied GPL-3.0 license text', () => {
		expect(existsSync(COPYING_PATH)).toBe(true);

		const copyingText = readFileSync(COPYING_PATH, 'utf8');
		expect(copyingText).toContain('GNU GENERAL PUBLIC LICENSE');
		expect(copyingText).toContain('Version 3');
	});

	test('vendors exact corresponding-source archives beside the license', () => {
		expect(existsSync(CORRESPONDING_SOURCE_PATH)).toBe(true);
		expect(existsSync(JS_ARCHIVE_PATH)).toBe(true);
		expect(existsSync(ENGINE_ARCHIVE_PATH)).toBe(true);

		const correspondingSourceText = readFileSync(
			CORRESPONDING_SOURCE_PATH,
			'utf8'
		);
		expect(correspondingSourceText).toContain(STOCKFISH_JS_PACKAGE_COMMIT);
		expect(correspondingSourceText).toContain(STOCKFISH_ENGINE_UPSTREAM_TAG);
		expect(correspondingSourceText).toContain(STOCKFISH_JS_SOURCE_ARCHIVE);
		expect(correspondingSourceText).toContain(STOCKFISH_ENGINE_SOURCE_ARCHIVE);
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
