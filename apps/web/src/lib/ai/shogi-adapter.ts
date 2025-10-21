/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable no-console */
import type {
	GameVariantAdapter,
	BaseGameState,
	GamePosition,
	GamePiece,
} from './service';
import type {
	ShogiGameState,
	ShogiPosition,
	ShogiPiece,
	ShogiMove,
} from '../shogi';
import {
	SHOGI_FILES,
	SHOGI_RANKS,
	PIECE_UNICODE,
	SHOGI_BOARD_SIZE,
} from '../shogi';
import { GAME_CONFIGS } from './game-variant-types';

export class ShogiAdapter implements GameVariantAdapter {
	gameVariant = 'shogi' as const;
	private config = GAME_CONFIGS.shogi;
	private debugMode: boolean;

	constructor(debugMode = false) {
		this.debugMode = debugMode;
	}

	convertGameState(gameState: ShogiGameState): BaseGameState {
		return {
			board: gameState.board,
			currentPlayer: gameState.currentPlayer,
			status: gameState.status,
			moveHistory: gameState.moveHistory,
			selectedSquare: gameState.selectedSquare,
			possibleMoves: gameState.possibleMoves,
			senteHand: gameState.senteHand,
			goteHand: gameState.goteHand,
			selectedHandPiece: gameState.selectedHandPiece,
		};
	}

	getAllValidMoves(gameState: ShogiGameState): string[] {
		const { board, currentPlayer, senteHand, goteHand } = gameState;
		const validMoves: string[] = [];
		const handPieces = currentPlayer === 'sente' ? senteHand : goteHand;

		if (this.debugMode) {
			console.log(`🔍 Generating valid moves for ${currentPlayer}:`);
		}

		// Board moves
		for (let row = 0; row < SHOGI_BOARD_SIZE; row++) {
			for (let col = 0; col < SHOGI_BOARD_SIZE; col++) {
				const piece = board[row][col];
				if (piece && piece.color === currentPlayer) {
					const fromPos = { row, col };
					const algebraicFrom = this.positionToAlgebraic(fromPos);

					if (this.debugMode) {
						console.log(`  Found ${piece.type} at ${algebraicFrom}`);
					}

					const possibleMoves = this.getPossibleMovesForPiece(
						piece,
						fromPos,
						board
					);

					if (this.debugMode && possibleMoves.length > 0) {
						console.log(
							`    Possible moves for ${piece.type} at ${algebraicFrom}:`,
							possibleMoves.map(pos => this.positionToAlgebraic(pos)).join(', ')
						);
					}

					for (const toPos of possibleMoves) {
						// Validate move doesn't leave king in check
						const isValidMove = this.wouldMoveBeValid(
							gameState,
							fromPos,
							toPos
						);
						if (isValidMove) {
							const from = this.positionToAlgebraic(fromPos);
							const to = this.positionToAlgebraic(toPos);
							const pieceSymbol = this.getPieceSymbol(piece);

							// Check for promotion possibility
							const canPromote = this.canPiecePromote(piece, fromPos, toPos);
							if (canPromote) {
								validMoves.push(`${from}-${to}+ (${pieceSymbol})`); // Promoted move
								// Also allow non-promoted move if legal
								if (!this.mustPromote(piece, toPos)) {
									validMoves.push(`${from}-${to} (${pieceSymbol})`);
								}
							} else {
								validMoves.push(`${from}-${to} (${pieceSymbol})`);
							}
						}
					}
				}
			}
		}

		// Drop moves
		for (const handPiece of handPieces) {
			const pieceSymbol = this.getPieceSymbol(handPiece);
			for (let row = 0; row < SHOGI_BOARD_SIZE; row++) {
				for (let col = 0; col < SHOGI_BOARD_SIZE; col++) {
					if (
						!board[row][col] &&
						this.canDropPiece(handPiece, { row, col }, board)
					) {
						const to = this.positionToAlgebraic({ row, col });
						validMoves.push(`*${to} (${pieceSymbol} drop)`);
					}
				}
			}
		}

		if (this.debugMode) {
			console.log(`📋 Total valid moves found: ${validMoves.length}`);
			if (validMoves.length > 0) {
				console.log(`📝 Valid moves:`, validMoves);
			}
		}

		if (validMoves.length === 0) {
			return ['No valid moves available (checkmate or stalemate)'];
		}

		const groupedMoves = this.groupMovesByPiece(validMoves);

		if (this.debugMode) {
			console.log(`📋 Grouped moves sent to AI:\n${groupedMoves}`);
		}

		return [groupedMoves];
	}

