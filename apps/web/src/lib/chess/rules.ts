import {
	Chess,
	DEFAULT_POSITION,
	type Color,
	type Move as EngineMove,
	type PieceSymbol,
	type Square,
} from 'chess.js';
import { positionToAlgebraic, tryAlgebraicToPosition } from './board';
import type {
	AttackQuery,
	AttackResult,
	ChessMoveRequest,
	ChessPiece,
	ChessSquare,
	GameMode,
	GameState,
	LegalChessMove,
	Move,
	MoveAttempt,
	PieceColor,
	Position,
} from './types';

const TO_ENGINE_COLOR: Record<PieceColor, Color> = {
	white: 'w',
	black: 'b',
};
const FROM_ENGINE_COLOR: Record<Color, PieceColor> = {
	w: 'white',
	b: 'black',
};
const TO_ENGINE_PIECE: Record<ChessPiece['type'], PieceSymbol> = {
	king: 'k',
	queen: 'q',
	rook: 'r',
	bishop: 'b',
	knight: 'n',
	pawn: 'p',
};
const FROM_ENGINE_PIECE: Record<PieceSymbol, ChessPiece['type']> = {
	k: 'king',
	q: 'queen',
	r: 'rook',
	b: 'bishop',
	n: 'knight',
	p: 'pawn',
};
const TO_ENGINE_PROMOTION = {
	queen: 'q',
	rook: 'r',
	bishop: 'b',
	knight: 'n',
} as const;
const PROMOTION_FROM_ENGINE = {
	q: 'queen',
	r: 'rook',
	b: 'bishop',
	n: 'knight',
} as const;

export interface ChessStateOptions {
	mode?: GameMode;
	aiPlayer?: PieceColor;
	isAiThinking?: boolean;
}

export interface BoardFenOptions extends ChessStateOptions {
	castling?: string;
	enPassant?: ChessSquare | null;
	halfmove?: number;
	fullmove?: number;
}

function positionToSquare(position: Position): ChessSquare {
	return positionToAlgebraic(position) as ChessSquare;
}

function squareToPosition(square: string): Position {
	const position = tryAlgebraicToPosition(square);
	if (!position) throw new Error(`Invalid chess square: ${square}`);
	return position;
}

function boardFromEngine(engine: Chess): (ChessPiece | null)[][] {
	return engine.board().map(row =>
		row.map(piece =>
			piece
				? {
						type: FROM_ENGINE_PIECE[piece.type],
						color: FROM_ENGINE_COLOR[piece.color],
					}
				: null
		)
	);
}

function fenPlacement(board: (ChessPiece | null)[][]): string {
	return board
		.map(row => {
			let empty = 0;
			let rank = '';
			for (const piece of row) {
				if (!piece) {
					empty += 1;
					continue;
				}
				if (empty) rank += String(empty);
				empty = 0;
				const symbol = TO_ENGINE_PIECE[piece.type];
				rank += piece.color === 'white' ? symbol.toUpperCase() : symbol;
			}
			return rank + (empty ? String(empty) : '');
		})
		.join('/');
}

function assertBoardContract(board: (ChessPiece | null)[][]): void {
	if (board.length !== 8 || board.some(rank => rank.length !== 8)) {
		throw new Error('Chess board must be exactly 8×8');
	}

	const kingCounts: Record<PieceColor, number> = { white: 0, black: 0 };
	for (const rank of board) {
		for (const piece of rank) {
			if (piece?.type === 'king') kingCounts[piece.color] += 1;
		}
	}
	if (kingCounts.white !== 1 || kingCounts.black !== 1) {
		throw new Error('Chess board must contain exactly one king per side');
	}
}

