import type { AIResponse } from './types';
import type { GameVariantAdapter } from './universal-service';
import type {
	JungleGameState,
	JunglePosition,
	JunglePiece,
	JunglePieceType,
} from '../jungle/types';
import { getPossibleMoves } from '../jungle/moves';
import { getPieceAt } from '../jungle/board';

export class JungleAdapter implements GameVariantAdapter {
	gameVariant = 'jungle' as const;

	constructor(_debug: boolean = false) {
		// Debug functionality handled by universal service
	}

	convertGameState(gameState: JungleGameState): any {
		return {
			board: gameState.board,
			terrain: gameState.terrain,
			currentPlayer: gameState.currentPlayer,
			status: gameState.status,
			moveHistory: gameState.moveHistory,
			selectedSquare: gameState.selectedSquare,
			possibleMoves: gameState.possibleMoves,
		};
	}

	getAllValidMoves(gameState: any): string[] {
		const moves: string[] = [];
		for (let row = 0; row < 9; row++) {
			for (let col = 0; col < 7; col++) {
				const piece = getPieceAt(gameState.board, { row, col });
				if (piece && piece.color === gameState.currentPlayer) {
					const from = { row, col };
					const possibleMoves = getPossibleMoves(
						gameState.board,
						gameState.terrain,
						from
					);

					for (const to of possibleMoves) {
						moves.push(
							`${this.positionToAlgebraic(from)} ${this.positionToAlgebraic(to)}`
						);
					}
				}
			}
		}
		return moves;
	}

	createVisualBoard(gameState: any): string {
		let board = '';
		for (let row = 0; row < 9; row++) {
			for (let col = 0; col < 7; col++) {
				const piece = getPieceAt(gameState.board, { row, col });
				if (piece) {
					board += this.getPieceSymbol(piece) + ' ';
				} else {
					board += '. ';
				}
			}
			board += '\n';
		}
		return board;
	}

	analyzeThreatsSafety(_gameState: any): string {
		return 'Threat analysis not implemented for Jungle chess';
	}

	generatePrompt(gameState: JungleGameState): string {
		return this.gameStateToPrompt(gameState);
	}

	/**
	 * Convert Jungle position to algebraic notation
	 */
	positionToAlgebraic(position: JunglePosition): string {
		const files = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
		const ranks = ['9', '8', '7', '6', '5', '4', '3', '2', '1'];
		const file = files[position.col];
		const rank = ranks[position.row];
		if (!file || !rank) return 'a1';
		return `${file}${rank}`;
	}

	/**
	 * Convert algebraic notation to Jungle position
	 */
	algebraicToPosition(algebraic: string): JunglePosition {
		const files = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
		const ranks = ['9', '8', '7', '6', '5', '4', '3', '2', '1'];

		return {
			col: files.indexOf(algebraic[0] || 'a'),
			row: ranks.indexOf(algebraic.slice(1) || '1'),
		};
	}

	/**
	 * Get piece symbol for display
	 */
	getPieceSymbol(piece: JunglePiece): string {
		const symbols = {
			red: {
				elephant: '象',
				lion: '獅',
				tiger: '虎',
				leopard: '豹',
				dog: '狗',
				wolf: '狼',
				cat: '貓',
				rat: '鼠',
			},
			blue: {
				elephant: '象',
				lion: '獅',
				tiger: '虎',
				leopard: '豹',
				dog: '狗',
				wolf: '狼',
				cat: '貓',
				rat: '鼠',
			},
		};
		return symbols[piece.color][piece.type];
	}

