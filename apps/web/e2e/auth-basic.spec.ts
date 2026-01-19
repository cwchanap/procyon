import { test } from '@playwright/test';
import { AuthHelper } from './utils/auth-helpers';

test.describe('Basic Authentication Flow', () => {
	test('should complete a basic login and logout flow', async ({ page }) => {
		const authHelper = new AuthHelper(page);
		const testUser = AuthHelper.getFixtureUser();

		await authHelper.login(testUser.email, testUser.password);
		await authHelper.expectAuthenticated(testUser.username, testUser.email);
		await authHelper.logout();
		await authHelper.expectNotAuthenticated();
	});
});
