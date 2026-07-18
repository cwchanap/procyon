import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { render, fireEvent, waitFor, act } from '@testing-library/react';
import React from 'react';
import { setupReactDom } from '../test/reactSetup';
import XiangqiGame from './XiangqiGame';
import ShogiGame from './ShogiGame';
import JungleGame from './JungleGame';
import { resetAIConfigStore, setConfig } from '../lib/ai/ai-config-store';

setupReactDom();

// Covers the three makeAIMove body paths (success / no-valid-response /
// catch) for the variants whose AI-move bodies are NOT already covered by
// ChessGame.test.tsx. The cross-variant stale-gen tests
// (CrossVariantInvalidation.test.tsx) only exercise the early `if
// (isStale(gen)) return` bail, so the bodies past that guard — move
// parsing/application, the "AI did not return a valid response" else
// branch, and the catch block — stay uncovered there.
//
// Auth/fetch strategy mirrors CrossVariantInvalidation: drive auth via the
// unauthenticated path with a mocked 401 /auth/session so fetchSession
// settles quickly (loading=false, configPending=false) and the AI-turn
// effect can fire. localStorage is pointed at window.localStorage so the
// AI config store's local persistence doesn't throw.

type VariantCase = {
	name: string;
	Component: React.FC;
	selectId: string;
	firstPlayerValue: string;
	/** Valid opening move JSON body for this variant's rule guardian. */
	validMoveBody: string;
	/** aria-label of the AI's first-move source square (the piece the AI
	 * moves with firstPlayerValue). Used to verify the AI move actually
	 * relocates that piece, and as the click target for the AI-turn
	 * no-op guard test (clicking the current player's piece would select
	 * it if the guard were absent). */
	sourceSquareLabel: string;
	/** aria-label of a human-piece square on the human's first turn (the
	 * default AI side plays second). Used as the click target for the
	 * human-turn board-click test. */
	humanPieceLabel: string;
};

const VARIANTS: VariantCase[] = [
	{
		name: 'XiangqiGame',
		Component: XiangqiGame,
		selectId: 'xiangqi-ai-side',
		firstPlayerValue: 'red',
		validMoveBody:
			'{"move":{"from":"a1","to":"a2"},"thinking":"valid","confidence":0.9}',
		// a1 = col 0 (file a), row 9 (rank 1) = red chariot.
		sourceSquareLabel: 'Square 9-0',
		// Default AI = black, human = red; red chariot at a1.
		humanPieceLabel: 'Square 9-0',
	},
	{
		name: 'ShogiGame',
		Component: ShogiGame,
		selectId: 'shogi-ai-side',
		firstPlayerValue: 'sente',
		validMoveBody:
			'{"move":{"from":"7g","to":"7f"},"thinking":"valid","confidence":0.9}',
		// 7g = col 2 (file 7), row 6 (rank g) = sente pawn.
		sourceSquareLabel: 'Square 6-2',
		// Default AI = gote, human = sente; sente lance at 9i = col 0, row 8.
		humanPieceLabel: 'Square 8-0',
	},
	{
		name: 'JungleGame',
		Component: JungleGame,
		selectId: 'jungle-ai-side',
		firstPlayerValue: 'red',
		validMoveBody:
			'{"move":{"from":"a1","to":"a2"},"thinking":"valid","confidence":0.9}',
		// a1 = col 0 (file a), row 8 (rank 1) = red lion.
		sourceSquareLabel: 'Square 8-0',
		// Default AI = blue, human = red; red lion at a1.
		humanPieceLabel: 'Square 8-0',
	},
];

type FetchMockOptions = {
	/** Gemini LLM response body text. If omitted with no reject, returns ok empty. */
	llmText?: string;
	/** Make the LLM fetch reject (triggers makeMove catch). */
	llmReject?: boolean;
};

