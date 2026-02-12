// Re-export all types
export type {
	ShogiPieceType,
	ShogiPieceColor,
	ShogiPiece,
	ShogiPosition,
	ShogiMove,
	ShogiGameStatus,
	ShogiGameState,
} from './types';

// Re-export constants
export {
	SHOGI_BOARD_SIZE,
	SHOGI_FILES,
	SHOGI_RANKS,
	PIECE_UNICODE,
	PROMOTABLE_PIECES,
	PROMOTION_MAP,
} from './types';

// Re-export board functions
export {
	createInitialBoard,
	isValidPosition,
	getPieceAt,
	setPieceAt,
	isSquareEmpty,
	isSquareOccupiedByOpponent,
	isSquareOccupiedByAlly,
	copyBoard,
	positionToAlgebraic,
	algebraicToPosition,
	getDirection,
	isInPromotionZone,
	mustPromote,
	canPromote,
	getPromotedType,
	getBaseType,
} from './board';

// Re-export move functions
export {
	getPossibleMoves,
	isMoveValid,
	getDropPositions,
	canDropAt,
} from './moves';

// Re-export game functions
export {
	createInitialGameState,
	selectSquare,
	selectHandPiece,
	clearSelection,
	makeMove,
	confirmPromotion,
	isKingInCheck,
	getGameStatus,
	makeAIMove,
	setAIThinking,
	isAITurn,
} from './game';
