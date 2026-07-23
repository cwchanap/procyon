import type {
	XiangqiGameState,
	XiangqiMove,
	XiangqiPiece,
} from '../xiangqi/types';
import {
	PALACE_ROWS,
	PALACE_COLS,
	XIANGQI_ROWS,
	XIANGQI_COLS,
} from '../xiangqi/types';
import { getPossibleMoves } from '../xiangqi/moves';
import { isKingInCheck } from '../xiangqi/game';
import { copyBoard, getRow, setPieceAt } from '../xiangqi/board';
import { BaseAdapter } from './base-adapter';
import type { GamePosition } from './service';

export class XiangqiAdapter extends BaseAdapter<XiangqiGameState> {
	gameVariant = 'xiangqi' as const;

	generatePrompt(gameState: XiangqiGameState): string {
		const currentPlayer = gameState.currentPlayer;
		const moveHistory = this.formatMoveHistory(gameState.moveHistory);
		const visualBoard = this.createVisualBoard(gameState);
		const threatAnalysis = this.analyzeThreatsSafety(gameState);
		const validMoves = this.getAllValidMoves(gameState)[0];
		const randomSeed = Math.floor(Math.random() * 1000);

		return `You are a xiangqi (Chinese chess) AI assistant playing as ${currentPlayer}. Analyze the current xiangqi position and provide your next move.

CURRENT BOARD POSITION:
${visualBoard}

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

XIANGQI STRATEGIC CONSIDERATIONS:
- Control the central files (d, e, f) - they are key to launching attacks
- Protect your palace at all costs - an exposed general is vulnerable to mating attacks
- Cannons are powerful when they have platforms - coordinate with other pieces
- Advance soldiers across the river to gain lateral movement and attack power
- Elephants and advisors defend the palace but cannot cross the river

XIANGQI TACTICAL AWARENESS:
- Look for cannon battery attacks (cannons supporting each other)
- Check for flying general attacks (generals facing each other on same file)
- Watch for horse leg blocks (pieces that prevent horse movement)
- Consider discovered attacks when moving platform pieces for cannons
- Evaluate soldier promotions after crossing the river

XIANGQI-SPECIFIC RULES:
- Generals and advisors must stay within the 9-point palace
- Elephants cannot cross the river and must stay on same side
- Cannons need exactly one piece to jump over when capturing
- Horses can be blocked by adjacent pieces ("hobbling the horse")
- Soldiers gain lateral movement after crossing the river

RANDOMIZATION SEED: ${randomSeed} (use this to vary your play style slightly)

IMPORTANT: You must respond in exactly this JSON format:
{
    "move": {
        "from": "e7",
        "to": "e6"
    },
    "reasoning": "Detailed explanation of your strategic thinking in xiangqi context",
    "confidence": 85
}

🚨 ABSOLUTE REQUIREMENT: You MUST choose ONLY from the valid moves listed above.
   - Use the xiangqi coordinate system (files a-i, ranks 1-10)
   - Look at the visual board to understand current piece positions
   - Use ONLY the algebraic notations provided in the valid moves list

Your move:`;
	}

	createVisualBoard(gameState: XiangqiGameState): string {
		const { board } = gameState;
		let visual = '    a  b  c  d  e  f  g  h  i\n';
		visual += '  ┌─────────────────────────────┐\n';

		for (let rank = 0; rank < 10; rank++) {
			const rankNumber = 10 - rank;
			visual += `${rankNumber.toString().padStart(2)} │ `;
			for (let file = 0; file < 9; file++) {
				const piece = getRow(board, rank)[file];
				if (piece) {
					const symbol = this.getPieceSymbol(piece);
					visual += `${symbol} `;
				} else {
					// Show river and palace boundaries
					if (rank === 4 || rank === 5) {
						visual += '~ '; // River
					} else if ((rank <= 2 || rank >= 7) && file >= 3 && file <= 5) {
						visual += '+ '; // Palace
					} else {
						visual += '. ';
					}
				}
			}
			visual += `│ ${rankNumber.toString().padStart(2)}\n`;
		}

		visual += '  └─────────────────────────────┘\n';
		visual += '    a  b  c  d  e  f  g  h  i\n';
		visual += '\n';
		visual +=
			'Legend: ~ = River, + = Palace, 帅/将 = General, 仕/士 = Advisor\n';
		visual +=
			'        相/象 = Elephant, 马 = Horse, 车 = Chariot, 炮 = Cannon, 兵/卒 = Soldier\n';

		return visual;
	}

