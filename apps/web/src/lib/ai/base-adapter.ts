import type {
	GameVariantAdapter,
	BaseGameState,
	GamePosition,
	GamePiece,
	AnyGameState,
} from './service';
import type { GameVariant, GameVariantConfig } from './game-variant-types';
import { GAME_CONFIGS } from './game-variant-types';
import { positionToAlgebraic, algebraicToPosition } from './notation-utils';

export abstract class BaseAdapter<T extends AnyGameState = AnyGameState>
	implements GameVariantAdapter<T>
{
	abstract gameVariant: GameVariant;
	protected debugMode: boolean;

	// Abstract declarations for interface members not yet implemented here.
	// getAllValidMoves + createVisualBoard become concrete in Task 3.
	// generatePrompt + analyzeThreatsSafety stay abstract (variant-specific).
	abstract getAllValidMoves(gameState: T): string[];
	abstract generatePrompt(gameState: T): string;
	abstract createVisualBoard(gameState: T): string;
	abstract analyzeThreatsSafety(gameState: T): string;

	constructor(debugMode = false) {
		this.debugMode = debugMode;
	}

	protected getConfig(): GameVariantConfig {
		return GAME_CONFIGS[this.gameVariant];
	}

	convertGameState(gameState: T): BaseGameState {
		return {
			board: gameState.board,
			currentPlayer: gameState.currentPlayer,
			status: gameState.status,
			moveHistory: gameState.moveHistory,
			selectedSquare: gameState.selectedSquare,
			possibleMoves: gameState.possibleMoves,
		};
	}

	positionToAlgebraic(pos: GamePosition): string {
		return positionToAlgebraic(this.gameVariant, pos);
	}

	algebraicToPosition(s: string): GamePosition {
		return algebraicToPosition(this.gameVariant, s);
	}

	getPieceSymbol(piece: GamePiece): string {
		const symbols = this.getConfig().pieceSymbols;
		return symbols[piece.color]?.[piece.type] ?? '?';
	}

	// Fully shared — no hooks needed.
	protected groupMovesByPiece(moves: string[]): string {
		const groups: { [key: string]: string[] } = {};
		for (const move of moves) {
			const pieceMatch = move.match(/\(([^)]+)\)/);
			const pieceType = pieceMatch?.[1] ?? 'Unknown';
			const group = groups[pieceType] ?? (groups[pieceType] = []);
			group.push(move.replace(/\s*\([^)]+\)/, ''));
		}
		let result = '';
		for (const [pieceType, movesArray] of Object.entries(groups)) {
			result += `${pieceType}: ${movesArray.join(', ')}\n`;
		}
		return result.trim();
	}

	protected findPiece(
		board: T['board'],
		type: string,
		color: string
	): { row: number; col: number } | null {
		const { rows, cols } = this.getConfig().boardSize;
		for (let row = 0; row < rows; row++) {
			for (let col = 0; col < cols; col++) {
				const piece = board[row]?.[col];
				if (piece && piece.type === type && piece.color === color) {
					return { row, col };
				}
			}
		}
		return null;
	}

	protected forEachPiece(
		board: T['board'],
		cb: (
			piece: NonNullable<T['board'][number][number]>,
			row: number,
			col: number
		) => void
	): void {
		const { rows, cols } = this.getConfig().boardSize;
		for (let row = 0; row < rows; row++) {
			for (let col = 0; col < cols; col++) {
				const piece = board[row]?.[col];
				if (piece) cb(piece, row, col);
			}
		}
	}
}
