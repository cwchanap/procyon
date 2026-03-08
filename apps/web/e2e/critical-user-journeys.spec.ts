import { test, expect, type Page } from '@playwright/test';
import { AuthHelper } from './utils/auth-helpers';

const waitForProfileReady = async (page: Page, authenticated = true) => {
	const selector = authenticated
		? '[data-testid="profile-page"][data-auth-ready="true"][data-authenticated="true"]'
		: '[data-testid="profile-page"][data-auth-ready="true"]';

	await page.locator(selector).waitFor({ state: 'visible', timeout: 15000 });
};

const waitForLoginFormReady = async (page: Page) => {
	await page
		.locator('[data-testid="login-form"][data-hydrated="true"]')
		.waitFor({ state: 'visible', timeout: 15000 });
};

const waitForPuzzleListReady = async (page: Page) => {
	await expect(
		page.getByRole('heading', { name: 'Chess Puzzles' })
	).toBeVisible();
	await expect(page.getByText('Loading puzzles…')).not.toBeVisible({
		timeout: 15000,
	});
};

const waitForConfiguredAIProviders = async (page: Page) => {
	const noProvidersMessage = page.getByText('⚠️ No AI providers configured');
	const providerSelect = page
		.locator('label', { hasText: 'AI Provider' })
		.locator('xpath=..')
		.locator('select');

	await expect(providerSelect).toBeVisible({ timeout: 15000 });
	await expect(noProvidersMessage).not.toBeVisible({ timeout: 15000 });

	return providerSelect;
};

test.describe('Critical user journeys', () => {
	test('homepage routes users to puzzles and core game pages', async ({
		page,
	}) => {
		await page.goto('/');
		await expect(
			page.getByRole('heading', { name: 'Procyon Chess' })
		).toBeVisible();

		await page.getByRole('link', { name: 'Puzzles' }).first().click();
		await expect(page).toHaveURL('/puzzles');
		await expect(
			page.getByRole('heading', { name: 'Chess Puzzles' })
		).toBeVisible();

		const routes = [
			{ buttonName: /Play Standard Chess/, path: '/chess' },
			{ buttonName: /Play Chinese Chess/, path: '/xiangqi' },
			{ buttonName: /Play Japanese Chess \(Shogi\)/, path: '/shogi' },
			{ buttonName: /Play Jungle Chess \(鬥獸棋\)/, path: '/jungle' },
		];

		for (const route of routes) {
			await page.goto('/');
			await page.getByRole('button', { name: route.buttonName }).click();
			await expect(page).toHaveURL(route.path);
			await expect(
				page.getByRole('button', { name: '▶️ Start' })
			).toBeVisible();
		}
	});

	test('profile prompts unauthenticated users to log in', async ({ page }) => {
		await page.goto('/profile');
		await waitForProfileReady(page, false);
		await expect(
			page.getByRole('heading', { name: 'Access Denied' })
		).toBeVisible();
		await expect(
			page.getByText('Please log in to view your profile.')
		).toBeVisible();

		await page.getByRole('button', { name: 'Go to Login' }).click();
		await expect(page).toHaveURL('/login');
		await waitForLoginFormReady(page);
	});

	test('play history prompts unauthenticated users to log in', async ({
		page,
	}) => {
		await page.goto('/play-history');
		await expect(
			page.getByRole('heading', { name: 'Sign in to view your play history' })
		).toBeVisible();
		await expect(
			page.getByText(
				'Your recent games and results will appear here once you are logged in.'
			)
		).toBeVisible();

		await page.getByRole('button', { name: 'Go to Login' }).click();
		await expect(page).toHaveURL('/login');
		await waitForLoginFormReady(page);
	});

	test('puzzles load and anonymous users can open a puzzle', async ({
		page,
	}) => {
		await page.goto('/puzzles');
		await waitForPuzzleListReady(page);
		await expect(
			page.getByRole('button', { name: /Back Rank Mate/i })
		).toBeVisible({ timeout: 15000 });
		await expect(
			page.getByRole('button', { name: /Smothered Mate/i })
		).toBeVisible({ timeout: 15000 });

		await page.getByRole('button', { name: /Back Rank Mate/i }).click();
		await expect(
			page.getByRole('button', { name: 'Back to puzzles' })
		).toBeVisible();
		await expect(
			page.getByRole('heading', { name: 'Back Rank Mate' })
		).toBeVisible();
		await expect(
			page.getByText(/Find the best move for white\./i)
		).toBeVisible();
		await expect(page.getByRole('button', { name: 'Hint' })).toBeVisible();
		await expect(page.getByRole('link', { name: 'Sign in' })).toBeVisible();
		await expect(page.getByText('to save your progress.')).toBeVisible();
	});

	test('authenticated users with no games see an empty play history state', async ({
		page,
	}) => {
		const authHelper = new AuthHelper(page);
		const testUser = AuthHelper.generateTestUser();

		await authHelper.register(testUser);
		await authHelper.expectAuthenticated(testUser.username, testUser.email);

		await page.goto('/play-history');
		await expect(
			page.getByRole('heading', { name: 'Play History' })
		).toBeVisible();
		await expect(
			page.getByText('You have not recorded any games yet.')
		).toBeVisible();
		await expect(
			page.getByText('Play against an AI or a friend to start your history.')
		).toBeVisible();
	});

	test('saved AI configuration is available from a real game page', async ({
		page,
	}) => {
		const authHelper = new AuthHelper(page);
		const testUser = AuthHelper.generateTestUser();

		await authHelper.register(testUser);
		await authHelper.expectAuthenticated(testUser.username, testUser.email);

		await page.goto('/profile');
		await waitForProfileReady(page);

		await page.getByRole('combobox').first().selectOption({ label: 'OpenAI' });
		await page.getByRole('combobox').nth(1).selectOption({ label: 'GPT-4o' });
		await page
			.getByPlaceholder('Enter your API key')
			.fill('openai-test-key-12345');
		await page.getByRole('button', { name: 'Save Configuration' }).click();
		await expect(
			page.getByText('✓ Configuration saved successfully')
		).toBeVisible();

		await page.goto('/shogi');
		await page.getByRole('button', { name: '⚙️ AI Settings' }).click();
		await expect(
			page.getByRole('heading', { name: 'AI Settings' })
		).toBeVisible();
		await expect(page.getByText('AI Player')).toBeVisible();
		await expect(page.getByText('AI Provider')).toBeVisible();
		const providerSelect = await waitForConfiguredAIProviders(page);
		await expect(providerSelect).toHaveValue('openai');
		await expect(page.getByText('AI plays Gote (後手)')).toBeVisible();
	});
});
