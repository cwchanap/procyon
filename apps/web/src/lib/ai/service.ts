/* eslint-disable no-console */
/* eslint-disable @typescript-eslint/no-explicit-any */
import type { AIConfig, AIResponse } from './types';
import type { GameState, Position, Move } from '../chess/types';
import { RANKS, FILES } from '../chess/types';
import { getPossibleMoves, isMoveValid } from '../chess/moves';
import { isKingInCheck } from '../chess/game';
import { copyBoard, setPieceAt } from '../chess/board';

export class AIService {
	private config: AIConfig;
	private debugCallback?: (
		type: string,
		message: string,
		data?: unknown
	) => void;

	constructor(config: AIConfig) {
		this.config = config;
	}

	setDebugCallback(
		callback: (type: string, message: string, data?: unknown) => void
	) {
		this.debugCallback = callback;
	}

	async makeMove(gameState: GameState): Promise<AIResponse | null> {
		if (!this.config.enabled || !this.config.apiKey) {
			return null;
		}

		try {
			const boardFEN = this.generateFEN(gameState);
			const prompt = this.createChessPrompt(gameState, boardFEN);

			if (this.config.debug) {
				console.group('🐛 AI DEBUG MODE');
				console.log('📋 Current Game State:');
				console.log(`Player: ${gameState.currentPlayer}`);
				console.log(`Status: ${gameState.status}`);
				console.log(
					`Move #: ${Math.floor(gameState.moveHistory.length / 2) + 1}`
				);
				console.log('\n📤 PROMPT SENT TO AI:');
				console.log(prompt);
				console.log('\n' + '='.repeat(80));

				this.debugCallback?.(
					'ai-debug',
					`🤔 AI is thinking as ${gameState.currentPlayer}...`,
					{
						player: gameState.currentPlayer,
						status: gameState.status,
						moveNumber: Math.floor(gameState.moveHistory.length / 2) + 1,
					}
				);
			}

			const response = await this.callLLM(prompt);

			if (this.config.debug) {
				console.log('📥 RAW AI RESPONSE:');
				console.log(response);
				console.log('\n' + '='.repeat(80));
			}

			const parsedResponse = this.parseAIResponse(response);

			if (this.config.debug) {
				console.log('🎯 PARSED AI RESPONSE:');
				console.log(parsedResponse);
				console.groupEnd();

				if (parsedResponse) {
					this.debugCallback?.(
						'ai-move',
						`🎯 AI suggests: ${parsedResponse.move.from} → ${parsedResponse.move.to}`,
						{
							move: parsedResponse.move,
							reasoning: parsedResponse.thinking,
							confidence: parsedResponse.confidence,
						}
					);
				} else {
					this.debugCallback?.('ai-error', '❌ Failed to parse AI response', {
						rawResponse: response,
					});
				}
			}

			return parsedResponse;
		} catch (error) {
			console.error('AI service error:', error);
			return null;
		}
	}

	private async callLLM(prompt: string): Promise<string> {
		switch (this.config.provider) {
			case 'gemini':
				return this.callGemini(prompt);
			case 'openrouter':
				return this.callOpenRouter(prompt);
			case 'openai':
				return this.callOpenAI(prompt);
			default:
				throw new Error(`Unsupported AI provider: ${this.config.provider}`);
		}
	}

	private async callGemini(prompt: string): Promise<string> {
		const response = await fetch(
			`https://generativelanguage.googleapis.com/v1beta/models/${this.config.model}:generateContent?key=${this.config.apiKey}`,
			{
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({
					contents: [
						{
							parts: [{ text: prompt }],
						},
					],
					generationConfig: {
						temperature: 0.3,
						maxOutputTokens: 500,
					},
				}),
			}
		);

		if (!response.ok) {
			throw new Error(`Gemini API error: ${response.statusText}`);
		}

		const data = await response.json();
		return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
	}

	private async callOpenRouter(prompt: string): Promise<string> {
		const response = await fetch(
			'https://openrouter.ai/api/v1/chat/completions',
			{
				method: 'POST',
				headers: {
					Authorization: `Bearer ${this.config.apiKey}`,
					'Content-Type': 'application/json',
					'HTTP-Referer': window.location.origin,
					'X-Title': 'Procyon Chess',
				},
				body: JSON.stringify({
					model: this.config.model,
					messages: [
						{
							role: 'user',
							content: prompt,
						},
					],
					temperature: 0.3,
					max_tokens: 500,
				}),
			}
		);

		if (!response.ok) {
			throw new Error(`OpenRouter API error: ${response.statusText}`);
		}

		const data = await response.json();
		return data.choices?.[0]?.message?.content || '';
	}

