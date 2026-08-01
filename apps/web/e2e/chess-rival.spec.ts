import { readFile } from 'node:fs/promises';
import { test, expect, type Page } from '@playwright/test';

/**
 * Mocked-browser journeys for the chess rival selection / opponent session
 * (HPA-161). These exercise the full ChessGame island — rival setup
 * hydration, the engine/LLM Start lifecycle, board orientation, control
 * locking, and disposal — in a real Chromium page WITHOUT loading the real
 * 7 MB Stockfish WASM.
 *
 * The engine journeys install a deterministic fake `Worker` (see
 * `installFakeStockfish`) BEFORE any app script runs, so the production
 * `StockfishRivalProvider` (rendered with no test props on `/chess`) talks
 * to a scripted UCI emulator instead of fetching `/vendor/stockfish/*`.
 * The real production Worker smoke lives in `stockfish-assets.spec.ts`
 * (packaging PR A) and is intentionally out of scope here.
 */

const STOCKFISH_ASSET_MARKER = '/vendor/stockfish/';
const RIVAL_PREFERENCES_STORAGE_KEY = 'procyon.chess.rival-preferences.v1';

interface BoardOrientationSample {
	hasBoard: boolean;
	hasSkeleton: boolean;
	firstSquareLabel: string | null;
	firstSquareDisabled: boolean | null;
}

interface MockedProviderRequest {
	url: string;
	method: string;
	authorization?: string;
	body: {
		model?: string;
		messages?: Array<{ role?: string; content?: string }>;
	};
}

interface FakeStockfishConfig {
	/** UCI moves the fake engine returns, consumed in order per `go`. */
	bestmoves?: string[];
	/** When true, omit the `option name Skill Level` advertisement. */
	advertiseSkillLevel?: boolean;
	/** When true, the worker reports an error on the `uci` handshake. */
	loadError?: boolean;
	/** When true, the worker never answers `uci` (simulates a hang). */
	loadTimeout?: boolean;
}

/**
 * Install a fake `Worker` that emulates the Stockfish UCI protocol. Runs as
 * an init script, so it is in place before the app constructs any provider.
 * Only `/vendor/stockfish/*` worker URLs are intercepted; every other
 * `new Worker(...)` (e.g. Vite HMR in dev) falls through to the real one.
 */
async function installFakeStockfish(
	page: Page,
	config: FakeStockfishConfig = {}
): Promise<void> {
	await page.addInitScript(
		({ cfg, marker }) => {
			const win = window as unknown as Record<string, unknown>;
			win.__FAKE_STOCKFISH_CONFIG__ = cfg;
			win.__FAKE_STOCKFISH_CONSTRUCTED__ = 0;
			win.__FAKE_STOCKFISH_TERMINATED__ = 0;
			const RealWorker = window.Worker;

			class FakeStockfishWorker {
				onmessage: ((event: { data: string }) => void) | null = null;
				onerror: ((event: { message: string }) => void) | null = null;
				private moveIndex = 0;
				private readonly cfg: FakeStockfishConfig;

				constructor() {
					this.cfg =
						(win.__FAKE_STOCKFISH_CONFIG__ as FakeStockfishConfig) ?? {};
					win.__FAKE_STOCKFISH_CONSTRUCTED__ =
						(win.__FAKE_STOCKFISH_CONSTRUCTED__ as number) + 1;
				}

				private emit(line: string): void {
					setTimeout(() => this.onmessage?.({ data: line }), 0);
				}

				postMessage(command: string): void {
					const cmd = String(command).trim();
					if (cmd === 'uci') {
						if (this.cfg.loadError) {
							setTimeout(
								() => this.onerror?.({ message: 'fake stockfish load error' }),
								0
							);
							return;
						}
						if (this.cfg.loadTimeout) {
							return;
						}
						this.emit('id name FakeStockfish');
						if (this.cfg.advertiseSkillLevel !== false) {
							this.emit(
								'option name Skill Level type spin default 20 min 0 max 20'
							);
						}
						this.emit('uciok');
						return;
					}
					if (cmd === 'isready') {
						this.emit('readyok');
						return;
					}
					if (cmd.startsWith('go')) {
						const moves = this.cfg.bestmoves ?? ['e2e4'];
						const move =
							moves[this.moveIndex] ?? moves[moves.length - 1] ?? 'e2e4';
						this.moveIndex += 1;
						this.emit(`bestmove ${move}`);
						return;
					}
					// setoption / ucinewgame / position — no engine reply.
				}

				terminate(): void {
					win.__FAKE_STOCKFISH_TERMINATED__ =
						(win.__FAKE_STOCKFISH_TERMINATED__ as number) + 1;
				}
			}

			const WorkerProxy = function (
				this: unknown,
				url: string | URL,
				options?: unknown
			) {
				if (String(url).includes(marker)) {
					return new FakeStockfishWorker();
				}
				return new (RealWorker as unknown as new (
					u: string | URL,
					o?: unknown
				) => unknown)(url, options);
			} as unknown as typeof Worker;
			WorkerProxy.prototype = FakeStockfishWorker.prototype;
			window.Worker = WorkerProxy;
		},
		{ cfg: config, marker: STOCKFISH_ASSET_MARKER }
	);
}

