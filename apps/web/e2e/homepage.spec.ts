import { test, expect } from '@playwright/test';

test.describe('Homepage', () => {
	test('should load the homepage successfully', async ({ page }) => {
		await page.goto('/');

		await expect(page).toHaveTitle('Chess Games');
		await expect(
			page.getByRole('heading', { name: 'Procyon Chess' })
		).toBeVisible();
		await expect(
			page.getByText(
				'Five games. One board room. Play Chess, Xiangqi, Shogi, and Jungle'
			)
		).toBeVisible();
		await expect(
			page.getByText('Aeroplane Chess uses built-in local heuristic rivals.')
		).toBeVisible();
	});

	test('should display chess game options', async ({ page }) => {
		await page.goto('/');

		// Check for some of the chess variants
		await expect(
			page.getByRole('heading', { name: 'Standard Chess' })
		).toBeVisible();
		await expect(
			page.getByRole('heading', { name: 'Chinese Chess' })
		).toBeVisible();
		await expect(
			page.getByRole('heading', { name: 'Japanese Chess (Shogi)' })
		).toBeVisible();
	});
});
