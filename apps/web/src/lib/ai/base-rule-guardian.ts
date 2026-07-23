import type {
	GameVariant,
	GamePosition,
	AnyGameState,
} from './game-variant-types';
import type { AIResponse } from './types';
import { tryAlgebraicToPosition, isValidPosition } from './notation-utils';
import { GAME_CONFIGS } from './game-variant-types';

export interface MoveValidationResult {
	isValid: boolean;
	reason?: string;
	suggestedAlternative?: { from: string; to: string };
}

export interface RuleGuardian<T extends AnyGameState = AnyGameState> {
	gameVariant: GameVariant;
	validateAIMove(gameState: T, aiResponse: AIResponse): MoveValidationResult;
	parseMove(algebraicMove: { from: string; to: string }): {
		fromPos: GamePosition;
		toPos: GamePosition;
		isDrop?: boolean;
	};
}

export abstract class BaseRuleGuardian<T extends AnyGameState = AnyGameState>
	implements RuleGuardian<T>
{
	abstract gameVariant: GameVariant;

	protected getConfig() {
		return GAME_CONFIGS[this.gameVariant];
	}

	parseMove(move: { from: string; to: string }): {
		fromPos: GamePosition;
		toPos: GamePosition;
		isDrop?: boolean;
	} {
		const isDrop = move.from === '*';
		if (isDrop) {
			return {
				fromPos: { row: -1, col: -1 },
				toPos: tryAlgebraicToPosition(this.gameVariant, move.to),
				isDrop: true,
			};
		}
		return {
			fromPos: tryAlgebraicToPosition(this.gameVariant, move.from),
			toPos: tryAlgebraicToPosition(this.gameVariant, move.to),
			isDrop: false,
		};
	}

	validateAIMove(gameState: T, aiResponse: AIResponse): MoveValidationResult {
		try {
			const parsed = this.parseMove(aiResponse.move);

			if (parsed.isDrop) {
				return this.validateDrop(gameState, aiResponse, parsed.toPos);
			}

			if (
				!isValidPosition(this.gameVariant, parsed.fromPos) ||
				!isValidPosition(this.gameVariant, parsed.toPos)
			) {
				return { isValid: false, reason: 'Move coordinates out of bounds' };
			}
			const piece = gameState.board[parsed.fromPos.row]?.[parsed.fromPos.col];
			if (!piece) {
				return {
					isValid: false,
					reason: `No piece at ${aiResponse.move.from}`,
				};
			}
			if (piece.color !== gameState.currentPlayer) {
				return {
					isValid: false,
					reason: `Not your piece at ${aiResponse.move.from}`,
				};
			}

			return this.validateVariantRules(gameState, piece, parsed, aiResponse);
		} catch (error) {
			return { isValid: false, reason: `Invalid move format: ${error}` };
		}
	}

	protected validateVariantRules(
		_gameState: T,
		_piece: NonNullable<T['board'][number][number]>,
		_parsed: { fromPos: GamePosition; toPos: GamePosition },
		_aiResponse: AIResponse
	): MoveValidationResult {
		return { isValid: true };
	}

	protected validateDrop(
		_gameState: T,
		_aiResponse: AIResponse,
		_toPos: GamePosition
	): MoveValidationResult {
		return {
			isValid: false,
			reason: `Drop moves not supported by ${this.gameVariant}`,
		};
	}
}
