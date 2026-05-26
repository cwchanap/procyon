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

const FIXTURE_USER: TestUser = {
	email: FIXTURE_EMAIL,
	username: FIXTURE_USERNAME,
	password: '',
};

export class AuthHelper {
	constructor(public page: Page) {}

	private async isUnauthenticatedState(): Promise<boolean> {
		const currentPath = new URL(this.page.url()).pathname;
		if (currentPath === '/login' || currentPath === '/register') {
			return true;
		}

		// Scope to nav element to avoid matching unrelated CTAs elsewhere on the page
		const navLocator = this.page.locator('nav');
		const unauthLocators = [
			navLocator.getByRole('button', { name: 'Login' }),
			navLocator.getByRole('link', { name: 'Login' }),
			navLocator.getByRole('button', { name: 'Sign In' }),
			navLocator.getByRole('link', { name: 'Sign In' }),
		];

		for (const locator of unauthLocators) {
			if (
				await locator
					.first()
					.isVisible()
					.catch(() => false)
			) {
				return true;
			}
		}

		return false;
	}

	/**
	 * Return the shared fixture user for E2E tests.
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
			password: '',
		};
	}

	/**
	 * Authenticate via the API by calling /api/auth/google with a test-mode
	 * claim payload.  This bypasses the Google Identity Services UI entirely.
	 */
	async loginViaApi(user?: TestUser): Promise<void> {
		const testUser = user ?? FIXTURE_USER;
		const apiBase =
			normalizeEnvValue(process.env.PUBLIC_API_URL) ||
			'http://localhost:3501/api';

		// Build a test-claim token that the server accepts in non-production mode
		const claimPayload = `test-claim:${JSON.stringify({
			sub: `e2e-${testUser.email}`,
			email: testUser.email,
			emailVerified: true,
			name: testUser.username,
		})}`;

		const response = await this.page.request.post(`${apiBase}/auth/google`, {
			headers: { 'Content-Type': 'application/json' },
			data: { id_token: claimPayload },
		});

		expect(response.ok()).toBe(true);

		// Navigate to home to trigger hydration with the new cookie
		await this.page.goto('/');
		await expect(this.page).toHaveTitle('Chess Games', { timeout: 15000 });
	}

	/**
	 * Navigate to the login page
	 */
	async goToLogin(): Promise<void> {
		await this.page.goto('/login');
		await expect(this.page).toHaveTitle('Sign In - Procyon Chess', {
			timeout: 15000,
		});
		// Wait for the Google sign-in button to be visible (the only auth control)
		await this.page
			.locator('[data-testid="google-signin-button"]')
			.waitFor({ state: 'visible', timeout: 15000 })
			.catch(() => {
				// Fallback: wait for any sign-in related content
				return this.page
					.getByText(/sign.?in/i)
					.first()
					.waitFor({ state: 'visible', timeout: 5000 });
			});
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
			.locator('[data-testid="google-signin-button"]')
			.waitFor({ state: 'visible', timeout: 15000 })
			.catch(() => {
				return this.page
					.getByText(/sign.?up/i)
					.first()
					.waitFor({ state: 'visible', timeout: 5000 });
			});
	}

	/**
	 * Authenticate a user via the API (replaces the old form-based login).
	 * For E2E, this uses the test-claim bypass to call /api/auth/google directly.
	 */
	async login(email?: string, _password?: string): Promise<void> {
		const user: TestUser = {
			email: email ?? FIXTURE_USER.email,
			username: email?.split('@')[0] ?? FIXTURE_USER.username,
			password: '',
		};
		await this.loginViaApi(user);
	}

	/**
	 * Register (and authenticate) a user via the API.
	 * Since Google sign-in creates the user on first login, register and login
	 * are equivalent — both call /api/auth/google.
	 */
	async register(user: TestUser): Promise<void> {
		await this.loginViaApi(user);
	}

	/**
	 * Click the logout button
	 */
	async logout(): Promise<void> {
		if (await this.isUnauthenticatedState()) {
			return;
		}

		// Open the user dropdown from the nav bar
		const navUserButton = this.page.locator('nav button').first();
		await navUserButton.click();

		// Click the Sign Out button in the dropdown
		await this.page.getByRole('button', { name: 'Sign Out' }).click();

		await expect
			.poll(() => this.isUnauthenticatedState(), {
				timeout: 15000,
			})
			.toBe(true);
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
		await expect
			.poll(() => this.isUnauthenticatedState(), {
				timeout: 15000,
			})
			.toBe(true);
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