/** Track every request to the Stockfish vendor assets for no-download asserts. */
function trackStockfishRequests(page: Page): string[] {
	const requests: string[] = [];
	page.on('request', request => {
		if (request.url().includes(STOCKFISH_ASSET_MARKER)) {
			requests.push(request.url());
		}
	});
	return requests;
}

async function readBoardOrientationSample(
	page: Page
): Promise<BoardOrientationSample> {
	return page.evaluate(() => {
		const board = document.querySelector('[data-testid="chess-board"]');
		const skeleton = document.querySelector(
			'[data-testid="board-loading-skeleton"]'
		);
		const firstSquare = board?.querySelector('button') ?? null;

		return {
			hasBoard: board != null,
			hasSkeleton: skeleton != null,
			firstSquareLabel: firstSquare?.getAttribute('aria-label') ?? null,
			firstSquareDisabled:
				firstSquare instanceof HTMLButtonElement ? firstSquare.disabled : null,
		};
	});
}

async function startBoardOrientationProbe(page: Page): Promise<void> {
	await page.evaluate(() => {
		type Probe = {
			samples: BoardOrientationSample[];
			observer: MutationObserver | null;
			sample: () => void;
		};
		const win = window as unknown as {
			__CHESS_BOARD_ORIENTATION_PROBE__?: Probe;
		};
		win.__CHESS_BOARD_ORIENTATION_PROBE__?.observer?.disconnect();

		const samples: BoardOrientationSample[] = [];
		const sample = () => {
			const board = document.querySelector('[data-testid="chess-board"]');
			const skeleton = document.querySelector(
				'[data-testid="board-loading-skeleton"]'
			);
			const firstSquare = board?.querySelector('button') ?? null;
			samples.push({
				hasBoard: board != null,
				hasSkeleton: skeleton != null,
				firstSquareLabel: firstSquare?.getAttribute('aria-label') ?? null,
				firstSquareDisabled:
					firstSquare instanceof HTMLButtonElement
						? firstSquare.disabled
						: null,
			});
		};

		const board = document.querySelector('[data-testid="chess-board"]');
		const observer = board ? new MutationObserver(sample) : null;
		observer?.observe(board!, {
			attributes: true,
			attributeFilter: ['aria-label', 'disabled'],
			childList: true,
			subtree: true,
		});

		win.__CHESS_BOARD_ORIENTATION_PROBE__ = {
			samples,
			observer,
			sample,
		};
	});
}

async function stopBoardOrientationProbe(
	page: Page
): Promise<BoardOrientationSample[]> {
	return page.evaluate(() => {
		const win = window as unknown as {
			__CHESS_BOARD_ORIENTATION_PROBE__?: {
				samples: BoardOrientationSample[];
				observer: MutationObserver | null;
				sample: () => void;
			};
		};
		const probe = win.__CHESS_BOARD_ORIENTATION_PROBE__;
		if (!probe) return [];

		probe.sample();
		probe.observer?.disconnect();
		delete win.__CHESS_BOARD_ORIENTATION_PROBE__;
		return probe.samples;
	});
}