	/**
	 * Convert game state to AI prompt
	 */
	gameStateToPrompt(gameState: JungleGameState): string {
		let prompt = `Jungle Chess (鬥獸棋) Position Analysis\n\n`;
		prompt += `Current Player: ${gameState.currentPlayer === 'red' ? 'Red (红方)' : 'Blue (蓝方)'}\n`;
		prompt += `Game Status: ${gameState.status}\n\n`;

		// Board representation
		prompt += `Board (9x7):\n`;
		prompt += `   a b c d e f g\n`;

		for (let row = 0; row < 9; row++) {
			const rank = 9 - row;
			prompt += `${rank} `;

			for (let col = 0; col < 7; col++) {
				const piece = getPieceAt(gameState.board, { row, col });
				const terrain = gameState.terrain[row]![col];

				if (piece) {
					prompt += `${this.getPieceSymbol(piece)} `;
				} else {
					// Show terrain symbols
					if (terrain) {
						switch (terrain.type) {
							case 'water':
								prompt += '〜 ';
								break;
							case 'trap':
								prompt += '△ ';
								break;
							case 'den':
								prompt += '◆ ';
								break;
							default:
								prompt += '· ';
						}
					} else {
						prompt += '· ';
					}
				}
			}
			prompt += `${rank}\n`;
		}

		prompt += `   a b c d e f g\n\n`;

		// Piece summary
		prompt += `Pieces on board:\n`;
		for (let row = 0; row < 9; row++) {
			for (let col = 0; col < 7; col++) {
				const piece = getPieceAt(gameState.board, { row, col });
				if (piece) {
					const position = this.positionToAlgebraic({ row, col });
					prompt += `  ${piece.color} ${piece.type} (rank ${piece.rank}) at ${position}\n`;
				}
			}
		}

		prompt += `\nMove History (${gameState.moveHistory.length} moves):\n`;
		gameState.moveHistory.forEach((move, index) => {
			const from = this.positionToAlgebraic(move.from);
			const to = this.positionToAlgebraic(move.to);
			const pieceSymbol = this.getPieceSymbol(move.piece);
			const captured = move.capturedPiece
				? ` x ${this.getPieceSymbol(move.capturedPiece)}`
				: '';
			prompt += `  ${index + 1}. ${pieceSymbol} ${from}${to}${captured}\n`;
		});

		prompt += `\nJungle Chess Rules:\n`;
		prompt += `- Piece ranks: Elephant(8) > Lion(7) > Tiger(6) > Leopard(5) > Dog(4) > Wolf(3) > Cat(2) > Rat(1)\n`;
		prompt += `- Higher rank captures lower rank, except Rat can capture Elephant\n`;
		prompt += `- Only Rat can enter water squares (〜)\n`;
		prompt += `- Lion and Tiger can jump across rivers if no pieces block the path\n`;
		prompt += `- Pieces in enemy traps (△) become rank 0 and can be captured by any piece\n`;
		prompt += `- Win by entering opponent's den (◆) or capturing all enemy pieces\n`;
		prompt += `- Pieces move one square horizontally or vertically\n\n`;

		// Current position analysis
		if (gameState.selectedSquare && gameState.possibleMoves.length > 0) {
			prompt += `Selected piece at ${this.positionToAlgebraic(gameState.selectedSquare)}\n`;
			prompt += `Possible moves: `;
			const moves = gameState.possibleMoves
				.map(pos => this.positionToAlgebraic(pos))
				.join(', ');
			prompt += `${moves}\n\n`;
		}

		// Add legal moves for current player
		const legalMoves = this.getAllValidMoves(gameState);
		if (legalMoves.length > 0) {
			prompt += `Legal moves for ${gameState.currentPlayer}:\n`;
			legalMoves.forEach((move, index) => {
				prompt += `  ${index + 1}. ${move}\n`;
			});
			prompt += `\n`;
		}

		prompt += `Analyze the position and suggest the best move for ${gameState.currentPlayer}.\n`;
		prompt += `Choose ONLY from the legal moves listed above. Consider piece values, tactical opportunities, and strategic positioning.\n\n`;

		prompt += `Respond in JSON format:\n`;
		prompt += `{\n`;
		prompt += `    "move": {\n`;
		prompt += `        "from": "a1",\n`;
		prompt += `        "to": "a2"\n`;
		prompt += `    },\n`;
		prompt += `    "reasoning": "Brief explanation of the strategic thinking",\n`;
		prompt += `    "confidence": 85\n`;
		prompt += `}\n\n`;

		prompt += `Rules:\n`;
		prompt += `- ONLY use moves from the legal moves list above\n`;
		prompt += `- "from" must have your piece on it (check board!)\n`;
		prompt += `- Parse moves like "a1 a2" as {"from": "a1", "to": "a2"}\n`;

		return prompt;
	}

