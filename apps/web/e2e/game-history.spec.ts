import { test, expect } from '@playwright/test';
import { AuthHelper } from './utils/auth-helpers';
import type { TestUser } from './utils/auth-helpers';

test.describe('Game history saving flow', () => {
	let authHelper: AuthHelper;
	let testUser: TestUser;

	test.beforeEach(async ({ page }) => {
		authHelper = new AuthHelper(page);
		testUser = AuthHelper.generateTestUser();

		await authHelper.register(testUser);
		// Give the auth client time to hydrate session state across the app
		await page.waitForTimeout(2000);
		await page.waitForTimeout(1000); // wait briefly for auth state to settle
	});

	// Note: We intentionally skip logout here to avoid flakiness from
	// Playwright internal fixture timeouts. Each test uses a fresh
	// browser context and registers a unique user.
	test.afterEach(async () => {});

	test('should save play history for all game variants via debug controls', async ({
		page,
	}) => {
		const finishGameWithDebugWin = async (
			path: string,
			helperName: string,
			saveCounterName: string
		) => {
			await page.goto(path);

			// Ensure the game controls are rendered
			const startButton = page.getByRole('button', { name: '▶️ Start' });
			await expect(startButton).toBeVisible();

			// Start the game
			await startButton.click();

			// Wait for the dev-only global helper to be available
			await page.waitForFunction(name => {
				const global = window as unknown as Record<string, unknown>;
				const fn = global[name as keyof typeof global];
				return typeof fn === 'function';
			}, helperName);

			// Use the helper to force a human win
			await page.evaluate(name => {
				const global = window as unknown as Record<string, unknown>;
				const fn = global[name as keyof typeof global];
				if (typeof fn === 'function') {
					(fn as () => void)();
				} else {
					throw new Error(`Debug helper ${name} is not available`);
				}
			}, helperName);

			// Game should now be over and offer a Play Again button
			await expect(
				page.getByRole('button', { name: '🎮 Play Again' })
			).toBeVisible();

			// Verify the per-variant debug save counter incremented once
			const saveCount = await page.evaluate(name => {
				const global = window as unknown as Record<string, unknown>;
				const value = global[name as keyof typeof global];
				return typeof value === 'number' ? (value as number) : 0;
			}, saveCounterName);
			await expect(saveCount).toBe(1);
		};

		// Complete one AI game for each variant using the dev-only debug helpers
		await finishGameWithDebugWin(
			'/chess',
			'__PROCYON_DEBUG_CHESS_TRIGGER_WIN__',
			'__PROCYON_DEBUG_CHESS_SAVE_COUNT__'
		);
		await finishGameWithDebugWin(
			'/shogi',
			'__PROCYON_DEBUG_SHOGI_TRIGGER_WIN__',
			'__PROCYON_DEBUG_SHOGI_SAVE_COUNT__'
		);
		await finishGameWithDebugWin(
			'/xiangqi',
			'__PROCYON_DEBUG_XIANGQI_TRIGGER_WIN__',
			'__PROCYON_DEBUG_XIANGQI_SAVE_COUNT__'
		);
		await finishGameWithDebugWin(
			'/jungle',
			'__PROCYON_DEBUG_JUNGLE_TRIGGER_WIN__',
			'__PROCYON_DEBUG_JUNGLE_SAVE_COUNT__'
		);

		// Basic sanity check that the Play History page is accessible while
		// authenticated. The detailed per-variant save behavior is verified
		// via the debug counters above.
		await page.goto('/play-history');
		await expect(
			page.getByRole('heading', { name: 'Play History' })
		).toBeVisible();
	});
});