/** Seed a signed-in user snapshot so auth resolves without a network fetch. */
async function seedAuthenticatedUser(page: Page): Promise<void> {
	await page.addInitScript(() => {
		(
			window as unknown as { __PROCYON_INITIAL_AUTH_USER__: unknown }
		).__PROCYON_INITIAL_AUTH_USER__ = {
			id: 'rival-e2e-user',
			email: 'rival-e2e@test.local',
			username: 'rivalTester',
		};
	});
}

/** Seed a persisted rival-kind preference before the app hydrates. */
async function seedRememberedRival(
	page: Page,
	kind: 'engine' | 'llm'
): Promise<void> {
	await page.addInitScript(
		({ storageKey, rememberedKind }) => {
			window.localStorage.setItem(
				storageKey,
				JSON.stringify({
					version: 1,
					lastRivalKind: rememberedKind,
					humanSideByRival: { engine: 'white', llm: 'white' },
				})
			);
		},
		{ storageKey: RIVAL_PREFERENCES_STORAGE_KEY, rememberedKind: kind }
	);
}

/** Force the engine capability preflight to report "unsupported". */
async function forceEngineUnsupported(page: Page): Promise<void> {
	await page.addInitScript(() => {
		// runEnginePreflight checks WebAssembly.validate; make it fail so the
		// cheap preflight resolves to unsupported without touching Worker.
		Object.defineProperty(window.WebAssembly, 'validate', {
			configurable: true,
			value: () => false,
		});
	});
}

/** Mock the AI-config endpoints so the LLM opponent resolves to "available". */
async function mockConfiguredLlm(page: Page): Promise<void> {
	await page.route('**/api/auth/session', async route => {
		await route.fulfill({
			status: 200,
			contentType: 'application/json',
			body: JSON.stringify({
				user: {
					id: 'rival-e2e-user',
					email: 'rival-e2e@test.local',
					username: 'rivalTester',
				},
			}),
		});
	});
	await page.route('**/api/ai-config', async route => {
		if (route.request().method() !== 'GET') return route.continue();
		await route.fulfill({
			status: 200,
			contentType: 'application/json',
			body: JSON.stringify({
				configurations: [
					{
						id: 'chess-config',
						provider: 'openai',
						modelName: 'gpt-4o-mini',
						gameVariant: 'chess',
						hasApiKey: true,
						isActive: true,
					},
				],
			}),
		});
	});
	await page.route('**/api/ai-config/*/full', async route => {
		await route.fulfill({
			status: 200,
			contentType: 'application/json',
			body: JSON.stringify({
				provider: 'openai',
				apiKey: 'sk-rival-e2e',
				modelName: 'gpt-4o-mini',
				gameVariant: 'chess',
			}),
		});
	});
}

async function mockOpenAIChessMove(
	page: Page
): Promise<MockedProviderRequest[]> {
	const requests: MockedProviderRequest[] = [];
	await page.route(
		'https://api.openai.com/v1/chat/completions',
		async route => {
			const request = route.request();
			const body = request.postDataJSON() as MockedProviderRequest['body'];
			requests.push({
				url: request.url(),
				method: request.method(),
				authorization: request.headers().authorization,
				body,
			});

			await route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify({
					choices: [
						{
							message: {
								content: JSON.stringify({
									move: { from: 'e7', to: 'e5' },
									reasoning: 'Mirror White in the center.',
									confidence: 87,
								}),
							},
						},
					],
				}),
			});
		}
	);

	return requests;
}

/** Locators shared across the journeys. */
const opponentRadio = (page: Page, name: RegExp | string) =>
	page.getByRole('radio', { name });
const startButton = (page: Page) =>
	page.getByRole('button', { name: '▶️ Start' });
const newGameButton = (page: Page) =>
	page.getByRole('button', { name: '🆕 New Game' });
const square = (page: Page, label: string) =>
	page.getByRole('button', { name: label });

/** Wait for client-side preference hydration to reveal the rival setup. */
async function waitForSetupResolved(page: Page): Promise<void> {
	await expect(page.getByRole('radiogroup', { name: /opponent/i })).toBeVisible(
		{ timeout: 20000 }
	);
}

