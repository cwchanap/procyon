import { test, expect, type Page } from '@playwright/test';
import { AuthHelper, type TestUser } from './utils/auth-helpers';

const waitForProfileReady = async (page: Page) => {
	await page
		.locator(
			'[data-testid="profile-page"][data-auth-ready="true"][data-authenticated="true"]'
		)
		.waitFor({ state: 'visible', timeout: 15000 });
};

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
			await waitForProfileReady(page);

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
			await waitForProfileReady(page);
		});

		test('should display all available AI providers', async ({ page }) => {
			const providerOptions = page
				.getByRole('combobox')
				.first()
				.locator('option');
			const providerOptionTexts = await providerOptions.allTextContents();
			expect(providerOptionTexts).toContain('Google Gemini');
			expect(providerOptionTexts).toContain('OpenRouter');
			expect(providerOptionTexts).toContain('OpenAI');
		});

		test('should display updated Gemini models including latest versions', async ({
			page,
		}) => {
			const modelOptions = page.getByRole('combobox').nth(1).locator('option');
			const modelOptionTexts = await modelOptions.allTextContents();
			expect(modelOptionTexts).toContain('Gemini 2.0 Flash');
			expect(modelOptionTexts).toContain('Gemini 2.5 Flash');
			expect(modelOptionTexts).toContain('Gemini 2.5 Pro');
			expect(modelOptionTexts).toContain('Gemini 2.5 Flash Lite');

			// Should NOT see deprecated 1.x models
			expect(modelOptionTexts.join(' ')).not.toMatch(/Gemini 1\./i);
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
			await modelDropdown.selectOption({ label: 'Gemini 2.5 Pro' });

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
			await waitForProfileReady(page);
		});

		test('should successfully save AI configuration', async ({ page }) => {
			// Select Gemini 2.5 Pro model
			const modelDropdown = page.getByRole('combobox').nth(1);
			await modelDropdown.selectOption({ label: 'Gemini 2.5 Pro' });

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
			await providerDropdown.selectOption({ label: 'OpenAI' });

			// Select OpenAI model
			const modelDropdown = page.getByRole('combobox').nth(1);
			await modelDropdown.selectOption({ label: 'GPT-4o' });

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
