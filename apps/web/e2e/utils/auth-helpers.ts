import { expect, type Page } from '@playwright/test';

export interface TestUser {
	id: string;
	email: string;
	username: string;
}

const ACCESS_TOKEN_KEY = 'procyon_access_token';

export class AuthHelper {
	constructor(public page: Page) {}

	static generateTestUser(): TestUser {
		const stamp = Date.now();
		return {
			id: `test-user-${stamp}`,
			email: `test-${stamp}@example.com`,
			username: `test_${stamp}`,
		};
	}

	/**
	 * Intercept /api/auth/google and /api/auth/session so the GIS callback can
	 * be simulated without involving Google Identity Services.
	 */
	async stubGoogleLogin(user: TestUser, accessToken = 'e2e-token') {
		await this.page.route('**/api/auth/google', async route => {
			await route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify({
					access_token: accessToken,
					user: {
						id: user.id,
						email: user.email,
						username: user.username,
						name: user.username,
						picture: null,
					},
				}),
			});
		});
		await this.page.route('**/api/auth/session', async route => {
			await route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify({
					user: {
						id: user.id,
						email: user.email,
						username: user.username,
					},
				}),
			});
		});
	}

	/**
	 * Stub auth endpoints, plant the access token in localStorage, and land
	 * authenticated on the home page.
	 */
	async loginAsTestUser(user: TestUser, accessToken = 'e2e-token') {
		await this.stubGoogleLogin(user, accessToken);
		await this.page.goto('/');
		await this.page.evaluate(
			({ token, key }) => {
				window.localStorage.setItem(key, token);
			},
			{ token: accessToken, key: ACCESS_TOKEN_KEY }
		);
		await this.page.reload();
	}

	/** Backwards-compatible alias used by older specs. */
	async register(user: TestUser) {
		await this.loginAsTestUser(user);
	}

	/** Backwards-compatible alias used by older specs. */
	async login(emailOrUser: string | TestUser) {
		const user =
			typeof emailOrUser === 'string'
				? {
						id: `test-user-${Date.now()}`,
						email: emailOrUser,
						username: emailOrUser.split('@')[0] || 'tester',
					}
				: emailOrUser;
		await this.loginAsTestUser(user);
	}

	async logout() {
		await this.page.evaluate(key => {
			window.localStorage.removeItem(key);
		}, ACCESS_TOKEN_KEY);
		await this.page.goto('/');
	}

	async expectAuthenticated(username: string, _email?: string) {
		await expect(this.page.locator('body')).toContainText(username);
	}

	async expectNotAuthenticated() {
		const navLocator = this.page.locator('nav');
		const candidates = [
			navLocator.getByRole('button', { name: 'Sign In' }),
			navLocator.getByRole('link', { name: 'Sign In' }),
			navLocator.getByRole('button', { name: 'Login' }),
			navLocator.getByRole('link', { name: 'Login' }),
		];
		for (const c of candidates) {
			if (
				await c
					.first()
					.isVisible()
					.catch(() => false)
			) {
				return;
			}
		}
		throw new Error('Expected unauthenticated nav state but none was found');
	}

	async goToHome() {
		await this.page.goto('/');
	}
}
