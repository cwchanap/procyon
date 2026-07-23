import type { GameState, Move, Position, ChessPiece } from '../chess/types';
import { BOARD_SIZE } from '../chess/types';
import { getPossibleMoves, isMoveValid } from '../chess/moves';
import { isKingInCheck } from '../chess/game';
import { copyBoard, getRow, setPieceAt } from '../chess/board';
import { BaseAdapter } from './base-adapter';
import type { GamePosition } from './service';

export class ChessAdapter extends BaseAdapter<GameState> {
	gameVariant = 'chess' as const;

	generatePrompt(gameState: GameState): string {
		const currentPlayer = gameState.currentPlayer;
		const moveHistory = this.formatMoveHistory(gameState.moveHistory);
		const visualBoard = this.createVisualBoard(gameState);
		const [validMoves] = this.getAllValidMoves(gameState);
		if (!validMoves) {
			throw new Error('getAllValidMoves returned an empty array');
		}
		const exampleMove = this.getExampleMoveFromValidMoves(validMoves);

		// Simplified threat analysis for token efficiency
		const material = this.getSimpleMaterialBalance(gameState);
		const criticalThreats = this.getCriticalThreats(gameState);

		return `You are the chess-playing AI for ${currentPlayer}. It is your turn to play this ongoing game—choose and execute the next move.

BOARD:
${visualBoard}

Move #${Math.floor(gameState.moveHistory.length / 2) + 1} | Status: ${gameState.status}
Recent: ${moveHistory}

VALID MOVES (choose ONLY from these):
${validMoves}

${criticalThreats}Material: ${material}

Respond in JSON:
{
    "move": {
        "from": "${exampleMove.from}",
        "to": "${exampleMove.to}"
    },
    "reasoning": "Brief tactical/strategic reason",
    "confidence": 85
}

Rules:
- ONLY use moves from the valid moves list above
- "from" must have your piece on it (check board!)
- Parse "a2-a4" as {"from": "a2", "to": "a4"}`;
	}

	createVisualBoard(gameState: GameState): string {
		const { board } = gameState;
		let visual = '    a  b  c  d  e  f  g  h\n';
		visual += '  ┌──────────────────────┐\n';

		for (let rank = 0; rank < 8; rank++) {
			visual += `${8 - rank} │ `;
			for (let file = 0; file < 8; file++) {
				const piece = getRow(board, rank)[file];
				if (piece) {
					const symbol = this.getPieceSymbol(piece);
					visual += `${symbol} `;
				} else {
					visual += '. ';
				}
			}
			visual += `│ ${8 - rank}\n`;
		}

		visual += '  └──────────────────────┘\n';
		visual += '    a  b  c  d  e  f  g  h\n';

		return visual;
	}

	analyzeThreatsSafety(gameState: GameState): string {
		let analysis = '';
		if (gameState.status === 'check') {
			analysis += `⚠️  Your king is in CHECK! Priority: Get out of check immediately.\n`;
		}
		const material = this.getSimpleMaterialBalance(gameState);
		analysis += `Material balance: ${material}\n`;
		return analysis;
	}

	// ---------------------------------------------------------------------
	// BaseAdapter hook overrides
	// ---------------------------------------------------------------------

	protected override forEachOwnPieceMove(
		gameState: GameState,
		cb: (piece: ChessPiece, from: GamePosition, to: GamePosition) => void
	): void {
		const { board, currentPlayer } = gameState;
		for (let row = 0; row < BOARD_SIZE; row++) {
			for (let col = 0; col < BOARD_SIZE; col++) {
				const piece = getRow(board, row)[col];
				if (piece && piece.color === currentPlayer) {
					const from = { row, col };
					for (const to of getPossibleMoves(board, piece, from)) {
						cb(piece, from, to);
					}
				}
			}
		}
	}

	protected override expandMoveVariants(
		piece: ChessPiece,
		from: GamePosition,
		to: GamePosition
	): string[] {
		const symbol = this.getPieceSymbolForMove(piece);
		return [
			`${this.positionToAlgebraic(from)}-${this.positionToAlgebraic(to)} (${symbol})`,
		];
	}

	protected override isMoveLegal(
		gameState: GameState,
		from: GamePosition,
		to: GamePosition
	): boolean {
		const piece = gameState.board[from.row]?.[from.col];
		if (!piece) return false;
		return isMoveValid(gameState.board, from, to, piece);
	}

	protected override simulateMove(
		board: (ChessPiece | null)[][],
		from: GamePosition,
		to: GamePosition,
		piece: ChessPiece
	): (ChessPiece | null)[][] {
		const testBoard = copyBoard(board);
		setPieceAt(testBoard, from, null);
		setPieceAt(testBoard, to, piece);
		return testBoard;
	}

	protected override isOwnKingInCheck(
		board: (ChessPiece | null)[][],
		color: string
	): boolean {
		return isKingInCheck(board, color as ChessPiece['color']);
	}

	// ---------------------------------------------------------------------
	// Chess-specific helpers (live — used by generatePrompt)
	// ---------------------------------------------------------------------

