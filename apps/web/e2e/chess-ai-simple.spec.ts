import { test, expect } from '@playwright/test';

test.describe.skip('Chess AI Integration - Core Functionality', () => {
	test.beforeEach(async ({ page }) => {
		await page.goto('/chess');
	});

	test('should enable and configure AI opponent', async ({ page }) => {
		// Check that the AI configuration panel exists
		await expect(page.getByText('AI Opponent')).toBeVisible();

		// Initially AI should be disabled
		await expect(page.getByText('Disabled')).toBeVisible();

		// Enable AI
		await page.getByRole('checkbox', { name: 'Enable AI' }).check();

		// Should show default configuration
		await expect(page.getByText(/Google Gemini/)).toBeVisible();
		await expect(page.getByText('API key required')).toBeVisible();

		// Expand AI configuration
		await page.getByRole('button', { name: '▼' }).click();

		// Enter API key
		await page
			.getByPlaceholder(/Enter your.*API key/)
			.fill('test-api-key-12345');

		// Save configuration
		await page.getByRole('button', { name: 'Save Configuration' }).click();

		// Check status changed to ready
		await expect(page.getByText('Ready to play')).toBeVisible();

		// AI game modes should now be enabled
		await expect(
			page.getByRole('button', { name: /Human vs AI/ })
		).toBeEnabled();
		await expect(
			page.getByRole('button', { name: /AI vs Human/ })
		).toBeEnabled();
	});

	test('should switch between AI providers', async ({ page }) => {
		// Enable AI and expand configuration
		await page.getByRole('checkbox', { name: 'Enable AI' }).check();
		await page.getByRole('button', { name: '▼' }).click();

		// Check provider selection is visible
		await expect(page.getByText('AI Provider')).toBeVisible();

		// Switch to OpenRouter
		await page.getByRole('button', { name: /OpenRouter/ }).click();

		// Check that provider switched (look for OpenRouter text)
		await expect(page.getByText(/OpenRouter/)).toBeVisible();

		// Enter API key and save
		await page.getByPlaceholder(/OpenRouter API key/).fill('test-key');
		await page.getByRole('button', { name: 'Save Configuration' }).click();

		// Should show OpenRouter configuration
		await expect(page.getByText(/OpenRouter/)).toBeVisible();
	});

	test('should start AI game mode successfully', async ({ page }) => {
		// Configure AI
		await page.getByRole('checkbox', { name: 'Enable AI' }).check();
		await page.getByRole('button', { name: '▼' }).click();
		await page.getByPlaceholder(/Enter your.*API key/).fill('test-key');
		await page.getByRole('button', { name: 'Save Configuration' }).click();

		// Start Human vs AI game
		await page.getByRole('button', { name: /Human vs AI/ }).click();

		// Check game status shows correct turn
		await expect(page.getByText('White to move')).toBeVisible();

		// Check basic chess elements are present
		await expect(page.getByText('♙')).toBeVisible(); // White pieces
		await expect(page.getByText('♟')).toBeVisible(); // Black pieces

		// Check AI information is displayed
		await expect(page.getByText(/Playing against/)).toBeVisible();
	});
});
