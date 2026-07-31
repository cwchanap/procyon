import { expect, test } from '@playwright/test';

const STOCKFISH_BASE_PATH = '/vendor/stockfish';
const STOCKFISH_JS_PATH = `${STOCKFISH_BASE_PATH}/stockfish-18-lite-single.js`;
const STOCKFISH_WASM_PATH = `${STOCKFISH_BASE_PATH}/stockfish-18-lite-single.wasm`;
const STOCKFISH_LICENSE_PATH = `${STOCKFISH_BASE_PATH}/Copying.txt`;
const STOCKFISH_CORRESPONDING_SOURCE_PATH = `${STOCKFISH_BASE_PATH}/CorrespondingSource.txt`;
const KNOWN_FAVICON_PATH = '/favicon.svg';

const isKnownFaviconEntry = (entry: string): boolean =>
	entry.includes(KNOWN_FAVICON_PATH);

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
