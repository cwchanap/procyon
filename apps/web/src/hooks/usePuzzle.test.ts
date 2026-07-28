import {
	test,
	expect,
	describe,
	beforeAll,
	beforeEach,
	afterAll,
} from 'bun:test';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { PuzzleData } from '../lib/puzzle/types';
import { createGameStateFromFen } from '../lib/chess/rules';
import { setupReactDom } from '../test/reactSetup';
import {
	applyPuzzleMove,
	readLocalPuzzleProgress,
	MAX_FAILED_ATTEMPTS,
	usePuzzle,
} from './usePuzzle';

setupReactDom();

beforeAll(() => {
	window.__PROCYON_INITIAL_AUTH_USER__ = null;
});

function boardFromFen(fen: string): PuzzleData['initialBoard'] {
	return createGameStateFromFen(fen).board;
}

function makePuzzle(overrides: Partial<PuzzleData> = {}): PuzzleData {
	return {
		id: 1,
		slug: 'test-puzzle',
		title: 'Test puzzle',
		description: 'Test the authoritative chess state.',
		difficulty: 'beginner',
		playerColor: 'white',
		initialBoard: boardFromFen('7k/8/8/8/8/8/R7/7K w - - 0 1'),
		solution: [{ from: 'a2', to: 'a8' }],
		hint: {
			pieceSquare: { row: 6, col: 0 },
			targetSquare: { row: 0, col: 0 },
		},
		...overrides,
	};
}

// --- localStorage stub ---
const store: Record<string, string> = {};

const localStorageMock = {
	getItem: (key: string): string | null => store[key] ?? null,
	setItem: (key: string, value: string): void => {
		store[key] = value;
	},
	removeItem: (key: string): void => {
		delete store[key];
	},
	clear: (): void => {
		Object.keys(store).forEach(k => delete store[k]);
	},
	get length() {
		return Object.keys(store).length;
	},
	key: (index: number): string | null => Object.keys(store)[index] ?? null,
};

const originalLocalStorage = globalThis.localStorage;
const originalFetch = globalThis.fetch;
globalThis.localStorage = localStorageMock;

afterAll(() => {
	globalThis.localStorage = originalLocalStorage;
	globalThis.fetch = originalFetch;
});

describe('MAX_FAILED_ATTEMPTS constant', () => {
	test('is exported and equals 3', () => {
		expect(MAX_FAILED_ATTEMPTS).toBe(3);
	});
});