	private formatMoveHistory(moves: Move[]): string {
		if (moves.length === 0) return 'None';

		const recentMoves = moves.slice(-6);
		return recentMoves
			.map(move => {
				const from = this.positionToAlgebraic(move.from);
				const to = this.positionToAlgebraic(move.to);
				return `${from}-${to}`;
			})
			.join(' ');
	}

	private getSimpleMaterialBalance(gameState: GameState): string {
		const { board, currentPlayer } = gameState;
		const myMaterial = this.countMaterial(board, currentPlayer);
		const enemyMaterial = this.countMaterial(
			board,
			currentPlayer === 'white' ? 'black' : 'white'
		);
		const diff = myMaterial - enemyMaterial;
		if (diff > 0) return `+${diff}`;
		if (diff < 0) return `${diff}`;
		return 'Equal';
	}

	private getCriticalThreats(gameState: GameState): string {
		if (gameState.status === 'check') {
			return '⚠️ IN CHECK! Must escape!\n';
		}
		const hangingPieces = this.findHangingPieces(
			gameState.board,
			gameState.currentPlayer
		);
		if (hangingPieces.length > 0) {
			const threats = hangingPieces
				.slice(0, 3)
				.map(t => `${t.piece} on ${t.square}`)
				.join(', ');
			return `⚠️ Hanging: ${threats}\n`;
		}
		return '';
	}

	private countMaterial(board: (ChessPiece | null)[][], color: string): number {
		const values = {
			pawn: 1,
			knight: 3,
			bishop: 3,
			rook: 5,
			queen: 9,
			king: 0,
		};
		let total = 0;

		for (let row = 0; row < BOARD_SIZE; row++) {
			for (let col = 0; col < BOARD_SIZE; col++) {
				const piece = getRow(board, row)[col];
				if (piece && piece.color === color) {
					total += values[piece.type as keyof typeof values] || 0;
				}
			}
		}

		return total;
	}

	private getPieceSymbolForMove(piece: ChessPiece): string {
		const symbols = {
			king: '♔/♚',
			queen: '♕/♛',
			rook: '♖/♜',
			bishop: '♗/♝',
			knight: '♘/♞',
			pawn: '♙/♟',
		};
		return symbols[piece.type] || piece.type;
	}

	private getExampleMoveFromValidMoves(validMovesText: string): {
		from: string;
		to: string;
	} {
		// Extract first move from the valid moves list as an example
		// Format is like: "♘/♞: b8-a6, b8-c6, ..."
		const moveMatch = validMovesText.match(/([a-h][1-8])-([a-h][1-8])/);
		if (moveMatch) {
			const [, from, to] = moveMatch;
			if (from && to) {
				return { from, to };
			}
		}
		// Fallback to generic example
		return {
			from: 'e2',
			to: 'e4',
		};
	}

	private findHangingPieces(
		board: (ChessPiece | null)[][],
		color: string
	): Array<{ piece: string; square: string }> {
		const opponent = color === 'white' ? 'black' : 'white';
		const hangingPieces: Array<{ piece: string; square: string }> = [];

		// Find all pieces of the current player
		for (let row = 0; row < BOARD_SIZE; row++) {
			for (let col = 0; col < BOARD_SIZE; col++) {
				const piece = getRow(board, row)[col];
				if (piece && piece.color === color) {
					const pos = { row, col };
					// Check if this piece is attacked by any opponent piece
					if (this.isSquareAttackedBy(board, pos, opponent)) {
						// Check if the piece is defended
						const isDefended = this.isSquareDefendedBy(board, pos, color);
						if (!isDefended) {
							hangingPieces.push({
								piece: piece.type,
								square: this.positionToAlgebraic(pos),
							});
						}
					}
				}
			}
		}

		return hangingPieces;
	}

	private isSquareAttackedBy(
		board: (ChessPiece | null)[][],
		pos: Position,
		attackerColor: string
	): boolean {
		// Check if any piece of attackerColor can attack this square
		for (let row = 0; row < BOARD_SIZE; row++) {
			for (let col = 0; col < BOARD_SIZE; col++) {
				const piece = getRow(board, row)[col];
				if (piece && piece.color === attackerColor) {
					const possibleMoves = getPossibleMoves(board, piece, {
						row,
						col,
					});
					if (
						possibleMoves.some(
							move => move.row === pos.row && move.col === pos.col
						)
					) {
						return true;
					}
				}
			}
		}
		return false;
	}

	private isSquareDefendedBy(
		board: (ChessPiece | null)[][],
		pos: Position,
		defenderColor: string
	): boolean {
		// Check if any piece of defenderColor can defend this square
		// (i.e., can move to this square, even if occupied by friendly piece)
		for (let row = 0; row < BOARD_SIZE; row++) {
			for (let col = 0; col < BOARD_SIZE; col++) {
				const piece = getRow(board, row)[col];
				if (
					piece &&
					piece.color === defenderColor &&
					!(row === pos.row && col === pos.col)
				) {
					// Don't count the piece itself
					const possibleMoves = getPossibleMoves(board, piece, {
						row,
						col,
					});
					if (
						possibleMoves.some(
							move => move.row === pos.row && move.col === pos.col
						)
					) {
						return true;
					}
				}
			}
		}
		return false;
	}
}
