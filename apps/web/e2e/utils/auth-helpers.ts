import { expect } from '@playwright/test';
import type { Page } from '@playwright/test';

export interface TestUser {
	email: string;
	username: string;
	password: string;
}

const normalizeEnvValue = (value?: string): string =>
	value?.trim().replace(/^["']+|["']+$/g, '') ?? '';

const FIXTURE_EMAIL =
	normalizeEnvValue(process.env.E2E_TEST_USER_EMAIL) ||
	'test-procyon@cwchanap.dev';
const FIXTURE_USERNAME =
	normalizeEnvValue(process.env.E2E_TEST_USER_USERNAME) ||
	FIXTURE_EMAIL.split('@')[0] ||
	'test-procyon';
const FIXTURE_PASSWORD =
	normalizeEnvValue(process.env.E2E_TEST_USER_PASSWORD) || 'password123';

const FIXTURE_USER: TestUser = {
	email: FIXTURE_EMAIL,
	username: FIXTURE_USERNAME,
	password: FIXTURE_PASSWORD,
};

export class AuthHelper {
	constructor(public page: Page) {}

	/**
	 * Return the shared Supabase fixture user for E2E tests.
	 */
	static getFixtureUser(): TestUser {
		return { ...FIXTURE_USER };
	}

	/**
	 * Generate a unique test user with timestamp to avoid conflicts
	 */
	static generateTestUser(): TestUser {
		const timestamp = Date.now();
		return {
			email: `testuser${timestamp}@example.com`,
			username: `testuser${timestamp}`,
			password: 'testpassword123',
		};
	}

	/**
	 * Navigate to the registration page
	 */
	async goToRegister(): Promise<void> {
		await this.page.goto('/register');
		await expect(this.page).toHaveTitle('Sign Up - Procyon Chess', {
			timeout: 15000,
		});
		await this.page
			.locator('[data-testid="register-form"][data-hydrated="true"]')
			.waitFor({ state: 'visible', timeout: 15000 });
	}

	/**
	 * Navigate to the login page
	 */
	async goToLogin(): Promise<void> {
		await this.page.goto('/login');
		await expect(this.page).toHaveTitle('Sign In - Procyon Chess', {
			timeout: 15000,
		});
		await this.page
			.locator('[data-testid="login-form"][data-hydrated="true"]')
			.waitFor({ state: 'visible', timeout: 15000 });
	}

	/**
	 * Fill out and submit the registration form
	 */
	async register(user: TestUser): Promise<void> {
		await this.goToRegister();

		await this.page.getByRole('textbox', { name: 'Email' }).fill(user.email);
		await this.page
			.getByRole('textbox', { name: 'Username' })
			.fill(user.username);
		await this.page
			.getByRole('textbox', { name: 'Password', exact: true })
			.fill(user.password);
		await this.page
			.getByRole('textbox', { name: 'Confirm Password' })
			.fill(user.password);

		await this.page.getByRole('button', { name: 'Create Account' }).click();

		// Wait briefly for any client-side redirect to occur
		await this.page.waitForTimeout(500);
		const currentUrl = this.page.url();
		if (currentUrl.includes('/register')) {
			// If we're still on the register page (with or without query params),
			// navigate explicitly to home. On successful registration the session
			// cookie should already be set, so the navbar will reflect auth state.
			await this.page.goto('/');
		}

		// Ensure we're on the home page
		await expect(this.page).toHaveURL('/', { timeout: 15000 });
		await expect(this.page).toHaveTitle('Chess Games', { timeout: 15000 });
	}

	/**
	 * Fill out and submit the login form
	 */
	async login(email: string, password: string): Promise<void> {
		await this.goToLogin();

		await this.page.getByRole('textbox', { name: 'Email' }).fill(email);
		await this.page.getByRole('textbox', { name: 'Password' }).fill(password);

		await this.page.getByRole('button', { name: 'Sign In' }).click();

		// Wait for redirect to home page
		await expect(this.page).toHaveURL('/', { timeout: 15000 });
		await expect(this.page).toHaveTitle('Chess Games', { timeout: 15000 });
	}

	/**
	 * Click the logout button
	 */
	async logout(): Promise<void> {
		// If the Login button is visible, we are already logged out
		const loginButton = this.page.getByRole('button', { name: 'Login' });
		if (await loginButton.isVisible().catch(() => false)) {
			return;
		}

		// Open the user dropdown from the nav bar
		const navUserButton = this.page.locator('nav button').first();
		await navUserButton.click();

		// Click the Sign Out button in the dropdown
		await this.page.getByRole('button', { name: 'Sign Out' }).click();

		// Wait for the unauthenticated state to appear
		await loginButton
			.waitFor({ state: 'visible', timeout: 5000 })
			.catch(() => {});
	}

	/**
	 * Check if user is authenticated by looking for user info in AuthNav
	 */
	async expectAuthenticated(username: string, email: string): Promise<void> {
		// Wait for auth nav to load first
		await this.waitForAuthNav();

		// Check for username and email text being visible on the page
		await expect(this.page.locator(`text=${username}`).first()).toBeVisible({
			timeout: 15000,
		});
		await expect(this.page.locator(`text=${email}`).first()).toBeVisible({
			timeout: 15000,
		});
	}

	/**
	 * Check if user is not authenticated by looking for Sign In/Sign Up buttons
	 */
	async expectNotAuthenticated(): Promise<void> {
		// Wait for auth nav to load first
		await this.waitForAuthNav();

		// Check for Login button in the nav as the unauthenticated indicator
		await expect(this.page.getByRole('button', { name: 'Login' })).toBeVisible({
			timeout: 15000,
		});
	}

	/**
	 * Navigate to home page
	 */
	async goToHome(): Promise<void> {
		await this.page.goto('/');
		await expect(this.page).toHaveTitle('Chess Games');
	}

	/**
	 * Click Sign In button from the auth nav
	 */
	async clickSignInFromNav(): Promise<void> {
		await this.page.getByRole('button', { name: 'Sign In' }).click();
		await expect(this.page).toHaveURL('/login');
	}

	/**
	 * Click Sign Up button from the auth nav
	 */
	async clickSignUpFromNav(): Promise<void> {
		await this.page.getByRole('button', { name: 'Sign Up' }).click();
		await expect(this.page).toHaveURL('/register');
	}

	/**
	 * Check for error message on login/register forms
	 */
	async expectErrorMessage(message: string): Promise<void> {
		await expect(this.page.getByText(message)).toBeVisible();
	}

	/**
	 * Wait for auth nav to load (useful for initial page loads)
	 */
	async waitForAuthNav(): Promise<void> {
		// Wait for any navigation button (Login or user dropdown) to be visible
		await this.page
			.locator('nav button')
			.first()
			.waitFor({ state: 'visible', timeout: 15000 });
	}
}
