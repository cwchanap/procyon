import { test, expect, describe } from 'bun:test';
import { BaseAdapter } from './base-adapter';
import { createInitialGameState } from '../chess/game';
import type { GameState, ChessPiece } from '../chess/types';
import type { GamePosition, GamePiece } from './game-variant-types';

// ---------------------------------------------------------------------------
// Test doubles: minimal concrete subclasses that expose the protected hooks
// of BaseAdapter so the default implementations can be exercised directly.
// ---------------------------------------------------------------------------

// A fully-functional test adapter that overrides the abstract hooks and the
// king-check/simulate hooks so the template-method flow runs end-to-end.
class TestAdapter extends BaseAdapter<GameState> {
	gameVariant = 'chess' as const;

	generatePrompt(): string {
		return '';
	}
	createVisualBoard(): string {
		return '';
	}
	analyzeThreatsSafety(): string {
		return '';
	}

	// Expose protected helpers for direct testing.
	exposeGetConfig() {
		return this.getConfig();
	}
	exposeGroupMovesByPiece(moves: string[]) {
		return this.groupMovesByPiece(moves);
	}
	exposeFindPiece(board: GameState['board'], type: string, color: string) {
		return this.findPiece(board, type, color);
	}
	exposeForEachPiece(
		board: GameState['board'],
		cb: (piece: ChessPiece, row: number, col: number) => void
	) {
		return this.forEachPiece(board, cb);
	}
	exposeExpandMoveVariants(
		piece: GamePiece,
		from: GamePosition,
		to: GamePosition
	) {
		return this.expandMoveVariants(piece, from, to);
	}
	exposeGetDropMoves(gameState: GameState) {
		return this.getDropMoves(gameState);
	}
	exposeFinalizeMoves(moves: string[]) {
		return this.finalizeMoves(moves);
	}
	exposeWouldMoveBeValid(
		gameState: GameState,
		from: GamePosition,
		to: GamePosition
	) {
		const piece = gameState.board[from.row]?.[from.col];
		if (!piece) return false;
		return this.wouldMoveBeValid(gameState, piece, from, to);
	}
	exposeIsMoveLegal(
		gameState: GameState,
		from: GamePosition,
		to: GamePosition
	) {
		return this.isMoveLegal(gameState, from, to);
	}

	// Enumerate the current player's pieces, emitting one pseudo-legal
	// forward step each (sufficient to drive the template method).
	protected override forEachOwnPieceMove(
		gameState: GameState,
		cb: (piece: ChessPiece, from: GamePosition, to: GamePosition) => void
	): void {
		this.forEachPiece(gameState.board, (piece, row, col) => {
			if (piece.color === gameState.currentPlayer) {
				cb(piece, { row, col }, { row: row - 1, col });
			}
		});
	}

	protected override simulateMove(
		board: GameState['board'],
		from: GamePosition,
		to: GamePosition,
		piece: ChessPiece
	): GameState['board'] {
		const newBoard = board.map(r => [...r]);
		newBoard[from.row]![from.col] = null;
		newBoard[to.row]![to.col] = piece;
		return newBoard;
	}

	protected override isOwnKingInCheck(
		board: GameState['board'],
		color: string
	): boolean {
		// Trivial: no check detection — returns false so moves are valid.
		void board;
		void color;
		return false;
	}
}

// A bare-minimum adapter that does NOT override simulateMove / isOwnKingInCheck,
// so the default throw stubs are reachable.
class BareAdapter extends BaseAdapter<GameState> {
	gameVariant = 'chess' as const;

	generatePrompt(): string {
		return '';
	}
	createVisualBoard(): string {
		return '';
	}
	analyzeThreatsSafety(): string {
		return '';
	}

	protected override forEachOwnPieceMove(
		_gameState: GameState,
		_cb: (piece: ChessPiece, from: GamePosition, to: GamePosition) => void
	): void {
		// no-op
	}

