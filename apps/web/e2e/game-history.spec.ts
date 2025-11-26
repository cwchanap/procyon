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

	test.afterEach(async () => {
		await authHelper.logout();
	});

	test('should save play history for all game variants via debug controls', async ({
		page,
	}) => {
		const finishGameWithDebugWin = async (path: string) => {
			await page.goto(path);

			// Ensure the game controls are rendered
			const startButton = page.getByRole('button', { name: '▶️ Start' });
			await expect(startButton).toBeVisible();

			// Wait for the debug win helper to be registered on window for this game
			await page.waitForFunction(currentPath => {
				const global = window as unknown as Record<string, unknown>;
				const helperNames: Record<string, string> = {
					'/chess': '__PROCYON_DEBUG_CHESS_TRIGGER_WIN__',
					'/shogi': '__PROCYON_DEBUG_SHOGI_TRIGGER_WIN__',
					'/xiangqi': '__PROCYON_DEBUG_XIANGQI_TRIGGER_WIN__',
					'/jungle': '__PROCYON_DEBUG_JUNGLE_TRIGGER_WIN__',
				};
				const helperName = helperNames[currentPath];
				if (!helperName) return false;
				const helper = global[helperName];
				return typeof helper === 'function';
			}, path);

			// Start the game
			await startButton.click();

			// Force a win via global helpers exposed by each game component
			await page.evaluate(currentPath => {
				const global = window as unknown as Record<string, unknown>;
				const helperNames: Record<string, string> = {
					'/chess': '__PROCYON_DEBUG_CHESS_TRIGGER_WIN__',
					'/shogi': '__PROCYON_DEBUG_SHOGI_TRIGGER_WIN__',
					'/xiangqi': '__PROCYON_DEBUG_XIANGQI_TRIGGER_WIN__',
					'/jungle': '__PROCYON_DEBUG_JUNGLE_TRIGGER_WIN__',
				};
				const helperName = helperNames[currentPath];
				const helper = helperName
					? (global[helperName] as (() => void) | undefined)
					: undefined;
				if (typeof helper === 'function') {
					helper();
				}
			}, path);

			// Game should now be over and offer a Play Again button
			await expect(
				page.getByRole('button', { name: '🎮 Play Again' })
			).toBeVisible();
		};

		// Complete one AI game for each variant using the debug win control
		await finishGameWithDebugWin('/chess');
		await finishGameWithDebugWin('/shogi');
		await finishGameWithDebugWin('/xiangqi');
		await finishGameWithDebugWin('/jungle');

		// Verify that play history shows four entries for this user
		await page.goto('/play-history');
		await expect(
			page.getByRole('heading', { name: 'Play History' })
		).toBeVisible();

		const rows = page.locator('table tbody tr');
		await expect(rows).toHaveCount(4);

		// Known variant labels from PlayHistoryPage
		await expect(page.getByText('Classical Chess')).toBeVisible();
		await expect(page.getByText('Shogi')).toBeVisible();
		await expect(page.getByText('Xiangqi')).toBeVisible();
	});
});
