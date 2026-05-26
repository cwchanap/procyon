import { test, expect } from '@playwright/test';
import { AuthHelper, type TestUser } from './utils/auth-helpers';

test.describe('Authentication System', () => {
	let authHelper: AuthHelper;
	let testUser: TestUser;

	test.beforeEach(async ({ page }) => {
		authHelper = new AuthHelper(page);
		testUser = AuthHelper.getFixtureUser();
	});

	test.describe('Page Navigation', () => {
		test('should navigate between login and register pages', async () => {
			await authHelper.goToLogin();
			await expect(authHelper.page).toHaveURL('/login');

			await authHelper.page.goto('/');
			await authHelper.goToRegister();
			await expect(authHelper.page).toHaveURL('/register');
		});

		test('should navigate back to home from auth pages', async () => {
			await authHelper.goToLogin();
			await authHelper.page
				.getByRole('link', { name: '← Back to home' })
				.click();
			await expect(authHelper.page).toHaveURL('/');

			await authHelper.goToRegister();
			await authHelper.page
				.getByRole('link', { name: '← Back to home' })
				.click();
			await expect(authHelper.page).toHaveURL('/');
		});
	});

	test.describe('User Login via API', () => {
		test('should successfully login via Google test-claim', async () => {
			await authHelper.login(testUser.email);
			await authHelper.expectAuthenticated(testUser.username, testUser.email);
		});
	});

	test.describe('Logout Functionality', () => {
		test.beforeEach(async () => {
			await authHelper.login(testUser.email);
		});

		test('should successfully logout and clear session', async () => {
			await authHelper.expectAuthenticated(testUser.username, testUser.email);
			await authHelper.logout();
			await authHelper.expectNotAuthenticated();
		});
	});

	test.describe('Authentication State Persistence', () => {
		test.beforeEach(async () => {
			await authHelper.login(testUser.email);
		});

		test('should persist authentication state across page refreshes', async () => {
			await authHelper.expectAuthenticated(testUser.username, testUser.email);
			await authHelper.page.reload();
			await authHelper.waitForAuthNav();
			await authHelper.expectAuthenticated(testUser.username, testUser.email);
		});

		test('should persist authentication state across navigation', async () => {
			await authHelper.expectAuthenticated(testUser.username, testUser.email);
			await authHelper.page.goto('/login');
			await authHelper.goToHome();
			await authHelper.waitForAuthNav();
			await authHelper.expectAuthenticated(testUser.username, testUser.email);
		});

		test('should clear authentication state after logout', async () => {
			await authHelper.expectAuthenticated(testUser.username, testUser.email);
			await authHelper.logout();
			await authHelper.expectNotAuthenticated();
			await authHelper.page.reload();
			await authHelper.waitForAuthNav();
			await authHelper.expectNotAuthenticated();
		});
	});

	test.describe('Login/Register Pages', () => {
		test('login page shows Google Sign-In button', async () => {
			await authHelper.goToLogin();
			await expect(
				authHelper.page.locator('[data-testid="google-signin-button"]')
			).toBeVisible();
		});

		test('register page shows Google Sign-Up button', async () => {
			await authHelper.goToRegister();
			await expect(
				authHelper.page.locator('[data-testid="google-signin-button"]')
			).toBeVisible();
		});
	});

	test.describe('E2E User Journey', () => {
		test('complete user journey: login → logout → login → logout', async () => {
			await authHelper.login(testUser.email);
			await authHelper.expectAuthenticated(testUser.username, testUser.email);

			await authHelper.logout();
			await authHelper.expectNotAuthenticated();

			await authHelper.login(testUser.email);
			await authHelper.expectAuthenticated(testUser.username, testUser.email);

			await authHelper.logout();
			await authHelper.expectNotAuthenticated();
		});
	});
});
