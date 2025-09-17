import { Page, expect } from '@playwright/test';

export interface TestUser {
    email: string;
    username: string;
    password: string;
}

export class AuthHelper {
    constructor(private page: Page) {}

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
        await expect(this.page).toHaveTitle('Sign Up - Procyon Chess');
    }

    /**
     * Navigate to the login page
     */
    async goToLogin(): Promise<void> {
        await this.page.goto('/login');
        await expect(this.page).toHaveTitle('Sign In - Procyon Chess');
    }

    /**
     * Fill out and submit the registration form
     */
    async register(user: TestUser): Promise<void> {
        await this.goToRegister();

        await this.page
            .getByRole('textbox', { name: 'Email' })
            .fill(user.email);
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

        // Wait for redirect to home page
        await expect(this.page).toHaveURL('/');
        await expect(this.page).toHaveTitle('Chess Games');
    }

    /**
     * Fill out and submit the login form
     */
    async login(email: string, password: string): Promise<void> {
        await this.goToLogin();

        await this.page.getByRole('textbox', { name: 'Email' }).fill(email);
        await this.page
            .getByRole('textbox', { name: 'Password' })
            .fill(password);

        await this.page.getByRole('button', { name: 'Sign In' }).click();

        // Wait for redirect to home page
        await expect(this.page).toHaveURL('/');
        await expect(this.page).toHaveTitle('Chess Games');
    }

    /**
     * Click the logout button
     */
    async logout(): Promise<void> {
        await this.page.getByRole('button', { name: 'Logout' }).click();
    }

    /**
     * Check if user is authenticated by looking for user info in AuthNav
     */
    async expectAuthenticated(username: string, email: string): Promise<void> {
        // Wait for auth nav to load first
        await this.waitForAuthNav();

        // Check for logout button (most reliable indicator)
        await expect(
            this.page.getByRole('button', { name: 'Logout' })
        ).toBeVisible();

        // Check for username and email in the auth nav (be more specific with selectors)
        await expect(
            this.page.locator(`text=${username}`).first()
        ).toBeVisible();
        await expect(this.page.locator(`text=${email}`).first()).toBeVisible();
    }

    /**
     * Check if user is not authenticated by looking for Sign In/Sign Up buttons
     */
    async expectNotAuthenticated(): Promise<void> {
        // Wait for auth nav to load first
        await this.waitForAuthNav();

        // Check for sign in and sign up buttons
        await expect(
            this.page.getByRole('button', { name: 'Sign In' })
        ).toBeVisible();
        await expect(
            this.page.getByRole('button', { name: 'Sign Up' })
        ).toBeVisible();

        // Ensure logout button is NOT visible
        await expect(
            this.page.getByRole('button', { name: 'Logout' })
        ).not.toBeVisible();
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
        // Wait for either Sign In button or Logout button to be visible
        try {
            await Promise.race([
                this.page
                    .getByRole('button', { name: 'Sign In' })
                    .waitFor({ state: 'visible', timeout: 5000 }),
                this.page
                    .getByRole('button', { name: 'Logout' })
                    .waitFor({ state: 'visible', timeout: 5000 }),
            ]);
        } catch (_error) {
            // If neither appears, wait a bit and try once more
            await this.page.waitForTimeout(1000);
            await Promise.race([
                this.page
                    .getByRole('button', { name: 'Sign In' })
                    .waitFor({ state: 'visible', timeout: 3000 }),
                this.page
                    .getByRole('button', { name: 'Logout' })
                    .waitFor({ state: 'visible', timeout: 3000 }),
            ]);
        }
    }
}
