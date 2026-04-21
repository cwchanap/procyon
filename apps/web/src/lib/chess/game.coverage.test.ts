import { test, expect, describe } from 'bun:test';
import {
	createInitialGameState,
	makeMove,
	makeAIMove,
	isKingInCheck,
	getGameStatus,
	selectSquare,
	setAIThinking,
	isAITurn,
	algebraicToPosition,
} from './game';
import { createInitialBoard, setPieceAt } from './board';
import type { ChessPiece, GameState } from './types';

function emptyState(currentPlayer: 'white' | 'black' = 'white'): GameState {
	const state = createInitialGameState();
	for (let row = 0; row < 8; row++)
		for (let col = 0; col < 8; col++) state.board[row][col] = null;
	state.currentPlayer = currentPlayer;
	return state;
}

// ---------------------------------------------------------------------------
// makeMove - null / wrong-colour guards
// ---------------------------------------------------------------------------

describe('makeMove - null returns', () => {
	test('returns null when no piece at from', () => {
		const state = emptyState();
		setPieceAt(state.board, { row: 7, col: 4 }, { type: 'king', color: 'white' });
		// from is an empty square
		expect(makeMove(state, { row: 4, col: 4 }, { row: 3, col: 4 })).toBeNull();
	});

	test('returns null when piece colour does not match currentPlayer', () => {
		const state = emptyState('white');
		const blackPawn: ChessPiece = { type: 'pawn', color: 'black' };
		setPieceAt(state.board, { row: 1, col: 4 }, blackPawn);
		// Try to move opponent's pawn on white's turn
		expect(makeMove(state, { row: 1, col: 4 }, { row: 2, col: 4 })).toBeNull();
	});

	test('returns null for an out-of-range destination', () => {
		const state = emptyState();
		const pawn: ChessPiece = { type: 'pawn', color: 'white' };
		setPieceAt(state.board, { row: 6, col: 4 }, pawn);
		expect(makeMove(state, { row: 6, col: 4 }, { row: 3, col: 4 })).toBeNull();
	});
});

// ---------------------------------------------------------------------------
// makeMove - hasMoved flag
// ---------------------------------------------------------------------------

describe('makeMove - hasMoved flag', () => {
	test('moved piece gains hasMoved: true', () => {
		const state = createInitialGameState();
		const result = makeMove(state, { row: 6, col: 4 }, { row: 5, col: 4 });
		expect(result).not.toBeNull();
		const movedPiece = result!.board[5]![4];
		expect(movedPiece?.hasMoved).toBe(true);
	});

	test('non-moved pieces do not gain hasMoved', () => {
		const state = createInitialGameState();
		const result = makeMove(state, { row: 6, col: 4 }, { row: 5, col: 4 });
		expect(result).not.toBeNull();
		// King was not moved
		const king = result!.board[7]![4];
		expect(king?.hasMoved).toBeFalsy();
	});
});

// ---------------------------------------------------------------------------
// makeMove - player switching and move history
// ---------------------------------------------------------------------------

describe('makeMove - turn switching', () => {
	test('switches from white to black after move', () => {
		const state = createInitialGameState();
		const after = makeMove(state, { row: 6, col: 4 }, { row: 4, col: 4 });
		expect(after?.currentPlayer).toBe('black');
	});

	test('switches back to white after two moves', () => {
		let state = createInitialGameState();
		state = makeMove(state, { row: 6, col: 4 }, { row: 4, col: 4 })!;
		state = makeMove(state, { row: 1, col: 4 }, { row: 3, col: 4 })!;
		expect(state.currentPlayer).toBe('white');
	});

	test('appends to moveHistory with each move', () => {
		let state = createInitialGameState();
		state = makeMove(state, { row: 6, col: 4 }, { row: 4, col: 4 })!;
		expect(state.moveHistory).toHaveLength(1);
		state = makeMove(state, { row: 1, col: 4 }, { row: 3, col: 4 })!;
		expect(state.moveHistory).toHaveLength(2);
	});

	test('selectedSquare and possibleMoves are cleared after move', () => {
		let state = createInitialGameState();
		state = selectSquare(state, { row: 6, col: 4 });
		expect(state.selectedSquare).not.toBeNull();
		state = makeMove(state, { row: 6, col: 4 }, { row: 4, col: 4 })!;
		expect(state.selectedSquare).toBeNull();
		expect(state.possibleMoves).toHaveLength(0);
	});
});

// ---------------------------------------------------------------------------
// isKingInCheck - king absent branch
// ---------------------------------------------------------------------------

describe('isKingInCheck - edge cases', () => {
	test('returns false when no king on board for that colour', () => {
		const board = createInitialBoard();
		// Remove white king
		board[7]![4] = null;
		expect(isKingInCheck(board, 'white')).toBe(false);
	});

	test('returns false when opponent has no pieces to attack', () => {
		const board: (ChessPiece | null)[][] = Array(8)
			.fill(null)
			.map(() => Array(8).fill(null));
		const king: ChessPiece = { type: 'king', color: 'white' };
		setPieceAt(board, { row: 7, col: 4 }, king);
		// No black pieces at all
		expect(isKingInCheck(board, 'white')).toBe(false);
	});
});

// ---------------------------------------------------------------------------
// getGameStatus - comprehensive scenarios
// ---------------------------------------------------------------------------