describe('authoritative puzzle chess state', () => {
	beforeEach(() => {
		globalThis.fetch = (async () =>
			new Response(null, { status: 401 })) as unknown as typeof fetch;
	});

	test('keeps one game state across player and opponent solution moves', async () => {
		const puzzle = makePuzzle({
			playerColor: 'white',
			initialBoard: boardFromFen('7k/8/8/8/8/8/R7/7K w - - 0 1'),
			solution: [
				{ from: 'a2', to: 'a8' },
				{ from: 'h8', to: 'h7' },
			],
		});
		const { result } = renderHook(() => usePuzzle());
		act(() => result.current.startPuzzle(puzzle));
		act(() => result.current.handleSquareClick({ row: 6, col: 0 }));
		act(() => result.current.handleSquareClick({ row: 0, col: 0 }));
		await waitFor(() => expect(result.current.state.phase).toBe('solved'));

		expect(result.current.state.gameState?.moveHistory).toHaveLength(2);
		expect(result.current.state.gameState?.board[0]?.[0]?.type).toBe('rook');
		expect(result.current.state.gameState?.board[1]?.[7]?.type).toBe('king');
	});

	test('rejects a scripted promotion that omits the piece', () => {
		const state = createGameStateFromFen('7k/P7/8/8/8/8/8/7K w - - 0 1');
		expect(applyPuzzleMove(state, { from: 'a7', to: 'a8' })).toBeNull();
		expect(
			applyPuzzleMove(state, {
				from: 'a7',
				to: 'a8',
				promotion: 'bishop',
			})?.board[0]?.[0]?.type
		).toBe('bishop');
	});

	test('player promotion move surfaces the dialog instead of auto-applying', async () => {
		const puzzle = makePuzzle({
			playerColor: 'white',
			initialBoard: boardFromFen('7k/P7/8/8/8/8/8/7K w - - 0 1'),
			solution: [{ from: 'a7', to: 'a8', promotion: 'queen' }],
		});
		const { result } = renderHook(() => usePuzzle());
		act(() => result.current.startPuzzle(puzzle));

		// Select the pawn on a7 (row 1, col 0)
		act(() => result.current.handleSquareClick({ row: 1, col: 0 }));
		// Click a8 (row 0, col 0) — should trigger promotion dialog, NOT auto-apply
		act(() => result.current.handleSquareClick({ row: 0, col: 0 }));

		expect(result.current.state.gameState?.pendingPromotion).not.toBeNull();
		expect(result.current.state.gameState?.pendingPromotion?.choices).toEqual([
			'queen',
			'rook',
			'bishop',
			'knight',
		]);
		// The pawn should still be on a7 — the move was NOT applied yet
		expect(result.current.state.gameState?.board[1]?.[0]?.type).toBe('pawn');
		expect(result.current.state.gameState?.board[0]?.[0]).toBeNull();

		// Confirm queen promotion — matches the scripted solution
		act(() => result.current.confirmPromotion('queen'));
		expect(result.current.state.gameState?.pendingPromotion).toBeNull();
		expect(result.current.state.gameState?.board[0]?.[0]?.type).toBe('queen');
		expect(result.current.state.phase).toBe('solved');
	});

	test('player choosing the wrong promotion piece counts as a wrong move', async () => {
		const puzzle = makePuzzle({
			playerColor: 'white',
			initialBoard: boardFromFen('7k/P7/8/8/8/8/8/7K w - - 0 1'),
			solution: [{ from: 'a7', to: 'a8', promotion: 'queen' }],
		});
		const { result } = renderHook(() => usePuzzle());
		act(() => result.current.startPuzzle(puzzle));
		act(() => result.current.handleSquareClick({ row: 1, col: 0 }));
		act(() => result.current.handleSquareClick({ row: 0, col: 0 }));

		expect(result.current.state.gameState?.pendingPromotion).not.toBeNull();

		// Choose rook — differs from the scripted queen promotion
		act(() => result.current.confirmPromotion('rook'));

		expect(result.current.state.gameState?.pendingPromotion).toBeNull();
		expect(result.current.state.failedAttempts).toBe(1);
		expect(result.current.state.phase).toBe('playing');
		// The pawn should still be on a7 — the wrong move was not applied
		expect(result.current.state.gameState?.board[1]?.[0]?.type).toBe('pawn');
	});

	test('cancelling the promotion dialog clears pending state without applying', async () => {
		const puzzle = makePuzzle({
			playerColor: 'white',
			initialBoard: boardFromFen('7k/P7/8/8/8/8/8/7K w - - 0 1'),
			solution: [{ from: 'a7', to: 'a8', promotion: 'queen' }],
		});
		const { result } = renderHook(() => usePuzzle());
		act(() => result.current.startPuzzle(puzzle));
		act(() => result.current.handleSquareClick({ row: 1, col: 0 }));
		act(() => result.current.handleSquareClick({ row: 0, col: 0 }));

		expect(result.current.state.gameState?.pendingPromotion).not.toBeNull();

		act(() => result.current.cancelPromotion());

		expect(result.current.state.gameState?.pendingPromotion).toBeNull();
		expect(result.current.state.failedAttempts).toBe(0);
		expect(result.current.state.phase).toBe('playing');
		expect(result.current.state.gameState?.board[1]?.[0]?.type).toBe('pawn');
	});

	test('fails closed when API puzzle data omits a king', async () => {
		const puzzle = makePuzzle({
			initialBoard: Array.from({ length: 8 }, () => Array<null>(8).fill(null)),
		});
		const { result } = renderHook(() => usePuzzle());
		await act(async () => {
			await new Promise(resolve => setTimeout(resolve, 0));
		});

		act(() => result.current.startPuzzle(puzzle));

		expect(result.current.state.phase).toBe('failed');
		expect(result.current.state.gameState).toBeNull();
		expect(result.current.state.showSolution).toBe(true);
	});
});

