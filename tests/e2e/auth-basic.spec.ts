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

		// Should redirect to home page
		await expect(page).toHaveURL('/');

		// Wait a bit for auth state to load
		await page.waitForTimeout(2000);

		// Should show logout button (indicating successful authentication)
		await expect(page.getByRole('button', { name: 'Logout' })).toBeVisible();

		// Logout
		await page.getByRole('button', { name: 'Logout' }).click();

		// Should show sign in/up buttons
		await page.waitForTimeout(1000);
		await expect(page.getByRole('button', { name: 'Sign In' })).toBeVisible();

		// Go to login page
		await page.getByRole('button', { name: 'Sign In' }).click();
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

		// Wait for auth state to load
		await page.waitForTimeout(2000);

		// Should show logout button again
		await expect(page.getByRole('button', { name: 'Logout' })).toBeVisible();
	});
});