describe('getGameStatus - additional scenarios', () => {
	test('returns playing on initial board', () => {
		expect(getGameStatus(createInitialGameState())).toBe('playing');
	});

	test('returns check when king is attacked and has escape', () => {
		const state = emptyState('white');
		setPieceAt(state.board, { row: 7, col: 4 }, { type: 'king', color: 'white' });
		setPieceAt(state.board, { row: 0, col: 4 }, { type: 'rook', color: 'black' });
		// King can escape sideways
		expect(getGameStatus(state)).toBe('check');
	});

	test('returns playing when current player has legal moves and is not in check', () => {
		const state = emptyState('white');
		setPieceAt(state.board, { row: 7, col: 4 }, { type: 'king', color: 'white' });
		setPieceAt(state.board, { row: 0, col: 4 }, { type: 'king', color: 'black' });
		expect(getGameStatus(state)).toBe('playing');
	});
});

// ---------------------------------------------------------------------------
// makeAIMove - edge cases
// ---------------------------------------------------------------------------

describe('makeAIMove - edge cases', () => {
	test('returns null for empty algebraic string', () => {
		const state = createInitialGameState();
		expect(makeAIMove(state, '', 'e4')).toBeNull();
	});

	test('returns null for string longer than 2 chars', () => {
		const state = createInitialGameState();
		expect(makeAIMove(state, 'e22', 'e4')).toBeNull();
	});

	test('returns null for valid notation but no piece at from', () => {
		const state = createInitialGameState();
		// d4 is empty at start
		expect(makeAIMove(state, 'd4', 'd5')).toBeNull();
	});

	test('makes a valid move via algebraic notation', () => {
		const state = createInitialGameState();
		// e2 → e4
		const result = makeAIMove(state, 'e2', 'e4');
		expect(result).not.toBeNull();
		expect(result?.currentPlayer).toBe('black');
	});
});

// ---------------------------------------------------------------------------
// setAIThinking
// ---------------------------------------------------------------------------

describe('setAIThinking', () => {
	test('does not mutate original state', () => {
		const state = createInitialGameState();
		const before = JSON.stringify(state);
		setAIThinking(state, true);
		expect(JSON.stringify(state)).toBe(before);
	});

	test('returned state has isAiThinking toggled', () => {
		const state = createInitialGameState();
		expect(setAIThinking(state, true).isAiThinking).toBe(true);
		expect(setAIThinking(state, false).isAiThinking).toBe(false);
	});
});

// ---------------------------------------------------------------------------
// isAITurn - additional cases
// ---------------------------------------------------------------------------

describe('isAITurn - additional cases', () => {
	test('returns false when mode is not human-vs-ai', () => {
		const state = createInitialGameState('human-vs-human');
		expect(isAITurn(state)).toBe(false);
	});

	test('returns false in human-vs-ai but AI is not current player', () => {
		const state = createInitialGameState('human-vs-ai', 'black');
		// currentPlayer starts as white, aiPlayer is black
		expect(isAITurn(state)).toBe(false);
	});

	test('returns false when status is stalemate', () => {
		const state: GameState = {
			...createInitialGameState('human-vs-ai', 'white'),
			currentPlayer: 'white',
			status: 'stalemate',
		};
		expect(isAITurn(state)).toBe(false);
	});
});

// ---------------------------------------------------------------------------
// algebraicToPosition - comprehensive
// ---------------------------------------------------------------------------

describe('algebraicToPosition - comprehensive', () => {
	test('handles all columns a-h on rank 1', () => {
		const expected = [
			{ file: 'a', col: 0 },
			{ file: 'b', col: 1 },
			{ file: 'c', col: 2 },
			{ file: 'd', col: 3 },
			{ file: 'e', col: 4 },
			{ file: 'f', col: 5 },
			{ file: 'g', col: 6 },
			{ file: 'h', col: 7 },
		];
		for (const { file, col } of expected) {
			expect(algebraicToPosition(`${file}1`)).toEqual({ row: 7, col });
		}
	});

	test('handles all ranks 1-8 on file a', () => {
		for (let rank = 1; rank <= 8; rank++) {
			const pos = algebraicToPosition(`a${rank}`);
			expect(pos?.row).toBe(8 - rank);
			expect(pos?.col).toBe(0);
		}
	});

	test('returns null for negative rank', () => {
		expect(algebraicToPosition('a-1')).toBeNull();
	});
});

// ---------------------------------------------------------------------------
// selectSquare - chess-specific
// ---------------------------------------------------------------------------

describe('selectSquare - chess', () => {
	test('creates possibleMoves for selected piece', () => {
		const state = createInitialGameState();
		const next = selectSquare(state, { row: 7, col: 1 }); // white knight
		expect(next.selectedSquare).toEqual({ row: 7, col: 1 });
		expect(next.possibleMoves.length).toBeGreaterThan(0);
	});

	test('clicking an empty square with nothing selected returns unchanged selection', () => {
		const state = createInitialGameState();
		const next = selectSquare(state, { row: 4, col: 4 }); // empty
		expect(next.selectedSquare).toBeNull();
		expect(next.possibleMoves).toHaveLength(0);
	});

	test('switching selection from one piece to another works', () => {
		const state = createInitialGameState();
		const first = selectSquare(state, { row: 6, col: 0 }); // a2 pawn
		const second = selectSquare(first, { row: 6, col: 1 }); // b2 pawn
		expect(second.selectedSquare).toEqual({ row: 6, col: 1 });
	});
});
