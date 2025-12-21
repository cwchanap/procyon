import { test, expect } from '@playwright/test';
import { AuthHelper } from './utils/auth-helpers';

test.describe('Basic Authentication Flow', () => {
	test('should complete a basic login and logout flow', async ({ page }) => {
		const testUser = AuthHelper.getFixtureUser();

		// Go to login page
		await page.goto('/login');
		await expect(page).toHaveTitle('Sign In - Procyon Chess');

		// Fill login form
		await page.getByRole('textbox', { name: 'Email' }).fill(testUser.email);
		await page
			.getByRole('textbox', { name: 'Password' })
			.fill(testUser.password);

		// Submit login
		await page.getByRole('button', { name: 'Sign In' }).click();

		// Should redirect to home page
		await expect(page).toHaveURL('/');

		// Wait for auth state to load again
		await page.waitForTimeout(1500);

		// Authenticated: user nav button should be visible
		const navUserButton = page.locator('nav button').first();
		await expect(navUserButton).toBeVisible();

		// Open user menu and click Sign Out
		await navUserButton.click();
		await page.getByRole('button', { name: 'Sign Out' }).click();

		// Should show sign in/up buttons
		await page.waitForTimeout(1000);
		await expect(page.getByRole('button', { name: 'Login' })).toBeVisible();
	});
});
