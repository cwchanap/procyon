import { expect, test } from '@playwright/test';
import { createHash } from 'node:crypto';
import http from 'node:http';
import type { IncomingHttpHeaders } from 'node:http';
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

/**
 * Fetch raw response bytes without auto-decompressing Content-Encoding.
 * Astro preview labels some static .tar.gz assets as gzip even when the body
 * is the verbatim archive; Playwright/fetch would otherwise gunzip and break
 * integrity checks.
 */
function fetchRaw(
	url: string
): Promise<{ status: number; headers: IncomingHttpHeaders; body: Buffer }> {
	return new Promise((resolve, reject) => {
		http
			.get(url, response => {
				const chunks: Buffer[] = [];
				response.on('data', chunk => {
					chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
				});
				response.on('end', () => {
					resolve({
						status: response.statusCode ?? 0,
						headers: response.headers,
						body: Buffer.concat(chunks),
					});
				});
			})
			.on('error', reject);
	});
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
		baseURL,
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

		expect(baseURL).toBeTruthy();
		const jsArchive = await fetchRaw(`${baseURL}${STOCKFISH_JS_ARCHIVE_PATH}`);
		const engineArchive = await fetchRaw(
			`${baseURL}${STOCKFISH_ENGINE_ARCHIVE_PATH}`
		);

		expect(jsArchive.status).toBe(200);
		expect(jsArchive.headers.location).toBeUndefined();
		expect(String(jsArchive.headers['content-type'] ?? '')).not.toContain(
			'text/html'
		);
		expect(jsArchive.body.byteLength).toBe(STOCKFISH_JS_SOURCE_ARCHIVE_BYTES);
		expect(sha256Bytes(jsArchive.body)).toBe(
			STOCKFISH_JS_SOURCE_ARCHIVE_SHA256
		);

		expect(engineArchive.status).toBe(200);
		expect(engineArchive.headers.location).toBeUndefined();
		expect(String(engineArchive.headers['content-type'] ?? '')).not.toContain(
			'text/html'
		);
		expect(engineArchive.body.byteLength).toBe(
			STOCKFISH_ENGINE_SOURCE_ARCHIVE_BYTES
		);
		expect(sha256Bytes(engineArchive.body)).toBe(
			STOCKFISH_ENGINE_SOURCE_ARCHIVE_SHA256
		);
	});

	test('starts a same-origin Stockfish worker and completes UCI readiness', async ({
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

		await page.evaluate(
			async ({ scriptPath }) => {
				const worker = new Worker(scriptPath);
				const messages: string[] = [];

				const waitForMessage = (expected: string): Promise<void> =>
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
							messages.push(String(event.data));
							if (String(event.data).includes(expected)) {
								window.clearTimeout(timeout);
								worker.removeEventListener('message', onMessage);
								resolve();
							}
						}

						worker.addEventListener('message', onMessage);
					});

				try {
					worker.postMessage('uci');
					await waitForMessage('uciok');
					worker.postMessage('isready');
					await waitForMessage('readyok');
				} finally {
					worker.terminate();
				}
			},
			{ scriptPath: STOCKFISH_JS_PATH }
		);

		expect(consoleErrors.filter(entry => !isKnownFaviconEntry(entry))).toEqual(
			[]
		);
		expect(
			failedAssetRequests.filter(entry => !isKnownFaviconEntry(entry))
		).toEqual([]);
	});
});
