import { expect, test, type Page } from '@playwright/test';
import { createHash } from 'node:crypto';
import {
	STOCKFISH_CORRESPONDING_SOURCE_FILENAME,
	STOCKFISH_ENGINE_SOURCE_ARCHIVE,
	STOCKFISH_ENGINE_SOURCE_ARCHIVE_BYTES,
	STOCKFISH_ENGINE_SOURCE_ARCHIVE_SHA256,
	STOCKFISH_JS_SOURCE_ARCHIVE,
	STOCKFISH_JS_SOURCE_ARCHIVE_BYTES,
	STOCKFISH_JS_SOURCE_ARCHIVE_SHA256,
	STOCKFISH_LICENSE_FILENAME,
} from '../scripts/stockfish-assets';
import { createInitialGameState, makeAIMove } from '../src/lib/chess/game';
import { parseBestMove } from '../src/lib/chess/rival/stockfish-protocol';

const STOCKFISH_BASE_PATH = '/vendor/stockfish';
const STOCKFISH_JS_PATH = `${STOCKFISH_BASE_PATH}/stockfish-18-lite-single.js`;
const STOCKFISH_WASM_PATH = `${STOCKFISH_BASE_PATH}/stockfish-18-lite-single.wasm`;
const STOCKFISH_LICENSE_PATH = `${STOCKFISH_BASE_PATH}/${STOCKFISH_LICENSE_FILENAME}`;
const STOCKFISH_CORRESPONDING_SOURCE_PATH = `${STOCKFISH_BASE_PATH}/${STOCKFISH_CORRESPONDING_SOURCE_FILENAME}`;
const STOCKFISH_JS_ARCHIVE_PATH = `${STOCKFISH_BASE_PATH}/source/${STOCKFISH_JS_SOURCE_ARCHIVE}`;
const STOCKFISH_ENGINE_ARCHIVE_PATH = `${STOCKFISH_BASE_PATH}/source/${STOCKFISH_ENGINE_SOURCE_ARCHIVE}`;
const KNOWN_FAVICON_PATH = '/favicon.svg';

const isKnownFaviconEntry = (entry: string): boolean =>
	entry.includes(KNOWN_FAVICON_PATH);

function sha256Bytes(body: Buffer): string {
	return createHash('sha256').update(body).digest('hex');
}

async function assertDownloadableArchive(
	page: Page,
	archivePath: string,
	expectedBytes: number,
	expectedSha256: string
) {
	// Use Playwright's APIRequestContext (same decompression behavior as
	// browser/fetch). The stockfish preview server must omit Content-Encoding
	// for .tar.gz so the body bytes stay the archive, not a gunzipped payload.
	const response = await page.request.get(archivePath, { maxRedirects: 0 });
	const body = Buffer.from(await response.body());
	const headers = response.headers();

	expect(response.status()).toBe(200);
	expect(headers['location']).toBeUndefined();
	expect(headers['content-encoding']).toBeUndefined();
	expect(headers['content-type'] ?? '').not.toContain('text/html');
	expect(body.byteLength).toBe(expectedBytes);
	expect(sha256Bytes(body)).toBe(expectedSha256);
}

