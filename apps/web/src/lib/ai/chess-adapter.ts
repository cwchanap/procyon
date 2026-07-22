import type {
	GameVariantAdapter,
	BaseGameState,
	GamePosition,
	GamePiece,
} from './service';
import type { GameState, Position, Move, ChessPiece } from '../chess/types';
import { BOARD_SIZE } from '../chess/types';
import { getPossibleMoves, isMoveValid } from '../chess/moves';
import { isKingInCheck } from '../chess/game';
import { copyBoard, getRow, setPieceAt } from '../chess/board';
import { GAME_CONFIGS } from './game-variant-types';
import { positionToAlgebraic, algebraicToPosition } from './notation-utils';

export class ChessAdapter implements GameVariantAdapter<GameState> {
	gameVariant = 'chess' as const;
	private config = GAME_CONFIGS.chess;
	private debugMode: boolean;

	constructor(debugMode = false) {
		this.debugMode = debugMode;
	}

	convertGameState(gameState: GameState): BaseGameState {
		return {
			board: gameState.board,
			currentPlayer: gameState.currentPlayer,
			status: gameState.status,
			moveHistory: gameState.moveHistory,
			selectedSquare: gameState.selectedSquare,
			possibleMoves: gameState.possibleMoves,
		};
	}

	getAllValidMoves(gameState: GameState): string[] {
		const { board, currentPlayer } = gameState;
		const validMoves: string[] = [];

		for (let row = 0; row < 8; row++) {
			for (let col = 0; col < 8; col++) {
				const piece = getRow(board, row)[col];
				if (piece && piece.color === currentPlayer) {
					const fromPos = { row, col };
					const possibleMoves = getPossibleMoves(board, piece, fromPos);

					for (const toPos of possibleMoves) {
						const isValidMove = this.wouldMoveBeValid(
							gameState,
							fromPos,
							toPos
						);
						if (isValidMove) {
							const from = this.positionToAlgebraic(fromPos);
							const to = this.positionToAlgebraic(toPos);
							const pieceSymbol = this.getPieceSymbolForMove(piece);
							validMoves.push(`${from}-${to} (${pieceSymbol})`);
						}
					}
				}
			}
		}

		if (validMoves.length === 0) {
			return ['No valid moves available (checkmate or stalemate)'];
		}

		const groupedMoves = this.groupMovesByPiece(validMoves);

		return [groupedMoves];
	}

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
		const { board, currentPlayer } = gameState;
		let analysis = '';

		const myKing = this.findPiece(board, 'king', currentPlayer);
		const _enemyKing = this.findPiece(
			board,
			'king',
			currentPlayer === 'white' ? 'black' : 'white'
		);

		if (gameState.status === 'check') {
			analysis += `⚠️  Your king is in CHECK! Priority: Get out of check immediately.\n`;
		}

		const myMaterial = this.countMaterial(board, currentPlayer);
		const enemyMaterial = this.countMaterial(
			board,
			currentPlayer === 'white' ? 'black' : 'white'
		);

		analysis += `Material balance: You ${myMaterial}, Opponent ${enemyMaterial}\n`;

		if (myMaterial > enemyMaterial) {
			analysis += `You have material advantage - consider trading pieces\n`;
		} else if (myMaterial < enemyMaterial) {
			analysis += `You are behind in material - avoid trades, look for tactics\n`;
		}

		if (myKing) {
			const kingSafety = this.evaluateKingSafety(board, myKing, currentPlayer);
			analysis += `Your king safety: ${kingSafety}\n`;
		}

		// Check for hanging pieces (pieces that can be captured)
		const hangingPieces = this.findHangingPieces(board, currentPlayer);
		if (hangingPieces.length > 0) {
			analysis += `\n⚠️  CRITICAL THREATS:\n`;
			for (const threat of hangingPieces) {
				analysis += `  - Your ${threat.piece} on ${threat.square} can be captured! Defend or move it!\n`;
			}
		}