function setupFetchMock(opts: FetchMockOptions = {}) {
	const originalFetch = globalThis.fetch;
	const originalLocalStorageDesc = Object.getOwnPropertyDescriptor(
		globalThis,
		'localStorage'
	);
	Object.defineProperty(globalThis, 'localStorage', {
		configurable: true,
		value: window.localStorage,
	});

	let llmCalled = false;
	(globalThis as unknown as { fetch: unknown }).fetch = ((url: string) => {
		if (url.includes('/auth/session')) {
			return Promise.resolve({
				ok: false,
				status: 401,
				json: () => Promise.resolve({}),
			});
		}
		// LLM (gemini) call
		llmCalled = true;
		if (opts.llmReject) {
			return Promise.reject(new Error('Network error'));
		}
		const text =
			opts.llmText ??
			JSON.stringify({
				candidates: [
					{ content: { parts: [{ text: '' }] }, finishReason: 'STOP' },
				],
			});
		return Promise.resolve({
			ok: true,
			status: 200,
			json: () =>
				Promise.resolve({
					candidates: [
						{ content: { parts: [{ text }] }, finishReason: 'STOP' },
					],
				}),
		});
	}) as unknown as typeof fetch;

	return {
		get llmCalled() {
			return llmCalled;
		},
		restore() {
			(globalThis as unknown as { fetch: unknown }).fetch = originalFetch;
			if (originalLocalStorageDesc) {
				Object.defineProperty(
					globalThis,
					'localStorage',
					originalLocalStorageDesc
				);
			} else {
				delete (globalThis as Record<string, unknown>).localStorage;
			}
		},
	};
}

async function waitForAuthSettled() {
	await act(async () => {
		for (let i = 0; i < 25; i++) {
			await Promise.resolve();
		}
	});
}