	generatePrompt(gameState: ShogiGameState): string {
		const currentPlayer = gameState.currentPlayer;
		const moveHistory = this.formatMoveHistory(gameState.moveHistory);
		const visualBoard = this.createVisualBoard(gameState);
		const threatAnalysis = this.analyzeThreatsSafety(gameState);
		const validMoves = this.getAllValidMoves(gameState)[0];
		const handInfo = this.formatHandPieces(gameState);
		const randomSeed = Math.floor(Math.random() * 1000);

		return `You are a shogi AI assistant playing as ${currentPlayer}. Analyze the current shogi position and provide your next move.

CURRENT BOARD POSITION:
${visualBoard}

PIECES IN HAND:
${handInfo}

Current player to move: ${currentPlayer}
Game status: ${gameState.status}
Move number: ${Math.floor(gameState.moveHistory.length / 2) + 1}

RECENT MOVES (last 5):
${moveHistory}

⚠️  CRITICAL - VALID MOVES AVAILABLE (ONLY CHOOSE FROM THESE):
${validMoves}

❌ DO NOT suggest moves for pieces that don't exist on those squares!
❌ Check the board position above to see where pieces actually are!

POSITION ANALYSIS:
${threatAnalysis}

SHOGI STRATEGIC CONSIDERATIONS:
- Promotion is key - advance your pieces to gain strength in the enemy camp (last 3 rows)
- The drop rule makes shogi unique - captured pieces join your army as hand pieces
- Protect your king while building attacking formations with gold and silver generals
- Lance and knight are powerful but can get trapped - support them well
- Control the center files and establish forward positions

SHOGI TACTICAL AWARENESS:
- Look for fork attacks with promoted pieces (dragons and horses are very powerful)
- Check for back-rank mates and edge attacks
- Consider piece sacrifices for tempo and hand piece advantage
- Watch for promotion opportunities in the enemy camp
- Evaluate drop moves carefully - they can create immediate threats

SHOGI-SPECIFIC RULES:
- Pieces promote when entering, moving within, or leaving the promotion zone (last 3 rows)
- Some pieces MUST promote if they would have no legal moves (pawns and lances at the far edge)
- You cannot drop pieces to give immediate checkmate (except if it's not mate in one)
- You cannot drop a pawn on a file where you already have an unpromoted pawn
- Promoted pieces revert to their basic form when captured and dropped

COORDINATE SYSTEM:
- Files are numbered 9-1 from left to right (from your perspective as sente)
- Ranks are lettered a-i from top to bottom
- Use format like "7g" for moves, "*5e" for drops
- "+" after a move indicates promotion (e.g., "7g-7f+")

RANDOMIZATION SEED: ${randomSeed} (use this to vary your play style slightly)

IMPORTANT: You must respond in exactly this JSON format:
{
    "move": {
        "from": "7g",
        "to": "7f"
    },
    "reasoning": "Detailed explanation of your strategic thinking in shogi context",
    "confidence": 85
}

For drop moves, use:
{
    "move": {
        "from": "*",
        "to": "5e"
    },
    "reasoning": "Explanation of why you're dropping this piece",
    "confidence": 85
}

🚨 ABSOLUTE REQUIREMENT: You MUST choose ONLY from the valid moves listed above.
   - Use the shogi coordinate system (files 9-1, ranks a-i)
   - For drops, use "*" as the from position
   - Look at the visual board to understand current piece positions
   - Use ONLY the algebraic notations provided in the valid moves list

Your move:`;
	}

