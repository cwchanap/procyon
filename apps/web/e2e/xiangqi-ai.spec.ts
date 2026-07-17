import { test, expect } from '@playwright/test';

test.describe('Xiangqi AI Integration', () => {
	test.beforeEach(async ({ page }) => {
		await page.goto('/xiangqi');
		await page.waitForFunction(() => {
			const global = window as unknown as Record<string, unknown>;
			return !!global.__PROCYON_DEBUG_XIANGQI_STATE__;
		});
	});

	test('should render Xiangqi AI mode by default', async ({ page }) => {
		await expect(
			page.getByRole('heading', { name: 'Chinese Chess (象棋)' })
		).toBeVisible();
		await expect(
			page.getByRole('button', { name: /Play vs AI/i })
		).toBeVisible();
		await expect(
			page.getByRole('button', { name: /^Tutorial$/ })
		).toBeVisible();
		await expect(page.getByRole('button', { name: '▶️ Start' })).toBeVisible();
	});

	test('should switch between tutorial and AI modes', async ({ page }) => {
		// Switch to tutorial mode via BoardSidePanel
		await page.getByRole('button', { name: /^Tutorial$/ }).click();
		await page.waitForFunction(() => {
			const global = window as unknown as Record<string, unknown>;
			const state = global.__PROCYON_DEBUG_XIANGQI_STATE__ as
				| { hasGameStarted: boolean; gameMode: string }
				| undefined;
			return state && state.gameMode === 'tutorial';
		});
		await expect(
			page.getByRole('heading', { name: 'Basic Piece Movement' })
		).toBeVisible();
		await expect(page.getByText(/Xiangqi Wisdom/)).toBeVisible();

		// Switch back to AI mode via BoardSidePanel
		await page.getByRole('button', { name: /Play vs AI/i }).click();
		await page.waitForFunction(() => {
			const global = window as unknown as Record<string, unknown>;
			const state = global.__PROCYON_DEBUG_XIANGQI_STATE__ as
				| { hasGameStarted: boolean; gameMode: string }
				| undefined;
			return state && state.gameMode === 'ai';
		});
		await expect(
			page.getByText('AI Mode - Configure API key to play against AI')
		).toBeVisible();
	});

	test('should show Xiangqi board and pieces after starting a game', async ({
		page,
	}) => {
		await page.getByRole('button', { name: /Start|New Game/ }).click();
		await page.waitForFunction(() => {
			const global = window as unknown as Record<string, unknown>;
			const state = global.__PROCYON_DEBUG_XIANGQI_STATE__ as
				| { hasGameStarted: boolean; gameMode: string }
				| undefined;
			return state && state.hasGameStarted === true;
		});
		await page.waitForFunction(() =>
			document.body.innerText.includes('Human 红方 (Red) to move')
		);
		await expect(page.getByText('车').first()).toBeVisible();
		await expect(page.getByText('将').first()).toBeVisible();
		await expect(page.getByText('帅').first()).toBeVisible();
		await expect(page.getByText('楚河 汉界')).toBeVisible();
	});

	test('should display xiangqi game instructions in AI mode', async ({
		page,
	}) => {
		// In AI mode by default
		await expect(
			page.getByText(
				'Click on a piece to select it, then click on a highlighted square to move.'
			)
		).toBeVisible();
		await expect(page.getByText('Possible moves')).toBeVisible();
		await expect(page.getByText('Captures')).toBeVisible();
		await expect(
			page.getByText('帅/将=General, 仕/士=Advisor, 相/象=Elephant')
		).toBeVisible();
		await expect(
			page.getByText('马=Horse, 车=Chariot, 炮=Cannon, 兵/卒=Soldier')
		).toBeVisible();
		await expect(
			page.getByText(/Checkmate the opponent.?s General \(King\)/)
		).toBeVisible();
	});

	test('should allow piece selection in AI mode after starting', async ({
		page,
	}) => {
		const startOrNewGameButton = page.getByRole('button', {
			name: /Start|New Game/,
		});
		await startOrNewGameButton.click();
		await page.waitForFunction(() => {
			const global = window as unknown as Record<string, unknown>;
			const state = global.__PROCYON_DEBUG_XIANGQI_STATE__ as
				| { hasGameStarted: boolean; gameMode: string }
				| undefined;
			return state && state.hasGameStarted === true;
		});
		await page.waitForFunction(() =>
			document.body.innerText.includes('Human 红方 (Red) to move')
		);

		const redSoldier = page.locator('text=兵').first();
		await redSoldier.click();

		// Reset game to clear selection and return to pre-start overlay state
		await startOrNewGameButton.click();
		await page.waitForFunction(() => {
			const global = window as unknown as Record<string, unknown>;
			const state = global.__PROCYON_DEBUG_XIANGQI_STATE__ as
				| { hasGameStarted: boolean; gameMode: string }
				| undefined;
			return state && state.hasGameStarted === false;
		});
		await expect(
			page.getByText('Click "Start" to begin playing')
		).toBeVisible();
	});
});