describe.each(VARIANTS)(
	'$name — makeAIMove body paths',
	({
		Component,
		selectId,
		firstPlayerValue,
		validMoveBody,
		sourceSquareLabel,
		humanPieceLabel,
	}) => {
		beforeEach(() => {
			delete (window as unknown as Record<string, unknown>)
				.__PROCYON_INITIAL_AUTH_USER__;
			resetAIConfigStore();
		});

		afterEach(() => {
			delete (window as unknown as Record<string, unknown>)
				.__PROCYON_INITIAL_AUTH_USER__;
			resetAIConfigStore();
		});

		test('unparseable LLM response: makeMove returns null -> "AI did not return a valid response" error', async () => {
			// Config is enabled (so AIStatusPanel renders the error branch, not
			// the "not configured" branch), but the LLM returns plain text with
			// no JSON. callLLM returns the text (non-empty, no throw),
			// parseAIResponse finds no JSON object -> returns null, and makeMove
			// returns null (without throwing) -> the makeAIMove else branch sets
			// aiError + isAiPaused.
			const env = setupFetchMock({ llmText: 'sorry, I cannot produce a move' });
			// parseAIResponse logs console.error on the unparseable body; silence
			// those expected logs so the test output stays clean.
			const originalError = console.error;
			// eslint-disable-next-line no-console
			console.error = (..._args: unknown[]) => {};
			try {
				const { getByLabelText, getByRole, getByText } = render(<Component />);
				const select = (await waitFor(() =>
					getByLabelText(/AI plays/i)
				)) as HTMLSelectElement;
				expect(select.id).toBe(selectId);

				// Let the 401 /auth/session settle so the store reset completes,
				// THEN enable the AI config so it sticks.
				await waitForAuthSettled();
				act(() => {
					setConfig({ enabled: true, apiKey: 'fake-key' });
				});

				// AI plays the first-moving side so the AI-turn effect fires
				// immediately on Start.
				fireEvent.change(select, { target: { value: firstPlayerValue } });
				fireEvent.click(getByRole('button', { name: /start/i }));

				// makeMove calls the LLM (empty body) -> parseAIResponse null ->
				// makeMove returns null -> else branch -> "❌ AI Error" panel
				// (visible because aiConfigured is true). Fires after the 1s
				// setTimeout.
				await waitFor(
					() => {
						expect(getByText(/❌ AI Error/i)).toBeTruthy();
						expect(
							getByText(/AI did not return a valid response/i)
						).toBeTruthy();
					},
					{ timeout: 4000 }
				);
			} finally {
				// eslint-disable-next-line no-console
				console.error = originalError;
				env.restore();
			}
		});

		test('enabled config + valid LLM move: move is applied (no error, LLM called)', async () => {
			const env = setupFetchMock({ llmText: validMoveBody });
			try {
				const { getByLabelText, getByRole, getByText, queryByText } = render(
					<Component />
				);
				const select = (await waitFor(() =>
					getByLabelText(/AI plays/i)
				)) as HTMLSelectElement;

				// Wait for the 401 /auth/session to settle so the store reset
				// completes, THEN enable the AI config so it sticks.
				await waitForAuthSettled();
				act(() => {
					setConfig({ enabled: true, apiKey: 'fake-key' });
				});

				fireEvent.change(select, { target: { value: firstPlayerValue } });
				fireEvent.click(getByRole('button', { name: /start/i }));

				// The AI-turn effect fires (1s setTimeout), makeMove calls the
				// LLM (llmCalled flips true) which returns a valid opening move,
				// the rule guardian accepts it, and makeAIMove applies it.
				await waitFor(
					() => {
						expect(env.llmCalled).toBe(true);
					},
					{ timeout: 4000 }
				);
				// Drain the makeMove promise chain so setGameState flushes.
				await act(async () => {
					for (let i = 0; i < 20; i++) {
						await Promise.resolve();
					}
				});
				expect(queryByText(/❌ AI Error/i)).toBeNull();

				// Verify the move was actually applied to game state (not just
				// that the LLM was called). A successful apply switches the turn
				// to the human player, so the status subtitle flips from the
				// "🤖 AI" turn indicator to "👤 Human". A valid response that is
				// never applied would leave the turn on the AI and fail here.
				await waitFor(
					() => {
						expect(getByText(/👤 Human/)).toBeTruthy();
					},
					{ timeout: 4000 }
				);
			} finally {
				env.restore();
			}
		});

		test('enabled config + LLM reject: catch block surfaces "AI move failed" error', async () => {
			const env = setupFetchMock({ llmReject: true });
			const originalError = console.error;
			const errorCalls: string[] = [];
			// eslint-disable-next-line no-console
			console.error = (...args: unknown[]) => {
				errorCalls.push(args.join(' '));
			};
			try {
				const { getByLabelText, getByRole, getByText } = render(<Component />);
				const select = (await waitFor(() =>
					getByLabelText(/AI plays/i)
				)) as HTMLSelectElement;

				await waitForAuthSettled();
				act(() => {
					setConfig({ enabled: true, apiKey: 'fake-key' });
				});

				fireEvent.change(select, { target: { value: firstPlayerValue } });
				fireEvent.click(getByRole('button', { name: /start/i }));

				// makeMove throws (LLM fetch rejects) -> catch block logs
				// 'AI move failed:' and sets aiError.
				await waitFor(
					() => {
						expect(errorCalls.some(s => s.includes('AI move failed:'))).toBe(
							true
						);
						expect(getByText(/❌ AI Error/i)).toBeTruthy();
					},
					{ timeout: 4000 }
				);
			} finally {
				// eslint-disable-next-line no-console
				console.error = originalError;
				env.restore();
			}
		});

		test('Retry button after AI error calls retryAIMove -> error clears', async () => {
			// Covers the retryAIMove callback: setAiError(null) +
			// setIsAiPaused(false). Trigger an AI error first (unparseable
			// LLM response), then click the "🔄 Retry" button in the
			// AIStatusPanel error block.
			const env = setupFetchMock({ llmText: 'sorry, I cannot produce a move' });
			const originalError = console.error;
			// eslint-disable-next-line no-console
			console.error = (..._args: unknown[]) => {};
			try {
				const { getByLabelText, getByRole, getByText, queryByText } = render(
					<Component />
				);
				const select = (await waitFor(() =>
					getByLabelText(/AI plays/i)
				)) as HTMLSelectElement;

				await waitForAuthSettled();
				act(() => {
					setConfig({ enabled: true, apiKey: 'fake-key' });
				});

				fireEvent.change(select, { target: { value: firstPlayerValue } });
				fireEvent.click(getByRole('button', { name: /start/i }));

				// Wait for the AI error to appear.
				await waitFor(
					() => {
						expect(getByText(/❌ AI Error/i)).toBeTruthy();
					},
					{ timeout: 4000 }
				);

				// Click Retry -> retryAIMove clears aiError + isAiPaused.
				fireEvent.click(getByRole('button', { name: /Retry/i }));
				await act(async () => {
					for (let i = 0; i < 5; i++) {
						await Promise.resolve();
					}
				});
				expect(queryByText(/❌ AI Error/i)).toBeNull();
			} finally {
				// eslint-disable-next-line no-console
				console.error = originalError;
				env.restore();
			}
		});

		test('clicking a board square during AI turn is a no-op (guard returns early)', async () => {
			// Covers the handleSquareClick AI-turn guard: when gameMode is
			// 'ai' and it's the AI's turn (currentPlayer === aiPlayer), the
			// handler returns early without calling selectSquare. We start a
			// game with AI playing first, then click one of the AI's OWN
			// piece squares after the game has started (before the 1s
			// setTimeout fires the AI move). Clicking a current-player piece
			// would select it if the guard were absent, so asserting no
			// selection ring appears actually verifies the guard.
			const env = setupFetchMock({ llmText: validMoveBody });
			try {
				const { getByLabelText, getByRole, queryByText } = render(
					<Component />
				);
				const select = (await waitFor(() =>
					getByLabelText(/AI plays/i)
				)) as HTMLSelectElement;

				await waitForAuthSettled();
				act(() => {
					setConfig({ enabled: true, apiKey: 'fake-key' });
				});

				fireEvent.change(select, { target: { value: firstPlayerValue } });
				fireEvent.click(getByRole('button', { name: /start/i }));

				// Wait for the game to start (board becomes interactive).
				await act(async () => {
					for (let i = 0; i < 10; i++) {
						await Promise.resolve();
					}
				});

				// Click one of the AI's own piece squares during the AI's
				// turn. The guard should return early: no selection, no
				// error. getByLabelText throws if the square is missing, so
				// the returned element is a definite HTMLElement (no
				// noUncheckedIndexedAccess narrowing needed).
				const aiPieceSquare = getByLabelText(sourceSquareLabel);
				fireEvent.click(aiPieceSquare);

				await act(async () => {
					for (let i = 0; i < 10; i++) {
						await Promise.resolve();
					}
				});

				// No error should be surfaced from the click.
				expect(queryByText(/❌ AI Error/i)).toBeNull();
				// The guard returned early, so selectSquare was never called
				// and the clicked square is NOT selected. Xiangqi/Shogi mark
				// selection with `ring-inset`; Jungle marks it with `z-10`.
				// A guard-less handler would have selected this AI piece and
				// the className would match.
				expect(aiPieceSquare.className).not.toMatch(/ring-inset|z-10/);
			} finally {
				env.restore();
			}
		});

		test('clicking a board square during human turn in AI mode applies the move', async () => {
			// Covers the handleSquareClick body past the AI-turn guard:
			// when gameMode is 'ai' and it's the human's turn (currentPlayer
			// !== aiPlayer), the guard falls through and selectSquare is
			// called. We start a game with the DEFAULT AI side (AI plays
			// second, human plays first), then click one of the human's OWN
			// piece squares and assert it becomes selected.
			const env = setupFetchMock({ llmText: validMoveBody });
			try {
				const { getByLabelText, getByRole } = render(<Component />);
				await waitFor(() => getByLabelText(/AI plays/i));

				await waitForAuthSettled();
				act(() => {
					setConfig({ enabled: true, apiKey: 'fake-key' });
				});

				// Don't change the AI side — default is AI plays second,
				// so the human moves first.
				fireEvent.click(getByRole('button', { name: /start/i }));

				// Wait for the game to start.
				await act(async () => {
					for (let i = 0; i < 10; i++) {
						await Promise.resolve();
					}
				});

				// Click one of the human's own piece squares during the
				// human's turn. The guard falls through and selectSquare
				// selects the piece. getByLabelText throws if the square is
				// missing, so the returned element is a definite HTMLElement.
				const humanPieceSquare = getByLabelText(humanPieceLabel);
				fireEvent.click(humanPieceSquare);

				await act(async () => {
					for (let i = 0; i < 10; i++) {
						await Promise.resolve();
					}
				});

				// selectSquare selected the piece, so the square now shows
				// the selection ring. Xiangqi/Shogi use `ring-inset`;
				// Jungle uses `z-10`. An inert handler (no selectSquare
				// call) would leave the className unchanged and fail here.
				expect(humanPieceSquare.className).toMatch(/ring-inset|z-10/);
			} finally {
				env.restore();
			}
		});

		test('debug mode ON + AI move: debug callback fires -> "AI Move History" appears', async () => {
			// With debug mode ON, the debug-callback useEffect registers a
			// callback on the AI service. When makeMove runs, it calls the
			// callback for ai-debug (thinking) and ai-move (result) events.
			// The callback appends to aiDebugMoves, and AIDebugDialog renders
			// "AI Move History" when moves exist. This covers the debug
			// callback body (stale-bail guard + createAIMove append) across
			// all variants.
			const env = setupFetchMock({ llmText: validMoveBody });
			try {
				const { getByLabelText, getByRole, getByText } = render(<Component />);
				const select = (await waitFor(() =>
					getByLabelText(/AI plays/i)
				)) as HTMLSelectElement;

				await waitForAuthSettled();
				act(() => {
					setConfig({ enabled: true, apiKey: 'fake-key' });
				});

				// Toggle debug mode ON before starting.
				fireEvent.click(getByRole('button', { name: /Debug Mode/i }));

				fireEvent.change(select, { target: { value: firstPlayerValue } });
				fireEvent.click(getByRole('button', { name: /start/i }));

				// The AI-turn effect fires (1s setTimeout), makeMove calls
				// the debug callback (ai-debug + ai-move events) which
				// appends to aiDebugMoves -> AIDebugDialog renders "AI Move
				// History".
				await waitFor(
					() => {
						expect(getByText(/AI Move History/i)).toBeTruthy();
					},
					{ timeout: 4000 }
				);
			} finally {
				env.restore();
			}
		});
	}
);

