import { expect, type Page } from '@playwright/test';
import { SignJWT } from 'jose';

export interface TestUser {
	id: string;
	email: string;
	username: string;
}

const ACCESS_TOKEN_KEY = 'procyon_access_token';

/**
 * JWT secret used by the API server in E2E / CI environments.
 * Must match the `JWT_SECRET` env var set in `.github/workflows/e2e.yml`
 * and the default in `playwright.config.ts` webServer config.
 */
const E2E_JWT_SECRET =
	process.env.JWT_SECRET || 'e2e-jwt-secret-must-be-at-least-32-chars-long';

/**
 * Generate a real HS256 JWT that the API's `authMiddleware` will accept.
 * This replaces the previous `'e2e-token'` literal string which was not a
 * valid JWT and caused 401s on every protected endpoint.
 */
async function generateTestJwt(user: TestUser): Promise<string> {
	const secret = new TextEncoder().encode(E2E_JWT_SECRET);
	return await new SignJWT({
		email: user.email,
		username: user.username,
	})
		.setProtectedHeader({ alg: 'HS256' })
		.setSubject(user.id)
		.setIssuedAt()
		.setExpirationTime('1h')
		.sign(secret);
}

export class AuthHelper {
	private _googleRouteHandler?: (
		route: import('@playwright/test').Route
	) => Promise<void>;
	private _sessionRouteHandler?: (
		route: import('@playwright/test').Route
	) => Promise<void>;

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
	 *
	 * The Google login stub returns a real HS256 JWT so that subsequent requests
	 * to protected API endpoints (ai-config, play-history, ratings) pass the
	 * `authMiddleware` verification.
	 */
	async stubGoogleLogin(user: TestUser, accessToken?: string) {
		const token = accessToken ?? (await generateTestJwt(user));
		this._googleRouteHandler = async route => {
			await route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify({
					access_token: token,
					user: {
						id: user.id,
						email: user.email,
						username: user.username,
						name: user.username,
						picture: null,
					},
				}),
			});
		};
		this._sessionRouteHandler = async route => {
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
		};
		await this.page.route('**/api/auth/google', this._googleRouteHandler);
		await this.page.route('**/api/auth/session', this._sessionRouteHandler);
		return token;
	}

	/**
	 * Stub auth endpoints, plant the access token in localStorage, and land
	 * authenticated on the home page.
	 */
	async loginAsTestUser(user: TestUser, accessToken?: string) {
		const token = accessToken ?? (await generateTestJwt(user));
		await this.stubGoogleLogin(user, token);
		await this.page.goto('/');
		await this.page.evaluate(
			({ token: t, key }) => {
				window.localStorage.setItem(key, t);
			},
			{ token, key: ACCESS_TOKEN_KEY }
		);
		await this.page.context().addCookies([
			{
				name: ACCESS_TOKEN_KEY,
				value: token,
				domain: 'localhost',
				path: '/',
				httpOnly: true,
				sameSite: 'Lax',
				expires: Math.floor(Date.now() / 1000) + 60 * 60,
			},
		]);
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
		await this.page.context().clearCookies({ name: ACCESS_TOKEN_KEY });
		if (this._googleRouteHandler) {
			await this.page.unroute('**/api/auth/google', this._googleRouteHandler);
		}
		if (this._sessionRouteHandler) {
			await this.page.unroute('**/api/auth/session', this._sessionRouteHandler);
		}
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
