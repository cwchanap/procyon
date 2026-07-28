import { describe, expect, test } from 'bun:test';
import type { ChessPiece, PromotionPiece } from './types';
import {
	attemptMove,
	createGameStateFromBoard,
	createGameStateFromFen,
	createInitialGameState,
	getAttackers,
	getLegalDestinations,
	getLegalMoves,
	isTerminalState,
	isSquareAttackedBy,
	queryAttacks,
} from './rules';

describe('chess rules state factories', () => {
	test('creates a reproducible initial state with twenty legal moves', () => {
		const state = createInitialGameState();

		expect(state.initialFen).toBe(
			'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
		);
		expect(state.fen).toBe(state.initialFen);
		expect(state.currentPlayer).toBe('white');
		expect(state.moveHistory).toEqual([]);
		expect(state.pendingPromotion).toBeNull();
		expect(state.terminationReason).toBeNull();
		expect(isTerminalState(state)).toBe(false);
		expect(getLegalMoves(state)).toHaveLength(20);
	});

	test('throws for authored invalid FEN instead of normalizing it', () => {
		expect(() => createGameStateFromFen('not-a-fen')).toThrow();
	});

	test('throws for authored boards without exactly one king per side', () => {
		const board = Array.from({ length: 8 }, () =>
			Array<ChessPiece | null>(8).fill(null)
		);
		board[7]![4] = { type: 'king', color: 'white' };
		expect(() => createGameStateFromBoard(board, 'white')).toThrow();
	});

	test('throws for authored boards that are not exactly eight by eight', () => {
		const board = createInitialGameState().board.slice(0, 7);
		expect(() => createGameStateFromBoard(board, 'white')).toThrow();
	});

	test('board conversion uses explicit safe defaults', () => {
		const initial = createInitialGameState();
		const state = createGameStateFromBoard(initial.board, 'black');

		expect(state.fen.split(' ').slice(1)).toEqual(['b', '-', '-', '0', '1']);
		expect(state.initialFen).toBe(state.fen);
	});

	test('destinations exactly equal the deduplicated authoritative candidates', () => {
		const state = createGameStateFromFen('7k/P7/8/8/8/8/8/7K w - - 0 1');
		const from = { row: 1, col: 0 };
		const destinations = getLegalDestinations(state, from);
		const expected = [
			...new Map(
				getLegalMoves(state, from).map(move => [
					`${move.to.row}:${move.to.col}`,
					move.to,
				])
			).values(),
		];

		expect(destinations).toEqual(expected);
		expect(getLegalMoves(state, from)).toHaveLength(4);
		expect(destinations).toEqual([{ row: 0, col: 0 }]);
	});

	test('a pinned piece still attacks a square it cannot legally move to', () => {
		const state = createGameStateFromFen('4r2k/8/8/8/8/4R3/8/4K3 w - - 0 1');

		expect(isSquareAttackedBy(state, { row: 5, col: 3 }, 'white')).toBe(true);
		expect(getAttackers(state, { row: 5, col: 3 }, 'white')).toContainEqual({
			row: 5,
			col: 4,
		});
		expect(
			queryAttacks(state, [
				{ square: { row: 5, col: 3 }, attacker: 'white' },
				{ square: { row: 5, col: 4 }, attacker: 'black' },
			])
		).toEqual([
			{
				square: { row: 5, col: 3 },
				attacker: 'white',
				attacked: true,
				attackers: [{ row: 5, col: 4 }],
			},
			{
				square: { row: 5, col: 4 },
				attacker: 'black',
				attacked: true,
				attackers: [{ row: 0, col: 4 }],
			},
		]);
		expect(getLegalDestinations(state, { row: 5, col: 4 })).not.toContainEqual({
			row: 5,
			col: 3,
		});
	});
});

