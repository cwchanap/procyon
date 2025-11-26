import { test, expect } from '@playwright/test';

test.describe('Basic Authentication Flow', () => {
	test('should complete a basic register and login flow', async ({ page }) => {
		const timestamp = Date.now();
		const testUser = {
			email: `testuser${timestamp}@example.com`,
			username: `testuser${timestamp}`,
			password: 'password123',
		};

		// Go to register page
		await page.goto('/register');
		await expect(page).toHaveTitle('Sign Up - Procyon Chess');

		// Fill registration form
		await page.getByRole('textbox', { name: 'Email' }).fill(testUser.email);
		await page
			.getByRole('textbox', { name: 'Username' })
			.fill(testUser.username);
		await page
			.getByRole('textbox', { name: 'Password', exact: true })
			.fill(testUser.password);
		await page
			.getByRole('textbox', { name: 'Confirm Password' })
			.fill(testUser.password);

		// Submit registration
		await page.getByRole('button', { name: 'Create Account' }).click();

		// Wait for auth state/nav to update
		await page.waitForTimeout(1500);

		// We should now see the user menu button in the nav (authenticated state)
		const navUserButton = page.locator('nav button').first();
		await expect(navUserButton).toBeVisible();

		// Open user menu and click Sign Out
		await navUserButton.click();
		await page.getByRole('button', { name: 'Sign Out' }).click();

		// Should show sign in/up buttons
		await page.waitForTimeout(1000);
		await expect(page.getByRole('button', { name: 'Login' })).toBeVisible();

		// Go to login page via nav Login button
		await page.getByRole('button', { name: 'Login' }).click();
		await expect(page).toHaveURL('/login');

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

		// Authenticated again: user nav button should be visible
		await expect(page.locator('nav button').first()).toBeVisible();
	});
});
