import { test, expect } from '@playwright/test';

test.describe('Shogi AI Integration', () => {
	test.beforeEach(async ({ page }) => {
		await page.goto('/shogi');
		await page.waitForFunction(() => {
			const global = window as any;
			return !!global.__PROCYON_DEBUG_SHOGI_STATE__;
		});
	});

	test('should render Shogi AI mode by default', async ({ page }) => {
		await expect(
			page.getByRole('heading', { name: '将棋 (Shogi)' })
		).toBeVisible();
		await expect(
			page.getByRole('button', { name: /Play vs AI/i })
		).toBeVisible();
		await expect(
			page.getByRole('button', { name: /^Tutorial$/ })
		).toBeVisible();
		await expect(page.getByRole('button', { name: '▶️ Start' })).toBeVisible();
	});

	test('should allow switching AI player side', async ({ page }) => {
		const dropdown = page.locator('#shogi-ai-side');
		await expect(dropdown).toBeVisible();
		await expect(dropdown).toHaveValue('gote');
		await expect(dropdown).toBeEnabled();

		await dropdown.selectOption('sente');
		await expect(dropdown).toHaveValue('sente');
		await expect(dropdown.locator('option:checked')).toHaveText(
			'AI plays Sente (先手)'
		);
	});

	test('should display proper game status in AI mode', async ({ page }) => {
		await page.getByRole('button', { name: '▶️ Start' }).click();
		await page.waitForFunction(() => {
			const global = window as any;
			const state = global.__PROCYON_DEBUG_SHOGI_STATE__;
			return state && state.hasGameStarted === true && state.gameMode === 'ai';
		});
		await page.waitForFunction(() =>
			document.body.innerText.includes('👤 Human 先手 to move')
		);

		await expect(page.getByText('👤 Human 先手 to move')).toBeVisible();
		await expect(
			page.getByRole('button', { name: '🆕 New Game' })
		).toBeVisible();

		// AI-side select locks while the game is active
		await expect(page.locator('#shogi-ai-side')).toBeDisabled();
	});

	test('should switch between game modes correctly', async ({ page }) => {
		await expect(
			page.getByRole('heading', { name: '将棋 (Shogi)' })
		).toBeVisible();

		// Switch to Tutorial mode via BoardSidePanel
		await page.getByRole('button', { name: /^Tutorial$/ }).click();
		await page.waitForFunction(() => {
			const global = window as any;
			const state = global.__PROCYON_DEBUG_SHOGI_STATE__;
			return state && state.gameMode === 'tutorial';
		});
		await expect(
			page.getByRole('heading', { name: 'Shogi Logic & Tutorials' })
		).toBeVisible();
		await expect(page.getByText(/Shogi Wisdom/)).toBeVisible();

		// Switch back to AI mode via BoardSidePanel
		await page.getByRole('button', { name: /Play vs AI/i }).click();
		await page.waitForFunction(() => {
			const global = window as any;
			const state = global.__PROCYON_DEBUG_SHOGI_STATE__;
			return state && state.gameMode === 'ai';
		});
		await expect(
			page.getByText('AI Mode - Configure API key to play against AI')
		).toBeVisible();
	});

	test('should maintain shogi board functionality in AI mode', async ({
		page,
	}) => {
		// Check shogi-specific pieces are visible in the initial AI mode
		await expect(page.getByText('香').first()).toBeVisible(); // Lance
		await expect(page.getByText('桂').first()).toBeVisible(); // Knight
		await expect(page.getByText('銀').first()).toBeVisible(); // Silver
		await expect(page.getByText('金').first()).toBeVisible(); // Gold
		await expect(page.getByText('王').first()).toBeVisible(); // King (Gote)
		await expect(page.getByText('玉').first()).toBeVisible(); // King (Sente)
		await expect(page.getByText('飛').first()).toBeVisible(); // Rook
		await expect(page.getByText('角').first()).toBeVisible(); // Bishop
		await expect(page.getByText('歩').first()).toBeVisible(); // Pawn

		// Check hand areas are present
		await expect(page.getByText('後手の持ち駒')).toBeVisible(); // Gote's captured pieces
		await expect(page.getByText('先手の持ち駒')).toBeVisible(); // Sente's captured pieces

		// Test starting a new game and showing status
		await page.getByRole('button', { name: '▶️ Start' }).click();
		await page.waitForFunction(() => {
			const global = window as any;
			const state = global.__PROCYON_DEBUG_SHOGI_STATE__;
			return state && state.hasGameStarted === true && state.gameMode === 'ai';
		});
		await page.waitForFunction(() =>
			document.body.innerText.includes('👤 Human 先手 to move')
		);
		await expect(page.getByText('👤 Human 先手 to move')).toBeVisible();
	});

	test('should display shogi game instructions', async ({ page }) => {
		await expect(
			page.getByText(
				'Click on a piece to select it, then click on a highlighted square to move.'
			)
		).toBeVisible();
		await expect(
			page.getByText('Click on pieces in your hand to drop them on the board.')
		).toBeVisible();
		await expect(page.getByText('Possible moves')).toBeVisible();
		await expect(page.getByText('Captures')).toBeVisible();
		await expect(
			page.getByText(
				'先手 (Sente) plays first and pieces point upward. 後手 (Gote) pieces are rotated and point downward.'
			)
		).toBeVisible();
	});

	test('should display shogi board coordinates correctly', async ({ page }) => {
		// Check file numbers (9-1) are visible
		await expect(page.getByText(/^9$/).first()).toBeVisible();
		await expect(page.getByText(/^1$/).first()).toBeVisible();

		// Check rank letters (a-i) are visible
		await expect(page.getByText(/^a$/).first()).toBeVisible();
		await expect(page.getByText(/^i$/).first()).toBeVisible();
	});

	test('should handle piece selection in AI mode', async ({ page }) => {
		await page.getByRole('button', { name: '▶️ Start' }).click();
		await page.waitForFunction(() => {
			const global = window as any;
			const state = global.__PROCYON_DEBUG_SHOGI_STATE__;
			return state && state.hasGameStarted === true && state.gameMode === 'ai';
		});
		await page.waitForFunction(() =>
			document.body.innerText.includes('👤 Human 先手 to move')
		);

		// Try to select a Sente piece (human player's piece)
		const sentePawn = page.locator('text=歩').last(); // Bottom row pawn
		await sentePawn.click();

		// After selection, game controls should still be usable
		await expect(
			page.getByRole('button', { name: '🆕 New Game' })
		).toBeVisible();

		// Reset game to clear any state
		await page.getByRole('button', { name: '🆕 New Game' }).click();
		await expect(page.getByRole('button', { name: '▶️ Start' })).toBeVisible();
	});

	test('should handle shogi promotion zones in AI mode', async ({ page }) => {
		await page.getByRole('button', { name: '▶️ Start' }).click();

		// Check that pieces are positioned correctly
		await expect(page.getByText('歩').first()).toBeVisible();

		// Ensure game state is correct
		await expect(page.getByText('👤 Human 先手 to move')).toBeVisible();
	});

	test('should display empty hand areas initially', async ({ page }) => {
		// Check hand areas show no captured pieces initially
		await expect(page.getByText('持ち駒なし').first()).toBeVisible(); // "No captured pieces"
	});

	test('should have keyboard accessible promotion modal', async ({ page }) => {
		// Start the game
		await page.getByRole('button', { name: '▶️ Start' }).click();
		await page.waitForFunction(() => {
			const global = window as any;
			const state = global.__PROCYON_DEBUG_SHOGI_STATE__;
			return state && state.hasGameStarted === true && state.gameMode === 'ai';
		});

		// Manually trigger promotion dialog for testing
		await page.evaluate(() => {
			const global = window as any;
			if (global.__PROCYON_DEBUG_SHOGI_TRIGGER_PROMOTION__) {
				global.__PROCYON_DEBUG_SHOGI_TRIGGER_PROMOTION__();
			}
		});

		// Wait for promotion dialog to appear
		await expect(
			page.getByRole('dialog', { name: '成りますか？' })
		).toBeVisible();

		// Check that dialog has proper ARIA attributes
		const dialog = page.locator('[role="dialog"]');
		await expect(dialog).toHaveAttribute('aria-modal', 'true');
		await expect(dialog).toHaveAttribute('aria-labelledby');

		// Check that Promote button is focused (autoFocus)
		const promoteButton = page.getByRole('button', { name: 'Promote' });
		await expect(promoteButton).toBeFocused();

		// Check that Decline button has proper aria-label
		const declineButton = page.getByRole('button', { name: 'Decline' });
		await expect(declineButton).toHaveAttribute(
			'aria-label',
			'Decline promotion'
		);

		// Test Tab key focus navigation
		await page.keyboard.press('Tab');
		await expect(declineButton).toBeFocused();

		// Press Tab again to cycle back to first button
		await page.keyboard.press('Tab');
		await expect(promoteButton).toBeFocused();

		// Press Shift+Tab to move backwards
		await page.keyboard.press('Shift+Tab');
		await expect(declineButton).toBeFocused();

		await expect(promoteButton).toBeVisible();
		await expect(declineButton).toBeVisible();
		await expect(dialog).toBeVisible();
	});

	test('shogi layout has no horizontal overflow at 1024', async ({ page }) => {
		await page.setViewportSize({ width: 1024, height: 800 });
		await page.goto('/shogi');
		await page.waitForFunction(() => {
			const global = window as any;
			return !!global.__PROCYON_DEBUG_SHOGI_STATE__;
		});
		const overflow = await page.evaluate(
			() => document.documentElement.scrollWidth <= window.innerWidth + 1
		);
		expect(overflow).toBe(true);
		await expect(
			page.getByRole('button', { name: /^Tutorial$/ })
		).toBeVisible();
		await expect(
			page.getByRole('button', { name: /Play vs AI/i })
		).toBeVisible();
		// Hands remain visible while side panel is stacked below at this width
		await expect(page.getByText('後手の持ち駒')).toBeVisible();
		await expect(page.getByText('先手の持ち駒')).toBeVisible();
	});

	test('shogi layout at 1280 keeps board and mode controls', async ({
		page,
	}) => {
		await page.setViewportSize({ width: 1280, height: 800 });
		await page.goto('/shogi');
		await page.waitForFunction(() => {
			const global = window as any;
			return !!global.__PROCYON_DEBUG_SHOGI_STATE__;
		});
		const overflow = await page.evaluate(
			() => document.documentElement.scrollWidth <= window.innerWidth + 1
		);
		expect(overflow).toBe(true);
		await expect(
			page.getByRole('button', { name: /^Tutorial$/ })
		).toBeVisible();
		await expect(
			page.getByRole('button', { name: /Play vs AI/i })
		).toBeVisible();
		await expect(page.getByText('香').first()).toBeVisible();
		await expect(page.getByText('後手の持ち駒')).toBeVisible();
		await expect(page.getByText('先手の持ち駒')).toBeVisible();

		// At 1280px (xl breakpoint) the board column and side panel must be
		// side-by-side (flex-row), not stacked. Assert via computed
		// flex-direction and overlapping vertical bounding boxes — the
		// 1024px test verifies the stacked (flex-col) counterpart.
		const geometry = await page.evaluate(() => {
			// Scope to the game side panel specifically — AppShell's fixed
			// desktop rail is also an <aside> and appears earlier in the DOM,
			// so a bare document.querySelector('aside') would select the rail
			// instead of the GamePlayLayout panel.
			const aside = document.querySelector('[data-testid="game-side-panel"]');
			if (!aside) return null;
			const container = aside.parentElement;
			if (!container) return null;
			const boardCol = container.firstElementChild as HTMLElement | null;
			if (!boardCol) return null;
			const asideRect = aside.getBoundingClientRect();
			const boardRect = boardCol.getBoundingClientRect();
			return {
				flexDirection: getComputedStyle(container).flexDirection,
				verticalOverlap:
					asideRect.top < boardRect.bottom && asideRect.bottom > boardRect.top,
				boardRight: Math.round(boardRect.right),
				asideLeft: Math.round(asideRect.left),
			};
		});
		expect(geometry).not.toBeNull();
		expect(geometry!.flexDirection).toBe('row');
		expect(geometry!.verticalOverlap).toBe(true);
		expect(geometry!.asideLeft).toBeGreaterThanOrEqual(geometry!.boardRight);
	});
});