	private async callOpenAI(prompt: string): Promise<string> {
		const response = await fetch('https://api.openai.com/v1/chat/completions', {
			method: 'POST',
			headers: {
				Authorization: `Bearer ${this.config.apiKey}`,
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({
				model: this.config.model,
				messages: [
					{
						role: 'user',
						content: prompt,
					},
				],
				temperature: 0.3,
				max_tokens: 500,
			}),
		});

		if (!response.ok) {
			throw new Error(`OpenAI API error: ${response.statusText}`);
		}

		const data = await response.json();
		return data.choices?.[0]?.message?.content || '';
	}

	private createChessPrompt(gameState: GameState, _boardFEN: string): string {
		const currentPlayer = gameState.currentPlayer;
		const moveHistory = this.formatMoveHistory(gameState.moveHistory);
		const visualBoard = this.createVisualBoard(gameState);
		const threatAnalysis = this.analyzeThreatsSafety(gameState);
		const validMoves = this.getAllValidMoves(gameState);
		const randomSeed = Math.floor(Math.random() * 1000);

		return `You are a chess AI assistant playing as ${currentPlayer}. Analyze the current chess position and provide your next move.

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
❌ DO NOT suggest e7-e5 if there's no pawn on e7!
❌ Check the board position above to see where pieces actually are!

POSITION ANALYSIS:
${threatAnalysis}

STRATEGIC CONSIDERATIONS:
- Opening principles: Control center (e4, e5, d4, d5), develop pieces, castle early
- Middlegame: Look for tactics, improve piece positions, create weaknesses
- Endgame: Activate king, promote pawns, use piece coordination

TACTICAL AWARENESS:
- Check for forks, pins, skewers, and discovered attacks
- Look for sacrifice opportunities
- Consider opponent's threats and counter-threats
- Evaluate piece exchanges carefully

RANDOMIZATION SEED: ${randomSeed} (use this to vary your play style slightly)

IMPORTANT: You must respond in exactly this JSON format:
{
    "move": {
        "from": "e2",
        "to": "e4"
    },
    "reasoning": "Detailed explanation of your strategic thinking",
    "confidence": 85
}

🚨 ABSOLUTE REQUIREMENT: You MUST choose ONLY from the valid moves listed above.
   - If you suggest e7-e5 but it's not in the valid moves list, your move will be REJECTED
   - Look at the visual board to understand current piece positions
   - Use ONLY the algebraic notations provided in the valid moves list

Your move:`;
	}

	private createVisualBoard(gameState: GameState): string {
		const { board } = gameState;
		let visual = '    a  b  c  d  e  f  g  h\n';
		visual += '  ┌──────────────────────┐\n';

		for (let rank = 0; rank < 8; rank++) {
			visual += `${8 - rank} │ `;
			for (let file = 0; file < 8; file++) {
				const piece = board[rank][file];
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

	private getPieceSymbol(piece: any): string {
		const symbols = {
			white: {
				king: '♔',
				queen: '♕',
				rook: '♖',
				bishop: '♗',
				knight: '♘',
				pawn: '♙',
			},
			black: {
				king: '♚',
				queen: '♛',
				rook: '♜',
				bishop: '♝',
				knight: '♞',
				pawn: '♟',
			},
		};
		return symbols[piece.color][piece.type] || '?';
	}

	private analyzeThreatsSafety(gameState: GameState): string {
		const { board, currentPlayer } = gameState;
		let analysis = '';

		// Find kings
		const myKing = this.findPiece(board, 'king', currentPlayer);
		const _enemyKing = this.findPiece(
			board,
			'king',
			currentPlayer === 'white' ? 'black' : 'white'
		);

		// Basic analysis
		if (gameState.status === 'check') {
			analysis += `⚠️  Your king is in CHECK! Priority: Get out of check immediately.\n`;
		}

		// Count material
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

		// King safety
		if (myKing) {
			const kingSafety = this.evaluateKingSafety(board, myKing, currentPlayer);
			analysis += `Your king safety: ${kingSafety}\n`;
		}

		return analysis;
	}

	private findPiece(
		board: any[][],
		type: string,
		color: string
	): { row: number; col: number } | null {
		for (let row = 0; row < 8; row++) {
			for (let col = 0; col < 8; col++) {
				const piece = board[row][col];
				if (piece && piece.type === type && piece.color === color) {
					return { row, col };
				}
			}
		}
		return null;
	}

	private countMaterial(board: any[][], color: string): number {
		const values = {
			pawn: 1,
			knight: 3,
			bishop: 3,
			rook: 5,
			queen: 9,
			king: 0,
		};
		let total = 0;

		for (let row = 0; row < 8; row++) {
			for (let col = 0; col < 8; col++) {
				const piece = board[row][col];
				if (piece && piece.color === color) {
					total += values[piece.type] || 0;
				}
			}
		}

		return total;
	}

	private evaluateKingSafety(
		board: any[][],
		kingPos: { row: number; col: number },
		color: string
	): string {
		const { row, col } = kingPos;

		// Check if king is in center (unsafe)
		if (row >= 2 && row <= 5 && col >= 2 && col <= 5) {
			return 'UNSAFE - King exposed in center';
		}

		// Check if castled
		if (color === 'white' && row === 7 && (col === 2 || col === 6)) {
			return 'GOOD - King castled';
		}
		if (color === 'black' && row === 0 && (col === 2 || col === 6)) {
			return 'GOOD - King castled';
		}

		// Check if on back rank
		if ((color === 'white' && row === 7) || (color === 'black' && row === 0)) {
			return 'OK - King on back rank';
		}

		return 'CAUTION - King position needs attention';
	}

	private generateFEN(gameState: GameState): string {
		let fen = '';

		// Board position
		for (let rank = 0; rank < 8; rank++) {
			let emptyCount = 0;
			let rankStr = '';

			for (let file = 0; file < 8; file++) {
				const piece = gameState.board[rank][file];

				if (piece) {
					if (emptyCount > 0) {
						rankStr += emptyCount.toString();
						emptyCount = 0;
					}

					let pieceChar = '';
					switch (piece.type) {
						case 'king':
							pieceChar = 'k';
							break;
						case 'queen':
							pieceChar = 'q';
							break;
						case 'rook':
							pieceChar = 'r';
							break;
						case 'bishop':
							pieceChar = 'b';
							break;
						case 'knight':
							pieceChar = 'n';
							break;
						case 'pawn':
							pieceChar = 'p';
							break;
					}

					if (piece.color === 'white') {
						pieceChar = pieceChar.toUpperCase();
					}

					rankStr += pieceChar;
				} else {
					emptyCount++;
				}
			}

			if (emptyCount > 0) {
				rankStr += emptyCount.toString();
			}

			fen += rankStr;
			if (rank < 7) fen += '/';
		}

		// Add current player
		fen += ` ${gameState.currentPlayer === 'white' ? 'w' : 'b'}`;

		// Simplified FEN (without castling, en passant, halfmove, fullmove)
		fen += ' - - 0 1';

		return fen;
	}

	private formatMoveHistory(moves: Move[]): string {
		if (moves.length === 0) return 'Game start';

		const recentMoves = moves.slice(-10); // Last 10 moves
		return recentMoves
			.map((move, index) => {
				const moveNum =
					Math.floor((moves.length - recentMoves.length + index) / 2) + 1;
				const isWhite = (moves.length - recentMoves.length + index) % 2 === 0;
				const from = this.positionToAlgebraic(move.from);
				const to = this.positionToAlgebraic(move.to);

				if (isWhite) {
					return `${moveNum}. ${from}-${to}`;
				} else {
					return `${from}-${to}`;
				}
			})
			.join(' ');
	}

	private positionToAlgebraic(position: Position): string {
		return FILES[position.col] + RANKS[position.row];
	}

	private algebraicToPosition(algebraic: string): Position {
		const file = algebraic[0];
		const rank = algebraic[1];

		return {
			col: FILES.indexOf(file),
			row: RANKS.indexOf(rank),
		};
	}

	private parseAIResponse(response: string): AIResponse | null {
		try {
			// Try to extract JSON from the response
			const jsonMatch = response.match(/\{[\s\S]*\}/);
			if (!jsonMatch) {
				if (this.config.debug) {
					console.error('🚨 DEBUG: No JSON found in AI response');
				}
				throw new Error('No JSON found in response');
			}

			const parsed = JSON.parse(jsonMatch[0]);

			if (!parsed.move || !parsed.move.from || !parsed.move.to) {
				if (this.config.debug) {
					console.error(
						'🚨 DEBUG: Invalid move format in parsed response:',
						parsed
					);
				}
				throw new Error('Invalid move format in response');
			}

			// Validate move format
			const moveFrom = parsed.move.from;
			const moveTo = parsed.move.to;

			if (this.config.debug) {
				console.log('🔍 DEBUG: Move validation:');
				console.log(`  From: "${moveFrom}" (type: ${typeof moveFrom})`);
				console.log(`  To: "${moveTo}" (type: ${typeof moveTo})`);

				// Check if moves are in correct algebraic format
				const algebraicPattern = /^[a-h][1-8]$/;
				const fromValid = algebraicPattern.test(moveFrom);
				const toValid = algebraicPattern.test(moveTo);

				console.log(`  From valid: ${fromValid}`);
				console.log(`  To valid: ${toValid}`);

				if (!fromValid || !toValid) {
					console.warn('⚠️ DEBUG: Move format may be incorrect!');
				}
			}

			return {
				move: {
					from: moveFrom,
					to: moveTo,
					reasoning: parsed.reasoning,
				},
				confidence: parsed.confidence || 50,
				thinking: parsed.reasoning,
			};
		} catch (error) {
			console.error('Failed to parse AI response:', error);

			console.error('Raw response:', response);
			return null;
		}
	}

	private getAllValidMoves(gameState: GameState): string {
		const { board, currentPlayer } = gameState;
		const validMoves: string[] = [];

		if (this.config.debug) {
			console.log(`🔍 Generating valid moves for ${currentPlayer}:`);
		}

		// Iterate through all squares to find pieces belonging to current player
		for (let row = 0; row < 8; row++) {
			for (let col = 0; col < 8; col++) {
				const piece = board[row][col];
				if (piece && piece.color === currentPlayer) {
					const fromPos = { row, col };
					const algebraicFrom = this.positionToAlgebraic(fromPos);

					if (this.config.debug) {
						console.log(`  Found ${piece.type} at ${algebraicFrom}`);
					}

					const possibleMoves = getPossibleMoves(board, piece, fromPos);

					if (this.config.debug && possibleMoves.length > 0) {
						console.log(
							`    Possible moves for ${piece.type} at ${algebraicFrom}:`,
							possibleMoves.map(pos => this.positionToAlgebraic(pos)).join(', ')
						);
					}

					// Convert each possible move to algebraic notation
					for (const toPos of possibleMoves) {
						// Check if move would leave king in check (basic validation)
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

		if (this.config.debug) {
			console.log(`📋 Total valid moves found: ${validMoves.length}`);
			if (validMoves.length > 0) {
				console.log(`📝 Valid moves:`, validMoves);
			}
		}

		if (validMoves.length === 0) {
			return 'No valid moves available (checkmate or stalemate)';
		}

		// Group moves by piece type for better readability
		const groupedMoves = this.groupMovesByPiece(validMoves);

		if (this.config.debug) {
			console.log(`📋 Grouped moves sent to AI:\n${groupedMoves}`);
		}

		return groupedMoves;
	}

	private wouldMoveBeValid(
		gameState: GameState,
		from: Position,
		to: Position
	): boolean {
		const { board, currentPlayer } = gameState;
		const piece = board[from.row]?.[from.col];

		if (!piece || piece.color !== currentPlayer) {
			if (this.config.debug) {
				console.log(
					`    ❌ Invalid: No ${currentPlayer} piece at ${this.positionToAlgebraic(from)}`
				);
			}
			return false;
		}

		// First check if the move is possible according to piece movement rules
		if (!isMoveValid(board, from, to, piece)) {
			if (this.config.debug) {
				console.log(
					`    ❌ Invalid: Move ${this.positionToAlgebraic(from)}-${this.positionToAlgebraic(to)} not allowed for ${piece.type}`
				);
			}
			return false;
		}

		// Then check if this move would leave our king in check
		const testBoard = copyBoard(board);
		setPieceAt(testBoard, from, null);
		setPieceAt(testBoard, to, piece);

		const wouldBeInCheck = isKingInCheck(testBoard, currentPlayer);
		if (wouldBeInCheck) {
			if (this.config.debug) {
				console.log(
					`    ❌ Invalid: Move ${this.positionToAlgebraic(from)}-${this.positionToAlgebraic(to)} leaves king in check`
				);
			}
			return false;
		}

		if (this.config.debug) {
			console.log(
				`    ✅ Valid: ${this.positionToAlgebraic(from)}-${this.positionToAlgebraic(to)}`
			);
		}
		return true;
	}

	private getPieceSymbolForMove(piece: any): string {
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
			const pieceType = pieceMatch ? pieceMatch[1] : 'Unknown';
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

	updateConfig(newConfig: Partial<AIConfig>): void {
		this.config = { ...this.config, ...newConfig };
	}
}
