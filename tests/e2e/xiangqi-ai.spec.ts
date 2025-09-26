import { test, expect } from '@playwright/test';

test.describe('Xiangqi AI Integration', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/xiangqi');
    });

    test('should display AI mode controls when AI mode is activated', async ({
        page,
    }) => {
        // Check initial state is Play mode
        await expect(
            page.getByRole('button', { name: '🎮 Play Mode' })
        ).toHaveClass(/from-red-500/);

        // Check AI mode button exists
        await expect(
            page.getByRole('button', { name: '🤖 AI Mode' })
        ).toBeVisible();

        // Click AI Mode
        await page.getByRole('button', { name: '🤖 AI Mode' }).click();

        // AI Mode should be active (highlighted)
        await expect(
            page.getByRole('button', { name: '🤖 AI Mode' })
        ).toHaveClass(/from-blue-500/);

        // Title should remain as game title
        await expect(
            page.getByRole('heading', { name: 'Chinese Chess (象棋)' })
        ).toBeVisible();

        // AI player selection dropdown should be visible
        await expect(page.getByRole('combobox')).toBeVisible();
        await expect(page.getByText('AI plays Black (黑方)')).toBeVisible();

        // Game board should be visible
        await expect(page.getByText('车')).toBeVisible(); // Chariot pieces
        await expect(page.getByText('将')).toBeVisible(); // Black general
        await expect(page.getByText('帅')).toBeVisible(); // Red general
    });

    test('should allow switching AI player side', async ({ page }) => {
        // Activate AI mode
        await page.getByRole('button', { name: '🤖 AI Mode' }).click();

        // Check default AI player is Black
        const dropdown = page.getByRole('combobox');
        await expect(dropdown).toHaveValue('black');

        // Switch to AI plays Red
        await dropdown.selectOption('red');

        // Check selection changed
        await expect(dropdown).toHaveValue('red');
        await expect(page.getByText('AI plays Red (红方)')).toBeVisible();
    });

    test('should display proper game status in AI mode', async ({ page }) => {
        // Activate AI mode
        await page.getByRole('button', { name: '🤖 AI Mode' }).click();

        // Should show human player indicator when it's human's turn
        await expect(
            page.getByText('👤 Human 红方 (Red) to move')
        ).toBeVisible();

        // Game controls should be available
        await expect(
            page.getByRole('button', { name: '🆕 New Game' })
        ).toBeVisible();
        await expect(
            page.getByRole('button', { name: '↶ Undo Move' })
        ).toBeVisible();
    });

    test('should switch between game modes correctly', async ({ page }) => {
        // Start in Play mode
        await expect(
            page.getByRole('button', { name: '🎮 Play Mode' })
        ).toHaveClass(/from-red-500/);

        // Switch to Tutorial mode
        await page.getByRole('button', { name: '📚 Tutorial Mode' }).click();
        await expect(
            page.getByRole('button', { name: '📚 Tutorial Mode' })
        ).toHaveClass(/from-purple-500/);
        await expect(
            page.getByRole('heading', { name: 'Xiangqi Logic & Tutorials' })
        ).toBeVisible();

        // Switch to AI mode
        await page.getByRole('button', { name: '🤖 AI Mode' }).click();
        await expect(
            page.getByRole('button', { name: '🤖 AI Mode' })
        ).toHaveClass(/from-blue-500/);
        await expect(
            page.getByRole('heading', { name: 'Chinese Chess (象棋)' })
        ).toBeVisible();

        // Switch back to Play mode
        await page.getByRole('button', { name: '🎮 Play Mode' }).click();
        await expect(
            page.getByRole('button', { name: '🎮 Play Mode' })
        ).toHaveClass(/from-red-500/);
    });

    test('should maintain xiangqi board functionality in AI mode', async ({
        page,
    }) => {
        // Activate AI mode
        await page.getByRole('button', { name: '🤖 AI Mode' }).click();

        // Check xiangqi-specific pieces are visible
        await expect(page.getByText('车')).toBeVisible(); // Chariot
        await expect(page.getByText('马')).toBeVisible(); // Horse
        await expect(page.getByText('象')).toBeVisible(); // Elephant
        await expect(page.getByText('士')).toBeVisible(); // Advisor
        await expect(page.getByText('将')).toBeVisible(); // General (Black)
        await expect(page.getByText('帅')).toBeVisible(); // General (Red)
        await expect(page.getByText('炮')).toBeVisible(); // Cannon
        await expect(page.getByText('兵')).toBeVisible(); // Soldier (Red)
        await expect(page.getByText('卒')).toBeVisible(); // Soldier (Black)

        // Check river divider is present
        await expect(page.getByText('楚河 汉界')).toBeVisible();

        // Test New Game functionality
        await page.getByRole('button', { name: '🆕 New Game' }).click();
        await expect(
            page.getByText('👤 Human 红方 (Red) to move')
        ).toBeVisible();
    });

    test('should display xiangqi game instructions', async ({ page }) => {
        // Activate AI mode
        await page.getByRole('button', { name: '🤖 AI Mode' }).click();

        // Check basic game instructions
        await expect(
            page.getByText(
                'Click on a piece to select it, then click on a highlighted point to move.'
            )
        ).toBeVisible();
        await expect(page.getByText('Possible moves')).toBeVisible();
        await expect(page.getByText('Captures')).toBeVisible();

        // Check piece explanations
        await expect(
            page.getByText('帅/将=General, 仕/士=Advisor, 相/象=Elephant')
        ).toBeVisible();
        await expect(
            page.getByText('马=Horse, 车=Chariot, 炮=Cannon, 兵/卒=Soldier')
        ).toBeVisible();
        await expect(
            page.getByText("Checkmate the opponent's General (King)")
        ).toBeVisible();
    });

    test('should handle piece selection in AI mode', async ({ page }) => {
        // Activate AI mode
        await page.getByRole('button', { name: '🤖 AI Mode' }).click();

        // Try to select a Red piece (human player's piece)
        // This should work since it's the human player's turn
        const redSoldier = page.locator('text=兵').first();
        await redSoldier.click();

        // The piece should be selectable and game should respond
        // (Note: actual move mechanics would require more complex interaction)

        // Reset game to clear selection
        await page.getByRole('button', { name: '🆕 New Game' }).click();
        await expect(
            page.getByText('👤 Human 红方 (Red) to move')
        ).toBeVisible();
    });

    test('should mock AI responses for testing', async ({ page, context }) => {
        // Mock the AI service calls
        await page.route('**/api/ai/**', async route => {
            // Mock successful AI response
            const mockResponse = {
                move: {
                    from: 'a10',
                    to: 'a9',
                    reasoning: 'Opening move advancing soldier',
                },
                confidence: 85,
                thinking:
                    'This is a standard opening move to advance the soldier forward.',
            };

            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify(mockResponse),
            });
        });

        // Mock fetch calls to external AI APIs
        await context.route(
            '**/generativelanguage.googleapis.com/**',
            async route => {
                const mockGeminiResponse = {
                    candidates: [
                        {
                            content: {
                                parts: [
                                    {
                                        text: '{"move": {"from": "a10", "to": "a9"}, "reasoning": "Advancing soldier for better position", "confidence": 80}',
                                    },
                                ],
                            },
                        },
                    ],
                };

                await route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify(mockGeminiResponse),
                });
            }
        );

        await context.route('**/openrouter.ai/**', async route => {
            const mockOpenRouterResponse = {
                choices: [
                    {
                        message: {
                            content:
                                '{"move": {"from": "a10", "to": "a9"}, "reasoning": "Strategic soldier advance", "confidence": 85}',
                        },
                    },
                ],
            };

            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify(mockOpenRouterResponse),
            });
        });

        // Now test the AI integration with mocked responses
        await page.getByRole('button', { name: '🤖 AI Mode' }).click();

        // The AI should be ready to play with mocked responses
        await expect(
            page.getByText('👤 Human 红方 (Red) to move')
        ).toBeVisible();

        // Note: Actual AI move testing would require triggering the AI move logic
        // This could be done by switching the AI to play as Red and triggering a move
        // For now, we've set up the infrastructure to mock the AI calls
    });
});