		// Find squares that are under attack by opponent
		const opponent = currentPlayer === 'white' ? 'black' : 'white';
		const dangerousSquares = this.findAttackedSquares(board, opponent);
		if (dangerousSquares.length > 0) {
			analysis += `\n🚨 DANGER ZONES (squares under attack by opponent):\n`;
			const squareList = dangerousSquares
				.slice(0, 20)
				.map(pos => this.positionToAlgebraic(pos))
				.join(', ');
			analysis += `  Attacked squares: ${squareList}\n`;
			analysis += `  ⚠️  DO NOT move valuable pieces to these squares - they will be captured!\n`;
		}

		return analysis;
	}

	positionToAlgebraic(position: GamePosition): string {
		return positionToAlgebraic('chess', position);
	}

	algebraicToPosition(algebraic: string): GamePosition {
		return algebraicToPosition('chess', algebraic);
	}

	getPieceSymbol(piece: GamePiece): string {
		const symbols = this.config.pieceSymbols;
		const colorSymbols = symbols[piece.color];
		if (!colorSymbols) return '?';
		return colorSymbols[piece.type] || '?';
	}

	private wouldMoveBeValid(
		gameState: GameState,
		from: Position,
		to: Position
	): boolean {
		const { board, currentPlayer } = gameState;
		const piece = board[from.row]?.[from.col];

		if (!piece || piece.color !== currentPlayer) {
			return false;
		}

		if (!isMoveValid(board, from, to, piece)) {
			return false;
		}

		const testBoard = copyBoard(board);
		setPieceAt(testBoard, from, null);
		setPieceAt(testBoard, to, piece);

		const wouldBeInCheck = isKingInCheck(testBoard, currentPlayer);
		if (wouldBeInCheck) {
			return false;
		}

		return true;
	}

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

	private findPiece(
		board: (ChessPiece | null)[][],
		type: string,
		color: string
	): { row: number; col: number } | null {
		for (let row = 0; row < BOARD_SIZE; row++) {
			for (let col = 0; col < BOARD_SIZE; col++) {
				const piece = getRow(board, row)[col];
				if (piece && piece.type === type && piece.color === color) {
					return { row, col };
				}
			}
		}
		return null;
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

	private evaluateKingSafety(
		board: (ChessPiece | null)[][],
		kingPos: { row: number; col: number },
		color: string
	): string {
		const { row, col } = kingPos;

		if (row >= 2 && row <= 5 && col >= 2 && col <= 5) {
			return 'UNSAFE - King exposed in center';
		}

		if (color === 'white' && row === 7 && (col === 2 || col === 6)) {
			return 'GOOD - King castled';
		}
		if (color === 'black' && row === 0 && (col === 2 || col === 6)) {
			return 'GOOD - King castled';
		}

		if ((color === 'white' && row === 7) || (color === 'black' && row === 0)) {
			return 'OK - King on back rank';
		}

		return 'CAUTION - King position needs attention';
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

	private groupMovesByPiece(moves: string[]): string {
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

	private findAttackedSquares(
		board: (ChessPiece | null)[][],
		attackerColor: string
	): Position[] {
		const attackedSquares = new Set<string>();

		// Find all squares that can be attacked by the given color
		for (let row = 0; row < BOARD_SIZE; row++) {
			for (let col = 0; col < BOARD_SIZE; col++) {
				const piece = getRow(board, row)[col];
				if (piece && piece.color === attackerColor) {
					const possibleMoves = getPossibleMoves(board, piece, {
						row,
						col,
					});
					for (const move of possibleMoves) {
						attackedSquares.add(`${move.row},${move.col}`);
					}
				}
			}
		}

		// Convert back to Position array
		return Array.from(attackedSquares)
			.map(key => key.split(',').map(Number))
			.filter(
				(parts): parts is [number, number] =>
					parts[0] !== undefined && parts[1] !== undefined
			)
			.map(([row, col]) => ({ row, col }));
	}
}
