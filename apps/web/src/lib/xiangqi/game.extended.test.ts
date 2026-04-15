import { test, expect, describe } from 'bun:test';
import {
	createInitialXiangqiGameState,
	selectSquare,
	isKingInCheck,
	undoMove,
} from './game';
import { setPieceAt } from './board';
import type { XiangqiPiece } from './types';

// Helper to create a clean empty board state for red to move
function makeEmptyState(currentPlayer: 'red' | 'black' = 'red') {
	const state = createInitialXiangqiGameState();
	for (let row = 0; row < 10; row++) {
		for (let col = 0; col < 9; col++) {
			state.board[row][col] = null;
		}
	}
	state.currentPlayer = currentPlayer;
	return state;
}

describe('Xiangqi flying general rule', () => {
	test('should prevent king from moving to square that directly faces opponent king', () => {
		// Red king at (9,4) and black king at (0,4) in same column with no pieces between.
		// Moving red king from (9,4) to (8,4) would still face black king directly
		// => flying general violation => isValidMove returns false => selectSquare deselects.
		const state = makeEmptyState('red');

		setPieceAt(state.board, { row: 9, col: 4 }, { type: 'king', color: 'red' });
		setPieceAt(state.board, { row: 0, col: 4 }, { type: 'king', color: 'black' });

		let newState = selectSquare(state, { row: 9, col: 4 }); // Select red king
		expect(newState.selectedSquare).toEqual({ row: 9, col: 4 });

		newState = selectSquare(newState, { row: 8, col: 4 }); // Try (8,4) - flying general
		// isValidMove returns false for flying general, so selection is cleared
		expect(newState.selectedSquare).toBeNull();
		// King must not have moved
		expect(newState.board[9][4]?.type).toBe('king');
		expect(newState.board[8][4]).toBeNull();
	});

	test('should allow king move to column not facing opponent king', () => {
		// Red king at (9,4), black king at (0,4). Moving red king to (9,3) changes column.
		// In col 3 there are no other pieces facing the black king's col 4, so it's valid.
		const state = makeEmptyState('red');

		setPieceAt(state.board, { row: 9, col: 4 }, { type: 'king', color: 'red' });
		setPieceAt(state.board, { row: 0, col: 4 }, { type: 'king', color: 'black' });

		let newState = selectSquare(state, { row: 9, col: 4 });
		newState = selectSquare(newState, { row: 9, col: 3 }); // Move to (9,3) - different col

		// Move should succeed: king now at (9,3)
		expect(newState.currentPlayer).toBe('black');
		expect(newState.board[9][3]?.type).toBe('king');
		expect(newState.board[9][4]).toBeNull();
	});

	test('should allow king move when a piece blocks direct opposition', () => {
		// Red king at (9,4), black king at (0,4), blocking piece at (5,4).
		// Moving red king to (8,4) is still in col 4, but there IS a piece at (5,4) between them.
		const state = makeEmptyState('red');

		setPieceAt(state.board, { row: 9, col: 4 }, { type: 'king', color: 'red' });
		setPieceAt(state.board, { row: 0, col: 4 }, { type: 'king', color: 'black' });
		setPieceAt(state.board, { row: 5, col: 4 }, { type: 'chariot', color: 'red' }); // blocker

		let newState = selectSquare(state, { row: 9, col: 4 });
		newState = selectSquare(newState, { row: 8, col: 4 }); // (8,4) – piece at (5,4) blocks direct opposition

		// Move should be valid
		expect(newState.currentPlayer).toBe('black');
		expect(newState.board[8][4]?.type).toBe('king');
	});
});