test.describe('Chess rival — signed-out on-device engine journey', () => {
	test('starts a scripted engine game without eagerly downloading the WASM', async ({
		page,
	}) => {
		await installFakeStockfish(page, {
			// White (the rival) opens 1.e4, then answers …e5 with 2.Nf3.
			bestmoves: ['e2e4', 'g1f3'],
		});
		const stockfishRequests = trackStockfishRequests(page);

		await page.goto('/chess');
		const initialBoardSample = await readBoardOrientationSample(page);
		if (!initialBoardSample.hasBoard) {
			await expect(page.getByTestId('board-loading-skeleton')).toBeVisible();
		}
		await waitForSetupResolved(page);
		await expect(page.getByTestId('board-loading-skeleton')).toHaveCount(0);

		// (3) Engine is the default opponent for a signed-out visitor.
		const engine = opponentRadio(page, /On-device computer/i);
		await expect(engine).toBeChecked();

		// (2) No vendor asset request before Start, and no fake Worker built.
		expect(stockfishRequests).toHaveLength(0);
		expect(
			await page.evaluate(
				() =>
					(window as unknown as { __FAKE_STOCKFISH_CONSTRUCTED__: number })
						.__FAKE_STOCKFISH_CONSTRUCTED__
			)
		).toBe(0);

		// (4) Choose to play Black — the rival (White) then moves first.
		await startBoardOrientationProbe(page);
		await opponentRadio(page, 'Black').click();
		await expect(opponentRadio(page, 'Black')).toBeChecked();
		await expect(
			page.getByText(/On-device computer · Computer plays White · Unrated/i)
		).toBeVisible();

		// (5) Orientation resolves to the chosen side (Black on the bottom):
		// the first rendered square is the White back rank (Square 7-7). No
		// interactive White-oriented board ever mounts (skeleton gates it).
		await expect
			.poll(async () =>
				page
					.getByTestId('chess-board')
					.getByRole('button')
					.first()
					.getAttribute('aria-label')
			)
			.toBe('Square 7-7');
		const blackSelectionSamples = await stopBoardOrientationProbe(page);
		expect(
			blackSelectionSamples.filter(
				sample =>
					sample.hasBoard &&
					sample.firstSquareLabel === 'Square 0-0' &&
					sample.firstSquareDisabled === false
			),
			`Black-side selection samples: ${JSON.stringify(blackSelectionSamples)}`
		).toHaveLength(0);
		expect(
			blackSelectionSamples.find(sample => sample.hasBoard)?.firstSquareLabel
		).toBe('Square 7-7');

		// Still nothing downloaded / constructed right before Start.
		expect(stockfishRequests).toHaveLength(0);

		// (6) Start the engine session.
		await startButton(page).click();

		// (7) The engine-specific loading label appears on the Start control.
		await expect(
			page.getByRole('button', { name: '⏳ Loading on-device computer…' })
		).toBeVisible({ timeout: 15000 });

		// Once the fake engine is ready the New Game control replaces Start.
		await expect(newGameButton(page)).toBeVisible({ timeout: 15000 });

		// (8) Session locks the setup controls.
		await expect(opponentRadio(page, 'White')).toBeDisabled();
		await expect(opponentRadio(page, /On-device computer/i)).toBeDisabled();
		await expect(
			page.getByText(
				/Finish or reset the current game to change your opponent/i
			)
		).toBeVisible();

		// Exactly one fake Worker was constructed — only after Start.
		expect(
			await page.evaluate(
				() =>
					(window as unknown as { __FAKE_STOCKFISH_CONSTRUCTED__: number })
						.__FAKE_STOCKFISH_CONSTRUCTED__
			)
		).toBe(1);

		// (9) The rival (White) makes the first move: 1.e4 → e4 holds a white
		// pawn (♙) and e2 is now empty.
		await expect(square(page, 'Square 4-4')).toContainText('♙', {
			timeout: 15000,
		});
		await expect(square(page, 'Square 6-4')).not.toContainText('♙');

		// (10) The human (Black) reply works: e7 → e5 places a black pawn (♟).
		await square(page, 'Square 1-4').click();
		await square(page, 'Square 3-4').click();
		await expect(square(page, 'Square 3-4')).toContainText('♟');

		// (11) New Game unlocks the setup and disposes the engine provider.
		await newGameButton(page).click();
		await expect(startButton(page)).toBeVisible();
		await expect(opponentRadio(page, 'White')).toBeEnabled();
		await expect(opponentRadio(page, /On-device computer/i)).toBeEnabled();
		expect(
			await page.evaluate(
				() =>
					(window as unknown as { __FAKE_STOCKFISH_TERMINATED__: number })
						.__FAKE_STOCKFISH_TERMINATED__
			)
		).toBeGreaterThanOrEqual(1);

		// Real vendor assets were never requested during the whole journey.
		expect(stockfishRequests).toHaveLength(0);
	});
});