function deriveStatus(engine: Chess): {
	status: GameState['status'];
	terminationReason: GameState['terminationReason'];
} {
	if (engine.isCheckmate()) {
		return { status: 'checkmate', terminationReason: 'checkmate' };
	}
	if (engine.isStalemate()) {
		return { status: 'stalemate', terminationReason: 'stalemate' };
	}
	if (engine.isInsufficientMaterial()) {
		return { status: 'draw', terminationReason: 'insufficient-material' };
	}
	if (engine.isThreefoldRepetition()) {
		return { status: 'draw', terminationReason: 'threefold-repetition' };
	}
	if (engine.isDrawByFiftyMoves()) {
		return { status: 'draw', terminationReason: 'fifty-move' };
	}
	if (engine.isCheck()) {
		return { status: 'check', terminationReason: null };
	}
	return { status: 'playing', terminationReason: null };
}

function stateFromEngine(
	engine: Chess,
	initialFen: string,
	options: ChessStateOptions,
	moveHistory: GameState['moveHistory'] = []
): GameState {
	const { status, terminationReason } = deriveStatus(engine);
	return {
		board: boardFromEngine(engine),
		currentPlayer: FROM_ENGINE_COLOR[engine.turn()],
		status,
		moveHistory,
		selectedSquare: null,
		possibleMoves: [],
		mode: options.mode ?? 'human-vs-human',
		aiPlayer: options.aiPlayer,
		isAiThinking: options.isAiThinking ?? false,
		initialFen,
		fen: engine.fen(),
		pendingPromotion: null,
		terminationReason,
	};
}

function replayEngine(state: GameState): Chess {
	const engine = new Chess(state.initialFen);
	for (const move of state.moveHistory) {
		engine.move({
			from: positionToSquare(move.from),
			to: positionToSquare(move.to),
			promotion: move.promotion
				? TO_ENGINE_PROMOTION[move.promotion]
				: undefined,
		});
	}
	if (engine.fen() !== state.fen) {
		throw new Error('Chess state FEN does not match replay history');
	}
	return engine;
}

export function createInitialGameState(
	options: ChessStateOptions = {}
): GameState {
	return createGameStateFromFen(DEFAULT_POSITION, options);
}

export function createGameStateFromFen(
	fen: string,
	options: ChessStateOptions = {}
): GameState {
	const engine = new Chess(fen);
	return stateFromEngine(engine, engine.fen(), options);
}

export function createGameStateFromBoard(
	board: (ChessPiece | null)[][],
	sideToMove: PieceColor,
	options: BoardFenOptions = {}
): GameState {
	assertBoardContract(board);
	const fen = [
		fenPlacement(board),
		TO_ENGINE_COLOR[sideToMove],
		options.castling ?? '-',
		options.enPassant ?? '-',
		options.halfmove ?? 0,
		options.fullmove ?? 1,
	].join(' ');
	return createGameStateFromFen(fen, options);
}

export function isTerminalState(state: GameState): boolean {
	return (
		state.terminationReason !== null ||
		state.status === 'checkmate' ||
		state.status === 'stalemate' ||
		state.status === 'draw'
	);
}

function legalMoveFromEngine(move: EngineMove): LegalChessMove {
	return {
		from: squareToPosition(move.from),
		to: squareToPosition(move.to),
		piece: {
			type: FROM_ENGINE_PIECE[move.piece],
			color: FROM_ENGINE_COLOR[move.color],
		},
		capturedPiece: move.captured
			? {
					type: FROM_ENGINE_PIECE[move.captured],
					color: FROM_ENGINE_COLOR[move.color === 'w' ? 'b' : 'w'],
				}
			: undefined,
		promotion: move.promotion
			? PROMOTION_FROM_ENGINE[
					move.promotion as keyof typeof PROMOTION_FROM_ENGINE
				]
			: undefined,
		isEnPassant: move.isEnPassant(),
		isCastling: move.isKingsideCastle() || move.isQueensideCastle(),
		san: move.san,
		lan: move.lan,
	};
}

