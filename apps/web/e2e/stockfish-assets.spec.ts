import { expect, test } from '@playwright/test';

const STOCKFISH_BASE_PATH = '/vendor/stockfish';
const STOCKFISH_JS_PATH = `${STOCKFISH_BASE_PATH}/stockfish-18-lite-single.js`;
const STOCKFISH_WASM_PATH = `${STOCKFISH_BASE_PATH}/stockfish-18-lite-single.wasm`;

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

	test('starts a same-origin Stockfish worker and completes UCI readiness', async ({
		page,
	}) => {
		const consoleErrors: string[] = [];
		const failedAssetRequests: string[] = [];

		page.on('console', message => {
			if (message.type() === 'error') {
				consoleErrors.push(message.text());
			}
		});
		page.on('requestfailed', request => {
			failedAssetRequests.push(
				`${request.url()} ${request.failure()?.errorText ?? 'request failed'}`
			);
		});

		await page.goto('/');
		await page.waitForLoadState('networkidle');
		consoleErrors.length = 0;
		failedAssetRequests.length = 0;

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

		expect(consoleErrors).toEqual([]);
		expect(failedAssetRequests).toEqual([]);
	});
});