describe('readLocalPuzzleProgress', () => {
	beforeEach(() => {
		localStorageMock.clear();
	});

	test('returns empty object when localStorage has no entry', () => {
		const result = readLocalPuzzleProgress(null);
		expect(result).toEqual({});
	});

	test('returns empty object for guest user when no data stored', () => {
		const result = readLocalPuzzleProgress(undefined);
		expect(result).toEqual({});
	});

	test('returns stored progress for authenticated user', () => {
		const userId = 'user-123';
		const progress = {
			42: { solved: true, failedAttempts: 0, solvedAt: '2026-01-01T00:00:00Z' },
		};
		localStorageMock.setItem(
			`procyon_puzzle_progress_${userId}`,
			JSON.stringify(progress)
		);

		const result = readLocalPuzzleProgress(userId);
		expect(result[42]).toEqual({
			solved: true,
			failedAttempts: 0,
			solvedAt: '2026-01-01T00:00:00Z',
		});
	});

	test('returns stored progress for guest user (null userId)', () => {
		const progress = {
			7: { solved: false, failedAttempts: 2 },
		};
		localStorageMock.setItem(
			'procyon_puzzle_progress_guest',
			JSON.stringify(progress)
		);

		const result = readLocalPuzzleProgress(null);
		expect(result[7]).toEqual({ solved: false, failedAttempts: 2 });
	});

	test('returns empty object for corrupt JSON in localStorage', () => {
		localStorageMock.setItem(
			'procyon_puzzle_progress_guest',
			'not-valid-json{'
		);

		const result = readLocalPuzzleProgress(null);
		expect(result).toEqual({});
	});

	test('returns empty object when localStorage.getItem throws', () => {
		const originalGetItem = localStorageMock.getItem;
		localStorageMock.getItem = () => {
			throw new Error('localStorage unavailable');
		};

		const result = readLocalPuzzleProgress(null);
		expect(result).toEqual({});

		localStorageMock.getItem = originalGetItem;
	});

	test('scopes data per user ID - different users have separate storage', () => {
		const userA = 'user-a';
		const userB = 'user-b';

		localStorageMock.setItem(
			`procyon_puzzle_progress_${userA}`,
			JSON.stringify({ 1: { solved: true, failedAttempts: 0 } })
		);
		localStorageMock.setItem(
			`procyon_puzzle_progress_${userB}`,
			JSON.stringify({ 2: { solved: false, failedAttempts: 1 } })
		);

		const resultA = readLocalPuzzleProgress(userA);
		const resultB = readLocalPuzzleProgress(userB);

		expect(resultA[1]).toBeDefined();
		expect(resultA[2]).toBeUndefined();
		expect(resultB[2]).toBeDefined();
		expect(resultB[1]).toBeUndefined();
	});

	test('returns empty object when stored value is empty string', () => {
		localStorageMock.setItem('procyon_puzzle_progress_guest', '');
		const result = readLocalPuzzleProgress(null);
		expect(result).toEqual({});
	});

	test('handles multiple puzzle entries', () => {
		const progress = {
			1: { solved: true, failedAttempts: 0, solvedAt: '2026-01-01T00:00:00Z' },
			2: { solved: false, failedAttempts: 1 },
			3: { solved: false, failedAttempts: 3 },
		};
		localStorageMock.setItem(
			'procyon_puzzle_progress_guest',
			JSON.stringify(progress)
		);

		const result = readLocalPuzzleProgress(null);
		expect(Object.keys(result)).toHaveLength(3);
		expect(result[1]?.solved).toBe(true);
		expect(result[2]?.failedAttempts).toBe(1);
		expect(result[3]?.failedAttempts).toBe(3);
	});
});