describe('Xiangqi game status after move', () => {
	test('should have check status after a move that puts opponent king in check', () => {
		// Red chariot at (5,4) moves to (1,4) to check black king at (0,4).
		// Red king at (9,3) to avoid flying general in col 4.
		const state = makeEmptyState('red');

		setPieceAt(state.board, { row: 9, col: 3 }, { type: 'king', color: 'red' });
		setPieceAt(state.board, { row: 0, col: 4 }, { type: 'king', color: 'black' });
		setPieceAt(state.board, { row: 5, col: 4 }, { type: 'chariot', color: 'red' });

		let newState = selectSquare(state, { row: 5, col: 4 }); // Select chariot
		newState = selectSquare(newState, { row: 1, col: 4 }); // Move to (1,4)

		expect(newState.currentPlayer).toBe('black');
		expect(newState.status).toBe('check');
		// Chariot is now at (1,4)
		expect(newState.board[1][4]?.type).toBe('chariot');
		expect(newState.board[5][4]).toBeNull();
	});

	test('should remain playing status after a normal move', () => {
		const state = makeEmptyState('red');

		setPieceAt(state.board, { row: 9, col: 3 }, { type: 'king', color: 'red' });
		setPieceAt(state.board, { row: 0, col: 4 }, { type: 'king', color: 'black' });
		setPieceAt(state.board, { row: 6, col: 0 }, { type: 'soldier', color: 'red' });

		// Move red soldier forward - no check
		let newState = selectSquare(state, { row: 6, col: 0 });
		newState = selectSquare(newState, { row: 5, col: 0 });

		expect(newState.currentPlayer).toBe('black');
		expect(newState.status).toBe('playing');
	});

	test('should detect checkmate when opponent has no legal moves after a move', () => {
		const state = makeEmptyState('red');

		// Red king at (9,3), black king at (0,4). After chariot at (5,4) moves to (1,4):
		//   - (0,3) covered by chariot at (0,0) sliding right
		//   - (0,5) covered by chariot at (0,8) sliding left
		//   - (1,3) covered by chariot at (1,0) sliding right
		//   - (1,5) covered by chariot at (1,8) sliding left
		//   - (1,4) occupied by checking chariot; capturing it still leaves king attacked by (1,0)
		setPieceAt(state.board, { row: 9, col: 3 }, { type: 'king', color: 'red' });
		setPieceAt(state.board, { row: 0, col: 4 }, { type: 'king', color: 'black' });
		// Chariot at (5,4) - will move to (1,4) to check black king
		setPieceAt(state.board, { row: 5, col: 4 }, { type: 'chariot', color: 'red' });
		// Chariot at (0,0) - covers (0,1), (0,2), (0,3) on row 0
		setPieceAt(state.board, { row: 0, col: 0 }, { type: 'chariot', color: 'red' });
		// Chariot at (1,0) - covers (1,1), (1,2), (1,3) on row 1
		setPieceAt(state.board, { row: 1, col: 0 }, { type: 'chariot', color: 'red' });
		// Chariot at (0,8) - covers (0,5), (0,6), (0,7) on row 0
		setPieceAt(state.board, { row: 0, col: 8 }, { type: 'chariot', color: 'red' });
		// Chariot at (1,8) - covers (1,5), (1,6), (1,7) on row 1
		setPieceAt(state.board, { row: 1, col: 8 }, { type: 'chariot', color: 'red' });

		// Move chariot from (5,4) to (1,4) for the check
		let newState = selectSquare(state, { row: 5, col: 4 });
		newState = selectSquare(newState, { row: 1, col: 4 });

		// After this move black king at (0,4) is in check from chariot at (1,4).
		// Escape squares:
		//   (0,3): chariot at (0,0) slides right to (0,3) ✓ - covered
		//   (0,5): chariot at (0,8) slides left to (0,5) ✓ - covered
		//   (1,3): chariot at (1,0) slides right to (1,3) ✓ - covered
		//   (1,4): occupied by red chariot - black king can capture it
		//           but after capture (1,4) black king: chariot at (1,0) attacks row 1 ✓ - still covered
		//   (1,5): chariot at (1,8) slides left to (1,5) ✓ - covered
		// So black has no legal moves => checkmate

		expect(newState.currentPlayer).toBe('black');
		expect(newState.status).toBe('checkmate');
	});
});

describe('Xiangqi selectSquare - selection switching and deselection', () => {
	test('should switch selection to a different own piece when one is already selected', () => {
		const state = createInitialXiangqiGameState();

		// Select red horse at (9,1)
		let newState = selectSquare(state, { row: 9, col: 1 });
		expect(newState.selectedSquare).toEqual({ row: 9, col: 1 });

		// Now select a different red piece (chariot at 9,0) - horse cannot move to (9,0) so it's a reselect
		newState = selectSquare(newState, { row: 9, col: 0 });
		expect(newState.selectedSquare).toEqual({ row: 9, col: 0 });
		expect(newState.possibleMoves.length).toBeGreaterThan(0);
	});

	test('should deselect when attempting to move to invalid empty square', () => {
		const state = createInitialXiangqiGameState();

		// Select red horse at (9,1)
		let newState = selectSquare(state, { row: 9, col: 1 });
		expect(newState.selectedSquare).toEqual({ row: 9, col: 1 });

		// Try to move to an invalid empty square the horse cannot reach
		newState = selectSquare(newState, { row: 5, col: 5 }); // far empty square
		expect(newState.selectedSquare).toBeNull();
		expect(newState.possibleMoves).toEqual([]);
	});

	test('should deselect when clicking opponent piece that is not a valid capture', () => {
		const state = createInitialXiangqiGameState();

		// Select red horse at (9,1)
		let newState = selectSquare(state, { row: 9, col: 1 });
		expect(newState.selectedSquare).toEqual({ row: 9, col: 1 });

		// Click on opponent piece that cannot be captured from this position
		newState = selectSquare(newState, { row: 0, col: 4 }); // black king - unreachable
		expect(newState.selectedSquare).toBeNull();
	});
});

