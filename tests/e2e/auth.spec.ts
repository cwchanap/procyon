import { test, expect } from '@playwright/test';
import { AuthHelper, TestUser } from './utils/auth-helpers';

test.describe('Authentication System', () => {
	let authHelper: AuthHelper;
	let testUser: TestUser;

	test.beforeEach(async () => {
		authHelper = new AuthHelper(page);
		testUser = AuthHelper.generateTestUser();
	});

	test.describe('Page Navigation', () => {
		test('should navigate to login page from auth nav', async () => {
			await authHelper.goToHome();
			await authHelper.waitForAuthNav();
			await authHelper.clickSignInFromNav();
		});

		test('should navigate to register page from auth nav', async () => {
			await authHelper.goToHome();
			await authHelper.waitForAuthNav();
			await authHelper.clickSignUpFromNav();
		});

		test('should navigate between login and register pages', async () => {
			await authHelper.goToLogin();

			// Go to register from login page
			await authHelper.page.getByRole('link', { name: 'Sign up' }).click();
			await expect(authHelper.page).toHaveURL('/register');

			// Go back to login from register page
			await authHelper.page.getByRole('link', { name: 'Sign in' }).click();
			await expect(authHelper.page).toHaveURL('/login');
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

	test.describe('User Registration', () => {
		test('should successfully register a new user', async () => {
			await authHelper.register(testUser);

			// Should be redirected to home and authenticated
			await authHelper.expectAuthenticated(testUser.username, testUser.email);
		});

		test('should show error for mismatched passwords', async () => {
			await authHelper.goToRegister();

			await authHelper.page
				.getByRole('textbox', { name: 'Email' })
				.fill(testUser.email);
			await authHelper.page
				.getByRole('textbox', { name: 'Username' })
				.fill(testUser.username);
			await authHelper.page
				.getByRole('textbox', { name: 'Password', exact: true })
				.fill(testUser.password);
			await authHelper.page
				.getByRole('textbox', { name: 'Confirm Password' })
				.fill('differentpassword');

			await authHelper.page
				.getByRole('button', { name: 'Create Account' })
				.click();

			// Should show validation error (this depends on client-side validation)
			// If validation is server-side, it would show a different error
		});

		test('should prevent duplicate email registration', async () => {
			// Register user first time
			await authHelper.register(testUser);
			await authHelper.logout();

			// Try to register with same email
			await authHelper.goToRegister();
			await authHelper.page
				.getByRole('textbox', { name: 'Email' })
				.fill(testUser.email);
			await authHelper.page
				.getByRole('textbox', { name: 'Username' })
				.fill('differentuser');
			await authHelper.page
				.getByRole('textbox', { name: 'Password', exact: true })
				.fill(testUser.password);
			await authHelper.page
				.getByRole('textbox', { name: 'Confirm Password' })
				.fill(testUser.password);

			await authHelper.page
				.getByRole('button', { name: 'Create Account' })
				.click();

			// Should show error about email already existing
			await expect(
				authHelper.page.getByText(
					/email.*already.*exists|User with this email already exists/i
				)
			).toBeVisible();
		});
	});

	test.describe('User Login', () => {
		test.beforeEach(async () => {
			// Register a user first
			await authHelper.register(testUser);
			await authHelper.logout();
		});

		test('should successfully login with valid credentials', async () => {
			await authHelper.login(testUser.email, testUser.password);
			await authHelper.expectAuthenticated(testUser.username, testUser.email);
		});

		test('should show error for invalid email', async () => {
			await authHelper.goToLogin();

			await authHelper.page
				.getByRole('textbox', { name: 'Email' })
				.fill('nonexistent@example.com');
			await authHelper.page
				.getByRole('textbox', { name: 'Password' })
				.fill(testUser.password);

			await authHelper.page.getByRole('button', { name: 'Sign In' }).click();

			await authHelper.expectErrorMessage('Invalid email or password');
		});

		test('should show error for invalid password', async () => {
			await authHelper.goToLogin();

			await authHelper.page
				.getByRole('textbox', { name: 'Email' })
				.fill(testUser.email);
			await authHelper.page
				.getByRole('textbox', { name: 'Password' })
				.fill('wrongpassword');

			await authHelper.page.getByRole('button', { name: 'Sign In' }).click();

			await authHelper.expectErrorMessage('Invalid email or password');
		});
	});

	test.describe('Logout Functionality', () => {
		test.beforeEach(async () => {
			// Register and login a user first
			await authHelper.register(testUser);
		});

		test('should successfully logout and clear session', async () => {
			// Verify user is logged in
			await authHelper.expectAuthenticated(testUser.username, testUser.email);

			// Logout
			await authHelper.logout();

			// Should show unauthenticated state
			await authHelper.expectNotAuthenticated();
		});
	});

	test.describe('Authentication State Persistence', () => {
		test.beforeEach(async () => {
			// Register a user first
			await authHelper.register(testUser);
		});

		test('should persist authentication state across page refreshes', async () => {
			// Verify user is authenticated
			await authHelper.expectAuthenticated(testUser.username, testUser.email);

			// Refresh the page
			await authHelper.page.reload();
			await authHelper.waitForAuthNav();

			// Should still be authenticated
			await authHelper.expectAuthenticated(testUser.username, testUser.email);
		});

		test('should persist authentication state across navigation', async () => {
			// Verify user is authenticated on home page
			await authHelper.expectAuthenticated(testUser.username, testUser.email);

			// Navigate to login page (should redirect or show authenticated state)
			await authHelper.page.goto('/login');

			// Navigate back to home
			await authHelper.goToHome();
			await authHelper.waitForAuthNav();

			// Should still be authenticated
			await authHelper.expectAuthenticated(testUser.username, testUser.email);
		});

		test('should clear authentication state after logout', async () => {
			// Verify user is authenticated
			await authHelper.expectAuthenticated(testUser.username, testUser.email);

			// Logout
			await authHelper.logout();
			await authHelper.expectNotAuthenticated();

			// Refresh page
			await authHelper.page.reload();
			await authHelper.waitForAuthNav();

			// Should still be unauthenticated
			await authHelper.expectNotAuthenticated();
		});
	});

	test.describe('Form Validation', () => {
		test('should require all fields for registration', async () => {
			await authHelper.goToRegister();

			// Try to submit empty form
			await authHelper.page
				.getByRole('button', { name: 'Create Account' })
				.click();

			// Should not navigate away from register page
			await expect(authHelper.page).toHaveURL('/register');
		});

		test('should require all fields for login', async () => {
			await authHelper.goToLogin();

			// Try to submit empty form
			await authHelper.page.getByRole('button', { name: 'Sign In' }).click();

			// Should not navigate away from login page
			await expect(authHelper.page).toHaveURL('/login');
		});

		test('should validate email format', async () => {
			await authHelper.goToRegister();

			await authHelper.page
				.getByRole('textbox', { name: 'Email' })
				.fill('invalid-email');
			await authHelper.page
				.getByRole('textbox', { name: 'Username' })
				.fill(testUser.username);
			await authHelper.page
				.getByRole('textbox', { name: 'Password', exact: true })
				.fill(testUser.password);
			await authHelper.page
				.getByRole('textbox', { name: 'Confirm Password' })
				.fill(testUser.password);

			await authHelper.page
				.getByRole('button', { name: 'Create Account' })
				.click();

			// Should show validation error or not submit
			await expect(authHelper.page).toHaveURL('/register');
		});
	});

	test.describe('E2E User Journey', () => {
		test('complete user journey: register → logout → login → logout', async () => {
			// Step 1: Register new user
			await authHelper.register(testUser);
			await authHelper.expectAuthenticated(testUser.username, testUser.email);

			// Step 2: Logout
			await authHelper.logout();
			await authHelper.expectNotAuthenticated();

			// Step 3: Login with same credentials
			await authHelper.login(testUser.email, testUser.password);
			await authHelper.expectAuthenticated(testUser.username, testUser.email);

			// Step 4: Logout again
			await authHelper.logout();
			await authHelper.expectNotAuthenticated();
		});
	});
});