// Shogi-specific: the catch block in makeAIMove has a debug-mode error
// callback (lines 412-417) that appends an error entry to aiDebugMoves
// when isDebugMode is true. This is Shogi-only — Chess has a similar
// block but it's already covered by ChessGame.test.tsx, and Xiangqi/Jungle
// don't have it.
describe('ShogiGame — debug mode + AI error', () => {
	beforeEach(() => {
		delete (window as unknown as Record<string, unknown>)
			.__PROCYON_INITIAL_AUTH_USER__;
		resetAIConfigStore();
	});

	afterEach(() => {
		delete (window as unknown as Record<string, unknown>)
			.__PROCYON_INITIAL_AUTH_USER__;
		resetAIConfigStore();
	});

	test('debug mode ON + LLM reject: catch block appends error to AI Move History', async () => {
		const env = setupFetchMock({ llmReject: true });
		const originalError = console.error;
		const errorCalls: string[] = [];
		// eslint-disable-next-line no-console
		console.error = (...args: unknown[]) => {
			errorCalls.push(args.join(' '));
		};
		try {
			const { getByLabelText, getByRole, getByText } = render(<ShogiGame />);
			const select = (await waitFor(() =>
				getByLabelText(/AI plays/i)
			)) as HTMLSelectElement;

			await act(async () => {
				for (let i = 0; i < 25; i++) {
					await Promise.resolve();
				}
			});
			act(() => {
				setConfig({ enabled: true, apiKey: 'fake-key' });
			});

			// Toggle debug mode ON.
			fireEvent.click(getByRole('button', { name: /Debug Mode/i }));

			fireEvent.change(select, { target: { value: 'sente' } });
			fireEvent.click(getByRole('button', { name: /start/i }));

			// makeMove throws (LLM reject) -> catch block sets aiError
			// AND appends an error entry to aiDebugMoves (because
			// isDebugMode is true) -> "AI Move History" appears with
			// the error entry.
			await waitFor(
				() => {
					expect(getByText(/AI Move History/i)).toBeTruthy();
				},
				{ timeout: 4000 }
			);
		} finally {
			// eslint-disable-next-line no-console
			console.error = originalError;
			env.restore();
		}
	});
});