describe('Xiangqi isKingInCheck - additional coverage', () => {
	test('should detect check from cannon with exactly one screen piece', () => {
		const board: (XiangqiPiece | null)[][] = Array(10)
			.fill(null)
			.map(() => Array(9).fill(null));

		setPieceAt(board, { row: 9, col: 4 }, { type: 'king', color: 'red' });
		// Screen piece (any piece) between cannon and king
		setPieceAt(board, { row: 7, col: 4 }, { type: 'soldier', color: 'red' });
		// Black cannon behind the screen
		setPieceAt(board, { row: 5, col: 4 }, { type: 'cannon', color: 'black' });

		expect(isKingInCheck(board, 'red')).toBe(true);
	});

	test('should not detect check from cannon with no screen piece', () => {
		const board: (XiangqiPiece | null)[][] = Array(10)
			.fill(null)
			.map(() => Array(9).fill(null));

		setPieceAt(board, { row: 9, col: 4 }, { type: 'king', color: 'red' });
		// Cannon with NO screen piece between it and the king cannot attack
		setPieceAt(board, { row: 5, col: 4 }, { type: 'cannon', color: 'black' });

		expect(isKingInCheck(board, 'red')).toBe(false);
	});

	test('should detect check from horse in an L-shape', () => {
		const board: (XiangqiPiece | null)[][] = Array(10)
			.fill(null)
			.map(() => Array(9).fill(null));

		setPieceAt(board, { row: 9, col: 4 }, { type: 'king', color: 'red' });
		// Horse at (7,3): can it reach (9,4)?
		// Horse at (7,3) moves: 2 forward + 1 right = (9,4) YES (2+1 diag)
		// But horse move is blocked by piece on the intermediate square (8,3)? No piece there.
		setPieceAt(board, { row: 7, col: 3 }, { type: 'horse', color: 'black' });

		expect(isKingInCheck(board, 'red')).toBe(true);
	});

	test('should not detect check from black king when black king is not adjacent', () => {
		const board: (XiangqiPiece | null)[][] = Array(10)
			.fill(null)
			.map(() => Array(9).fill(null));

		setPieceAt(board, { row: 9, col: 4 }, { type: 'king', color: 'red' });
		setPieceAt(board, { row: 0, col: 3 }, { type: 'king', color: 'black' });
		// Kings in different columns (no flying general) – not checking each other
		expect(isKingInCheck(board, 'red')).toBe(false);
	});
});

describe('Xiangqi undoMove - edge cases', () => {
	test('should handle multiple undos correctly', () => {
		const state = createInitialXiangqiGameState();

		// Make two moves
		let s = selectSquare(state, { row: 6, col: 0 });
		s = selectSquare(s, { row: 5, col: 0 }); // red soldier forward
		expect(s.moveHistory.length).toBe(1);

		s = selectSquare(s, { row: 3, col: 0 });
		s = selectSquare(s, { row: 4, col: 0 }); // black soldier forward
		expect(s.moveHistory.length).toBe(2);

		// Undo both moves
		s = undoMove(s);
		expect(s.moveHistory.length).toBe(1);
		expect(s.currentPlayer).toBe('black');

		s = undoMove(s);
		expect(s.moveHistory.length).toBe(0);
		expect(s.currentPlayer).toBe('red');
		expect(s.board[6][0]?.type).toBe('soldier');
	});

	test('should clear selectedSquare and possibleMoves after undo', () => {
		const state = createInitialXiangqiGameState();
		let s = selectSquare(state, { row: 6, col: 0 });
		s = selectSquare(s, { row: 5, col: 0 });

		const undone = undoMove(s);
		expect(undone.selectedSquare).toBeNull();
		expect(undone.possibleMoves).toEqual([]);
	});
});