test.describe('Stockfish production asset delivery', () => {
	test('serves the browser worker script as a static non-HTML asset', async ({
		page,
	}) => {
		const response = await page.request.get(STOCKFISH_JS_PATH, {
			maxRedirects: 0,
		});

		expect(response.status()).toBe(200);
		expect(response.headers()['location']).toBeUndefined();
		expect(response.headers()['content-type']).not.toContain('text/html');
	});

	test('serves the wasm binary with WebAssembly MIME type', async ({
		page,
	}) => {
		const response = await page.request.get(STOCKFISH_WASM_PATH, {
			maxRedirects: 0,
		});
		const body = await response.body();

		expect(response.status()).toBe(200);
		expect(response.headers()['location']).toBeUndefined();
		expect(response.headers()['content-type']).toContain('application/wasm');
		expect(body.byteLength).toBeGreaterThan(1024 * 1024);
	});

	test('serves license and corresponding-source materials beside the binaries', async ({
		page,
	}) => {
		const licenseResponse = await page.request.get(STOCKFISH_LICENSE_PATH, {
			maxRedirects: 0,
		});
		const correspondingSourceResponse = await page.request.get(
			STOCKFISH_CORRESPONDING_SOURCE_PATH,
			{ maxRedirects: 0 }
		);
		const licenseBody = await licenseResponse.text();
		const correspondingSourceBody = await correspondingSourceResponse.text();

		expect(licenseResponse.status()).toBe(200);
		expect(licenseBody).toContain('GNU GENERAL PUBLIC LICENSE');
		expect(licenseBody).toContain('Version 3');
		expect(correspondingSourceResponse.status()).toBe(200);
		expect(correspondingSourceBody).toContain('stockfish-18-lite-single.js');
		expect(correspondingSourceBody).toContain(
			'93c994592dcf3b4b21052ab925e9b534df9c0918'
		);
		expect(correspondingSourceBody).toContain('sf_18');
		expect(correspondingSourceBody).toContain(STOCKFISH_JS_SOURCE_ARCHIVE);
		expect(correspondingSourceBody).toContain(STOCKFISH_ENGINE_SOURCE_ARCHIVE);
		expect(correspondingSourceBody).toContain(
			STOCKFISH_JS_SOURCE_ARCHIVE_SHA256
		);
		expect(correspondingSourceBody).toContain(
			STOCKFISH_ENGINE_SOURCE_ARCHIVE_SHA256
		);

		await assertDownloadableArchive(
			page,
			STOCKFISH_JS_ARCHIVE_PATH,
			STOCKFISH_JS_SOURCE_ARCHIVE_BYTES,
			STOCKFISH_JS_SOURCE_ARCHIVE_SHA256
		);
		await assertDownloadableArchive(
			page,
			STOCKFISH_ENGINE_ARCHIVE_PATH,
			STOCKFISH_ENGINE_SOURCE_ARCHIVE_BYTES,
			STOCKFISH_ENGINE_SOURCE_ARCHIVE_SHA256
		);
	});

	test('starts the packaged Stockfish worker and returns one legal move', async ({
		page,
	}) => {
		const consoleErrors: string[] = [];
		const failedAssetRequests: string[] = [];

		// Astro preview serves static assets only; stub session so auth
		// revalidation does not emit browser console errors.
		await page.route('**/api/auth/session', async route => {
			if (route.request().method() !== 'GET') {
				return route.continue();
			}
			await route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify({
					user: {
						id: 'stockfish-asset-test',
						email: 'stockfish@test.local',
						username: 'stockfish-tester',
					},
				}),
			});
		});

		page.on('console', message => {
			if (message.type() === 'error') {
				const location = message.location();
				consoleErrors.push(
					location.url ? `${location.url}: ${message.text()}` : message.text()
				);
			}
		});
		page.on('response', response => {
			if (response.status() >= 400) {
				failedAssetRequests.push(`${response.url()} HTTP ${response.status()}`);
			}
		});
		page.on('requestfailed', request => {
			failedAssetRequests.push(
				`${request.url()} ${request.failure()?.errorText ?? 'request failed'}`
			);
		});

		await page.goto('/');
		await expect(
			page.getByRole('heading', { name: 'Procyon Chess' })
		).toBeVisible();

		const bestMoveLine = await page.evaluate(
			async ({ scriptPath }) => {
				const worker = new Worker(scriptPath);
				const messages: string[] = [];

				const waitForMessage = (expected: string): Promise<string> =>
					new Promise((resolve, reject) => {
						const timeout = window.setTimeout(() => {
							worker.removeEventListener('message', onMessage);
							reject(
								new Error(
									`Timed out waiting for ${expected}. Messages: ${messages.join(
										'\n'
									)}`
								)
							);
						}, 15_000);

						function onMessage(event: MessageEvent<string>) {
							const line = String(event.data);
							messages.push(line);
							if (line.includes(expected)) {
								window.clearTimeout(timeout);
								worker.removeEventListener('message', onMessage);
								resolve(line);
							}
						}

						worker.addEventListener('message', onMessage);
					});

				try {
					worker.postMessage('uci');
					await waitForMessage('uciok');
					worker.postMessage('isready');
					await waitForMessage('readyok');
					worker.postMessage('ucinewgame');
					worker.postMessage('isready');
					await waitForMessage('readyok');
					worker.postMessage('position startpos');
					worker.postMessage('go movetime 250');
					return await waitForMessage('bestmove ');
				} finally {
					worker.terminate();
				}
			},
			{ scriptPath: STOCKFISH_JS_PATH }
		);

		const parsed = parseBestMove(bestMoveLine);
		expect(parsed).not.toBeNull();
		expect(parsed?.ok).toBe(true);
		if (!parsed || !parsed.ok) {
			throw new Error(`Stockfish returned unusable bestmove: ${bestMoveLine}`);
		}

		const initial = createInitialGameState('human-vs-ai', 'white');
		const next = makeAIMove(
			initial,
			parsed.move.from,
			parsed.move.to,
			parsed.move.promotion
		);
		expect(next).not.toBeNull();

		expect(consoleErrors.filter(entry => !isKnownFaviconEntry(entry))).toEqual(
			[]
		);
		expect(
			failedAssetRequests.filter(entry => !isKnownFaviconEntry(entry))
		).toEqual([]);
	});
});