	/**
	 * Parse AI response to extract move
	 */
	parseAIResponse(
		response: string,
		gameState: JungleGameState
	): AIResponse | null {
		try {
			// Try to extract JSON response first
			const jsonMatch = response.match(/\{[\s\S]*\}/);
			if (jsonMatch) {
				const parsed = JSON.parse(jsonMatch[0]);
				if (parsed.move && parsed.reasoning) {
					return {
						move: {
							from: parsed.move.from,
							to: parsed.move.to,
						},
						thinking: parsed.reasoning,
						confidence: parsed.confidence || 0.8,
					};
				}
			}

			// Fallback: extract move from text
			const movePattern = /([a-g][1-9])\s*(?:\s+|(?:-|->|→))\s*([a-g][1-9])/i;
			const match = response.match(movePattern);

			if (match) {
				const from = this.algebraicToPosition(match[1] || 'a1');
				const to = this.algebraicToPosition(match[2] || 'a1');

				// Validate the move
				const piece = getPieceAt(gameState.board, from);
				if (!piece || piece.color !== gameState.currentPlayer) {
					return null;
				}

				const possibleMoves = getPossibleMoves(
					gameState.board,
					gameState.terrain,
					from
				);

				const isValidMove = possibleMoves.some(
					move => move.row === to.row && move.col === to.col
				);

				if (!isValidMove) {
					return null;
				}

				return {
					move: {
						from: this.positionToAlgebraic(from),
						to: this.positionToAlgebraic(to),
					},
					thinking: response.substring(0, 200) + '...',
					confidence: 0.7,
				};
			}

			return null;
		} catch (_error) {
			return null;
		}
	}

	/**
	 * Get all legal moves for the current player
	 */
	getLegalMoves(
		gameState: JungleGameState
	): Array<{ from: JunglePosition; to: JunglePosition }> {
		const moves: Array<{ from: JunglePosition; to: JunglePosition }> = [];

		for (let row = 0; row < 9; row++) {
			for (let col = 0; col < 7; col++) {
				const piece = getPieceAt(gameState.board, { row, col });
				if (piece && piece.color === gameState.currentPlayer) {
					const from = { row, col };
					const possibleMoves = getPossibleMoves(
						gameState.board,
						gameState.terrain,
						from
					);

					for (const to of possibleMoves) {
						moves.push({ from, to });
					}
				}
			}
		}

		return moves;
	}

	/**
	 * Evaluate position score (simple material count)
	 */
	evaluatePosition(gameState: JungleGameState): number {
		const pieceValues: Record<JunglePieceType, number> = {
			elephant: 8,
			lion: 7,
			tiger: 6,
			leopard: 5,
			dog: 4,
			wolf: 3,
			cat: 2,
			rat: 1,
		};

		let score = 0;

		for (let row = 0; row < 9; row++) {
			for (let col = 0; col < 7; col++) {
				const piece = getPieceAt(gameState.board, { row, col });
				if (piece) {
					const value = pieceValues[piece.type];
					score += piece.color === gameState.currentPlayer ? value : -value;
				}
			}
		}

		return score;
	}

	/**
	 * Get position analysis for debugging
	 */
	getPositionAnalysis(gameState: JungleGameState): string {
		const legalMoves = this.getLegalMoves(gameState);
		const evaluation = this.evaluatePosition(gameState);

		let analysis = `Position Analysis:\n`;
		analysis += `- Legal moves: ${legalMoves.length}\n`;
		analysis += `- Material evaluation: ${evaluation > 0 ? '+' : ''}${evaluation}\n`;
		analysis += `- Current player: ${gameState.currentPlayer}\n`;

		if (legalMoves.length > 0) {
			analysis += `- Sample moves:\n`;
			legalMoves.slice(0, 5).forEach(move => {
				const from = this.positionToAlgebraic(move.from);
				const to = this.positionToAlgebraic(move.to);
				analysis += `  ${from} → ${to}\n`;
			});
		}

		return analysis;
	}
}
