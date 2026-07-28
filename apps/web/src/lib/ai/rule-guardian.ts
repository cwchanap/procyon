import { BaseRuleGuardian } from './base-rule-guardian';
import type { RuleGuardian, MoveValidationResult } from './base-rule-guardian';
import type {
	GameVariant,
	AnyGameState,
	GamePosition,
} from './game-variant-types';
import type { AIResponse } from './types';
import type { ShogiPieceType } from '../shogi';
import { isValidPosition } from './notation-utils';
import type { GameState as ChessGameState } from '../chess/types';
import type { XiangqiGameState } from '../xiangqi/types';
import type { ShogiGameState } from '../shogi';
import type { JungleGameState } from '../jungle/types';
import { attemptMove } from '../chess/rules';
import type { ChessMoveRequest, ChessSquare } from '../chess/types';

// Re-export types so existing importers (service.ts, tests) don't break:
export type { RuleGuardian, MoveValidationResult } from './base-rule-guardian';

const VALID_SHOGI_PIECE_TYPES: ShogiPieceType[] = [
	'rook',
	'bishop',
	'gold',
	'silver',
	'knight',
	'lance',
	'pawn',
];

export class ChessRuleGuardian extends BaseRuleGuardian<ChessGameState> {
	gameVariant = 'chess' as const;

	protected override validateVariantRules(
		gameState: ChessGameState,
		_piece: NonNullable<ChessGameState['board'][number][number]>,
		_parsed: { fromPos: GamePosition; toPos: GamePosition },
		aiResponse: AIResponse
	): MoveValidationResult {
		const request: ChessMoveRequest = {
			from: aiResponse.move.from as ChessSquare,
			to: aiResponse.move.to as ChessSquare,
			...(aiResponse.move.promotion !== undefined
				? { promotion: aiResponse.move.promotion }
				: {}),
		};
		const result = attemptMove(gameState, request);
		if (result.kind === 'applied') return { isValid: true };
		if (result.kind === 'promotion-required') {
			return {
				isValid: false,
				reason: 'Chess promotion moves must include promotion',
			};
		}
		return { isValid: false, reason: `Illegal chess move: ${result.reason}` };
	}
}

export class XiangqiRuleGuardian extends BaseRuleGuardian<XiangqiGameState> {
	gameVariant = 'xiangqi' as const;

	protected override validateVariantRules(
		_gameState: XiangqiGameState,
		piece: NonNullable<XiangqiGameState['board'][number][number]>,
		parsed: { fromPos: GamePosition; toPos: GamePosition },
		_aiResponse: AIResponse
	): MoveValidationResult {
		if (
			(piece.type === 'king' || piece.type === 'advisor') &&
			!this.isInPalace(parsed.toPos, piece.color)
		) {
			return { isValid: false, reason: `${piece.type} must stay in palace` };
		}
		if (
			piece.type === 'elephant' &&
			!this.isOnCorrectSide(parsed.toPos, piece.color)
		) {
			return { isValid: false, reason: 'Elephant cannot cross river' };
		}
		return { isValid: true };
	}

	private isInPalace(pos: GamePosition, color: string): boolean {
		const palaceRows = color === 'red' ? [7, 8, 9] : [0, 1, 2];
		const palaceCols = [3, 4, 5];
		return palaceRows.includes(pos.row) && palaceCols.includes(pos.col);
	}

	private isOnCorrectSide(pos: GamePosition, color: string): boolean {
		return color === 'red' ? pos.row >= 5 : pos.row <= 4;
	}
}

export class ShogiRuleGuardian extends BaseRuleGuardian<ShogiGameState> {
	gameVariant = 'shogi' as const;

	protected override validateDrop(
		gameState: ShogiGameState,
		aiResponse: AIResponse,
		toPos: GamePosition
	): MoveValidationResult {
		if (!isValidPosition('shogi', toPos)) {
			return { isValid: false, reason: 'Drop coordinates out of bounds' };
		}
		if (gameState.board[toPos.row]?.[toPos.col]) {
			return { isValid: false, reason: 'Cannot drop on occupied square' };
		}
		if (!aiResponse.move.pieceType) {
			return {
				isValid: false,
				reason: 'Drop moves must include pieceType (e.g., "pawn", "lance")',
			};
		}
		if (
			!VALID_SHOGI_PIECE_TYPES.includes(
				aiResponse.move.pieceType as ShogiPieceType
			)
		) {
			return {
				isValid: false,
				reason: `Invalid pieceType for drop: ${aiResponse.move.pieceType}. Must be one of: ${VALID_SHOGI_PIECE_TYPES.join(', ')}`,
			};
		}
		const hand =
			gameState.currentPlayer === 'sente'
				? gameState.senteHand
				: gameState.goteHand;
		const pieceInHand = hand.find(
			p =>
				p.type === aiResponse.move.pieceType &&
				p.color === gameState.currentPlayer
		);
		if (!pieceInHand) {
			return {
				isValid: false,
				reason: `You don't have a ${aiResponse.move.pieceType} in your hand`,
			};
		}
		return { isValid: true };
	}
}

export class JungleRuleGuardian extends BaseRuleGuardian<JungleGameState> {
	gameVariant = 'jungle' as const;
}

export function createRuleGuardian<T extends AnyGameState>(
	gameVariant: GameVariant
): RuleGuardian<T> {
	switch (gameVariant) {
		case 'chess':
			return new ChessRuleGuardian() as RuleGuardian<T>;
		case 'xiangqi':
			return new XiangqiRuleGuardian() as RuleGuardian<T>;
		case 'shogi':
			return new ShogiRuleGuardian() as RuleGuardian<T>;
		case 'jungle':
			return new JungleRuleGuardian() as RuleGuardian<T>;
		default:
			throw new Error(`Unsupported game variant: ${gameVariant}`);
	}
}