	createVisualBoard(gameState: ShogiGameState): string {
		const { board } = gameState;
		let visual = '    9  8  7  6  5  4  3  2  1\n';
		visual += '  ┌─────────────────────────────┐\n';

		for (let rank = 0; rank < SHOGI_BOARD_SIZE; rank++) {
			const rankLetter = SHOGI_RANKS[rank];
			visual += `${rankLetter} │ `;
			for (let file = 0; file < SHOGI_BOARD_SIZE; file++) {
				const piece = board[rank][file];
				if (piece) {
					const symbol = this.getPieceSymbol(piece);
					const rotated = piece.color === 'gote' ? `v${symbol}` : ` ${symbol}`;
					visual += rotated;
				} else {
					visual += ' . ';
				}
			}
			visual += `│ ${rankLetter}\n`;
		}

		visual += '  └─────────────────────────────┘\n';
		visual += '    9  8  7  6  5  4  3  2  1\n';
		visual += '\n';
		visual += 'Legend: v = Gote pieces (rotated), plain = Sente pieces\n';
		visual += '        Promotion zone: Sente (ranks a-c), Gote (ranks g-i)\n';

		return visual;
	}

	analyzeThreatsSafety(gameState: ShogiGameState): string {
		const { board, currentPlayer } = gameState;
		let analysis = '';

		const myKing = this.findPiece(board, 'king', currentPlayer);
		const _enemyKing = this.findPiece(
			board,
			'king',
			currentPlayer === 'sente' ? 'gote' : 'sente'
		);

		if (gameState.status === 'check') {
			analysis += `⚠️  Your king is in CHECK! Priority: Get out of check immediately.\n`;
		}

		const myMaterial = this.countMaterial(gameState, currentPlayer);
		const enemyMaterial = this.countMaterial(
			gameState,
			currentPlayer === 'sente' ? 'gote' : 'sente'
		);

		analysis += `Material balance: You ${myMaterial}, Opponent ${enemyMaterial}\n`;

		// Hand piece analysis
		const handPieces =
			currentPlayer === 'sente' ? gameState.senteHand : gameState.goteHand;
		const enemyHandPieces =
			currentPlayer === 'sente' ? gameState.goteHand : gameState.senteHand;

		analysis += `Hand pieces: You ${handPieces.length}, Opponent ${enemyHandPieces.length}\n`;

		if (handPieces.length > enemyHandPieces.length) {
			analysis += `You have more pieces in hand - look for drop opportunities\n`;
		}

		if (myKing) {
			const kingSafety = this.evaluateKingSafety(board, myKing, currentPlayer);
			analysis += `Your king safety: ${kingSafety}\n`;
		}

		// Promotion opportunities
		const promotionAnalysis = this.analyzePromotionOpportunities(gameState);
		if (promotionAnalysis) {
			analysis += promotionAnalysis;
		}

		return analysis;
	}

	positionToAlgebraic(position: GamePosition): string {
		return SHOGI_FILES[position.col] + SHOGI_RANKS[position.row];
	}

	algebraicToPosition(algebraic: string): GamePosition {
		const file = algebraic[0];
		const rank = algebraic[1];

		return {
			col: SHOGI_FILES.indexOf(file),
			row: SHOGI_RANKS.indexOf(rank),
		};
	}

	getPieceSymbol(piece: GamePiece): string {
		const unicode = PIECE_UNICODE as any;
		return unicode[piece.type]?.[piece.color] || '?';
	}

	private formatHandPieces(gameState: ShogiGameState): string {
		const senteHand = gameState.senteHand
			.map(p => this.getPieceSymbol(p))
			.join(' ');
		const goteHand = gameState.goteHand
			.map(p => this.getPieceSymbol(p))
			.join(' ');

		return (
			`Sente (${gameState.currentPlayer === 'sente' ? 'YOU' : 'opponent'}): ${senteHand || 'none'}\n` +
			`Gote (${gameState.currentPlayer === 'gote' ? 'YOU' : 'opponent'}): ${goteHand || 'none'}`
		);
	}

