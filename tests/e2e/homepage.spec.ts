import { test, expect } from '@playwright/test';

test.describe('Homepage', () => {
    test('should load the homepage successfully', async ({ page }) => {
        await page.goto('/');

        await expect(page).toHaveTitle('Chess Games');
        await expect(
            page.getByRole('heading', { name: 'Procyon Chess' })
        ).toBeVisible();
        await expect(
            page.getByText('Experience chess like never before')
        ).toBeVisible();
    });

    test('should display chess game options', async ({ page }) => {
        await page.goto('/');

        // Check for some of the chess variants
        await expect(
            page.getByRole('heading', { name: 'Standard Chess' })
        ).toBeVisible();
        await expect(
            page.getByRole('heading', { name: 'Chinese Chess' })
        ).toBeVisible();
        await expect(
            page.getByRole('heading', { name: 'Japanese Chess (Shogi)' })
        ).toBeVisible();
    });

    test('should show authentication navigation', async ({ page }) => {
        await page.goto('/');

        // Wait for auth nav to load using a simpler approach
        await page.waitForTimeout(2000); // Give time for React components to load

        // Should show either authenticated or unauthenticated state
        const logoutButton = page.getByRole('button', { name: 'Logout' });
        const signInButton = page.getByRole('button', { name: 'Sign In' });

        const isAuthenticated = await logoutButton
            .isVisible()
            .catch(() => false);

        if (isAuthenticated) {
            await expect(logoutButton).toBeVisible();
        } else {
            await expect(signInButton).toBeVisible();
            await expect(
                page.getByRole('button', { name: 'Sign Up' })
            ).toBeVisible();
        }
    });
});
