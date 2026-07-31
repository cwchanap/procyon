import { describe, expect, test } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import {
	STOCKFISH_JS_FILENAME,
	STOCKFISH_WASM_FILENAME,
} from './stockfish-assets';

const REPO_ROOT = path.resolve(import.meta.dir, '../../..');
const COPYING_PATH = path.join(
	REPO_ROOT,
	'third_party/licenses/stockfish/Copying.txt'
);
const NOTICES_PATH = path.join(REPO_ROOT, 'THIRD_PARTY_NOTICES.md');

const STOCKFISH_JS_UPSTREAM_TAG = 'v18.0.0';
const STOCKFISH_JS_UPSTREAM_REPO = 'https://github.com/nmrugg/stockfish.js';

describe('Stockfish license traceability', () => {
	test('keeps the copied GPL-3.0 license text', () => {
		expect(existsSync(COPYING_PATH)).toBe(true);

		const copyingText = readFileSync(COPYING_PATH, 'utf8');
		expect(copyingText).toContain('GNU GENERAL PUBLIC LICENSE');
		expect(copyingText).toContain('Version 3');
	});

	test('documents Stockfish attribution and upstream references', () => {
		expect(existsSync(NOTICES_PATH)).toBe(true);

		const noticesText = readFileSync(NOTICES_PATH, 'utf8');
		expect(noticesText).toContain('Stockfish.js');
		expect(noticesText).toContain('Stockfish');
		expect(noticesText).toContain('18.0.8');
		expect(noticesText).toContain('GPL-3.0');
		expect(noticesText).toContain(STOCKFISH_JS_UPSTREAM_REPO);
		expect(noticesText).toContain(STOCKFISH_JS_UPSTREAM_TAG);
		expect(noticesText).toContain(STOCKFISH_JS_FILENAME);
		expect(noticesText).toContain(STOCKFISH_WASM_FILENAME);
		expect(noticesText).toContain('third_party/licenses/stockfish/Copying.txt');
	});

	test('does not claim the notice alone completes source-distribution obligations', () => {
		const noticesText = readFileSync(NOTICES_PATH, 'utf8');

		expect(noticesText).toMatch(/HPA-187/i);
		expect(noticesText).toMatch(/corresponding-source/i);
		expect(noticesText).toMatch(/does not.*by itself/i);
		expect(noticesText).not.toMatch(
			/this notice alone (?:satisfies|fulfills|completes)/i
		);
	});
});