	private getPossibleMovesForPiece(
		piece: ShogiPiece,
		position: ShogiPosition,
		board: (ShogiPiece | null)[][]
	): ShogiPosition[] {
		const moves: ShogiPosition[] = [];
		const { row, col } = position;
		const direction = piece.color === 'sente' ? -1 : 1;

		const addMoveIfValid = (targetRow: number, targetCol: number) => {
			if (
				targetRow >= 0 &&
				targetRow < SHOGI_BOARD_SIZE &&
				targetCol >= 0 &&
				targetCol < SHOGI_BOARD_SIZE
			) {
				const targetPiece = board[targetRow][targetCol];
				if (!targetPiece || targetPiece.color !== piece.color) {
					moves.push({ row: targetRow, col: targetCol });
				}
			}
		};

		const addSlidingMoves = (rowDelta: number, colDelta: number) => {
			for (let i = 1; i < SHOGI_BOARD_SIZE; i++) {
				const targetRow = row + i * rowDelta;
				const targetCol = col + i * colDelta;
				if (
					targetRow < 0 ||
					targetRow >= SHOGI_BOARD_SIZE ||
					targetCol < 0 ||
					targetCol >= SHOGI_BOARD_SIZE
				) {
					break;
				}
				const targetPiece = board[targetRow][targetCol];
				if (!targetPiece) {
					moves.push({ row: targetRow, col: targetCol });
				} else {
					if (targetPiece.color !== piece.color) {
						moves.push({ row: targetRow, col: targetCol });
					}
					break;
				}
			}
		};

		switch (piece.type) {
			case 'pawn':
				addMoveIfValid(row + direction, col);
				break;

			case 'lance':
				addSlidingMoves(direction, 0);
				break;

			case 'knight':
				addMoveIfValid(row + 2 * direction, col - 1);
				addMoveIfValid(row + 2 * direction, col + 1);
				break;

			case 'silver':
				addMoveIfValid(row + direction, col - 1);
				addMoveIfValid(row + direction, col);
				addMoveIfValid(row + direction, col + 1);
				addMoveIfValid(row - direction, col - 1);
				addMoveIfValid(row - direction, col + 1);
				break;

			case 'gold':
			case 'promoted_pawn':
			case 'promoted_lance':
			case 'promoted_knight':
			case 'promoted_silver':
				// Gold general movement
				addMoveIfValid(row + direction, col - 1);
				addMoveIfValid(row + direction, col);
				addMoveIfValid(row + direction, col + 1);
				addMoveIfValid(row, col - 1);
				addMoveIfValid(row, col + 1);
				addMoveIfValid(row - direction, col);
				break;

			case 'bishop':
				addSlidingMoves(1, 1);
				addSlidingMoves(1, -1);
				addSlidingMoves(-1, 1);
				addSlidingMoves(-1, -1);
				break;

			case 'rook':
				addSlidingMoves(1, 0);
				addSlidingMoves(-1, 0);
				addSlidingMoves(0, 1);
				addSlidingMoves(0, -1);
				break;

			case 'horse': // Promoted bishop
				// Bishop moves
				addSlidingMoves(1, 1);
				addSlidingMoves(1, -1);
				addSlidingMoves(-1, 1);
				addSlidingMoves(-1, -1);
				// King moves
				addMoveIfValid(row + 1, col);
				addMoveIfValid(row - 1, col);
				addMoveIfValid(row, col + 1);
				addMoveIfValid(row, col - 1);
				break;

			case 'dragon': // Promoted rook
				// Rook moves
				addSlidingMoves(1, 0);
				addSlidingMoves(-1, 0);
				addSlidingMoves(0, 1);
				addSlidingMoves(0, -1);
				// King moves
				addMoveIfValid(row + 1, col + 1);
				addMoveIfValid(row + 1, col - 1);
				addMoveIfValid(row - 1, col + 1);
				addMoveIfValid(row - 1, col - 1);
				break;

			case 'king':
				// King moves in all 8 directions
				for (let dr = -1; dr <= 1; dr++) {
					for (let dc = -1; dc <= 1; dc++) {
						if (dr !== 0 || dc !== 0) {
							addMoveIfValid(row + dr, col + dc);
						}
					}
				}
				break;
		}

		return moves;
	}

	private canPiecePromote(
		piece: ShogiPiece,
		from: ShogiPosition,
		to: ShogiPosition
	): boolean {
		if (piece.isPromoted) return false;

		const promotableTypes = [
			'pawn',
			'lance',
			'knight',
			'silver',
			'bishop',
			'rook',
		];
		if (!promotableTypes.includes(piece.type)) return false;

		const promotionZone = piece.color === 'sente' ? [0, 1, 2] : [6, 7, 8];
		return promotionZone.includes(from.row) || promotionZone.includes(to.row);
	}