	analyzeThreatsSafety(gameState: XiangqiGameState): string {
		const { board, currentPlayer } = gameState;
		let analysis = '';

		const myGeneral = this.findPiece(board, 'king', currentPlayer);
		const enemyGeneral = this.findPiece(
			board,
			'king',
			currentPlayer === 'red' ? 'black' : 'red'
		);

		if (gameState.status === 'check') {
			analysis += `⚠️  Your general is in CHECK! Priority: Get out of check immediately.\n`;
		}

		// Check for flying general situation
		if (myGeneral && enemyGeneral && myGeneral.col === enemyGeneral.col) {
			const between = this.countPiecesBetween(board, myGeneral, enemyGeneral);
			if (between === 0) {
				analysis += `🚨 FLYING GENERAL: Both generals on same file with no pieces between!\n`;
			} else if (between === 1) {
				analysis += `⚠️  One piece between generals - watch for discovered attacks!\n`;
			}
		}

		const myMaterial = this.countMaterial(board, currentPlayer);
		const enemyMaterial = this.countMaterial(
			board,
			currentPlayer === 'red' ? 'black' : 'red'
		);

		analysis += `Material balance: You ${myMaterial}, Opponent ${enemyMaterial}\n`;

		if (myMaterial > enemyMaterial) {
			analysis += `You have material advantage - consider trading pieces\n`;
		} else if (myMaterial < enemyMaterial) {
			analysis += `You are behind in material - avoid trades, look for tactics\n`;
		}

		if (myGeneral) {
			const generalSafety = this.evaluateGeneralSafety(
				board,
				myGeneral,
				currentPlayer
			);
			analysis += `Your general safety: ${generalSafety}\n`;
		}

		// Check for cannon batteries and other tactical themes
		const cannonThreats = this.analyzeCannons(board, currentPlayer);
		if (cannonThreats) {
			analysis += cannonThreats;
		}

		return analysis;
	}

	// ---------------------------------------------------------------------
	// BaseAdapter hook overrides
	// ---------------------------------------------------------------------

	protected override forEachOwnPieceMove(
		gameState: XiangqiGameState,
		cb: (piece: XiangqiPiece, from: GamePosition, to: GamePosition) => void
	): void {
		const { board, currentPlayer } = gameState;
		for (let row = 0; row < XIANGQI_ROWS; row++) {
			for (let col = 0; col < XIANGQI_COLS; col++) {
				const piece = getRow(board, row)[col];
				if (piece && piece.color === currentPlayer) {
					const from = { row, col };
					for (const to of getPossibleMoves(board, from)) {
						cb(piece, from, to);
					}
				}
			}
		}
	}

	protected override simulateMove(
		board: (XiangqiPiece | null)[][],
		from: GamePosition,
		to: GamePosition,
		piece: XiangqiPiece
	): (XiangqiPiece | null)[][] {
		const testBoard = copyBoard(board);
		setPieceAt(testBoard, from, null);
		setPieceAt(testBoard, to, piece);
		return testBoard;
	}

	protected override isOwnKingInCheck(
		board: (XiangqiPiece | null)[][],
		color: string
	): boolean {
		return isKingInCheck(board, color as XiangqiPiece['color']);
	}

