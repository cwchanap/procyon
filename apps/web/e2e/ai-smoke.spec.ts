import { test, expect } from '@playwright/test';

/**
 * Mocked-AI smoke test: verifies the full service → adapter → guardian →
 * engine round-trip in a real browser. Unit tests cover each layer in
 * isolation (service.extended.test.ts mocks fetch; adapter/guardian tests
 * cover move generation and validation), but no unit test exercises the
 * React component wiring, AI config store hydration, and game-state
 * application together.
 *
 * Shogi is chosen because its component exposes __PROCYON_DEBUG_SHOGI_STATE__
 * (currentPlayer/status) for assertion, and its AI-side selector lets the
 * AI play first (sente), so the mocked move fires without a preceding human
 * move.
 *
 * All external calls are mocked via page.route — no running API server or
 * AI provider is required. The /auth/session endpoint is mocked to return
 * an authenticated user so the AI config store hydrates.
 */
test.describe('Mocked-AI smoke test (shogi)', () => {
	test.beforeEach(async ({ page }) => {
		// --- Route mocks (set up before navigation) ---

		// 1. Auth session — return an authenticated user so useAuth reports
		//    isAuthenticated=true, revalidated=true, which gates AI config
		//    hydration.
		await page.route('**/api/auth/session', async route => {
			if (route.request().method() !== 'GET') {
				return route.continue();
			}
			await route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify({
					user: {
						id: 'smoke-test-user',
						email: 'smoke@test.local',
						username: 'smoke-tester',
					},
				}),
			});
		});

		// 2. AI config list — return one active, keyed config.
		await page.route('**/api/ai-config', async route => {
			if (route.request().method() !== 'GET') {
				return route.continue();
			}
			await route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify({
					configurations: [
						{
							id: 'test-config',
							provider: 'gemini',
							modelName: 'gemini-2.5-flash-lite',
							gameVariant: 'shogi',
							hasApiKey: true,
							isActive: true,
						},
					],
				}),
			});
		});

		// 3. Full config — return the API key so hydration enables the AI.
		await page.route('**/api/ai-config/*/full', async route => {
			await route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify({
					provider: 'gemini',
					apiKey: 'test-api-key-smoke',
					modelName: 'gemini-2.5-flash-lite',
					gameVariant: 'shogi',
				}),
			});
		});

		// 4. Gemini API — return a valid opening move (P-7f: pawn 7g → 7f).
		//    Sente pawn at row 6, col 2 (file '7', rank 'g') advances to
		//    row 5, col 2 (file '7', rank 'f').
		await page.route('**/generativelanguage.googleapis.com/**', async route => {
			await route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify({
					candidates: [
						{
							finishReason: 'STOP',
							content: {
								parts: [
									{
										text: JSON.stringify({
											move: { from: '7g', to: '7f' },
											reasoning: 'Opening pawn push to 7f.',
											confidence: 90,
										}),
									},
								],
							},
						},
					],
				}),
			});
		});
	});

	test('AI move applies to the board via service → adapter → guardian → engine', async ({
		page,
	}) => {
		await page.goto('/shogi');

		// Wait for the debug state global to be exposed.
		await page.waitForFunction(() => {
			const global = window as unknown as Record<string, unknown>;
			return !!global.__PROCYON_DEBUG_SHOGI_STATE__;
		});

		// Switch AI to sente so the AI moves first.
		const sideSelect = page.locator('#shogi-ai-side');
		await expect(sideSelect).toBeVisible();
		await sideSelect.selectOption('sente');
		await expect(sideSelect).toHaveValue('sente');

		// Wait for the Start button to be enabled (AI config hydrated +
		// auth revalidated). aiStarting disables Start until both complete.
		const startButton = page.getByRole('button', { name: '▶️ Start' });
		await expect(startButton).toBeEnabled({ timeout: 15000 });

		// Start the game.
		await startButton.click();

		// Wait for the game to register as started with sente to move.
		await page.waitForFunction(() => {
			const global = window as unknown as Record<string, unknown>;
			const state = global.__PROCYON_DEBUG_SHOGI_STATE__ as
				| { hasGameStarted: boolean; gameMode: string; currentPlayer: string }
				| undefined;
			return (
				state &&
				state.hasGameStarted === true &&
				state.gameMode === 'ai' &&
				state.currentPlayer === 'sente'
			);
		});

		// The AI move effect fires after a 1s setTimeout, then the mocked
		// Gemini response is parsed, guardian-validated, and applied via
		// applyShogiAIMoveResponse. After the move, currentPlayer flips
		// from 'sente' to 'gote'.
		await page.waitForFunction(
			() => {
				const global = window as unknown as Record<string, unknown>;
				const state = global.__PROCYON_DEBUG_SHOGI_STATE__ as
					| { currentPlayer: string }
					| undefined;
				return state?.currentPlayer === 'gote';
			},
			{},
			{ timeout: 20000 }
		);

		// Verify the move was applied: current player is now gote (human).
		const state = await page.evaluate(() => {
			const global = window as unknown as Record<string, unknown>;
			return global.__PROCYON_DEBUG_SHOGI_STATE__ as {
				currentPlayer: string;
				status: string;
			};
		});
		expect(state.currentPlayer).toBe('gote');
		expect(state.status).toBe('playing');
	});
});