test.describe('Chess rival — configured language-model journey', () => {
	test('resolves a configured user to the LLM and starts without touching Stockfish', async ({
		page,
	}) => {
		await installFakeStockfish(page);
		await seedAuthenticatedUser(page);
		await mockConfiguredLlm(page);
		const llmProviderRequests = await mockOpenAIChessMove(page);
		const stockfishRequests = trackStockfishRequests(page);

		await page.goto('/chess');
		await waitForSetupResolved(page);

		// A configured, untouched user resolves to the language model.
		await expect(opponentRadio(page, /Language model/i)).toBeChecked({
			timeout: 20000,
		});
		await expect(
			page.getByText(/Language model · gpt-4o-mini · Computer plays Black/i)
		).toBeVisible();

		// The LLM opponent surfaces the prompt-oriented debug/export tools.
		await expect(
			page.getByRole('button', { name: /Debug Mode/i })
		).toBeVisible();

		// Start uses the existing LLM path (no engine Worker constructed) and
		// commits the session (human White → human to move first).
		await startButton(page).click();
		await expect(newGameButton(page)).toBeVisible({ timeout: 15000 });
		const exportButton = page.getByRole('button', { name: /Export Game/i });
		await expect(exportButton).toBeVisible();
		await expect(opponentRadio(page, /Language model/i)).toBeDisabled();
		expect(
			await page.evaluate(
				() =>
					(window as unknown as { __FAKE_STOCKFISH_CONSTRUCTED__: number })
						.__FAKE_STOCKFISH_CONSTRUCTED__
			)
		).toBe(0);

		// Exercise the real LLM provider request path after Start: the human
		// opens 1.e4, then the mocked OpenAI response returns ...e5.
		await square(page, 'Square 6-4').click();
		await square(page, 'Square 4-4').click();
		await expect(square(page, 'Square 4-4')).toContainText('♙');
		await expect
			.poll(() => llmProviderRequests.length, { timeout: 15000 })
			.toBe(1);
		await expect(square(page, 'Square 3-4')).toContainText('♟', {
			timeout: 15000,
		});
		const [llmRequest] = llmProviderRequests;
		expect(llmRequest?.url).toBe('https://api.openai.com/v1/chat/completions');
		expect(llmRequest?.method).toBe('POST');
		expect(llmRequest?.authorization).toBe('Bearer sk-rival-e2e');
		expect(llmRequest?.body.model).toBe('gpt-4o-mini');
		expect(llmRequest?.body.messages?.[0]?.content).toContain(
			'You are the chess-playing AI for black'
		);
		await expect(exportButton).toBeVisible();

		const downloadPromise = page.waitForEvent('download');
		await exportButton.click();
		const download = await downloadPromise;
		expect(download.suggestedFilename()).toMatch(
			/^chess-game-\d{4}-\d{2}-\d{2}\.txt$/
		);
		const downloadPath = await download.path();
		expect(downloadPath).toBeTruthy();
		const exportText = await readFile(downloadPath!, 'utf8');
		expect(exportText).toContain('Provider: openai');
		expect(exportText).toContain('Model: gpt-4o-mini');
		expect(exportText).toContain('Move: e7 → e5');
		expect(exportText).toContain('AI RAW RESPONSE:');

		// Reset and switch to the engine before Start — a clean, interactive
		// human-vs-AI preview appears (human White → human to move).
		await newGameButton(page).click();
		await expect(startButton(page)).toBeVisible();
		await opponentRadio(page, /On-device computer/i).click();
		await expect(opponentRadio(page, /On-device computer/i)).toBeChecked();
		await expect(
			page.getByText(/On-device computer · Computer plays Black · Unrated/i)
		).toBeVisible();
		await expect(square(page, 'Square 6-4')).toBeEnabled();

		// No engine assets requested and no Worker built by any preview switch.
		expect(stockfishRequests).toHaveLength(0);
		expect(
			await page.evaluate(
				() =>
					(window as unknown as { __FAKE_STOCKFISH_CONSTRUCTED__: number })
						.__FAKE_STOCKFISH_CONSTRUCTED__
			)
		).toBe(0);
	});
});

