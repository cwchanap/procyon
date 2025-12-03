import { test, expect } from '@playwright/test';

test.describe.skip('Chess AI Integration', () => {
	test.beforeEach(async ({ page }) => {
		await page.goto('/chess');
	});

	test('should display AI configuration panel and handle provider switching', async ({
		page,
	}) => {
		// Check that the AI configuration panel exists
		await expect(page.getByText('AI Opponent')).toBeVisible();

		// Initially AI should be disabled
		await expect(page.getByText('Disabled')).toBeVisible();

		// Enable AI
		await page.getByRole('checkbox', { name: 'Enable AI' }).check();

		// Should show default Gemini configuration
		await expect(
			page.getByText(/Google Gemini.*gemini-2\.5-flash-lite/)
		).toBeVisible();
		await expect(page.getByText('API key required')).toBeVisible();

		// Expand AI configuration
		await page.getByRole('button', { name: '▼' }).click();

		// Check provider selection is visible
		await expect(page.getByText('AI Provider')).toBeVisible();
		await expect(
			page.getByRole('button', {
				name: 'Google Gemini gemini-2.5-flash-lite',
			})
		).toBeVisible();
		await expect(
			page.getByRole('button', { name: 'OpenRouter gpt-oss-120b' })
		).toBeVisible();

		// Switch to OpenRouter
		await page.getByRole('button', { name: 'OpenRouter gpt-oss-120b' }).click();

		// Check that provider switched
		await expect(page.getByText('OpenRouter - gpt-oss-120b')).toBeVisible();

		// Check model dropdown updated
		const modelSelect = page.locator('select').first();
		await expect(modelSelect).toBeVisible();
		await expect(
			modelSelect.locator('option[value="gpt-oss-120b"]')
		).toBeVisible();
		await expect(
			modelSelect.locator('option[value="claude-3-haiku"]')
		).toBeVisible();

		// Check API key field
		const apiKeyInput = page.getByPlaceholder('Enter your OpenRouter API key');
		await expect(apiKeyInput).toBeVisible();
		await expect(apiKeyInput).toHaveAttribute('type', 'password');
	});

	test('should enable AI game modes after configuring API key', async ({
		page,
	}) => {
		// Initially AI game modes should be disabled
		await expect(
			page.getByRole('button', { name: /Human vs AI/ })
		).toBeDisabled();
		await expect(
			page.getByRole('button', { name: /AI vs Human/ })
		).toBeDisabled();

		// Enable AI
		await page.getByRole('checkbox', { name: 'Enable AI' }).check();

		// Expand configuration
		await page.getByRole('button', { name: '▼' }).click();

		// Enter test API key
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

	test('should display correct game mode states and AI information', async ({
		page,
	}) => {
		// Enable AI and configure
		await page.getByRole('checkbox', { name: 'Enable AI' }).check();
		await page.getByRole('button', { name: '▼' }).click();
		await page
			.getByPlaceholder(/Enter your.*API key/)
			.fill('test-api-key-12345');
		await page.getByRole('button', { name: 'Save Configuration' }).click();

		// Start Human vs AI game
		await page.getByRole('button', { name: /Human vs AI/ }).click();

		// Check game mode is selected
		await expect(page.getByRole('button', { name: /Human vs AI/ })).toHaveClass(
			/border-purple-400/
		);

		// Check AI opponent information is displayed
		await expect(page.getByText(/Playing against.*gemini/)).toBeVisible();

		// Check game status shows correct turn
		await expect(page.getByText('White to move')).toBeVisible();

		// Switch to AI vs Human mode
		await page.getByRole('button', { name: /AI vs Human/ }).click();

		// Check mode switched
		await expect(page.getByRole('button', { name: /AI vs Human/ })).toHaveClass(
			/border-pink-400/
		);
	});

	test('should handle provider model switching correctly', async ({ page }) => {
		// Enable AI and expand configuration
		await page.getByRole('checkbox', { name: 'Enable AI' }).check();
		await page.getByRole('button', { name: '▼' }).click();

		// Switch to OpenRouter
		await page.getByRole('button', { name: 'OpenRouter gpt-oss-120b' }).click();

		// Change model
		const modelSelect = page.locator('select').first();
		await modelSelect.selectOption('claude-3-haiku');

		// Add API key and save
		await page
			.getByPlaceholder('Enter your OpenRouter API key')
			.fill('test-key');
		await page.getByRole('button', { name: 'Save Configuration' }).click();

		// Check model updated in display
		await expect(page.getByText('OpenRouter - claude-3-haiku')).toBeVisible();

		// Switch back to Gemini
		await page.getByRole('button', { name: '▼' }).click();
		await page
			.getByRole('button', {
				name: 'Google Gemini gemini-2.5-flash-lite',
			})
			.click();

		// Change to different Gemini model
		await modelSelect.selectOption('gemini-1.5-pro');

		// Add API key and save
		await page
			.getByPlaceholder('Enter your Google Gemini API key')
			.fill('test-gemini-key');
		await page.getByRole('button', { name: 'Save Configuration' }).click();

		// Check configuration persisted
		await expect(
			page.getByText('Google Gemini - gemini-1.5-pro')
		).toBeVisible();
	});

	test('should display proper game instructions for AI modes', async ({
		page,
	}) => {
		// Configure AI
		await page.getByRole('checkbox', { name: 'Enable AI' }).check();
		await page.getByRole('button', { name: '▼' }).click();
		await page.getByPlaceholder(/Enter your.*API key/).fill('test-key');
		await page.getByRole('button', { name: 'Save Configuration' }).click();

		// Start Human vs AI game
		await page.getByRole('button', { name: /Human vs AI/ }).click();

		// Check basic game instructions are visible
		await expect(page.getByText('Click on a piece to select it')).toBeVisible();
		await expect(page.getByText('Possible moves')).toBeVisible();
		await expect(page.getByText('Captures')).toBeVisible();

		// Check AI-specific instructions
		await expect(page.getByText(/Playing against.*gemini/)).toBeVisible();
	});

	test('should handle AI configuration cancellation', async ({ page }) => {
		// Enable AI and expand configuration
		await page.getByRole('checkbox', { name: 'Enable AI' }).check();
		await page.getByRole('button', { name: '▼' }).click();

		// Make some changes
		await page.getByRole('button', { name: 'OpenRouter gpt-oss-120b' }).click();
		await page
			.getByPlaceholder('Enter your OpenRouter API key')
			.fill('test-key');

		// Cancel instead of saving
		await page.getByRole('button', { name: 'Cancel' }).click();

		// Should revert to original configuration
		await expect(
			page.getByText('Google Gemini - gemini-2.5-flash-lite')
		).toBeVisible();

		// Panel should be collapsed
		await expect(page.getByText('AI Provider')).not.toBeVisible();
	});

	test('should maintain chess board functionality with AI enabled', async ({
		page,
	}) => {
		// Configure AI
		await page.getByRole('checkbox', { name: 'Enable AI' }).check();
		await page.getByRole('button', { name: '▼' }).click();
		await page.getByPlaceholder(/Enter your.*API key/).fill('test-key');
		await page.getByRole('button', { name: 'Save Configuration' }).click();

		// Start Human vs AI game
		await page.getByRole('button', { name: /Human vs AI/ }).click();

		// Check chess board is visible and interactive
		await expect(page.locator('main')).toBeVisible();

		// Check pieces are visible
		await expect(page.getByText('♙')).toBeVisible(); // White pawn
		await expect(page.getByText('♟')).toBeVisible(); // Black pawn
		await expect(page.getByText('♔')).toBeVisible(); // White king
		await expect(page.getByText('♚')).toBeVisible(); // Black king

		// Test New Game button
		await page.getByRole('button', { name: '🆕 New Game' }).click();

		// Board should reset (pieces in starting positions)
		await expect(page.getByText('White to move')).toBeVisible();
	});
});