// Shogi-specific: the DEV-only global __PROCYON_DEBUG_SHOGI_TRIGGER_PROMOTION__
// sets up a pendingPromotion state for E2E/manual debugging. Covers the
// invalidate + setIsAIThinking + setGameStarted + setGameState block.
describe('ShogiGame — debug promotion trigger', () => {
	const env = import.meta.env as unknown as { DEV: boolean };
	const originalDev = env.DEV;

	beforeEach(() => {
		delete (window as unknown as Record<string, unknown>)
			.__PROCYON_INITIAL_AUTH_USER__;
		resetAIConfigStore();
		env.DEV = true;
	});

	afterEach(() => {
		delete (window as unknown as Record<string, unknown>)
			.__PROCYON_INITIAL_AUTH_USER__;
		resetAIConfigStore();
		env.DEV = originalDev;
	});

	test('calling global promotion trigger sets pendingPromotion state', async () => {
		const fetchEnv = setupFetchMock();
		try {
			const { getByText, queryByText } = render(<ShogiGame />);

			// Wait for the component to register the global trigger.
			await act(async () => {
				for (let i = 0; i < 15; i++) {
					await Promise.resolve();
				}
			});

			// Precondition: no promotion dialog yet. Establishes that the
			// postcondition below is a real state transition.
			expect(queryByText(/Promote your/i)).toBeNull();

			const triggerKey = '__PROCYON_DEBUG_SHOGI_TRIGGER_PROMOTION__';
			const trigger = (
				window as unknown as Record<string, (() => void) | undefined>
			)[triggerKey];
			expect(trigger).toBeDefined();

			act(() => {
				trigger!();
			});

			// The trigger sets pendingPromotion, which renders the
			// promotion dialog ("Promote your pawn?"). Asserting the
			// dialog text appears verifies the trigger actually set the
			// state — a no-op trigger would leave queryByText null and
			// fail here. Drain effects first so the render flushes.
			await act(async () => {
				for (let i = 0; i < 10; i++) {
					await Promise.resolve();
				}
			});
			expect(getByText(/Promote your/i)).toBeTruthy();
			expect(getByText(/✓ Promote/i)).toBeTruthy();
		} finally {
			fetchEnv.restore();
		}
	});
});

