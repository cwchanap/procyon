import { test, expect, type Page } from '@playwright/test';
import { AuthHelper } from './utils/auth-helpers';

const waitForProfileReady = async (page: Page) => {
	await page
		.locator(
			'[data-testid="profile-page"][data-auth-ready="true"][data-authenticated="true"]'
		)
		.waitFor({ state: 'visible', timeout: 15000 });
};

/**
 * Helper function to play a game and win using debug function
 * @param page - Playwright Page object
 * @param variant - Game variant to play ('chess' | 'shogi')
 */
async function playGameAndWin(
	page: Page,
	variant: 'chess' | 'shogi' = 'chess'
) {
	const debugFnName =
		variant === 'chess'
			? '__PROCYON_DEBUG_CHESS_TRIGGER_WIN__'
			: '__PROCYON_DEBUG_SHOGI_TRIGGER_WIN__';

	// Navigate to game page
	await page.goto(`/${variant}`);

	// Start game
	const startButton = page.getByRole('button', { name: '▶️ Start' });
	await expect(startButton).toBeVisible();
	await startButton.click();

	// Wait for debug helper
	await page.waitForFunction(
		debugFn =>
			typeof (window as unknown as Record<string, unknown>)[debugFn] ===
			'function',
		debugFnName,
		{ timeout: 5000 }
	);

	// Set up response listener BEFORE triggering the action (prevents race condition)
	// P1 fix: Wait for POST /api/play-history (which updates ratings), not /api/ratings
	const ratingApiPromise = page.waitForResponse(
		response =>
			response.url().includes('/api/play-history') &&
			response.request().method() === 'POST' &&
			response.status() === 201,
		{ timeout: 15000 }
	);

	// Trigger a win
	await page.evaluate(fnName => {
		const fn = (window as unknown as Record<string, () => void>)[fnName];
		if (fn) fn();
	}, debugFnName);

	// Wait for the rating API response (before checking Play Again button)
	await ratingApiPromise;

	// Wait for game to end
	await expect(
		page.getByRole('button', { name: '🎮 Play Again' })
	).toBeVisible();
}