	private formatMoveHistory(moves: XiangqiMove[]): string {
		if (moves.length === 0) return 'Game start';

		const recentMoves = moves.slice(-10);
		return recentMoves
			.map((move, index) => {
				const moveNum =
					Math.floor((moves.length - recentMoves.length + index) / 2) + 1;
				const isRed = (moves.length - recentMoves.length + index) % 2 === 0;
				const from = this.positionToAlgebraic(move.from);
				const to = this.positionToAlgebraic(move.to);
				const symbol = this.getPieceSymbol(move.piece);

				if (isRed) {
					return `${moveNum}. ${symbol}${from}-${to}`;
				} else {
					return `${symbol}${from}-${to}`;
				}
			})
			.join(' ');
	}

	private countMaterial(
		board: (XiangqiPiece | null)[][],
		color: string
	): number {
		const values = {
			king: 0, // General
			advisor: 2,
			elephant: 2,
			horse: 4,
			chariot: 9,
			cannon: 4.5,
			soldier: 1,
		};
		let total = 0;

		for (let row = 0; row < XIANGQI_ROWS; row++) {
			for (let col = 0; col < XIANGQI_COLS; col++) {
				const piece = getRow(board, row)[col];
				if (piece && piece.color === color) {
					total += values[piece.type as keyof typeof values] || 0;
					// Bonus for crossed river soldiers
					if (piece.type === 'soldier' && piece.hasCrossedRiver) {
						total += 0.5;
					}
				}
			}
		}

		return total;
	}

	private evaluateGeneralSafety(
		board: (XiangqiPiece | null)[][],
		generalPos: { row: number; col: number },
		color: string
	): string {
		const { row, col } = generalPos;

		// Check if general is in proper palace
		const palaceRows = color === 'red' ? PALACE_ROWS.RED : PALACE_ROWS.BLACK;
		const inPalace = palaceRows.includes(row) && PALACE_COLS.includes(col);

		if (!inPalace) {
			return 'CRITICAL - General outside palace!';
		}

		// Check if general is well-protected
		const isCorner =
			(row === palaceRows[0] || row === palaceRows[2]) &&
			(col === PALACE_COLS[0] || col === PALACE_COLS[2]);

		if (isCorner) {
			return 'GOOD - General in palace corner';
		}

		const isCenter = row === palaceRows[1] && col === PALACE_COLS[1];
		if (isCenter) {
			return 'CAUTION - General exposed in palace center';
		}

		return 'OK - General in palace but could be safer';
	}

	private countPiecesBetween(
		board: (XiangqiPiece | null)[][],
		pos1: { row: number; col: number },
		pos2: { row: number; col: number }
	): number {
		if (pos1.col !== pos2.col && pos1.row !== pos2.row) {
			return -1; // Not on same line
		}

		let count = 0;
		if (pos1.col === pos2.col) {
			// Same column
			const minRow = Math.min(pos1.row, pos2.row);
			const maxRow = Math.max(pos1.row, pos2.row);
			for (let row = minRow + 1; row < maxRow; row++) {
				if (getRow(board, row)[pos1.col]) count++;
			}
		} else {
			// Same row
			const minCol = Math.min(pos1.col, pos2.col);
			const maxCol = Math.max(pos1.col, pos2.col);
			for (let col = minCol + 1; col < maxCol; col++) {
				if (getRow(board, pos1.row)[col]) count++;
			}
		}

		return count;
	}

	private analyzeCannons(
		board: (XiangqiPiece | null)[][],
		color: string
	): string {
		let analysis = '';
		const cannons = [];

		// Find all cannons of current player
		for (let row = 0; row < XIANGQI_ROWS; row++) {
			for (let col = 0; col < XIANGQI_COLS; col++) {
				const piece = getRow(board, row)[col];
				if (piece && piece.type === 'cannon' && piece.color === color) {
					cannons.push({ row, col });
				}
			}
		}

		if (cannons.length >= 2) {
			analysis += `Cannon battery available - coordinate your cannons for powerful attacks\n`;
		}

		return analysis;
	}
}