// Jungle-specific: the rule guardian validates that a piece exists at the
// from-position and belongs to the current player, but does NOT validate
// that the destination is a legal move. When the LLM returns a move with
// a valid from-position but an illegal destination, the rule guardian
// passes it, makeMove returns it, and the component's selectSquare fails
// to apply the move — moveHistory doesn't grow, and the "AI move invalid:
// unable to apply" throw fires (lines 331-333).
describe('JungleGame — AI move with illegal destination', () => {
	beforeEach(() => {
		delete (window as unknown as Record<string, unknown>)
			.__PROCYON_INITIAL_AUTH_USER__;
		resetAIConfigStore();
	});

	afterEach(() => {
		delete (window as unknown as Record<string, unknown>)
			.__PROCYON_INITIAL_AUTH_USER__;
		resetAIConfigStore();
	});

	test('LLM returns valid from but illegal destination -> "AI move invalid" error', async () => {
		// a1 = RED lion (row 8, col 0). a5 = row 4, col 0 (empty, 4
		// squares away). The lion can only move 1 square orthogonally,
		// so a1->a5 is illegal. The rule guardian passes (piece exists,
		// right color), but selectSquare doesn't apply the move.
		const env = setupFetchMock({
			llmText:
				'{"move":{"from":"a1","to":"a5"},"thinking":"invalid","confidence":0.5}',
		});
		const originalError = console.error;
		// eslint-disable-next-line no-console
		console.error = (..._args: unknown[]) => {};
		try {
			const { getByLabelText, getByRole, getByText } = render(<JungleGame />);
			const select = (await waitFor(() =>
				getByLabelText(/AI plays/i)
			)) as HTMLSelectElement;

			await act(async () => {
				for (let i = 0; i < 25; i++) {
					await Promise.resolve();
				}
			});
			act(() => {
				setConfig({ enabled: true, apiKey: 'fake-key' });
			});

			fireEvent.change(select, { target: { value: 'red' } });
			fireEvent.click(getByRole('button', { name: /start/i }));

			// The AI-turn effect fires, makeMove returns the move,
			// selectSquare doesn't apply it (illegal destination),
			// moveHistory doesn't grow -> throw "AI move invalid:
			// unable to apply a1 -> a5" -> catch block sets aiError.
			await waitFor(
				() => {
					expect(getByText(/❌ AI Error/i)).toBeTruthy();
					expect(
						getByText(/AI move invalid: unable to apply a1 -> a5/i)
					).toBeTruthy();
				},
				{ timeout: 4000 }
			);
		} finally {
			// eslint-disable-next-line no-console
			console.error = originalError;
			env.restore();
		}
	});
});