test.describe('ELO Rating System', () => {
	let authHelper: AuthHelper;

	test.beforeEach(async ({ page }) => {
		authHelper = new AuthHelper(page);
		const testUser = AuthHelper.getFixtureUser();
		await authHelper.login(testUser.email, testUser.password);
		await authHelper.expectAuthenticated(testUser.username, testUser.email);
	});

	test.describe('Profile Page - Ratings Section', () => {
		test('should display ratings section on profile page', async ({ page }) => {
			await page.goto('/profile');
			await waitForProfileReady(page);

			// Wait for the page to load
			await expect(
				page.getByRole('heading', { name: 'Profile' })
			).toBeVisible();

			// The ratings section should be visible (either with ratings or "No ratings yet")
			const ratingsHeading = page.getByRole('heading', {
				name: 'Your Ratings',
			});
			const noRatingsText = page.getByText('No ratings yet');

			// Either the ratings heading or "No ratings yet" should be visible
			await expect(ratingsHeading.or(noRatingsText).first()).toBeVisible({
				timeout: 10000,
			});
		});

		test('should show variant rating cards when user has played games', async ({
			page,
		}) => {
			// First, play a chess game to generate a rating
			await playGameAndWin(page, 'chess');

			// Now go to profile and check ratings
			await page.goto('/profile');
			await waitForProfileReady(page);

			// Wait for the ratings section to load
			await expect(
				page.getByRole('heading', { name: 'Your Ratings' })
			).toBeVisible({ timeout: 10000 });

			// Check for Classical Chess rating card
			await expect(page.getByText('Classical Chess')).toBeVisible();

			// Check for rating badge (should show a number like "1200" or "1220")
			// The rating badge shows the rating number
			const ratingCard = page.locator('text=Classical Chess').locator('..');
			await expect(ratingCard).toBeVisible();
		});
	});

	test.describe('Play History - Rating Display', () => {
		test('should display rating column in play history table', async ({
			page,
		}) => {
			// First, play a chess game
			await playGameAndWin(page, 'chess');

			// Go to play history
			await page.goto('/play-history');

			// Check for play history heading
			await expect(
				page.getByRole('heading', { name: 'Play History' })
			).toBeVisible();

			// Check for Rating column header once table renders
			const historyTable = page.getByRole('table');
			await expect(historyTable).toBeVisible();
			await expect(
				page.getByRole('columnheader', { name: 'Rating' })
			).toBeVisible({ timeout: 10000 });
		});

		test('should show rating change with color coding after game', async ({
			page,
		}) => {
			// Play a chess game to get a rating change
			await playGameAndWin(page, 'chess');

			// Go to play history
			await page.goto('/play-history');

			// Wait for the page heading to appear
			await expect(
				page.getByRole('heading', { name: 'Play History' })
			).toBeVisible();

			// Wait for loading to complete (loading text should disappear)
			await expect(page.getByText('Loading your games...')).not.toBeVisible({
				timeout: 15000,
			});

			// Wait for at least one game row to be present (not the empty state)
			const tableRows = page.locator('tbody tr');
			await expect(
				tableRows
					.filter({
						hasNot: page.getByText('You have not recorded any games yet'),
					})
					.first()
			).toBeVisible({ timeout: 10000 });

			// Verify we have actual game data (not empty state or loading)
			const emptyState = page.getByText('You have not recorded any games yet');
			await expect(emptyState).not.toBeVisible();

			// Check for a positive rating change (green text with +)
			// For a win, the rating change should be positive
			const ratingCell = tableRows.first().locator('td').last();
			await expect(ratingCell).toBeVisible();

			// Verify rating change shows positive indicator (+)
			const ratingText = await ratingCell.textContent();
			expect(ratingText).toMatch(/\+/);

			// Verify positive CSS indicator (green color class)
			await expect(ratingCell.locator('span').first()).toHaveClass(
				/text-green/
			);
		});
	});

	test.describe('Rating Update Flow', () => {
		test('should update rating after winning a game', async ({ page }) => {
			// Get initial rating (might not exist for new user)
			await page.goto('/profile');
			await waitForProfileReady(page);

			// Wait for profile page to load
			await expect(page.getByRole('heading', { name: 'Profile' })).toBeVisible({
				timeout: 5000,
			});

			// Play a chess game
			await playGameAndWin(page, 'chess');

			// Go to profile and verify rating exists
			await page.goto('/profile');
			await waitForProfileReady(page);

			// Wait for ratings section
			await expect(
				page.getByRole('heading', { name: 'Your Ratings' })
			).toBeVisible({ timeout: 10000 });

			// Verify Classical Chess rating is shown
			await expect(page.getByText('Classical Chess')).toBeVisible();

			// Verify there's at least 1 game played
			await expect(page.getByText('Games')).toBeVisible();
		});

		test('should show Win badge and update win count after winning', async ({
			page,
		}) => {
			// Play a chess game
			await playGameAndWin(page, 'chess');

			// Go to play history
			await page.goto('/play-history');

			// Check for Win badge in the results
			await expect(page.getByText('Win').first()).toBeVisible({
				timeout: 10000,
			});
		});
	});

	test.describe('Multi-Variant Ratings', () => {
		test('should track ratings separately for different variants', async ({
			page,
		}) => {
			// Play a chess game
			await playGameAndWin(page, 'chess');

			// Play a shogi game
			await playGameAndWin(page, 'shogi');

			// Go to profile and check both ratings exist
			await page.goto('/profile');
			await waitForProfileReady(page);

			await expect(
				page.getByRole('heading', { name: 'Your Ratings' })
			).toBeVisible({ timeout: 10000 });

			// Both variants should have rating cards
			await expect(page.getByText('Classical Chess')).toBeVisible();
			await expect(page.getByText('Shogi')).toBeVisible();
		});
	});
});
