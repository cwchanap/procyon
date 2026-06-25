import { test, expect } from '@playwright/test';
import { AuthHelper } from './utils/auth-helpers';

test.describe('Basic Authentication Flow', () => {
	test('should complete a basic login and logout flow', async ({ page }) => {
		const authHelper = new AuthHelper(page);
		const testUser = AuthHelper.getFixtureUser();

		await authHelper.login(testUser.email);
		await authHelper.expectAuthenticated(testUser.username, testUser.email);
		await authHelper.logout();
		await authHelper.expectNotAuthenticated();
	});
});

// Covers the access-control logic added to AppShell.tsx: History/Profile are
// only rendered for authenticated users; anonymous users see a Login CTA.
test.describe('AppShell nav gating', () => {
	// The desktop <aside> rail is visible at the default 1280px viewport
	// (lg:flex); the mobile bottom <nav> is lg:hidden there, so scoping to
	// `aside` avoids matching the duplicated mobile bar.
	const shellAside = (page: import('@playwright/test').Page) =>
		page.locator('aside');

	test('hides History/Profile and shows Login for anonymous users', async ({
		page,
	}) => {
		await page.goto('/');
		const aside = shellAside(page);

		// Wait for the AppShell to hydrate (Play is always present in PUBLIC_NAV).
		await expect(aside.getByRole('link', { name: 'Play' })).toBeVisible({
			timeout: 15000,
		});

		// Auth-gated links are not rendered for anonymous users.
		await expect(aside.getByRole('link', { name: 'History' })).toBeHidden();
		await expect(aside.getByRole('link', { name: 'Profile' })).toBeHidden();

		// Login CTA is shown instead.
		await expect(aside.getByRole('link', { name: 'Login' })).toBeVisible();
	});

	test('shows History/Profile and Sign Out for authenticated users', async ({
		page,
	}) => {
		const authHelper = new AuthHelper(page);
		const testUser = AuthHelper.getFixtureUser();
		await authHelper.login(testUser.email);
		await authHelper.expectAuthenticated(testUser.username, testUser.email);

		const aside = shellAside(page);
		await expect(aside.getByRole('link', { name: 'History' })).toBeVisible();
		await expect(aside.getByRole('link', { name: 'Profile' })).toBeVisible();
		await expect(aside.getByRole('button', { name: 'Sign Out' })).toBeVisible();

		await authHelper.logout();
	});
});
