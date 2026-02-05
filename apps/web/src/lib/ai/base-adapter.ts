import type {
	GameVariantAdapter,
	BaseGameState,
	GamePosition,
	GamePiece,
	AnyGameState,
} from './service';
import type { GameVariant, GameVariantConfig } from './game-variant-types';

/**
 * Abstract base class for game adapters that provides common functionality
 * shared across all game variants.
 */
export abstract class BaseGameAdapter<T extends AnyGameState>
	implements GameVariantAdapter<T>
{
	abstract readonly gameVariant: GameVariant;
	protected abstract readonly config: GameVariantConfig;
	protected debugMode: boolean;

	constructor(debugMode = false) {
		this.debugMode = debugMode;
	}

	// Abstract methods that must be implemented by each adapter
	abstract convertGameState(gameState: T): BaseGameState;
	abstract getAllValidMoves(gameState: T): string[];
	abstract generatePrompt(gameState: T): string;
	abstract createVisualBoard(gameState: T): string;
	abstract analyzeThreatsSafety(gameState: T): string;
	abstract getPieceSymbol(piece: GamePiece): string;

	/**
	 * Convert a position to algebraic notation using the game's file/rank system
	 */
	positionToAlgebraic(position: GamePosition): string {
		const file = this.config.files[position.col];
		const rank = this.config.ranks[position.row];
		if (!file || !rank) return '';
		return `${file}${rank}`;
	}

	/**
	 * Convert algebraic notation to a position
	 */
	algebraicToPosition(algebraic: string): GamePosition {
		const normalized = algebraic?.trim().toLowerCase();

		if (!normalized || normalized.length < 2) {
			throw new Error(`Invalid algebraic notation: ${algebraic}`);
		}

		// Handle different rank formats (single char vs multi-char like "10")
		const file = normalized[0];
		const rank = normalized.slice(1);

		if (!file || !rank) {
			throw new Error(`Invalid algebraic notation: ${algebraic}`);
		}

		const col = this.config.files.indexOf(file);
		const row = this.config.ranks.indexOf(rank);

		if (col === -1 || row === -1) {
			throw new Error(`Invalid algebraic notation: ${algebraic}`);
		}

		return { col, row };
	}

	/**
	 * Group moves by piece type for display
	 * Input format: "e2-e4 (♙/♟)", "b1-c3 (♘/♞)"
	 * Output format: "♙/♟: e2-e4, d2-d4\n♘/♞: b1-c3, g1-f3"
	 */
	protected groupMovesByPiece(moves: string[]): string {
		const groups: Record<string, string[]> = {};

		for (const move of moves) {
			const pieceMatch = move.match(/\(([^)]+)\)/);
			const pieceType = pieceMatch ? pieceMatch[1] : 'Unknown';
			if (!groups[pieceType]) {
				groups[pieceType] = [];
			}
			// Remove the piece annotation from the move string
			groups[pieceType].push(move.replace(/\s*\([^)]+\)/, ''));
		}

		let result = '';
		for (const [pieceType, movesArray] of Object.entries(groups)) {
			result += `${pieceType}: ${movesArray.join(', ')}\n`;
		}

		return result.trim();
	}

	/**
	 * Get the board dimensions for this game variant
	 */
	protected getBoardDimensions(): { rows: number; cols: number } {
		return this.config.boardSize;
	}

	/**
	 * Check if a position is within the board bounds
	 */
	protected isValidPosition(position: GamePosition): boolean {
		const { rows, cols } = this.getBoardDimensions();
		return (
			position.row >= 0 &&
			position.row < rows &&
			position.col >= 0 &&
			position.col < cols
		);
	}

	/**
	 * Find a piece on the board by type and color
	 */
	protected findPiece<P extends GamePiece>(
		board: (P | null)[][],
		type: string,
		color: string
	): GamePosition | null {
		const { rows, cols } = this.getBoardDimensions();

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

	/**
	 * Count pieces on the board for material evaluation
	 */
	protected countPiecesOnBoard<P extends GamePiece>(
		board: (P | null)[][],
		color: string,
		pieceValues: Record<string, number>
	): number {
		const { rows, cols } = this.getBoardDimensions();
		let total = 0;

		for (let row = 0; row < rows; row++) {
			for (let col = 0; col < cols; col++) {
				const piece = board[row]?.[col];
				if (piece && piece.color === color) {
					total += pieceValues[piece.type] || 0;
				}
			}
		}

		return total;
	}

	/**
	 * Get an example move from a valid moves string for prompt generation
	 */
	protected getExampleMoveFromValidMoves(validMovesText: string): {
		from: string;
		to: string;
	} {
		// Extract first move from the valid moves list
		// Format is like: "♘/♞: b8-a6, b8-c6, ..." or "e2-e4, d2-d4"
		const moveMatch = validMovesText.match(
			/([a-z][0-9]{1,2})-([a-z][0-9]{1,2})/i
		);
		if (moveMatch && moveMatch[1] && moveMatch[2]) {
			return {
				from: moveMatch[1],
				to: moveMatch[2],
			};
		}
		// Fallback to first file/rank combination in config
		const firstFile = this.config.files[0] || 'a';
		const firstRank = this.config.ranks[this.config.ranks.length - 1] || '1';
		const secondRank = this.config.ranks[this.config.ranks.length - 2] || '2';
		return {
			from: `${firstFile}${firstRank}`,
			to: `${firstFile}${secondRank}`,
		};
	}
}