// Shogi-specific: same pattern as Jungle — the rule guardian validates
// from-position and piece ownership but NOT destination legality. When
// the LLM returns a valid from (7g = sente pawn) but an illegal
// destination (7a = 6 squares forward), makeShogiAIMove returns null
// and the "Failed to apply AI move" throw fires (line 392).
describe('ShogiGame — AI move with illegal destination', () => {
	beforeEach(() => {
		delete (window as unknown as Record<string, unknown>)
			.__PROCYON_INITIAL_AUTH_USER__;
		resetAIConfigStore();
	});

	afterEach(() => {
		delete (window as unknown as Record<string, unknown>)
			.__PROCYON_INITIAL_AUTH_USER__;
		resetAIConfigStore();
	});

	test('LLM returns valid from but illegal destination -> "Failed to apply" error', async () => {
		// 7g = sente pawn (col 2, row 6). 7a = col 2, row 0 (6 squares
		// forward — a pawn can only move 1 square). The rule guardian
		// passes, but makeShogiAIMove returns null.
		const env = setupFetchMock({
			llmText:
				'{"move":{"from":"7g","to":"7a"},"thinking":"invalid","confidence":0.5}',
		});
		const originalError = console.error;
		// eslint-disable-next-line no-console
		console.error = (..._args: unknown[]) => {};
		try {
			const { getByLabelText, getByRole, getByText } = render(<ShogiGame />);
			const select = (await waitFor(() =>
				getByLabelText(/AI plays/i)
			)) as HTMLSelectElement;

			await act(async () => {
				for (let i = 0; i < 25; i++) {
					await Promise.resolve();
				}
			});
			act(() => {
				setConfig({ enabled: true, apiKey: 'fake-key' });
			});

			fireEvent.change(select, { target: { value: 'sente' } });
			fireEvent.click(getByRole('button', { name: /start/i }));

			await waitFor(
				() => {
					expect(getByText(/❌ AI Error/i)).toBeTruthy();
					expect(
						getByText(/Failed to apply AI move: from=7g, to=7a/i)
					).toBeTruthy();
				},
				{ timeout: 4000 }
			);
		} finally {
			// eslint-disable-next-line no-console
			console.error = originalError;
			env.restore();
		}
	});
});
