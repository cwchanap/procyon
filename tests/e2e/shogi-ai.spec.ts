import { test, expect } from '@playwright/test';

test.describe('Shogi AI Integration', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/shogi');
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
            page.getByRole('heading', { name: '将棋 (Shogi)' })
        ).toBeVisible();

        // AI player selection dropdown should be visible
        await expect(page.getByRole('combobox')).toBeVisible();
        await expect(page.getByText('AI plays Gote (後手)')).toBeVisible();

        // Game board should be visible with proper layout
        await expect(page.getByText('香')).toBeVisible(); // Lance pieces
        await expect(page.getByText('王')).toBeVisible(); // King (Gote)
        await expect(page.getByText('玉')).toBeVisible(); // King (Sente)
    });

    test('should allow switching AI player side', async ({ page }) => {
        // Activate AI mode
        await page.getByRole('button', { name: '🤖 AI Mode' }).click();

        // Check default AI player is Gote
        const dropdown = page.getByRole('combobox');
        await expect(dropdown).toHaveValue('gote');

        // Switch to AI plays Sente
        await dropdown.selectOption('sente');

        // Check selection changed
        await expect(dropdown).toHaveValue('sente');
        await expect(page.getByText('AI plays Sente (先手)')).toBeVisible();
    });

    test('should display proper game status in AI mode', async ({ page }) => {
        // Activate AI mode
        await page.getByRole('button', { name: '🤖 AI Mode' }).click();

        // Should show human player indicator when it's human's turn
        await expect(page.getByText('👤 Human 先手 to move')).toBeVisible();

        // Game controls should be available
        await expect(
            page.getByRole('button', { name: '❌ Clear Selection' })
        ).toBeVisible();
        await expect(
            page.getByRole('button', { name: '🆕 New Game' })
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
            page.getByRole('heading', { name: 'Shogi Logic & Tutorials' })
        ).toBeVisible();

        // Switch to AI mode
        await page.getByRole('button', { name: '🤖 AI Mode' }).click();
        await expect(
            page.getByRole('button', { name: '🤖 AI Mode' })
        ).toHaveClass(/from-blue-500/);
        await expect(
            page.getByRole('heading', { name: '将棋 (Shogi)' })
        ).toBeVisible();

        // Switch back to Play mode
        await page.getByRole('button', { name: '🎮 Play Mode' }).click();
        await expect(
            page.getByRole('button', { name: '🎮 Play Mode' })
        ).toHaveClass(/from-red-500/);
    });

    test('should maintain shogi board functionality in AI mode', async ({
        page,
    }) => {
        // Activate AI mode
        await page.getByRole('button', { name: '🤖 AI Mode' }).click();

        // Check shogi-specific pieces are visible
        await expect(page.getByText('香')).toBeVisible(); // Lance
        await expect(page.getByText('桂')).toBeVisible(); // Knight
        await expect(page.getByText('銀')).toBeVisible(); // Silver
        await expect(page.getByText('金')).toBeVisible(); // Gold
        await expect(page.getByText('王')).toBeVisible(); // King (Gote)
        await expect(page.getByText('玉')).toBeVisible(); // King (Sente)
        await expect(page.getByText('飛')).toBeVisible(); // Rook
        await expect(page.getByText('角')).toBeVisible(); // Bishop
        await expect(page.getByText('歩')).toBeVisible(); // Pawn

        // Check hand areas are present
        await expect(page.getByText('後手の持ち駒')).toBeVisible(); // Gote's captured pieces
        await expect(page.getByText('先手の持ち駒')).toBeVisible(); // Sente's captured pieces

        // Test New Game functionality
        await page.getByRole('button', { name: '🆕 New Game' }).click();
        await expect(page.getByText('👤 Human 先手 to move')).toBeVisible();
    });

    test('should display shogi game instructions', async ({ page }) => {
        // Activate AI mode
        await page.getByRole('button', { name: '🤖 AI Mode' }).click();

        // Check basic game instructions
        await expect(
            page.getByText(
                'Click on a piece to select it, then click on a highlighted square to move.'
            )
        ).toBeVisible();
        await expect(
            page.getByText(
                'Click on pieces in your hand to drop them on the board.'
            )
        ).toBeVisible();
        await expect(page.getByText('Possible moves')).toBeVisible();
        await expect(page.getByText('Captures')).toBeVisible();

        // Check shogi-specific instructions
        await expect(
            page.getByText(
                '先手 (Sente) plays first and pieces point upward. 後手 (Gote) pieces are rotated and point downward.'
            )
        ).toBeVisible();
    });

    test('should display shogi board coordinates correctly', async ({
        page,
    }) => {
        // Activate AI mode
        await page.getByRole('button', { name: '🤖 AI Mode' }).click();

        // Check file numbers (9-1) are visible
        await expect(page.getByText('9')).toBeVisible();
        await expect(page.getByText('1')).toBeVisible();

        // Check rank letters (a-i) are visible
        await expect(page.getByText('a')).toBeVisible();
        await expect(page.getByText('i')).toBeVisible();
    });

    test('should handle piece selection in AI mode', async ({ page }) => {
        // Activate AI mode
        await page.getByRole('button', { name: '🤖 AI Mode' }).click();

        // Try to select a Sente piece (human player's piece)
        // This should work since it's the human player's turn
        const sentePawn = page.locator('text=歩').last(); // Bottom row pawn
        await sentePawn.click();

        // Clear selection button should be available for testing
        await page.getByRole('button', { name: '❌ Clear Selection' }).click();

        // Reset game to clear any state
        await page.getByRole('button', { name: '🆕 New Game' }).click();
        await expect(page.getByText('👤 Human 先手 to move')).toBeVisible();
    });

    test('should mock AI responses for shogi testing', async ({
        page,
        context,
    }) => {
        // Mock the AI service calls
        await page.route('**/api/ai/**', async route => {
            // Mock successful Shogi AI response
            const mockResponse = {
                move: {
                    from: '9g',
                    to: '9f',
                    reasoning: 'Opening move advancing pawn',
                },
                confidence: 85,
                thinking:
                    'Standard opening move pushing the edge pawn forward.',
            };

            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify(mockResponse),
            });
        });

        // Mock fetch calls to external AI APIs for Shogi
        await context.route(
            '**/generativelanguage.googleapis.com/**',
            async route => {
                const mockGeminiResponse = {
                    candidates: [
                        {
                            content: {
                                parts: [
                                    {
                                        text: '{"move": {"from": "9g", "to": "9f"}, "reasoning": "Advancing pawn for better position", "confidence": 80}',
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
                                '{"move": {"from": "9g", "to": "9f"}, "reasoning": "Strategic pawn advance", "confidence": 85}',
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

        // Test AI integration with mocked responses
        await page.getByRole('button', { name: '🤖 AI Mode' }).click();

        // The AI should be ready to play with mocked responses
        await expect(page.getByText('👤 Human 先手 to move')).toBeVisible();

        // Test drop move mocking
        await context.route('**/api/ai/**', async route => {
            // Mock drop move response
            const mockDropResponse = {
                move: {
                    from: '*', // Drop move indicator
                    to: '5e',
                    reasoning: 'Dropping captured piece for tactical advantage',
                },
                confidence: 90,
                thinking:
                    'Dropping the captured pawn in the center for better control.',
            };

            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify(mockDropResponse),
            });
        });

        // Note: Actual AI move testing would require triggering the AI move logic
        // This sets up comprehensive mocking for both regular moves and drop moves
    });

    test('should handle shogi promotion zones in AI mode', async ({ page }) => {
        // Activate AI mode
        await page.getByRole('button', { name: '🤖 AI Mode' }).click();

        // The promotion zones are the first 3 ranks for each player
        // We can't easily test promotion in E2E without making actual moves
        // But we can verify the board structure supports it

        // Check that pieces are positioned correctly
        await expect(page.getByText('歩')).toBeVisible(); // Pawns in starting position

        // Ensure game state is correct
        await expect(page.getByText('👤 Human 先手 to move')).toBeVisible();
    });

    test('should display empty hand areas initially', async ({ page }) => {
        // Activate AI mode
        await page.getByRole('button', { name: '🤖 AI Mode' }).click();

        // Check hand areas show no captured pieces initially
        await expect(page.getByText('持ち駒なし')).toBeVisible(); // "No captured pieces"
    });
});
