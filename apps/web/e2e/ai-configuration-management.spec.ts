import { test, expect } from '@playwright/test';
import { AuthHelper, type TestUser } from './utils/auth-helpers';

test.describe.skip('AI Configuration Management', () => {
	let authHelper: AuthHelper;
	let testUser: TestUser;

	test.beforeEach(async ({ page }) => {
		authHelper = new AuthHelper(page);
		testUser = AuthHelper.generateTestUser();

		await authHelper.register(testUser);
		await authHelper.expectAuthenticated(testUser.username, testUser.email);

		// Navigate to profile page
		await page
			.getByRole('button', {
				name: new RegExp(`${testUser.username}.*${testUser.email}`),
			})
			.click();
		await page.getByRole('button', { name: 'Profile' }).click();
		await expect(page).toHaveURL('/profile');
	});

	test.afterEach(async () => {
		// Clean up - logout after each test
		await authHelper.logout();
	});

	test.describe('Set Active Configuration', () => {
		test.beforeEach(async ({ page }) => {
			// Create a test configuration first
			const modelDropdown = page.getByRole('combobox').nth(1);
			await modelDropdown.click();
			await page.getByRole('option', { name: 'Gemini 2.5 Pro' }).click();

			await page
				.getByRole('textbox', { name: 'Enter your API key' })
				.fill('test-gemini-key-123');
			await page.getByRole('button', { name: 'Save Configuration' }).click();
			await expect(
				page.getByText('✓ Configuration saved successfully')
			).toBeVisible();
		});

		test('should set configuration as active', async ({ page }) => {
			// Initially should show "Set Active" button
			const setActiveButton = page.getByRole('button', {
				name: 'Set Active',
			});
			await expect(setActiveButton).toBeVisible();

			// Click Set Active
			await setActiveButton.click();

			// Should show "Active" status
			await expect(page.getByText('Active')).toBeVisible();

			// Set Active button should disappear
			await expect(setActiveButton).not.toBeVisible();

			// Should still show Delete button
			await expect(page.getByRole('button', { name: 'Delete' })).toBeVisible();
		});

		test('should handle multiple configurations with only one active', async ({
			page,
		}) => {
			// Set first configuration as active
			await page.getByRole('button', { name: 'Set Active' }).click();
			await expect(page.getByText('Active')).toBeVisible();

			// Add second configuration
			const providerDropdown = page.getByRole('combobox').first();
			await providerDropdown.click();
			await page.getByRole('option', { name: 'OpenAI' }).click();

			const modelDropdown = page.getByRole('combobox').nth(1);
			await modelDropdown.click();
			await page.getByRole('option', { name: 'GPT-4o' }).click();

			await page
				.getByRole('textbox', { name: 'Enter your API key' })
				.fill('openai-key-456');
			await page.getByRole('button', { name: 'Save Configuration' }).click();

			// Should have two configurations, first one active

			// First config should be active
			await expect(
				page.getByText('Google Gemini').locator('xpath=..').getByText('Active')
			).toBeVisible();

			// Second config should have Set Active button
			await expect(
				page
					.getByText('OpenAI')
					.locator('xpath=..')
					.getByRole('button', { name: 'Set Active' })
			).toBeVisible();
		});
	});

	test.describe('Delete Configuration', () => {
		test.beforeEach(async ({ page }) => {
			// Create a test configuration first
			const modelDropdown = page.getByRole('combobox').nth(1);
			await modelDropdown.click();
			await page.getByRole('option', { name: 'Gemini 2.0 Flash' }).click();

			await page
				.getByRole('textbox', { name: 'Enter your API key' })
				.fill('test-delete-key-789');
			await page.getByRole('button', { name: 'Save Configuration' }).click();
			await expect(
				page.getByText('✓ Configuration saved successfully')
			).toBeVisible();
		});

		test('should delete configuration', async ({ page }) => {
			// Verify configuration exists
			await expect(page.getByText('Google Gemini')).toBeVisible();
			await expect(page.getByText('• Gemini 2.0 Flash')).toBeVisible();
			await expect(page.getByText('API Key: ***789')).toBeVisible();

			// Click Delete button
			await page.getByRole('button', { name: 'Delete' }).click();

			// Configuration should be removed
			await expect(page.getByText('Google Gemini')).not.toBeVisible();
			await expect(page.getByText('• Gemini 2.0 Flash')).not.toBeVisible();
			await expect(page.getByText('API Key: ***789')).not.toBeVisible();

			// Saved Configurations section should disappear if no configs left
			await expect(
				page.getByRole('heading', { name: 'Saved Configurations' })
			).not.toBeVisible();
		});

		test('should delete active configuration', async ({ page }) => {
			// Set configuration as active first
			await page.getByRole('button', { name: 'Set Active' }).click();
			await expect(page.getByText('Active')).toBeVisible();

			// Delete the active configuration
			await page.getByRole('button', { name: 'Delete' }).click();

			// Configuration should be removed
			await expect(page.getByText('Google Gemini')).not.toBeVisible();
			await expect(page.getByText('Active')).not.toBeVisible();
		});

		test('should handle deleting one of multiple configurations', async ({
			page,
		}) => {
			// Create second configuration
			const providerDropdown = page.getByRole('combobox').first();
			await providerDropdown.click();
			await page.getByRole('option', { name: 'OpenAI' }).click();

			const modelDropdown = page.getByRole('combobox').nth(1);
			await modelDropdown.click();
			await page.getByRole('option', { name: 'GPT-4o' }).click();

			await page
				.getByRole('textbox', { name: 'Enter your API key' })
				.fill('openai-key-999');
			await page.getByRole('button', { name: 'Save Configuration' }).click();

			// Should have two configurations
			await expect(page.getByText('Google Gemini')).toBeVisible();
			await expect(page.getByText('OpenAI')).toBeVisible();

			// Delete first configuration (Google Gemini)
			const geminiDeleteButton = page
				.getByText('Google Gemini')
				.locator('xpath=..')
				.getByRole('button', { name: 'Delete' });
			await geminiDeleteButton.click();

			// Google Gemini should be gone, OpenAI should remain
			await expect(page.getByText('Google Gemini')).not.toBeVisible();
			await expect(page.getByText('OpenAI')).toBeVisible();
			await expect(page.getByText('GPT-4o')).toBeVisible();

			// Saved Configurations section should still be visible
			await expect(
				page.getByRole('heading', { name: 'Saved Configurations' })
			).toBeVisible();
		});
	});

	test.describe('Complete E2E Workflow', () => {
		test('should complete full AI configuration workflow', async ({ page }) => {
			// Step 1: Save Gemini configuration
			let modelDropdown = page.getByRole('combobox').nth(1);
			await modelDropdown.click();
			await page.getByRole('option', { name: 'Gemini 2.5 Pro' }).click();
			await page
				.getByRole('textbox', { name: 'Enter your API key' })
				.fill('gemini-workflow-key');
			await page.getByRole('button', { name: 'Save Configuration' }).click();
			await expect(
				page.getByText('✓ Configuration saved successfully')
			).toBeVisible();

			// Step 2: Add OpenAI configuration
			const providerDropdown = page.getByRole('combobox').first();
			await providerDropdown.click();
			await page.getByRole('option', { name: 'OpenAI' }).click();
			modelDropdown = page.getByRole('combobox').nth(1);
			await modelDropdown.click();
			await page.getByRole('option', { name: 'GPT-4o' }).click();
			await page
				.getByRole('textbox', { name: 'Enter your API key' })
				.fill('openai-workflow-key');
			await page.getByRole('button', { name: 'Save Configuration' }).click();

			// Step 3: Set Gemini as active
			const geminiSetActive = page
				.getByText('Google Gemini')
				.locator('xpath=..')
				.getByRole('button', { name: 'Set Active' });
			await geminiSetActive.click();
			await expect(
				page.getByText('Google Gemini').locator('xpath=..').getByText('Active')
			).toBeVisible();

			// Step 4: Switch active to OpenAI
			const openaiSetActive = page
				.getByText('OpenAI')
				.locator('xpath=..')
				.getByRole('button', { name: 'Set Active' });
			await openaiSetActive.click();
			await expect(
				page.getByText('OpenAI').locator('xpath=..').getByText('Active')
			).toBeVisible();

			// Gemini should no longer be active
			await expect(
				page.getByText('Google Gemini').locator('xpath=..').getByText('Active')
			).not.toBeVisible();
			await expect(
				page
					.getByText('Google Gemini')
					.locator('xpath=..')
					.getByRole('button', { name: 'Set Active' })
			).toBeVisible();

			// Step 5: Delete non-active configuration (Gemini)
			const geminiDelete = page
				.getByText('Google Gemini')
				.locator('xpath=..')
				.getByRole('button', { name: 'Delete' });
			await geminiDelete.click();
			await expect(page.getByText('Google Gemini')).not.toBeVisible();

			// Step 6: Verify only OpenAI remains and is active
			await expect(page.getByText('OpenAI')).toBeVisible();
			await expect(page.getByText('Active')).toBeVisible();
		});

		test('should persist configurations across page refresh', async ({
			page,
		}) => {
			// Save a configuration
			const modelDropdown = page.getByRole('combobox').nth(1);
			await modelDropdown.click();
			await page.getByRole('option', { name: 'Gemini 2.5 Flash Lite' }).click();
			await page
				.getByRole('textbox', { name: 'Enter your API key' })
				.fill('persist-test-key');
			await page.getByRole('button', { name: 'Save Configuration' }).click();
			await page.getByRole('button', { name: 'Set Active' }).click();

			// Refresh the page
			await page.reload();
			await expect(page).toHaveURL('/profile');

			// Configuration should still be there and active
			await expect(page.getByText('Google Gemini')).toBeVisible();
			await expect(page.getByText('• Gemini 2.5 Flash Lite')).toBeVisible();
			await expect(page.getByText('Active')).toBeVisible();
			await expect(page.getByText('API Key: ***key')).toBeVisible();
		});
	});
});