	private mustPromote(piece: ShogiPiece, to: ShogiPosition): boolean {
		if (piece.color === 'sente') {
			return (
				(piece.type === 'pawn' && to.row === 0) ||
				(piece.type === 'lance' && to.row === 0) ||
				(piece.type === 'knight' && to.row <= 1)
			);
		} else {
			return (
				(piece.type === 'pawn' && to.row === 8) ||
				(piece.type === 'lance' && to.row === 8) ||
				(piece.type === 'knight' && to.row >= 7)
			);
		}
	}

	private canDropPiece(
		piece: ShogiPiece,
		position: ShogiPosition,
		board: (ShogiPiece | null)[][]
	): boolean {
		// Basic drop rules - no immediate checkmate with pawn drops, no double pawns, etc.
		if (piece.type === 'pawn') {
			// Check for existing pawn on same file
			for (let row = 0; row < SHOGI_BOARD_SIZE; row++) {
				const existingPiece = board[row][position.col];
				if (
					existingPiece &&
					existingPiece.type === 'pawn' &&
					existingPiece.color === piece.color &&
					!existingPiece.isPromoted
				) {
					return false;
				}
			}
		}
		return true;
	}

	private formatMoveHistory(moves: ShogiMove[]): string {
		if (moves.length === 0) return 'Game start';

		const recentMoves = moves.slice(-10);
		return recentMoves
			.map((move, index) => {
				const moveNum =
					Math.floor((moves.length - recentMoves.length + index) / 2) + 1;
				const isSente = (moves.length - recentMoves.length + index) % 2 === 0;

				let moveStr = '';
				if (move.isDrop) {
					const to = this.positionToAlgebraic(move.to);
					const symbol = this.getPieceSymbol(move.piece);
					moveStr = `${symbol}*${to}`;
				} else if (move.from) {
					const from = this.positionToAlgebraic(move.from);
					const to = this.positionToAlgebraic(move.to);
					const symbol = this.getPieceSymbol(move.piece);
					moveStr = `${symbol}${from}-${to}${move.isPromotion ? '+' : ''}`;
				}

				if (isSente) {
					return `${moveNum}. ${moveStr}`;
				} else {
					return moveStr;
				}
			})
			.join(' ');
	}

	private findPiece(
		board: any[][],
		type: string,
		color: string
	): { row: number; col: number } | null {
		for (let row = 0; row < SHOGI_BOARD_SIZE; row++) {
			for (let col = 0; col < SHOGI_BOARD_SIZE; col++) {
				const piece = board[row][col];
				if (piece && piece.type === type && piece.color === color) {
					return { row, col };
				}
			}
		}
		return null;
	}

	private countMaterial(gameState: ShogiGameState, color: string): number {
		const values = {
			king: 0,
			rook: 10,
			dragon: 15,
			bishop: 8,
			horse: 12,
			gold: 6,
			silver: 5,
			promoted_silver: 6,
			knight: 4,
			promoted_knight: 6,
			lance: 3,
			promoted_lance: 6,
			pawn: 1,
			promoted_pawn: 6,
		};

		let total = 0;

		// Count pieces on board
		for (let row = 0; row < SHOGI_BOARD_SIZE; row++) {
			for (let col = 0; col < SHOGI_BOARD_SIZE; col++) {
				const piece = gameState.board[row][col];
				if (piece && piece.color === color) {
					total += values[piece.type as keyof typeof values] || 0;
				}
			}
		}

		// Count pieces in hand
		const handPieces =
			color === 'sente' ? gameState.senteHand : gameState.goteHand;
		for (const piece of handPieces) {
			// Hand pieces are worth slightly less since they need to be dropped
			total += (values[piece.type as keyof typeof values] || 0) * 0.8;
		}

		return total;
	}

	private evaluateKingSafety(
		board: any[][],
		kingPos: { row: number; col: number },
		color: string
	): string {
		const { row, col } = kingPos;

		// Check if king is near the edge (generally safer in shogi)
		const nearEdge = row === 8 || col === 0 || col === 8;
		if (nearEdge) {
			return 'GOOD - King near edge';
		}

		// Check if king is in center (dangerous)
		if (row >= 3 && row <= 5 && col >= 3 && col <= 5) {
			return 'UNSAFE - King exposed in center';
		}

		// Check for typical king safety patterns
		if (color === 'sente' && row >= 6) {
			return 'OK - King in back rank area';
		} else if (color === 'gote' && row <= 2) {
			return 'OK - King in back rank area';
		}

		return 'CAUTION - King position needs attention';
	}

