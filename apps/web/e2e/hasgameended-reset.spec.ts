import { test, expect } from '@playwright/test';
import { AuthHelper } from './utils/auth-helpers';
import type { TestUser } from './utils/auth-helpers';

test.describe('hasGameEnded reset flow', () => {
	let authHelper: AuthHelper;
	let testUser: TestUser;

	test.beforeEach(async ({ page }) => {
		authHelper = new AuthHelper(page);
		testUser = AuthHelper.generateTestUser();

		await authHelper.register(testUser);
		// Give the auth client time to hydrate session state across the app
		await page.waitForTimeout(2000);
		await page.waitForTimeout(500); // wait briefly for auth state to settle
	});

	test.afterEach(async () => {
		await authHelper.logout();
	});

	test('should save history for multiple chess games after mode switches', async ({
		page,
	}) => {
		await page.goto('/chess');

		// Ensure game controls are present
		const startButton = page.getByRole('button', { name: '▶️ Start' });
		await expect(startButton).toBeVisible();

		// Enable debug controls by simulating Shift+D at window level
		await page.evaluate(() => {
			window.dispatchEvent(
				new KeyboardEvent('keydown', { key: 'D', shiftKey: true })
			);
		});

		// --- First game ---
		await startButton.click();

		// Finish first game with debug win via dev-only global helper
		await page.waitForFunction(() => {
			const global = window as unknown as {
				__PROCYON_DEBUG_CHESS_TRIGGER_WIN__?: () => void;
			};
			return typeof global.__PROCYON_DEBUG_CHESS_TRIGGER_WIN__ === 'function';
		});
		await page.evaluate(() => {
			const global = window as unknown as {
				__PROCYON_DEBUG_CHESS_TRIGGER_WIN__?: () => void;
			};
			if (typeof global.__PROCYON_DEBUG_CHESS_TRIGGER_WIN__ === 'function') {
				global.__PROCYON_DEBUG_CHESS_TRIGGER_WIN__();
			} else {
				throw new Error('Chess debug win helper is not available');
			}
		});

		// Game is over; Play Again should be available
		const playAgainButton = page.getByRole('button', { name: '🎮 Play Again' });
		await expect(playAgainButton).toBeVisible();

		// Reset back to a fresh state
		await playAgainButton.click();

		// Switch to tutorial mode
		const tutorialModeButton = page.getByRole('button', {
			name: '📚 Tutorial Mode',
		});
		await expect(tutorialModeButton).toBeVisible();
		await tutorialModeButton.click();

		// Switch back to AI mode via AI Settings (which activates AI mode when not active)
		const aiSettingsButton = page.getByRole('button', {
			name: '⚙️ AI Settings',
		});
		await expect(aiSettingsButton).toBeVisible();
		await aiSettingsButton.click();

		// Close the AI settings dialog so we can interact with the board and controls again
		const closeButton = page.getByRole('button', { name: 'Close' });
		await expect(closeButton).toBeVisible();
		await closeButton.click();

		// --- Second game after mode switches ---
		await startButton.click();

		// Finish second game with debug win via dev-only global helper
		await page.evaluate(() => {
			const global = window as unknown as {
				__PROCYON_DEBUG_CHESS_TRIGGER_WIN__?: () => void;
			};
			if (typeof global.__PROCYON_DEBUG_CHESS_TRIGGER_WIN__ === 'function') {
				global.__PROCYON_DEBUG_CHESS_TRIGGER_WIN__();
			} else {
				throw new Error('Chess debug win helper is not available');
			}
		});

		// Verify that both games were recorded in play history, confirming hasGameEnded was reset
		await page.goto('/play-history');
		await expect(
			page.getByRole('heading', { name: 'Play History' })
		).toBeVisible();

		const rows = page.locator('table tbody tr');
		await expect(rows).toHaveCount(2);
		await expect(page.getByText('Classical Chess')).toBeVisible();
	});
});
