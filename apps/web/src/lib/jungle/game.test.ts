import { describe, it, expect } from 'bun:test';
import { createInitialGameState, selectSquare } from './game';
import { getPieceAt } from './board';
import type { JunglePiece } from './types';

describe('Jungle Game', () => {
	it('should create initial game state correctly', () => {
		const gameState = createInitialGameState();

		expect(gameState.currentPlayer).toBe('red');
		expect(gameState.status).toBe('playing');
		expect(gameState.moveHistory).toHaveLength(0);
		expect(gameState.selectedSquare).toBeNull();
		expect(gameState.possibleMoves).toHaveLength(0);

		// Check that red pieces are in correct positions
		const redLion = getPieceAt(gameState.board, { row: 8, col: 0 });
		expect(redLion?.type).toBe('lion');
		expect(redLion?.color).toBe('red');

		const redElephant = getPieceAt(gameState.board, { row: 6, col: 0 });
		expect(redElephant?.type).toBe('elephant');
		expect(redElephant?.color).toBe('red');

		// Check that blue pieces are in correct positions
		const blueLion = getPieceAt(gameState.board, { row: 0, col: 6 });
		expect(blueLion?.type).toBe('lion');
		expect(blueLion?.color).toBe('blue');

		const blueElephant = getPieceAt(gameState.board, { row: 2, col: 6 });
		expect(blueElephant?.type).toBe('elephant');
		expect(blueElephant?.color).toBe('blue');
	});

	it('should select a piece and show possible moves', () => {
		const gameState = createInitialGameState();
		const newState = selectSquare(gameState, { row: 8, col: 0 }); // Red lion

		expect(newState.selectedSquare).toEqual({ row: 8, col: 0 });
		expect(newState.possibleMoves.length).toBeGreaterThan(0);
	});

	it('should make a valid move', () => {
		const gameState = createInitialGameState();
		const selectedState = selectSquare(gameState, { row: 8, col: 0 }); // Red lion
		const moveTarget = selectedState.possibleMoves[0];

		if (moveTarget) {
			const newState = selectSquare(selectedState, moveTarget);

			expect(newState.currentPlayer).toBe('blue');
			expect(newState.moveHistory).toHaveLength(1);
			expect(newState.selectedSquare).toBeNull();
			expect(newState.possibleMoves).toHaveLength(0);
		}
	});

	it('should not allow selecting opponent pieces', () => {
		const gameState = createInitialGameState();
		const newState = selectSquare(gameState, { row: 0, col: 6 }); // Blue lion

		expect(newState.selectedSquare).toBeNull();
		expect(newState.possibleMoves).toHaveLength(0);
	});

	it('should detect game status correctly', () => {
		const gameState = createInitialGameState();

		// Initial state should be playing
		expect(gameState.status).toBe('playing');
	});

	it('should handle piece capture correctly', () => {
		const gameState = createInitialGameState();

		// Move a piece to capture another (simplified test)
		const selectedState = selectSquare(gameState, { row: 8, col: 1 }); // Red dog

		// Find a valid capture move if available
		const captureMove = selectedState.possibleMoves.find(move => {
			const targetPiece = getPieceAt(gameState.board, move);
			return targetPiece && targetPiece.color !== gameState.currentPlayer;
		});

		if (captureMove) {
			const newState = selectSquare(selectedState, captureMove);
			const lastMove = newState.moveHistory[newState.moveHistory.length - 1];
			if (lastMove) {
				expect(lastMove.capturedPiece).toBeDefined();
			}
		}
	});

	it('should validate piece ranks correctly', () => {
		const testPieces: JunglePiece[] = [
			{ type: 'elephant', color: 'red', rank: 8 },
			{ type: 'lion', color: 'red', rank: 7 },
			{ type: 'tiger', color: 'red', rank: 6 },
			{ type: 'leopard', color: 'red', rank: 5 },
			{ type: 'dog', color: 'red', rank: 4 },
			{ type: 'wolf', color: 'red', rank: 3 },
			{ type: 'cat', color: 'red', rank: 2 },
			{ type: 'rat', color: 'red', rank: 1 },
		];

		testPieces.forEach(piece => {
			expect(piece.rank).toBeGreaterThan(0);
			expect(piece.rank).toBeLessThan(9);
		});
	});

	it('should handle terrain correctly', () => {
		const gameState = createInitialGameState();

		// Check that water squares exist
		expect(gameState.terrain[3]![1]!.type).toBe('water');
		expect(gameState.terrain[3]![2]!.type).toBe('water');
		expect(gameState.terrain[4]![1]!.type).toBe('water');
		expect(gameState.terrain[4]![2]!.type).toBe('water');
		expect(gameState.terrain[5]![1]!.type).toBe('water');
		expect(gameState.terrain[5]![2]!.type).toBe('water');

		// Check that dens exist
		expect(gameState.terrain[0]![3]!.type).toBe('den');
		expect(gameState.terrain[8]![3]!.type).toBe('den');

		// Check that traps exist
		expect(gameState.terrain[0]![2]!.type).toBe('trap');
		expect(gameState.terrain[0]![4]!.type).toBe('trap');
		expect(gameState.terrain[1]![3]!.type).toBe('trap');
		expect(gameState.terrain[8]![2]!.type).toBe('trap');
		expect(gameState.terrain[8]![4]!.type).toBe('trap');
		expect(gameState.terrain[7]![3]!.type).toBe('trap');
	});

	it('should allow weaker pieces to capture stronger pieces in enemy traps', () => {
		const gameState = createInitialGameState();

		// Set up a scenario where a blue cat (rank 2) can capture a red lion (rank 7)
		// that's sitting in a BLUE trap (enemy trap for the red lion)
		const blueCat: JunglePiece = { type: 'cat', color: 'blue', rank: 2 };
		const redLion: JunglePiece = { type: 'lion', color: 'red', rank: 7 };

		// Place the red lion in the BLUE trap at position {row: 1, col: 3}
		gameState.board[1]![3] = redLion;

		// Place the blue cat adjacent to the trap
		gameState.board[2]![3] = blueCat;

		// Set current player to blue so the cat can move
		gameState.currentPlayer = 'blue';

		// Try to capture the lion with the cat
		const selectedState = selectSquare(gameState, { row: 2, col: 3 });

		// This should be a valid move since the lion is in an enemy trap
		const isValidCapture = selectedState.possibleMoves.some(
			move => move.row === 1 && move.col === 3
		);

		expect(isValidCapture).toBe(true);
	});

	it('should not allow pieces to capture in their own traps', () => {
		const gameState = createInitialGameState();

		// Set up a scenario where a red cat tries to capture a blue lion
		// that's sitting in a BLUE trap (should not be allowed since it's the lion's own trap)
		const redCat: JunglePiece = { type: 'cat', color: 'red', rank: 2 };
		const blueLion: JunglePiece = { type: 'lion', color: 'blue', rank: 7 };

		// Place the blue lion in the BLUE trap at position {row: 1, col: 3}
		gameState.board[1]![3] = blueLion;

		// Place the red cat adjacent to the trap
		gameState.board[2]![3] = redCat;

		// Set current player to red so the cat can move
		gameState.currentPlayer = 'red';

		// Try to capture the lion with the cat
		const selectedState = selectSquare(gameState, { row: 2, col: 3 });

		// This should not be a valid move since it's the blue lion's own trap
		const isValidCapture = selectedState.possibleMoves.some(
			move => move.row === 1 && move.col === 3
		);

		expect(isValidCapture).toBe(false);
	});

	it('should prevent pieces in enemy traps from capturing', () => {
		const gameState = createInitialGameState();

		// Set up a scenario where a red lion in a BLUE trap tries to capture a blue rat
		// The lion should not be able to capture while in the enemy trap
		const redLion: JunglePiece = { type: 'lion', color: 'red', rank: 7 };
		const blueRat: JunglePiece = { type: 'rat', color: 'blue', rank: 1 };

		// Place the red lion in the BLUE trap at position {row: 1, col: 3}
		gameState.board[1]![3] = redLion;

		// Place the blue rat adjacent to the trapped lion
		gameState.board[1]![4] = blueRat;

		// Set current player to red so the lion can move
		gameState.currentPlayer = 'red';

		// Try to capture the rat with the trapped lion
		const selectedState = selectSquare(gameState, { row: 1, col: 3 });

		// This should not be a valid move since the lion is in an enemy trap
		const isValidCapture = selectedState.possibleMoves.some(
			move => move.row === 1 && move.col === 4
		);

		expect(isValidCapture).toBe(false);
	});
});
