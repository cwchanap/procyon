import type {
	ChessSquare,
	GameMode,
	GameState,
	PieceColor,
	Position,
	PromotionPiece,
} from './types';
import {
	getPieceAt,
	positionToAlgebraic,
	tryAlgebraicToPosition,
} from './board';
import {
	attemptMove,
	createInitialGameState as createRulesInitialGameState,
	getLegalDestinations,
	isTerminalState,
} from './rules';

export function createInitialGameState(
	mode: GameMode = 'human-vs-human',
	aiPlayer?: PieceColor
): GameState {
	return createRulesInitialGameState({ mode, aiPlayer });
}

export function selectSquare(state: GameState, position: Position): GameState {
	if (isTerminalState(state) || state.pendingPromotion) return state;
	const piece = getPieceAt(state.board, position);
	const isSelected =
		state.selectedSquare?.row === position.row &&
		state.selectedSquare.col === position.col;
	if (!piece || piece.color !== state.currentPlayer || isSelected) {
		return { ...state, selectedSquare: null, possibleMoves: [] };
	}
	return {
		...state,
		selectedSquare: position,
		possibleMoves: getLegalDestinations(state, position),
	};
}

export function makeMove(
	state: GameState,
	from: Position,
	to: Position,
	promotion?: PromotionPiece
): GameState | null {
	const result = attemptMove(state, {
		from: positionToAlgebraic(from) as ChessSquare,
		to: positionToAlgebraic(to) as ChessSquare,
		promotion,
	});
	if (result.kind === 'applied') return result.state;
	if (result.kind === 'promotion-required') {
		return {
			...state,
			selectedSquare: from,
			possibleMoves: [],
			pendingPromotion: {
				from,
				to,
				color: result.color,
				choices: result.choices,
			},
		};
	}
	return null;
}

export function confirmPromotion(
	state: GameState,
	promotion: PromotionPiece
): GameState | null {
	const pending = state.pendingPromotion;
	if (!pending || !pending.choices.includes(promotion)) return null;
	return makeMove(
		{ ...state, pendingPromotion: null },
		pending.from,
		pending.to,
		promotion
	);
}

export function cancelPromotion(state: GameState): GameState {
	return {
		...state,
		pendingPromotion: null,
		selectedSquare: null,
		possibleMoves: [],
	};
}

export function makeAIMove(
	state: GameState,
	from: string,
	to: string,
	promotion?: PromotionPiece
): GameState | null {
	if (!tryAlgebraicToPosition(from) || !tryAlgebraicToPosition(to)) {
		return null;
	}
	const result = attemptMove(state, {
		from: from as ChessSquare,
		to: to as ChessSquare,
		promotion,
	});
	return result.kind === 'applied' ? result.state : null;
}

export function getGameStatus(state: GameState): GameState['status'] {
	return state.status;
}

export function setAIThinking(state: GameState, thinking: boolean): GameState {
	return { ...state, isAiThinking: thinking };
}

export function isAITurn(state: GameState): boolean {
	return (
		!isTerminalState(state) &&
		state.mode === 'human-vs-ai' &&
		state.currentPlayer === state.aiPlayer
	);
}
