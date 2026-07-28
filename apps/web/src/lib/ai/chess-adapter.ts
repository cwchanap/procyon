import { getRow } from '../chess/board';
import { getLegalMoves, queryAttacks } from '../chess/rules';
import { BOARD_SIZE } from '../chess/types';
import type {
	ChessMoveRequest,
	ChessPiece,
	ChessSquare,
	GameState,
	Move,
	PieceColor,
	Position,
} from '../chess/types';
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
		const responseExample = JSON.stringify(
			{
				move: exampleMove,
				reasoning: 'Brief tactical/strategic reason',
				confidence: 85,
			},
			null,
			2
		);

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
${responseExample}

Rules:
- ONLY use moves from the valid moves list above
- "from" must have your piece on it (check board!)
- Parse "a2-a4" as {"from": "a2", "to": "a4"}
- For promotions, promotion is required when the move ends on rank 8 or rank 1
- omit promotion for every other move`;
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
	override getAllValidMoves(gameState: GameState): string[] {
		const suffix = {
			queen: 'Q',
			rook: 'R',
			bishop: 'B',
			knight: 'N',
		} as const;
		const rawMoves = getLegalMoves(gameState).map(move => {
			const from = this.positionToAlgebraic(move.from);
			const to = this.positionToAlgebraic(move.to);
			const promotion = move.promotion ? `=${suffix[move.promotion]}` : '';
			return `${from}-${to}${promotion} (${this.getPieceSymbolForMove(move.piece)})`;
		});
		return this.finalizeMoves(rawMoves);
	}

	protected override forEachOwnPieceMove(
		gameState: GameState,
		cb: (piece: ChessPiece, from: GamePosition, to: GamePosition) => void
	): void {
		for (const move of getLegalMoves(gameState)) {
			cb(move.piece, move.from, move.to);
		}
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
		const hangingPieces = this.findHangingPieces(gameState);
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
		// Build the dual-color "white/black" glyph pair from the shared
		// GAME_CONFIGS symbol table (via BaseAdapter#getPieceSymbol) rather
		// than maintaining a parallel inline mapping that could drift if
		// piece types are added.
		const white = this.getPieceSymbol({ ...piece, color: 'white' });
		const black = this.getPieceSymbol({ ...piece, color: 'black' });
		if (white === '?' || black === '?') return piece.type;
		return `${white}/${black}`;
	}

	private getExampleMoveFromValidMoves(
		validMovesText: string
	): ChessMoveRequest {
		const match = validMovesText.match(
			/([a-h][1-8])-([a-h][1-8])(?:=([QRBN]))?/
		);
		if (!match) return { from: 'e2', to: 'e4' };

		const [, from, to, suffix] = match;
		if (!from || !to) return { from: 'e2', to: 'e4' };
		const promotionBySuffix = {
			Q: 'queen',
			R: 'rook',
			B: 'bishop',
			N: 'knight',
		} as const;
		const promotion = suffix
			? promotionBySuffix[suffix as keyof typeof promotionBySuffix]
			: undefined;
		return {
			from: from as ChessSquare,
			to: to as ChessSquare,
			...(promotion ? { promotion } : {}),
		};
	}

	private findHangingPieces(
		gameState: GameState
	): Array<{ piece: string; square: string }> {
		const color = gameState.currentPlayer;
		const opponent: PieceColor = color === 'white' ? 'black' : 'white';
		const pieces: Array<{ piece: ChessPiece; position: Position }> = [];

		for (let row = 0; row < BOARD_SIZE; row++) {
			for (let col = 0; col < BOARD_SIZE; col++) {
				const piece = gameState.board[row]?.[col];
				if (piece && piece.color === color) {
					pieces.push({ piece, position: { row, col } });
				}
			}
		}

		const results = queryAttacks(gameState, [
			...pieces.map(({ position }) => ({
				square: position,
				attacker: opponent,
			})),
			...pieces.map(({ position }) => ({
				square: position,
				attacker: color,
			})),
		]);
		const count = pieces.length;

		return pieces.flatMap(({ piece, position }, index) => {
			const attacked = results[index]?.attacked ?? false;
			const defended = results[index + count]?.attacked ?? false;
			if (!attacked || defended) return [];
			return [
				{
					piece: piece.type,
					square: this.positionToAlgebraic(position),
				},
			];
		});
	}
}
