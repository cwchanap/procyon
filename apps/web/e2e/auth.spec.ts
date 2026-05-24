import { test, expect } from '@playwright/test';
import { AuthHelper } from './utils/auth-helpers';

test.describe('Google sign-in flow', () => {
	test('shows Google sign-in card on /login', async ({ page }) => {
		await page.goto('/login');
		await expect(page.getByTestId('login-form')).toBeVisible();
		await expect(page.getByTestId('login-form')).toContainText('Sign In');
	});

	test('authed UI shows username after token is set', async ({ page }) => {
		const auth = new AuthHelper(page);
		const user = AuthHelper.generateTestUser();
		await auth.loginAsTestUser(user);
		await expect(page).toHaveURL(/\/$/);
		await expect(page.locator('body')).toContainText(user.username);
	});

	test('logout clears the session', async ({ page }) => {
		const auth = new AuthHelper(page);
		const user = AuthHelper.generateTestUser();
		await auth.loginAsTestUser(user);
		await expect(page.locator('body')).toContainText(user.username);

		await auth.logout();
		await page.goto('/');
		await expect(page.locator('body')).not.toContainText(user.username);
	});
});
