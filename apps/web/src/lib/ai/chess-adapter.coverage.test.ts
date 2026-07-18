import { test, expect, describe, beforeEach } from 'bun:test';
import { ChessAdapter } from './chess-adapter';
import { createInitialGameState } from '../chess/game';
import type { GameState, Move, ChessPiece } from '../chess/types';

describe('ChessAdapter - formatMoveHistory (via generatePrompt)', () => {
	let adapter: ChessAdapter;
	let gameState: GameState;

	beforeEach(() => {
		adapter = new ChessAdapter();
		gameState = createInitialGameState();
	});

	test('prompt includes move history when moves exist', () => {
		// FILES = ['a','b','c','d','e','f','g','h'], RANKS = ['8','7','6','5','4','3','2','1']
		// row 6, col 4 => RANKS[6]='2', FILES[4]='e' => 'e2'
		// row 4, col 4 => RANKS[4]='4', FILES[4]='e' => 'e4'
		const move: Move = {
			from: { row: 6, col: 4 },
			to: { row: 4, col: 4 },
			piece: { type: 'pawn', color: 'white' },
		};
		const stateWithHistory: GameState = {
			...gameState,
			moveHistory: [move],
		};
		const prompt = adapter.generatePrompt(stateWithHistory);
		expect(prompt).toContain('e2-e4');
	});

	test('prompt includes multiple moves in history', () => {
		const whiteMove: Move = {
			from: { row: 6, col: 4 },
			to: { row: 4, col: 4 },
			piece: { type: 'pawn', color: 'white' },
		};
		const blackMove: Move = {
			from: { row: 1, col: 4 },
			to: { row: 3, col: 4 },
			piece: { type: 'pawn', color: 'black' },
		};
		const stateWithHistory: GameState = {
			...gameState,
			moveHistory: [whiteMove, blackMove],
		};
		const prompt = adapter.generatePrompt(stateWithHistory);
		// Both moves should appear
		expect(prompt).toContain('e2-e4');
		expect(prompt).toContain('e7-e5');
	});

	test('prompt includes captured piece move in history', () => {
		const capturedPiece: ChessPiece = { type: 'pawn', color: 'black' };
		const move: Move = {
			from: { row: 3, col: 4 },
			to: { row: 2, col: 3 },
			piece: { type: 'pawn', color: 'white' },
			capturedPiece,
		};
		const stateWithHistory: GameState = {
			...gameState,
			moveHistory: [move],
		};
		const prompt = adapter.generatePrompt(stateWithHistory);
		expect(prompt).toContain('e5-d6');
	});
});

describe('ChessAdapter - generatePrompt defensive guard', () => {
	test('throws when getAllValidMoves returns an empty array', () => {
		const adapter = new ChessAdapter();
		// getAllValidMoves normally always returns at least one entry (it
		// substitutes a "No valid moves" string when none exist), so the
		// `if (!validMoves) throw` guard in generatePrompt is only reachable
		// if a subclass or stub breaks that invariant. Override the method
		// to return [] and assert the guard fires.
		adapter.getAllValidMoves = () => [];
		expect(() => adapter.generatePrompt(createInitialGameState())).toThrow(
			'getAllValidMoves returned an empty array'
		);
	});
});

describe('ChessAdapter - hanging pieces analysis (isSquareDefendedBy path)', () => {
	// build an 8x8 empty board with the two kings placed legally so
	// getPossibleMoves / isKingInCheck don't throw on a kingless position.
	function emptyBoardWithKings(): (ChessPiece | null)[][] {
		const board: (ChessPiece | null)[][] = Array.from({ length: 8 }, () =>
			Array(8).fill(null)
		);
		// White king on e1 (row 7, col 4), black king on e8 (row 0, col 4).
		board[7]![4] = { type: 'king', color: 'white' };
		board[0]![4] = { type: 'king', color: 'black' };
		return board;
	}

	test('prompt surfaces a hanging white knight attacked by a black pawn (defender check runs)', () => {
		const adapter = new ChessAdapter();
		const board = emptyBoardWithKings();
		// White knight on c3 (row 5, col 2).
		board[5]![2] = { type: 'knight', color: 'white' };
		// Black pawn on b4 (row 4, col 1) attacks c3 (and a3). Black pawns
		// capture toward higher rows, so row 4 col 1 -> row 5 col 0/2.
		board[4]![1] = { type: 'pawn', color: 'black' };

		const state: GameState = {
			...createInitialGameState(),
			board,
			currentPlayer: 'white',
		};

		const prompt = adapter.generatePrompt(state);
		// findHangingPieces detected the attacked knight and called
		// isSquareDefendedBy to check for a defender; with no defender
		// the knight is reported as hanging on c3.
		expect(prompt).toContain('Hanging');
		expect(prompt).toContain('knight');
		expect(prompt).toContain('c3');
	});

	test('prompt does not report a defended piece as hanging', () => {
		const adapter = new ChessAdapter();
		const board = emptyBoardWithKings();
		// White knight on c3 (row 5, col 2) attacked by black pawn b4.
		board[5]![2] = { type: 'knight', color: 'white' };
		board[4]![1] = { type: 'pawn', color: 'black' };
		// White bishop on d4 (row 4, col 3) defends c3 along the d4-c3
		// diagonal (one step up-left), so isSquareDefendedBy returns true
		// and the knight is NOT listed as hanging.
		board[4]![3] = { type: 'bishop', color: 'white' };

		const state: GameState = {
			...createInitialGameState(),
			board,
			currentPlayer: 'white',
		};

		const prompt = adapter.generatePrompt(state);
		// The defended knight is not reported as a critical threat.
		expect(prompt).not.toContain('CRITICAL THREATS');
	});
});