describe('chess rules move application', () => {
	test('applies castling atomically for either color and side', () => {
		const white = createGameStateFromFen(
			'r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1'
		);
		const whiteResult = attemptMove(white, { from: 'e1', to: 'g1' });
		expect(whiteResult.kind).toBe('applied');
		if (whiteResult.kind !== 'applied') throw new Error('expected applied');
		expect(whiteResult.move.isCastling).toBe(true);
		expect(whiteResult.move.san).toBe('O-O');
		expect(whiteResult.move.lan).toBe('e1g1');
		expect(whiteResult.state.board[7]?.[6]?.type).toBe('king');
		expect(whiteResult.state.board[7]?.[5]?.type).toBe('rook');

		const whiteQueenside = attemptMove(white, { from: 'e1', to: 'c1' });
		expect(whiteQueenside.kind).toBe('applied');
		if (whiteQueenside.kind !== 'applied') {
			throw new Error('expected applied');
		}
		expect(whiteQueenside.move.san).toBe('O-O-O');
		expect(whiteQueenside.state.board[7]?.[2]?.type).toBe('king');
		expect(whiteQueenside.state.board[7]?.[3]?.type).toBe('rook');

		const black = createGameStateFromFen(
			'r3k2r/8/8/8/8/8/8/R3K2R b KQkq - 0 1'
		);
		const blackResult = attemptMove(black, { from: 'e8', to: 'c8' });
		expect(blackResult.kind).toBe('applied');
		if (blackResult.kind !== 'applied') throw new Error('expected applied');
		expect(blackResult.move.san).toBe('O-O-O');
		expect(blackResult.state.board[0]?.[2]?.type).toBe('king');
		expect(blackResult.state.board[0]?.[3]?.type).toBe('rook');

		const blackKingside = attemptMove(black, { from: 'e8', to: 'g8' });
		expect(blackKingside.kind).toBe('applied');
		if (blackKingside.kind !== 'applied') {
			throw new Error('expected applied');
		}
		expect(blackKingside.move.san).toBe('O-O');
		expect(blackKingside.state.board[0]?.[6]?.type).toBe('king');
		expect(blackKingside.state.board[0]?.[5]?.type).toBe('rook');
	});

	test('applies en passant and removes the captured pawn', () => {
		const state = createGameStateFromFen('4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 1');
		const result = attemptMove(state, { from: 'e5', to: 'd6' });
		expect(result.kind).toBe('applied');
		if (result.kind !== 'applied') throw new Error('expected applied');
		expect(result.move.isEnPassant).toBe(true);
		expect(result.move.capturedPiece).toEqual({
			type: 'pawn',
			color: 'black',
		});
		expect(result.move.lan).toBe('e5d6');
		expect(result.state.board[3]?.[3]).toBeNull();
		expect(result.state.board[2]?.[3]?.type).toBe('pawn');
	});

	test('requires an explicit promotion and applies all four choices', () => {
		const state = createGameStateFromFen('7k/P7/8/8/8/8/8/7K w - - 0 1');
		const pending = attemptMove(state, { from: 'a7', to: 'a8' });
		expect(pending).toMatchObject({
			kind: 'promotion-required',
			choices: ['queen', 'rook', 'bishop', 'knight'],
		});

		for (const promotion of ['queen', 'rook', 'bishop', 'knight'] as const) {
			const result = attemptMove(state, {
				from: 'a7',
				to: 'a8',
				promotion,
			});
			expect(result.kind).toBe('applied');
			if (result.kind !== 'applied') throw new Error('expected applied');
			expect(result.state.board[0]?.[0]?.type).toBe(promotion);
			expect(result.move.promotion).toBe(promotion);
			expect(result.move.lan).toBe(
				`a7a8${{ queen: 'q', rook: 'r', bishop: 'b', knight: 'n' }[promotion]}`
			);
		}
	});

	test('rejects moves that expose the moving king', () => {
		const state = createGameStateFromFen('4r2k/8/8/8/8/8/4R3/4K3 w - - 0 1');
		expect(attemptMove(state, { from: 'e2', to: 'd2' })).toEqual({
			kind: 'rejected',
			reason: 'illegal-move',
		});
	});

	test('rejects every castling disqualifier', () => {
		const blocked = createGameStateFromFen(
			'r3k2r/8/8/8/8/8/8/R3KN1R w KQkq - 0 1'
		);
		expect(attemptMove(blocked, { from: 'e1', to: 'g1' })).toMatchObject({
			kind: 'rejected',
		});

		const checked = createGameStateFromFen('4r2k/8/8/8/8/8/8/R3K2R w KQ - 0 1');
		expect(attemptMove(checked, { from: 'e1', to: 'g1' })).toMatchObject({
			kind: 'rejected',
		});

		const crossesAttack = createGameStateFromFen(
			'k4r2/8/8/8/8/8/8/4K2R w K - 0 1'
		);
		expect(attemptMove(crossesAttack, { from: 'e1', to: 'g1' })).toMatchObject({
			kind: 'rejected',
		});

		const rightsLost = createGameStateFromFen(
			'4k3/8/8/8/8/8/8/R3K2R w - - 0 1'
		);
		expect(attemptMove(rightsLost, { from: 'e1', to: 'g1' })).toMatchObject({
			kind: 'rejected',
		});
	});

	test('en passant expires and cannot expose the moving king', () => {
		let expired = createGameStateFromFen('4k3/3p4/8/4P3/8/8/8/4K3 b - - 0 1');
		for (const request of [
			{ from: 'd7', to: 'd5' },
			{ from: 'e1', to: 'e2' },
			{ from: 'e8', to: 'e7' },
		] as const) {
			const result = attemptMove(expired, request);
			if (result.kind !== 'applied') throw new Error('expected applied');
			expired = result.state;
		}
		expect(attemptMove(expired, { from: 'e5', to: 'd6' })).toMatchObject({
			kind: 'rejected',
		});

		const exposesKing = createGameStateFromFen(
			'4r2k/8/8/3pP3/8/8/8/4K3 w - d6 0 1'
		);
		expect(attemptMove(exposesKing, { from: 'e5', to: 'd6' })).toMatchObject({
			kind: 'rejected',
		});
	});

	test('records capture promotion and rejects invalid promotion/state data', () => {
		const capture = createGameStateFromFen('r6k/1P6/8/8/8/8/8/7K w - - 0 1');
		const promoted = attemptMove(capture, {
			from: 'b7',
			to: 'a8',
			promotion: 'rook',
		});
		expect(promoted.kind).toBe('applied');
		if (promoted.kind !== 'applied') throw new Error('expected applied');
		expect(promoted.move.capturedPiece?.type).toBe('rook');
		expect(promoted.move.promotion).toBe('rook');

		expect(
			attemptMove(capture, {
				from: 'b7',
				to: 'a8',
				promotion: 'king' as PromotionPiece,
			})
		).toEqual({ kind: 'rejected', reason: 'invalid-promotion' });

		expect(
			attemptMove(
				{ ...capture, fen: capture.fen.replace(' w ', ' b ') },
				{ from: 'b7', to: 'a8', promotion: 'queen' }
			)
		).toEqual({ kind: 'rejected', reason: 'state-inconsistent' });
	});
});

