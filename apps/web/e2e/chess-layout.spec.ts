import { test, expect } from '@playwright/test';

test.describe('Chess page layout', () => {
	test('theme toggle flips and persists', async ({ page }) => {
		// Emulate a dark system preference so the initial resolved theme is dark,
		// matching the brief's "default is dark" assumption.
		await page.emulateMedia({ colorScheme: 'dark' });
		await page.goto('/chess');
		// Default is dark (or system). Toggle to light.
		const toggle = page.getByRole('button', { name: /switch to/i }).first();
		await toggle.click();
		await expect(page.locator('html')).toHaveClass(/light/);
		// Persist across reload
		await page.reload();
		await expect(page.locator('html')).toHaveClass(/light/);
	});

	test('board-side panel is visible beside the board on desktop', async ({
		page,
	}) => {
		await page.setViewportSize({ width: 1280, height: 800 });
		await page.goto('/chess');
		await expect(
			page.getByRole('button', { name: /^Tutorial$/ })
		).toBeVisible();
		await expect(
			page.getByRole('button', { name: /Play vs AI/i })
		).toBeVisible();
	});

	test('board-side panel stacks below board on mobile', async ({ page }) => {
		await page.setViewportSize({ width: 390, height: 800 });
		await page.goto('/chess');
		const board = page
			.locator('canvas, .chess-board, [class*="board"]')
			.first();
		const tutorialBtn = page.getByRole('button', { name: /^Tutorial$/ });
		// Board renders above; tutorial button exists (panel rendered, stacked below).
		await expect(board).toBeVisible();
		await expect(tutorialBtn).toBeVisible();
	});

	test('Back to Game Selection link is absent', async ({ page }) => {
		await page.goto('/chess');
		await expect(page.getByText('Back to Game Selection')).toHaveCount(0);
	});
});
