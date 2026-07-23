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

	// Abstract declarations for interface members not implemented here.
	// getAllValidMoves is concrete (template method) below.
	// generatePrompt + analyzeThreatsSafety stay abstract (variant-specific).
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

	// ---------------------------------------------------------------------
	// Template method: getAllValidMoves
	// ---------------------------------------------------------------------
	// Concrete workflow: enumerate own pieces' moves → expand notation variants
	// → append drop moves → finalize (group/raw/etc.). Variants customize via
	// hooks below rather than re-implementing the orchestration.

	getAllValidMoves(gameState: T): string[] {
		const rawMoves: string[] = [];

		this.forEachOwnPieceMove(gameState, (piece, from, to) => {
			if (this.wouldMoveBeValid(gameState, piece, from, to)) {
				rawMoves.push(...this.expandMoveVariants(piece, from, to));
			}
		});

		rawMoves.push(...this.getDropMoves(gameState));

		return this.finalizeMoves(rawMoves);
	}

	// Hook: iterate the current player's pieces and emit each pseudo-legal
	// (from, to) pair. Subclasses MUST override — move-generation signatures
	// differ per variant.
	protected abstract forEachOwnPieceMove(
		gameState: T,
		cb: (
			piece: NonNullable<T['board'][number][number]>,
			from: GamePosition,
			to: GamePosition
		) => void
	): void;

	// Hook: produce one or more notation strings for a single (piece, from, to).
	// Default uses BaseAdapter#getPieceSymbol. Shogi overrides for promotion
	// variants; chess overrides for dual ♙/♟ symbols; jungle uses a different
	// separator.
	protected expandMoveVariants(
		piece: GamePiece,
		from: GamePosition,
		to: GamePosition
	): string[] {
		const symbol = this.getPieceSymbol(piece);
		return [
			`${this.positionToAlgebraic(from)}-${this.positionToAlgebraic(to)} (${symbol})`,
		];
	}

	// Hook: enumerate drop moves (default: none). Shogi overrides.
	protected getDropMoves(_gameState: T): string[] {
		return [];
	}

	// Hook: wrap/group the raw move list. Default groups by piece symbol and
	// substitutes a sentinel when no moves exist. Jungle overrides to return
	// the raw array unchanged.
	protected finalizeMoves(rawMoves: string[]): string[] {
		if (rawMoves.length === 0) {
			return ['No valid moves available (checkmate or stalemate)'];
		}
		return [this.groupMovesByPiece(rawMoves)];
	}

	// Hook: copy/apply/test shell. Returns true if the move is legal AND does
	// not leave the mover's own king in check. Jungle overrides entirely
	// (no king to check). The caller (forEachOwnPieceMove) supplies the piece,
	// avoiding a redundant board lookup per move.
	protected wouldMoveBeValid(
		gameState: T,
		piece: NonNullable<T['board'][number][number]>,
		from: GamePosition,
		to: GamePosition
	): boolean {
		if (piece.color !== gameState.currentPlayer) return false;
		if (!this.isMoveLegal(gameState, from, to)) return false;

		const testBoard = this.simulateMove(gameState.board, from, to, piece);
		if (this.isOwnKingInCheck(testBoard, gameState.currentPlayer)) return false;
		return true;
	}

	// Hook: variant-specific legality check (e.g. isMoveValid). Default trusts
	// forEachOwnPieceMove's source (getPossibleMoves).
	protected isMoveLegal(
		_gameState: T,
		_from: GamePosition,
		_to: GamePosition
	): boolean {
		return true;
	}

	// Hook: produce a copy of the board with the move applied. Subclasses
	// MUST override — board representation + copy helpers differ per variant.
	protected simulateMove(
		_board: T['board'],
		_from: GamePosition,
		_to: GamePosition,
		_piece: NonNullable<T['board'][number][number]>
	): T['board'] {
		throw new Error('simulateMove must be overridden');
	}

	// Hook: detect whether the mover's own king is in check on the given board.
	// Subclasses MUST override (king-lookup is variant-specific).
	protected isOwnKingInCheck(_board: T['board'], _color: string): boolean {
		throw new Error('isOwnKingInCheck must be overridden');
	}
}