	exposeSimulateMove(
		board: GameState['board'],
		from: GamePosition,
		to: GamePosition,
		piece: ChessPiece
	) {
		return this.simulateMove(board, from, to, piece);
	}
	exposeIsOwnKingInCheck(board: GameState['board'], color: string) {
		return this.isOwnKingInCheck(board, color);
	}
}

// Adapter that reports the mover's own king as always in check, to exercise
// the "leaves king in check" branch of wouldMoveBeValid.
class AlwaysInCheckAdapter extends TestAdapter {
	protected override isOwnKingInCheck(): boolean {
		return true;
	}
}

// Adapter whose isMoveLegal hook rejects everything, to exercise that branch.
class IllegalMoveAdapter extends TestAdapter {
	protected override isMoveLegal(): boolean {
		return false;
	}
}

function emptyBoardWithKings(): (ChessPiece | null)[][] {
	const board: (ChessPiece | null)[][] = Array.from({ length: 8 }, () =>
		Array(8).fill(null)
	);
	board[7]![4] = { type: 'king', color: 'white' };
	board[0]![4] = { type: 'king', color: 'black' };
	return board;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('BaseAdapter - convertGameState', () => {
	test('projects the shared base-state fields from a variant state', () => {
		const adapter = new TestAdapter();
		const state = createInitialGameState();
		const base = adapter.convertGameState(state);
		expect(base.board).toBe(state.board);
		expect(base.currentPlayer).toBe(state.currentPlayer);
		expect(base.status).toBe(state.status);
		expect(base.moveHistory).toBe(state.moveHistory);
		expect(base.selectedSquare).toBe(state.selectedSquare);
		expect(base.possibleMoves).toBe(state.possibleMoves);
	});
});

describe('BaseAdapter - notation delegation', () => {
	test('positionToAlgebraic delegates to notation-utils for the variant', () => {
		const adapter = new TestAdapter();
		expect(adapter.positionToAlgebraic({ row: 6, col: 4 })).toBe('e2');
	});

	test('algebraicToPosition delegates to notation-utils for the variant', () => {
		const adapter = new TestAdapter();
		expect(adapter.algebraicToPosition('e2')).toEqual({
			row: 6,
			col: 4,
		});
	});
});

describe('BaseAdapter - getPieceSymbol', () => {
	test('returns the configured symbol for a known piece', () => {
		const adapter = new TestAdapter();
		expect(adapter.getPieceSymbol({ type: 'king', color: 'white' })).toBe('♔');
	});

	test('falls back to "?" for an unknown color', () => {
		const adapter = new TestAdapter();
		expect(adapter.getPieceSymbol({ type: 'king', color: 'purple' })).toBe('?');
	});

	test('falls back to "?" for an unknown piece type', () => {
		const adapter = new TestAdapter();
		expect(adapter.getPieceSymbol({ type: 'dragon', color: 'white' })).toBe(
			'?'
		);
	});
});

describe('BaseAdapter - groupMovesByPiece', () => {
	test('groups moves by the parenthesized piece symbol and strips the tag', () => {
		const adapter = new TestAdapter();
		const grouped = adapter.exposeGroupMovesByPiece([
			'e2-e4 (♙)',
			'g1-f3 (♘)',
			'e7-e5 (♟)',
		]);
		expect(grouped).toContain('♙: e2-e4');
		expect(grouped).toContain('♘: g1-f3');
		expect(grouped).toContain('♟: e7-e5');
		// The parenthesized tag is stripped from each move body.
		expect(grouped).not.toContain('(♙)');
	});

	test('groups multiple moves of the same piece onto one line', () => {
		const adapter = new TestAdapter();
		const grouped = adapter.exposeGroupMovesByPiece(['e2-e4 (♙)', 'e2-e3 (♙)']);
		expect(grouped).toContain('♙: e2-e4, e2-e3');
	});

	test('treats moves without a piece tag as "Unknown"', () => {
		const adapter = new TestAdapter();
		const grouped = adapter.exposeGroupMovesByPiece(['e2-e4']);
		expect(grouped).toContain('Unknown: e2-e4');
	});
});

describe('BaseAdapter - findPiece', () => {
	test('locates a matching piece by type and color', () => {
		const adapter = new TestAdapter();
		const board = emptyBoardWithKings();
		board[6]![4] = { type: 'pawn', color: 'white' };
		expect(adapter.exposeFindPiece(board, 'pawn', 'white')).toEqual({
			row: 6,
			col: 4,
		});
	});

	test('returns null when no matching piece exists', () => {
		const adapter = new TestAdapter();
		const board = emptyBoardWithKings();
		expect(adapter.exposeFindPiece(board, 'queen', 'white')).toBeNull();
	});
});

describe('BaseAdapter - forEachPiece', () => {
	test('invokes the callback for every non-null piece with its coordinates', () => {
		const adapter = new TestAdapter();
		const board = emptyBoardWithKings();
		board[6]![4] = { type: 'pawn', color: 'white' };
		const visited: { type: string; row: number; col: number }[] = [];
		adapter.exposeForEachPiece(board, (piece, row, col) => {
			visited.push({ type: piece.type, row, col });
		});
		expect(visited).toContainEqual({ type: 'king', row: 7, col: 4 });
		expect(visited).toContainEqual({ type: 'king', row: 0, col: 4 });
		expect(visited).toContainEqual({ type: 'pawn', row: 6, col: 4 });
		expect(visited).toHaveLength(3);
	});
});

describe('BaseAdapter - expandMoveVariants (default)', () => {
	test('produces a single "from-to (symbol)" entry', () => {
		const adapter = new TestAdapter();
		const variants = adapter.exposeExpandMoveVariants(
			{ type: 'pawn', color: 'white' },
			{ row: 6, col: 4 },
			{ row: 4, col: 4 }
		);
		expect(variants).toEqual(['e2-e4 (♙)']);
	});
});

describe('BaseAdapter - getDropMoves (default)', () => {
	test('returns an empty array by default', () => {
		const adapter = new TestAdapter();
		expect(adapter.exposeGetDropMoves(createInitialGameState())).toEqual([]);
	});
});

describe('BaseAdapter - finalizeMoves (default)', () => {
	test('returns a sentinel when no moves exist', () => {
		const adapter = new TestAdapter();
		expect(adapter.exposeFinalizeMoves([])).toEqual([
			'No valid moves available (checkmate or stalemate)',
		]);
	});

	test('groups raw moves by piece when moves exist', () => {
		const adapter = new TestAdapter();
		const result = adapter.exposeFinalizeMoves(['e2-e4 (♙)']);
		expect(result).toHaveLength(1);
		expect(result[0]).toContain('♙: e2-e4');
	});
});

describe('BaseAdapter - wouldMoveBeValid', () => {
	test('returns false when the source square is empty', () => {
		const adapter = new TestAdapter();
		const state = createInitialGameState();
		// e4 is empty in the initial position.
		expect(
			adapter.exposeWouldMoveBeValid(
				state,
				{ row: 4, col: 4 },
				{
					row: 3,
					col: 4,
				}
			)
		).toBe(false);
	});

	test("returns false when the piece is not the current player's", () => {
		const adapter = new TestAdapter();
		const state = createInitialGameState(); // currentPlayer = white
		// e7 holds a black pawn.
		expect(
			adapter.exposeWouldMoveBeValid(
				state,
				{ row: 1, col: 4 },
				{
					row: 2,
					col: 4,
				}
			)
		).toBe(false);
	});

	test('returns false when isMoveLegal rejects the move', () => {
		const adapter = new IllegalMoveAdapter();
		const state = createInitialGameState();
		expect(
			adapter.exposeWouldMoveBeValid(
				state,
				{ row: 6, col: 4 },
				{
					row: 5,
					col: 4,
				}
			)
		).toBe(false);
	});

	test("returns false when the move leaves the mover's own king in check", () => {
		const adapter = new AlwaysInCheckAdapter();
		const state = createInitialGameState();
		expect(
			adapter.exposeWouldMoveBeValid(
				state,
				{ row: 6, col: 4 },
				{
					row: 5,
					col: 4,
				}
			)
		).toBe(false);
	});

	test('returns true for a legal move that does not leave the king in check', () => {
		const adapter = new TestAdapter();
		const state = createInitialGameState();
		expect(
			adapter.exposeWouldMoveBeValid(
				state,
				{ row: 6, col: 4 },
				{
					row: 5,
					col: 4,
				}
			)
		).toBe(true);
	});
});

describe('BaseAdapter - isMoveLegal (default)', () => {
	test('defaults to true (trusts the move source)', () => {
		const adapter = new TestAdapter();
		expect(
			adapter.exposeIsMoveLegal(
				createInitialGameState(),
				{
					row: 6,
					col: 4,
				},
				{ row: 5, col: 4 }
			)
		).toBe(true);
	});
});

describe('BaseAdapter - default simulateMove / isOwnKingInCheck stubs throw', () => {
	test('simulateMove throws "must be overridden" when not overridden', () => {
		const adapter = new BareAdapter();
		const board = emptyBoardWithKings();
		expect(() =>
			adapter.exposeSimulateMove(
				board,
				{ row: 7, col: 4 },
				{ row: 6, col: 4 },
				{ type: 'king', color: 'white' }
			)
		).toThrow('simulateMove must be overridden');
	});

	test('isOwnKingInCheck throws "must be overridden" when not overridden', () => {
		const adapter = new BareAdapter();
		const board = emptyBoardWithKings();
		expect(() => adapter.exposeIsOwnKingInCheck(board, 'white')).toThrow(
			'isOwnKingInCheck must be overridden'
		);
	});
});

describe('BaseAdapter - getAllValidMoves template method', () => {
	test('orchestrates enumeration, validation, expansion and grouping', () => {
		const adapter = new TestAdapter();
		// Empty board with only the two kings — each king emits one forward
		// pseudo-legal step (white king e1->e2, black king e8->e7). Only the
		// white king's move is valid (currentPlayer = white).
		const state: GameState = {
			...createInitialGameState(),
			board: emptyBoardWithKings(),
			currentPlayer: 'white',
		};
		const moves = adapter.getAllValidMoves(state);
		expect(moves).toHaveLength(1);
		expect(moves[0]).toContain('♔: e1-e2');
	});

	test('returns the sentinel when the current player has no valid moves', () => {
		const adapter = new TestAdapter();
		// Empty board (no pieces) — forEachOwnPieceMove emits nothing.
		const state: GameState = {
			...createInitialGameState(),
			board: Array.from({ length: 8 }, () =>
				Array(8).fill(null)
			) as (ChessPiece | null)[][],
			currentPlayer: 'white',
		};
		const moves = adapter.getAllValidMoves(state);
		expect(moves).toEqual([
			'No valid moves available (checkmate or stalemate)',
		]);
	});
});

describe('BaseAdapter - getConfig', () => {
	test("returns the config for the adapter's game variant", () => {
		const adapter = new TestAdapter();
		const config = adapter.exposeGetConfig();
		expect(config.boardSize).toEqual({ rows: 8, cols: 8 });
	});
});

describe('BaseAdapter - constructor debugMode', () => {
	test('defaults debugMode to false', () => {
		const adapter = new TestAdapter();
		// debugMode is protected; observe indirectly via no throw.
		expect(adapter).toBeInstanceOf(TestAdapter);
	});

	test('accepts an explicit debugMode flag', () => {
		const adapter = new TestAdapter(true);
		expect(adapter).toBeInstanceOf(TestAdapter);
	});
});
