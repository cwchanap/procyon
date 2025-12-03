import { test, expect } from '@playwright/test';

test.describe('Homepage', () => {
	test('should load the homepage successfully', async ({ page }) => {
		await page.goto('/');

		await expect(page).toHaveTitle('Chess Games');
		await expect(
			page.getByRole('heading', { name: 'Procyon Chess' })
		).toBeVisible();
		await expect(
			page.getByText('Experience chess like never before')
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