	private analyzePromotionOpportunities(gameState: ShogiGameState): string {
		let analysis = '';
		const { board, currentPlayer } = gameState;
		const promotionZone = currentPlayer === 'sente' ? [0, 1, 2] : [6, 7, 8];

		let piecesInZone = 0;
		for (let row = 0; row < SHOGI_BOARD_SIZE; row++) {
			for (let col = 0; col < SHOGI_BOARD_SIZE; col++) {
				const piece = board[row][col];
				if (
					piece &&
					piece.color === currentPlayer &&
					promotionZone.includes(row)
				) {
					if (
						!piece.isPromoted &&
						piece.type !== 'king' &&
						piece.type !== 'gold'
					) {
						piecesInZone++;
					}
				}
			}
		}

		if (piecesInZone > 0) {
			analysis += `${piecesInZone} pieces in promotion zone - look for promotion opportunities\n`;
		}

		return analysis;
	}

	private groupMovesByPiece(moves: string[]): string {
		const groups: { [key: string]: string[] } = {};

		for (const move of moves) {
			let pieceType = 'Unknown';

			if (move.includes('drop')) {
				const pieceMatch = move.match(/\(([^)]+) drop\)/);
				pieceType = pieceMatch ? `${pieceMatch[1]} (drop)` : 'Drop';
			} else {
				const pieceMatch = move.match(/\(([^)]+)\)/);
				pieceType = pieceMatch ? pieceMatch[1] : 'Unknown';
			}

			if (!groups[pieceType]) {
				groups[pieceType] = [];
			}
			groups[pieceType].push(move.replace(/\s*\([^)]+\)/, ''));
		}

		let result = '';
		for (const [pieceType, movesArray] of Object.entries(groups)) {
			result += `${pieceType}: ${movesArray.join(', ')}\n`;
		}

		return result.trim();
	}

	private wouldMoveBeValid(
		gameState: ShogiGameState,
		from: GamePosition,
		to: GamePosition
	): boolean {
		const { board, currentPlayer } = gameState;
		const piece = board[from.row]?.[from.col];

		if (!piece || piece.color !== currentPlayer) {
			if (this.debugMode) {
				console.log(
					`    ❌ Invalid: No ${currentPlayer} piece at ${this.positionToAlgebraic(from)}`
				);
			}
			return false;
		}

		// Create test board to check if move leaves king in check
		const testBoard = board.map(row => [...row]);
		testBoard[from.row][from.col] = null;
		testBoard[to.row][to.col] = piece;

		const wouldBeInCheck = this.isKingInCheck(testBoard, currentPlayer);
		if (wouldBeInCheck) {
			if (this.debugMode) {
				console.log(
					`    ❌ Invalid: Move ${this.positionToAlgebraic(from)}-${this.positionToAlgebraic(to)} leaves king in check`
				);
			}
			return false;
		}

		if (this.debugMode) {
			console.log(
				`    ✅ Valid: ${this.positionToAlgebraic(from)}-${this.positionToAlgebraic(to)}`
			);
		}
		return true;
	}

	private isKingInCheck(
		board: (ShogiPiece | null)[][],
		kingColor: ShogiPieceColor
	): boolean {
		const kingPosition = this.findPiece(board, 'king', kingColor);
		if (!kingPosition) return false;

		const opponentColor = kingColor === 'sente' ? 'gote' : 'sente';

		// Check if any opponent piece can attack the king
		for (let row = 0; row < SHOGI_BOARD_SIZE; row++) {
			for (let col = 0; col < SHOGI_BOARD_SIZE; col++) {
				const piece = board[row][col];
				if (piece && piece.color === opponentColor) {
					const from = { row, col };
					const possibleMoves = this.getPossibleMovesForPiece(
						piece,
						from,
						board
					);
					if (
						possibleMoves.some(
							move =>
								move.row === kingPosition.row && move.col === kingPosition.col
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