test.describe('Chess rival — failure & fallback journeys', () => {
	test('unsupported engine preflight surfaces actionable copy and a manual LLM choice', async ({
		page,
	}) => {
		await forceEngineUnsupported(page);
		const stockfishRequests = trackStockfishRequests(page);

		await page.goto('/chess');
		await waitForSetupResolved(page);

		// The engine card reports it is unavailable with the actionable copy.
		// The message appears in both the opponent card status and the engine
		// details panel; asserting the panel header + its copy is enough.
		await expect(page.getByText('Engine unavailable')).toBeVisible();
		await expect(
			page
				.getByText(
					/This device cannot run the local chess engine\. Choose a language-model opponent instead\./i
				)
				.first()
		).toBeVisible();

		// Start is blocked while the unsupported engine is selected.
		await expect(startButton(page)).toBeDisabled();

		// The player can still manually pick the language model.
		await opponentRadio(page, /Language model/i).click();
		await expect(opponentRadio(page, /Language model/i)).toBeChecked();

		expect(stockfishRequests).toHaveLength(0);
	});

	test('engine load failure shows the load-failed copy and a Try again affordance', async ({
		page,
	}) => {
		await installFakeStockfish(page, { loadError: true });

		await page.goto('/chess');
		await waitForSetupResolved(page);

		await expect(opponentRadio(page, /On-device computer/i)).toBeChecked();
		await startButton(page).click();

		// The failed handshake rejects Start → load-failed copy + Try again.
		await expect(page.getByText('Engine load failed')).toBeVisible({
			timeout: 15000,
		});
		await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible();
		// The Start control returns (the game never committed).
		await expect(startButton(page)).toBeVisible();
	});

	test('remembered engine that is unsupported falls back to a usable LLM with a notice', async ({
		page,
	}) => {
		await seedRememberedRival(page, 'engine');
		await seedAuthenticatedUser(page);
		await mockConfiguredLlm(page);
		await forceEngineUnsupported(page);

		await page.goto('/chess');
		await waitForSetupResolved(page);

		await expect(opponentRadio(page, /Language model/i)).toBeChecked({
			timeout: 20000,
		});
		const notice = page.getByRole('status');
		await expect(notice).toContainText(
			/on-device computer is unavailable on this device, so a language-model opponent was selected/i
		);
	});

	test('remembered LLM that is unavailable falls back to the supported engine with a notice', async ({
		page,
	}) => {
		await installFakeStockfish(page);
		await seedRememberedRival(page, 'llm');
		// Signed-out: the LLM is confirmed unusable (signed-out), engine ok.

		await page.goto('/chess');
		await waitForSetupResolved(page);

		await expect(opponentRadio(page, /On-device computer/i)).toBeChecked();
		const notice = page.getByRole('status');
		await expect(notice).toContainText(
			/language-model opponent is unavailable, so the on-device computer was selected/i
		);
	});

	test('an explicit unusable opponent choice is not auto-overridden', async ({
		page,
	}) => {
		await installFakeStockfish(page);
		// Signed-out visitor: the LLM is unusable, the engine is supported.

		await page.goto('/chess');
		await waitForSetupResolved(page);

		// Explicitly select the (unusable) language model.
		await opponentRadio(page, /Language model/i).click();
		await expect(opponentRadio(page, /Language model/i)).toBeChecked();

		// The explicit choice sticks — it is NOT auto-switched back to engine,
		// and no auto-fallback notice is shown.
		await expect(page.getByRole('status')).toHaveCount(0);
		await expect(opponentRadio(page, /On-device computer/i)).not.toBeChecked();

		// Start stays blocked with the unusable-LLM guidance.
		await expect(startButton(page)).toBeDisabled();
	});
});
