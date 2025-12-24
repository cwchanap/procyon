import { test, expect } from '@playwright/test';
import { AuthHelper, type TestUser } from './utils/auth-helpers';

test.describe('AI Configuration Management', () => {
	let authHelper: AuthHelper;
	let testUser: TestUser;

	test.beforeEach(async ({ page }) => {
		authHelper = new AuthHelper(page);
		testUser = AuthHelper.generateTestUser();

		await authHelper.register(testUser);
		await authHelper.expectAuthenticated(testUser.username, testUser.email);
	});

	test.afterEach(async () => {
		// Clean up - logout after each test
		await authHelper.logout();
	});

	test.describe('Profile Navigation', () => {
		test('should navigate to profile page from user dropdown', async ({
			page,
		}) => {
			// Click on user dropdown
			await page
				.getByRole('button', {
					name: new RegExp(`${testUser.username}.*${testUser.email}`),
				})
				.click();

			// Click on Profile option
			await page.getByRole('button', { name: 'Profile' }).click();

			// Should be on profile page
			await expect(page).toHaveURL('/profile');
			await expect(page).toHaveTitle('Profile - Procyon Chess');

			// Should see AI Configuration section
			await expect(
				page.getByRole('heading', { name: 'AI Configuration' })
			).toBeVisible();
		});
	});

	test.describe('AI Configuration Form', () => {
		test.beforeEach(async ({ page }) => {
			// Navigate to profile page
			await page
				.getByRole('button', {
					name: new RegExp(`${testUser.username}.*${testUser.email}`),
				})
				.click();
			await page.getByRole('button', { name: 'Profile' }).click();
			await expect(page).toHaveURL('/profile');
		});

		test('should display all available AI providers', async ({ page }) => {
			const providerDropdown = page.getByRole('combobox').first();
			await providerDropdown.click();

			// Should see all providers
			await expect(
				page.getByRole('option', { name: 'Google Gemini' })
			).toBeVisible();
			await expect(
				page.getByRole('option', { name: 'OpenRouter' })
			).toBeVisible();
			await expect(page.getByRole('option', { name: 'OpenAI' })).toBeVisible();
		});

		test('should display updated Gemini models including latest versions', async ({
			page,
		}) => {
			// Select Google Gemini provider (should be default)
			const modelDropdown = page.getByRole('combobox').nth(1);
			await modelDropdown.click();

			// Should see all updated Gemini models
			await expect(
				page.getByRole('option', { name: 'Gemini 2.0 Flash' })
			).toBeVisible();
			await expect(
				page.getByRole('option', { name: 'Gemini 2.5 Flash' })
			).toBeVisible();
			await expect(
				page.getByRole('option', { name: 'Gemini 2.5 Pro' })
			).toBeVisible();
			await expect(
				page.getByRole('option', { name: 'Gemini 2.5 Flash Lite' })
			).toBeVisible();

			// Should NOT see deprecated 1.x models
			await expect(
				page.getByRole('option', { name: /Gemini 1\./i })
			).not.toBeVisible();
		});

		test('should require API key before enabling save button', async ({
			page,
		}) => {
			// Save button should be disabled initially
			const saveButton = page.getByRole('button', {
				name: 'Save Configuration',
			});
			await expect(saveButton).toBeDisabled();

			// Enter API key
			await page
				.getByPlaceholder('Enter your API key')
				.fill('test-api-key-123');

			// Save button should be enabled
			await expect(saveButton).toBeEnabled();
		});

		test('should validate form inputs', async ({ page }) => {
			// Try to save without API key
			const saveButton = page.getByRole('button', {
				name: 'Save Configuration',
			});
			await expect(saveButton).toBeDisabled();

			// Select provider and model
			const modelDropdown = page.getByRole('combobox').nth(1);
			await modelDropdown.click();
			await page.getByRole('option', { name: 'Gemini 2.5 Pro' }).click();

			// Still disabled without API key
			await expect(saveButton).toBeDisabled();
		});
	});

	test.describe('Save AI Configuration', () => {
		test.beforeEach(async ({ page }) => {
			// Navigate to profile page
			await page
				.getByRole('button', {
					name: new RegExp(`${testUser.username}.*${testUser.email}`),
				})
				.click();
			await page.getByRole('button', { name: 'Profile' }).click();
			await expect(page).toHaveURL('/profile');
		});

		test('should successfully save AI configuration', async ({ page }) => {
			// Select Gemini 2.5 Pro model
			const modelDropdown = page.getByRole('combobox').nth(1);
			await modelDropdown.click();
			await page.getByRole('option', { name: 'Gemini 2.5 Pro' }).click();

			// Enter API key
			const testApiKey = 'gemini-test-api-key-12345';
			await page.getByPlaceholder('Enter your API key').fill(testApiKey);

			// Save configuration
			await page.getByRole('button', { name: 'Save Configuration' }).click();

			// Should show success message
			await expect(
				page.getByText('✓ Configuration saved successfully')
			).toBeVisible();
		});

		test('should save different configurations for different providers', async ({
			page,
		}) => {
			// Save Gemini configuration
			await page.getByPlaceholder('Enter your API key').fill('gemini-key-123');
			await page.getByRole('button', { name: 'Save Configuration' }).click();
			await expect(
				page.getByText('✓ Configuration saved successfully')
			).toBeVisible();

			// Change to OpenAI provider
			const providerDropdown = page.getByRole('combobox').first();
			await providerDropdown.click();
			await page.getByRole('option', { name: 'OpenAI' }).click();

			// Select OpenAI model
			const modelDropdown = page.getByRole('combobox').nth(1);
			await modelDropdown.click();
			await page.getByRole('option', { name: 'GPT-4o' }).click();

			// Save OpenAI configuration
			await page.getByPlaceholder('Enter your API key').fill('openai-key-456');
			await page.getByRole('button', { name: 'Save Configuration' }).click();

			// Should show success message
			await expect(
				page.getByText('✓ Configuration saved successfully')
			).toBeVisible();
		});
	});
});