function moveRecordFromEngine(move: EngineMove): Move {
	const mapped = legalMoveFromEngine(move);
	return {
		from: mapped.from,
		to: mapped.to,
		piece: mapped.piece,
		capturedPiece: mapped.capturedPiece,
		promotion: mapped.promotion,
		isEnPassant: mapped.isEnPassant,
		isCastling: mapped.isCastling,
		san: mapped.san,
		lan: mapped.lan,
		beforeFen: move.before,
		afterFen: move.after,
	};
}

export function attemptMove(
	state: GameState,
	request: ChessMoveRequest
): MoveAttempt {
	if (isTerminalState(state)) {
		return { kind: 'rejected', reason: 'terminal' };
	}

	let engine: Chess;
	try {
		engine = replayEngine(state);
	} catch {
		return { kind: 'rejected', reason: 'state-inconsistent' };
	}

	const from = tryAlgebraicToPosition(request.from);
	const to = tryAlgebraicToPosition(request.to);
	if (!from || !to) {
		return { kind: 'rejected', reason: 'invalid-coordinate' };
	}

	const piece = engine.get(request.from as Square);
	if (!piece || FROM_ENGINE_COLOR[piece.color] !== state.currentPlayer) {
		return { kind: 'rejected', reason: 'wrong-side' };
	}

	const candidates = engine
		.moves({ square: request.from as Square, verbose: true })
		.filter(move => move.to === request.to);
	const promotionCandidates = candidates.filter(move => move.isPromotion());
	if (!request.promotion && promotionCandidates.length > 0) {
		return {
			kind: 'promotion-required',
			from,
			to,
			color: state.currentPlayer,
			choices: ['queen', 'rook', 'bishop', 'knight'],
		};
	}

	const enginePromotion = request.promotion
		? TO_ENGINE_PROMOTION[request.promotion]
		: undefined;
	const candidate = candidates.find(
		move => (move.promotion ?? undefined) === enginePromotion
	);
	if (!candidate) {
		return {
			kind: 'rejected',
			reason: request.promotion ? 'invalid-promotion' : 'illegal-move',
		};
	}

	const applied = engine.move({
		from: request.from,
		to: request.to,
		promotion: enginePromotion,
	});
	const move = moveRecordFromEngine(applied);
	const nextState = stateFromEngine(
		engine,
		state.initialFen,
		{
			mode: state.mode,
			aiPlayer: state.aiPlayer,
			isAiThinking: state.isAiThinking,
		},
		[...state.moveHistory, move]
	);
	return { kind: 'applied', state: nextState, move };
}

export function getLegalMoves(
	state: GameState,
	from?: Position
): LegalChessMove[] {
	const engine = replayEngine(state);
	const moves = from
		? engine.moves({
				square: positionToSquare(from) as Square,
				verbose: true,
			})
		: engine.moves({ verbose: true });
	return moves.map(legalMoveFromEngine);
}

export function getLegalDestinations(
	state: GameState,
	from: Position
): Position[] {
	const unique = new Map<string, Position>();
	for (const move of getLegalMoves(state, from)) {
		unique.set(`${move.to.row}:${move.to.col}`, move.to);
	}
	return [...unique.values()];
}

export function queryAttacks(
	state: GameState,
	queries: readonly AttackQuery[]
): AttackResult[] {
	const engine = replayEngine(state);
	return queries.map(query => {
		const square = positionToSquare(query.square) as Square;
		const attacker = TO_ENGINE_COLOR[query.attacker];
		return {
			...query,
			attacked: engine.isAttacked(square, attacker),
			attackers: engine.attackers(square, attacker).map(squareToPosition),
		};
	});
}

export function isSquareAttackedBy(
	state: GameState,
	square: Position,
	attacker: PieceColor
): boolean {
	return queryAttacks(state, [{ square, attacker }])[0]?.attacked ?? false;
}

export function getAttackers(
	state: GameState,
	square: Position,
	attacker: PieceColor
): Position[] {
	return queryAttacks(state, [{ square, attacker }])[0]?.attackers ?? [];
}