describe('chess rules adjudication', () => {
	test('distinguishes checkmate and stalemate at factory time', () => {
		const mate = createGameStateFromFen('7k/6Q1/6K1/8/8/8/8/8 b - - 0 1');
		expect(mate.status).toBe('checkmate');
		expect(mate.terminationReason).toBe('checkmate');

		const stalemate = createGameStateFromFen('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1');
		expect(stalemate.status).toBe('stalemate');
		expect(stalemate.terminationReason).toBe('stalemate');
	});

	test('automatically adjudicates threefold despite changing halfmove clocks', () => {
		let state = createInitialGameState();
		for (const request of [
			{ from: 'g1', to: 'f3' },
			{ from: 'g8', to: 'f6' },
			{ from: 'f3', to: 'g1' },
			{ from: 'f6', to: 'g8' },
			{ from: 'g1', to: 'f3' },
			{ from: 'g8', to: 'f6' },
			{ from: 'f3', to: 'g1' },
			{ from: 'f6', to: 'g8' },
		] as const) {
			const result = attemptMove(state, request);
			if (result.kind !== 'applied') throw new Error('expected applied');
			state = result.state;
		}
		expect(state.status).toBe('draw');
		expect(state.terminationReason).toBe('threefold-repetition');
	});

	test('mid-game FEN starts repetition history at its current position', () => {
		let state = createGameStateFromFen('6nk/8/8/8/8/8/8/KN6 w - - 17 42');
		expect(state.initialFen).toBe(state.fen);
		expect(state.moveHistory).toEqual([]);

		const cycle = [
			{ from: 'b1', to: 'c3' },
			{ from: 'g8', to: 'f6' },
			{ from: 'c3', to: 'b1' },
			{ from: 'f6', to: 'g8' },
		] as const;

		for (const request of cycle) {
			const result = attemptMove(state, request);
			if (result.kind !== 'applied') throw new Error('expected applied');
			state = result.state;
		}
		expect(state.terminationReason).toBeNull();

		for (const request of cycle) {
			const result = attemptMove(state, request);
			if (result.kind !== 'applied') throw new Error('expected applied');
			state = result.state;
		}
		expect(state.terminationReason).toBe('threefold-repetition');
	});

	test('castling and effective en-passant rights prevent premature repetition', () => {
		let castling = createGameStateFromFen('4k2r/8/8/8/8/8/8/4K2R w Kk - 0 1');
		for (const request of [
			{ from: 'e1', to: 'f1' },
			{ from: 'e8', to: 'f8' },
			{ from: 'f1', to: 'e1' },
			{ from: 'f8', to: 'e8' },
			{ from: 'e1', to: 'f1' },
			{ from: 'e8', to: 'f8' },
			{ from: 'f1', to: 'e1' },
			{ from: 'f8', to: 'e8' },
		] as const) {
			const result = attemptMove(castling, request);
			if (result.kind !== 'applied') throw new Error('expected applied');
			castling = result.state;
		}
		expect(castling.terminationReason).toBeNull();

		let enPassant = createGameStateFromFen('7k/8/8/3pP3/8/8/8/K7 w - d6 0 1');
		for (const request of [
			{ from: 'a1', to: 'a2' },
			{ from: 'h8', to: 'h7' },
			{ from: 'a2', to: 'a1' },
			{ from: 'h7', to: 'h8' },
			{ from: 'a1', to: 'a2' },
			{ from: 'h8', to: 'h7' },
			{ from: 'a2', to: 'a1' },
			{ from: 'h7', to: 'h8' },
		] as const) {
			const result = attemptMove(enPassant, request);
			if (result.kind !== 'applied') throw new Error('expected applied');
			enPassant = result.state;
		}
		expect(enPassant.terminationReason).toBeNull();

		let ineffectiveEnPassant = createGameStateFromFen(
			'7k/8/8/3p4/8/8/8/K7 w - d6 0 1'
		);
		expect(ineffectiveEnPassant.fen.split(' ')[3]).toBe('-');
		for (const request of [
			{ from: 'a1', to: 'a2' },
			{ from: 'h8', to: 'h7' },
			{ from: 'a2', to: 'a1' },
			{ from: 'h7', to: 'h8' },
			{ from: 'a1', to: 'a2' },
			{ from: 'h8', to: 'h7' },
			{ from: 'a2', to: 'a1' },
			{ from: 'h7', to: 'h8' },
		] as const) {
			const result = attemptMove(ineffectiveEnPassant, request);
			if (result.kind !== 'applied') throw new Error('expected applied');
			ineffectiveEnPassant = result.state;
		}
		expect(ineffectiveEnPassant.terminationReason).toBe('threefold-repetition');
	});

	test('the fifty-move clock draws at 100 and a pawn move resets it', () => {
		const nearDraw = createGameStateFromFen('7k/8/8/8/8/8/P7/K6R w - - 99 50');
		const pawn = attemptMove(nearDraw, { from: 'a2', to: 'a3' });
		expect(pawn.kind).toBe('applied');
		if (pawn.kind !== 'applied') throw new Error('expected applied');
		expect(pawn.state.fen.split(' ')[4]).toBe('0');
		expect(pawn.state.terminationReason).toBeNull();

		const qualifying = createGameStateFromFen('7k/8/8/8/8/8/8/K6R w - - 99 50');
		const rook = attemptMove(qualifying, { from: 'h1', to: 'h2' });
		expect(rook.kind).toBe('applied');
		if (rook.kind !== 'applied') throw new Error('expected applied');
		expect(rook.state.terminationReason).toBe('fifty-move');
	});

	test('uses the chess.js insufficient-material definition', () => {
		for (const fen of [
			'7k/8/8/8/8/8/8/7K w - - 0 1',
			'7k/8/8/8/8/8/8/K1B5 w - - 0 1',
			'7k/8/8/8/8/8/8/KN6 w - - 0 1',
			'7k/8/8/8/5b2/8/8/K1B5 w - - 0 1',
		]) {
			const state = createGameStateFromFen(fen);
			expect(state.status).toBe('draw');
			expect(state.terminationReason).toBe('insufficient-material');
		}

		const twoKnights = createGameStateFromFen('7k/8/8/8/8/8/8/KNN5 w - - 0 1');
		expect(twoKnights.terminationReason).toBeNull();
	});

	test('finishes a legal game and rejects all later moves', () => {
		let state = createInitialGameState();
		for (const request of [
			{ from: 'f2', to: 'f3' },
			{ from: 'e7', to: 'e5' },
			{ from: 'g2', to: 'g4' },
			{ from: 'd8', to: 'h4' },
		] as const) {
			const result = attemptMove(state, request);
			if (result.kind !== 'applied') throw new Error('expected applied');
			state = result.state;
		}

		expect(state.status).toBe('checkmate');
		expect(state.terminationReason).toBe('checkmate');
		expect(isTerminalState(state)).toBe(true);
		expect(attemptMove(state, { from: 'e1', to: 'f2' })).toEqual({
			kind: 'rejected',
			reason: 'terminal',
		});
	});
});
