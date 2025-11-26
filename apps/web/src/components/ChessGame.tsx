import React, { useState, useCallback, useEffect, useRef } from 'react';
import type { GameState, Position, ChessPiece } from '../lib/chess/types';
import {
	createInitialGameState,
	selectSquare,
	makeMove,
	getGameStatus,
	makeAIMove,
	setAIThinking,
	isAITurn,
} from '../lib/chess/game';
import { createInitialBoard, getPieceAt } from '../lib/chess/board';
import ChessBoard from './ChessBoard';
import GameScaffold from './game/GameScaffold';
import GameStartOverlay from './game/GameStartOverlay';
import AIStatusPanel from './game/AIStatusPanel';
import GameControls from './game/GameControls';
import DemoSelector from './game/DemoSelector';
import TutorialInstructions from './game/TutorialInstructions';
import AIGameInstructions from './game/AIGameInstructions';
import AISettingsDialog from './ai/AISettingsDialog';
import type { AIMove } from './ai/AIDebugDialog';
import type { AIConfig, AIProvider } from '../lib/ai/types';
import { createChessAI } from '../lib/ai';
import { loadAIConfig, saveAIConfig, defaultAIConfig } from '../lib/ai/storage';
import { GameExporter } from '../lib/ai/game-export';
import { useAuth } from '../lib/auth';
import { AI_PROVIDERS } from '../lib/ai/types';
import { env } from '../lib/env';

interface LogicDemo {
	id: string;
	title: string;
	description: string;
	board: (ChessPiece | null)[][];
	focusSquare?: Position;
	highlightSquares?: Position[];
	explanation: string;
}

type ChessGameMode = 'tutorial' | 'ai';

const ChessGame: React.FC = () => {
	const [gameMode, setGameMode] = useState<ChessGameMode>('ai');
	const [gameStarted, setGameStarted] = useState(false);
	const [gameState, setGameState] = useState<GameState>(() =>
		createInitialGameState()
	);
	const [currentDemo, setCurrentDemo] = useState<string>('basic-movement');
	const [aiPlayer, setAIPlayer] = useState<'white' | 'black'>('black');
	const [aiConfig, setAIConfig] = useState<AIConfig>(defaultAIConfig);
	const [isDebugMode, setIsDebugMode] = useState(false);
	const [aiDebugMoves, setAiDebugMoves] = useState<AIMove[]>([]);
	const [_aiRejectionCount, setAiRejectionCount] = useState(0);
	const [isAiPaused, setIsAiPaused] = useState(false);
	const [isLoadingConfig, setIsLoadingConfig] = useState(true);
	const [aiError, setAiError] = useState<string | null>(null);
	const gameExporterRef = useRef<GameExporter | null>(null);
	const [hasGameEnded, setHasGameEnded] = useState(false);
	const [showDebugWinButton, setShowDebugWinButton] = useState(false);
	const { isAuthenticated } = useAuth();
	const [providerError, setProviderError] = useState<string | null>(null);

	const handleProviderChange = useCallback(
		async (newProvider: AIProvider) => {
			const providerInfo = AI_PROVIDERS[newProvider];
			const fallbackModel =
				providerInfo.models[0] || providerInfo.defaultModel || aiConfig.model;

			setProviderError(null);

			try {
				if (!isAuthenticated) {
					setProviderError('Please sign in to manage your AI settings.');
					return;
				}

				const response = await fetch(`${env.PUBLIC_API_URL}/ai-config`, {
					credentials: 'include',
					headers: {
						'Content-Type': 'application/json',
					},
				});

				if (!response.ok) {
					// eslint-disable-next-line no-console
					console.error(
						`Failed to fetch AI configurations for provider ${newProvider}:`,
						response.status,
						response.statusText
					);
					setProviderError(
						"We couldn't load your saved AI settings. Please try again from AI Settings."
					);
					return;
				}

				const data = await response.json();
				const configurations = (data.configurations || []) as Array<{
					id?: string;
					provider?: AIProvider;
					hasApiKey?: boolean;
				}>;
				const providerConfig = configurations.find(
					config => config.provider === newProvider && config.hasApiKey
				);

				if (!providerConfig?.id) {
					// eslint-disable-next-line no-console
					console.warn(
						'No stored API key found for provider; prompt user to add one:',
						newProvider
					);
					setProviderError(
						'Add an API key for this provider in AI Settings to reuse it here.'
					);
					return;
				}

				const fullConfigResponse = await fetch(
					`${env.PUBLIC_API_URL}/ai-config/${providerConfig.id}/full`,
					{
						credentials: 'include',
						headers: {
							'Content-Type': 'application/json',
						},
					}
				);

				if (!fullConfigResponse.ok) {
					// eslint-disable-next-line no-console
					console.error(
						`Failed to fetch full AI configuration for provider ${newProvider}:`,
						fullConfigResponse.status,
						fullConfigResponse.statusText
					);
					setProviderError(
						"We couldn't load your saved API key details. Please try again."
					);
					return;
				}

				const fullConfig = await fullConfigResponse.json();
				const resolvedModel = fullConfig.modelName || fallbackModel;

				setAIConfig(prev => ({
					...prev,
					provider: newProvider,
					model: resolvedModel,
					apiKey: fullConfig.apiKey || '',
				}));
			} catch (_error) {
				// eslint-disable-next-line no-console
				console.error('Failed to load AI provider configuration', _error);
				setProviderError(
					'Something went wrong loading AI settings. Please try again.'
				);
			}
		},
		[aiConfig.model, isAuthenticated]
	);

	// Helper function to convert move history to debug format
	const createAIMove = useCallback(
		(
			move: string,
			isAI: boolean,
			thinking?: string,
			error?: string
		): AIMove => {
			const moveNumber = Math.floor(gameState.moveHistory.length / 2) + 1;
			const player = gameState.currentPlayer === 'white' ? 'White' : 'Black';

			return {
				moveNumber,
				player: `${isAI ? '🤖 AI ' : '👤 '}${player}`,
				move,
				timestamp: Date.now(),
				isAI,
				thinking,
				error,
			};
		},
		[gameState.moveHistory.length, gameState.currentPlayer]
	);
	const [aiService] = useState(() => createChessAI(defaultAIConfig));

	// Load AI config on client side only to avoid SSR hydration mismatch
	useEffect(() => {
		const loadConfig = async () => {
			const config = await loadAIConfig();
			setAIConfig(config);
			aiService.updateConfig({ ...config, debug: isDebugMode });
			setIsLoadingConfig(false);
		};
		loadConfig();
	}, [aiService, isDebugMode]);

	// Save play history when game ends
	useEffect(() => {
		const isGameOver =
			gameState.status === 'checkmate' ||
			gameState.status === 'stalemate' ||
			gameState.status === 'draw';

		if (
			isGameOver &&
			gameStarted &&
			gameMode === 'ai' &&
			!hasGameEnded &&
			(isAuthenticated || import.meta.env.DEV)
		) {
			setHasGameEnded(true);

			const savePlayHistory = async () => {
				try {
					// Determine game result from current player's perspective
					let status: 'win' | 'loss' | 'draw';
					if (gameState.status === 'checkmate') {
						// Current player is in checkmate (they lost)
						// If AI player is in checkmate, human won
						// If human player is in checkmate, AI won
						status = gameState.currentPlayer === aiPlayer ? 'win' : 'loss';
					} else {
						// Stalemate or draw
						status = 'draw';
					}

					// Map provider/model to valid OpponentLlmId enum values
					let opponentLlmId: 'gpt-4o' | 'gemini-2.5-flash' = 'gemini-2.5-flash';
					const providerModel =
						`${aiConfig.provider}/${aiConfig.model}`.toLowerCase();
					if (providerModel.includes('gpt-4o')) {
						opponentLlmId = 'gpt-4o';
					} else if (providerModel.includes('gemini')) {
						opponentLlmId = 'gemini-2.5-flash';
					}

					await fetch(`${env.PUBLIC_API_URL}/play-history`, {
						method: 'POST',
						credentials: 'include',
						headers: {
							'Content-Type': 'application/json',
						},
						body: JSON.stringify({
							chessId: 'chess',
							status,
							date: new Date().toISOString(),
							opponentLlmId,
						}),
					});
				} catch (error) {
					// eslint-disable-next-line no-console
					console.error('Failed to save play history:', error);
				}
			};

			void savePlayHistory();
		}
	}, [
		gameState.status,
		gameState.currentPlayer,
		gameStarted,
		gameMode,
		hasGameEnded,
		isAuthenticated,
		aiPlayer,
		aiConfig.provider,
		aiConfig.model,
	]);

	// Trigger debug button with Shift+D
	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			if (e.shiftKey && e.key.toLowerCase() === 'd') {
				setShowDebugWinButton(prev => !prev);
			}
		};
		window.addEventListener('keydown', handleKeyDown);
		return () => window.removeEventListener('keydown', handleKeyDown);
	}, []);

	// Update AI service when debug mode changes
	useEffect(() => {
		aiService.updateConfig({ ...aiConfig, debug: isDebugMode });

		// Set up debug callback
		if (isDebugMode) {
			aiService.setDebugCallback((type, message, _data) => {
				const thinking = type === 'ai-thinking' ? message : undefined;
				const error = type === 'ai-error' ? message : undefined;

				setAiDebugMoves(prev => [
					...prev,
					createAIMove(
						type === 'ai-move' ? message : `Debug: ${message}`,
						true,
						thinking,
						error
					),
				]);
			});
		}
	}, [isDebugMode, aiConfig, aiService, createAIMove]);

	const createCustomBoard = useCallback(
		(setup: string): (ChessPiece | null)[][] => {
			const board: (ChessPiece | null)[][] = Array(8)
				.fill(null)
				.map(() => Array(8).fill(null));

			switch (setup) {
				case 'knight-moves':
					board[4][4] = {
						type: 'knight',
						color: 'white',
						hasMoved: false,
					};
					board[2][1] = {
						type: 'pawn',
						color: 'black',
						hasMoved: false,
					};
					board[6][3] = {
						type: 'pawn',
						color: 'black',
						hasMoved: false,
					};
					break;
				case 'check-demo':
					board[7][4] = {
						type: 'king',
						color: 'white',
						hasMoved: false,
					};
					board[0][0] = {
						type: 'rook',
						color: 'black',
						hasMoved: false,
					};
					board[7][0] = {
						type: 'rook',
						color: 'white',
						hasMoved: false,
					};
					break;
				case 'castling':
					board[7][4] = {
						type: 'king',
						color: 'white',
						hasMoved: false,
					};
					board[7][7] = {
						type: 'rook',
						color: 'white',
						hasMoved: false,
					};
					board[7][0] = {
						type: 'rook',
						color: 'white',
						hasMoved: false,
					};
					break;
				case 'pawn-promotion':
					board[1][3] = {
						type: 'pawn',
						color: 'white',
						hasMoved: true,
					};
					board[0][4] = {
						type: 'king',
						color: 'black',
						hasMoved: false,
					};
					board[7][4] = {
						type: 'king',
						color: 'white',
						hasMoved: false,
					};
					break;
				default:
					return createInitialBoard();
			}

			return board;
		},
		[]
	);

	const logicDemos: LogicDemo[] = [
		{
			id: 'basic-movement',
			title: 'Basic Piece Movement',
			description: 'Learn how different chess pieces move across the board',
			board: createInitialBoard(),
			explanation:
				'Click on any piece to see its possible moves. Each piece has unique movement patterns that define the strategy of chess.',
		},
		{
			id: 'knight-moves',
			title: 'Knight Movement Pattern',
			description:
				'The knight moves in an L-shape: 2 squares in one direction, then 1 square perpendicular',
			board: createCustomBoard('knight-moves'),
			focusSquare: { row: 4, col: 4 },
			highlightSquares: [
				{ row: 2, col: 3 },
				{ row: 2, col: 5 },
				{ row: 3, col: 2 },
				{ row: 3, col: 6 },
				{ row: 5, col: 2 },
				{ row: 5, col: 6 },
				{ row: 6, col: 3 },
				{ row: 6, col: 5 },
			],
			explanation:
				'The knight is unique - it can jump over other pieces and moves in an L-shape. Notice how it can capture the pawns but also move to empty squares.',
		},
		{
			id: 'check-demo',
			title: 'Check and King Safety',
			description:
				'Understanding when the king is in check and must be protected',
			board: createCustomBoard('check-demo'),
			focusSquare: { row: 7, col: 4 },
			explanation:
				'The white king is in check from the black rook. The king must move to safety, block the attack, or capture the attacking piece.',
		},
		{
			id: 'castling',
			title: 'Castling Rules',
			description: 'A special move involving the king and rook for king safety',
			board: createCustomBoard('castling'),
			focusSquare: { row: 7, col: 4 },
			explanation:
				'Castling allows the king to move 2 squares toward a rook, and the rook moves to the square the king crossed. Both pieces must not have moved, and there must be no pieces between them.',
		},
		{
			id: 'pawn-promotion',
			title: 'Pawn Promotion',
			description:
				'When a pawn reaches the opposite end, it promotes to any piece',
			board: createCustomBoard('pawn-promotion'),
			focusSquare: { row: 1, col: 3 },
			explanation:
				'This white pawn is one move away from promoting. When it reaches the 8th rank, it can become a queen, rook, bishop, or knight.',
		},
	];

	const getCurrentDemo = useCallback((): LogicDemo => {
		return logicDemos.find(demo => demo.id === currentDemo) || logicDemos[0];
	}, [currentDemo, logicDemos]);

	// AI Configuration handlers
	const _handleAIConfigChange = useCallback(
		async (newConfig: AIConfig) => {
			setAIConfig(newConfig);
			// Note: Saving should be done through profile page, not here
			// This is kept for backward compatibility only
			saveAIConfig(newConfig);
			aiService.updateConfig(newConfig);
		},
		[aiService]
	);

	// AI Move handling
	const makeAIMoveAsync = useCallback(async () => {
		if (!isAITurn(gameState) || gameState.isAiThinking) {
			return;
		}

		setGameState(prev => setAIThinking(prev, true));
		setAiError(null); // Clear previous errors

		try {
			const aiResponse = await aiService.makeMove(gameState);

			if (aiResponse && aiResponse.move) {
				if (isDebugMode) {
					setAiDebugMoves(prev => [
						...prev,
						createAIMove(
							`${aiResponse.move.from} → ${aiResponse.move.to}`,
							true,
							`Attempting move: ${aiResponse.move.from} → ${aiResponse.move.to}`
						),
					]);
				}

				const newGameState = makeAIMove(
					gameState,
					aiResponse.move.from,
					aiResponse.move.to
				);

				if (newGameState) {
					const updatedGameState = {
						...newGameState,
						status: getGameStatus(newGameState),
						isAiThinking: false,
					};
					setGameState(updatedGameState);

					if (isDebugMode) {
						setAiDebugMoves(prev => [
							...prev.slice(0, -1), // Remove the "attempting" move
							createAIMove(
								`${aiResponse.move.from} → ${aiResponse.move.to}`,
								true,
								`✅ Move successful! Status: ${updatedGameState.status}`
							),
						]);
					}

					// Record AI move in exporter with AI data
					if (gameExporterRef.current) {
						const piece = getPieceAt(
							gameState.board,
							aiService.adapter.algebraicToPosition(aiResponse.move.from)
						);
						const interaction = aiService.getLastInteraction();
						gameExporterRef.current.addMove(
							Math.floor(gameState.moveHistory.length / 2) + 1,
							gameState.currentPlayer,
							aiResponse.move.from,
							aiResponse.move.to,
							piece?.type || 'unknown',
							{
								prompt: interaction?.prompt,
								response: interaction?.rawResponse,
								reasoning: aiResponse.thinking,
								confidence: aiResponse.confidence,
							}
						);
					}
				} else {
					setAiError('AI suggested an invalid move');
					setIsAiPaused(true);
				}
			} else {
				setAiError('AI did not return a valid response');
				setIsAiPaused(true);
			}
		} catch (error) {
			// eslint-disable-next-line no-console
			console.error('AI move failed:', error);
			const errorMessage =
				error instanceof Error ? error.message : 'Unknown error occurred';
			setAiError(errorMessage);
			setIsAiPaused(true);

			if (isDebugMode) {
				setAiDebugMoves(prev => [
					...prev,
					createAIMove('Error', true, undefined, `❌ ${errorMessage}`),
				]);
			}
		} finally {
			setGameState(prev => setAIThinking(prev, false));
		}
	}, [gameState, aiService, isDebugMode, createAIMove]);

	// Retry AI move
	const retryAIMove = useCallback(() => {
		setAiError(null);
		setIsAiPaused(false);
		setAiRejectionCount(0);
		// The effect will trigger makeAIMoveAsync automatically
	}, []);

	// Effect to trigger AI moves
	useEffect(() => {
		if (
			gameMode === 'ai' &&
			gameStarted &&
			gameState.currentPlayer === aiPlayer &&
			(gameState.status === 'playing' || gameState.status === 'check') &&
			!gameState.isAiThinking &&
			!isAiPaused
		) {
			const timer = setTimeout(() => {
				makeAIMoveAsync();
			}, 1000); // 1 second delay for better UX

			return () => clearTimeout(timer);
		}
	}, [gameState, gameMode, gameStarted, aiPlayer, makeAIMoveAsync, isAiPaused]);

	// Game mode handlers
	const toggleToMode = useCallback(
		(newMode: ChessGameMode) => {
			setGameMode(newMode);
			setGameStarted(false);
			setAiRejectionCount(0);
			setIsAiPaused(false);
			setAiDebugMoves([]);
			setHasGameEnded(false);

			if (newMode === 'tutorial') {
				const demo = getCurrentDemo();
				setGameState({
					board: demo.board,
					currentPlayer: 'white',
					status: 'playing',
					moveHistory: [],
					selectedSquare: null,
					possibleMoves: [],
					mode: 'human-vs-human',
					isAiThinking: false,
				});
			} else if (newMode === 'ai') {
				if (aiConfig.enabled && aiConfig.apiKey) {
					setGameState(createInitialGameState('human-vs-ai', aiPlayer));
				} else {
					// AI mode without proper config - default to human vs human
					setGameState(createInitialGameState('human-vs-human'));
				}
			}
		},
		[getCurrentDemo, aiPlayer, aiConfig.enabled, aiConfig.apiKey]
	);

	const handleSquareClick = useCallback(
		(position: Position) => {
			if (gameMode === 'tutorial') {
				// If a piece is already selected, try to make a move
				if (gameState.selectedSquare) {
					const newGameState = makeMove(
						gameState,
						gameState.selectedSquare,
						position
					);
					if (newGameState) {
						// Update game status after the move
						const updatedGameState = {
							...newGameState,
							status: getGameStatus(newGameState),
						};
						setGameState(updatedGameState);
						return;
					}
				}

				// Otherwise, select the square using selectSquare function
				// which enforces turn-based play
				const newGameState = selectSquare(gameState, position);
				setGameState(newGameState);
			} else {
				// Regular game mode or AI mode
				// Prevent moves during AI turn or when AI is thinking
				if (
					(gameMode === 'ai' && gameState.currentPlayer === aiPlayer) ||
					gameState.isAiThinking
				) {
					return;
				}

				// If a piece is already selected, try to make a move
				if (gameState.selectedSquare) {
					const newGameState = makeMove(
						gameState,
						gameState.selectedSquare,
						position
					);
					if (newGameState) {
						// Update game status
						const updatedGameState = {
							...newGameState,
							status: getGameStatus(newGameState),
						};
						setGameState(updatedGameState);

						// Track human move in debug
						if (isDebugMode && gameMode === 'ai') {
							const fromSquare =
								String.fromCharCode(97 + gameState.selectedSquare.col) +
								(8 - gameState.selectedSquare.row);
							const toSquare =
								String.fromCharCode(97 + position.col) + (8 - position.row);
							setAiDebugMoves(prev => [
								...prev,
								createAIMove(`${fromSquare} → ${toSquare}`, false),
							]);
						}

						// Record human move in exporter
						if (gameExporterRef.current) {
							const fromSquare =
								String.fromCharCode(97 + gameState.selectedSquare.col) +
								(8 - gameState.selectedSquare.row);
							const toSquare =
								String.fromCharCode(97 + position.col) + (8 - position.row);
							const piece = getPieceAt(
								gameState.board,
								gameState.selectedSquare
							);
							gameExporterRef.current.addMove(
								Math.floor(gameState.moveHistory.length / 2) + 1,
								gameState.currentPlayer,
								fromSquare,
								toSquare,
								piece?.type || 'unknown'
							);
						}

						return;
					}
				}

				// Otherwise, select the square
				const newGameState = selectSquare(gameState, position);
				setGameState(newGameState);
			}
		},
		[gameMode, gameState, getCurrentDemo, aiPlayer, isDebugMode, createAIMove]
	);

	const resetGame = useCallback(() => {
		if (gameMode === 'ai') {
			setGameState(createInitialGameState('human-vs-ai', aiPlayer));
		} else {
			setGameState(createInitialGameState('human-vs-human'));
		}
		setGameStarted(false);
		setAiDebugMoves([]);
		setIsAiPaused(false);
		setAiError(null);
		setAiRejectionCount(0);
		setHasGameEnded(false);
	}, [gameMode, aiPlayer]);

	const triggerDebugWin = useCallback(() => {
		setGameState(prev => ({
			...prev,
			status: 'checkmate',
			currentPlayer: aiPlayer, // AI player in checkmate = human won
		}));
	}, [aiPlayer]);

	const triggerDebugLoss = useCallback(() => {
		const humanPlayer = aiPlayer === 'white' ? 'black' : 'white';
		setGameState(prev => ({
			...prev,
			status: 'checkmate',
			currentPlayer: humanPlayer, // Human player in checkmate = AI won
		}));
	}, [aiPlayer]);

	const triggerDebugDraw = useCallback(() => {
		setGameState(prev => ({
			...prev,
			status: 'stalemate',
		}));
	}, []);

	useEffect(() => {
		if (typeof window !== 'undefined') {
			const global = window as unknown as {
				__PROCYON_DEBUG_CHESS_TRIGGER_WIN__?: () => void;
			};
			// Helper for tests and manual debugging to force a human win
			global.__PROCYON_DEBUG_CHESS_TRIGGER_WIN__ = () => {
				setGameStarted(true);
				setHasGameEnded(false);
				setShowDebugWinButton(true);
				triggerDebugWin();
			};
		}
	}, [triggerDebugWin]);

	const handleStartOrReset = useCallback(() => {
		if (!gameStarted) {
			// Starting the game - ensure game state is properly initialized
			if (gameMode === 'ai') {
				setGameState(createInitialGameState('human-vs-ai', aiPlayer));
			} else {
				setGameState(createInitialGameState('human-vs-human'));
			}
			setGameStarted(true);
			setHasGameEnded(false);

			// Initialize game exporter
			gameExporterRef.current = new GameExporter('chess', aiConfig);
		} else {
			// Resetting the game
			resetGame();
		}
	}, [gameStarted, resetGame, gameMode, aiPlayer, aiConfig]);

	const handleDemoChange = useCallback(
		(demoId: string) => {
			setCurrentDemo(demoId);
			const demo = logicDemos.find(d => d.id === demoId);
			if (demo) {
				setGameState(prev => ({
					...prev,
					board: demo.board,
					selectedSquare: null,
					possibleMoves: [],
				}));
			}
		},
		[logicDemos]
	);

	const getStatusMessage = (): string => {
		const playerName = gameState.currentPlayer === 'white' ? 'White' : 'Black';

		// Add AI/Human indicator in AI mode
		const playerType =
			gameMode === 'ai'
				? gameState.currentPlayer === aiPlayer
					? '🤖 AI'
					: '👤 Human'
				: '';

		switch (gameState.status) {
			case 'check':
				return `${playerName} is in check!`;
			case 'checkmate':
				return `Checkmate! ${gameState.currentPlayer === 'white' ? 'Black' : 'White'} wins!`;
			case 'stalemate':
				return 'Stalemate! The game is a draw.';
			case 'draw':
				return 'The game is a draw.';
			default:
				return gameMode === 'ai'
					? `${playerType} ${playerName} to move`
					: `${playerName} to move`;
		}
	};

	const isGameOver =
		gameState.status === 'checkmate' ||
		gameState.status === 'stalemate' ||
		gameState.status === 'draw';

	const currentBoard = gameState.board;
	const currentHighlightSquares =
		gameMode === 'tutorial' ? getCurrentDemo().highlightSquares : undefined;

	const title =
		gameMode === 'tutorial' ? 'Chess Logic & Tutorials' : 'Chess Game';
	const subtitle =
		gameMode === 'tutorial'
			? getCurrentDemo().description
			: gameStarted
				? getStatusMessage()
				: '';
	const showModeToggle = gameMode === 'tutorial' || !gameStarted;

	return (
		<GameScaffold
			title={title}
			subtitle={subtitle}
			titleGradientClassName='bg-gradient-to-r from-cyan-300 via-purple-300 to-pink-300'
			subtitleClassName='text-purple-100'
			currentMode={gameMode}
			onModeChange={toggleToMode}
			showModeToggle={showModeToggle}
			inactiveModeClassName='text-purple-100 hover:bg-white hover:bg-opacity-20'
			aiSettingsButton={
				<AISettingsDialog
					aiPlayer={aiPlayer}
					onAIPlayerChange={player => setAIPlayer(player as 'white' | 'black')}
					provider={aiConfig.provider}
					model={aiConfig.model}
					onProviderChange={provider =>
						handleProviderChange(provider as AIProvider)
					}
					onModelChange={model => setAIConfig(prev => ({ ...prev, model }))}
					aiPlayerOptions={[
						{ value: 'black', label: 'AI plays Black' },
						{ value: 'white', label: 'AI plays White' },
					]}
					isActive={gameMode === 'ai'}
					onActivate={() => toggleToMode('ai')}
				/>
			}
		>
			{providerError && (
				<div className='w-full max-w-4xl mx-auto mb-4'>
					<div
						className='flex items-start justify-between gap-4 rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-red-100'
						role='alert'
					>
						<p className='text-sm'>{providerError}</p>
						<button
							type='button'
							className='text-xs font-semibold uppercase tracking-wide text-red-200 hover:text-red-100'
							onClick={() => setProviderError(null)}
						>
							Dismiss
						</button>
					</div>
				</div>
			)}
			{gameMode === 'ai' &&
				!gameStarted &&
				!isLoadingConfig &&
				(!aiConfig.enabled || !aiConfig.apiKey) && (
					<div className='text-center'>
						<div className='text-yellow-400 text-sm'>
							⚠ AI not configured - Configure API key in Profile to enable AI
							gameplay
						</div>
					</div>
				)}

			{gameMode === 'ai' && (
				<AIStatusPanel
					aiConfigured={aiConfig.enabled && !!aiConfig.apiKey}
					hasGameStarted={gameStarted}
					isAIThinking={gameState.isAiThinking}
					isAIPaused={isAiPaused}
					aiError={aiError}
					aiDebugMoves={aiDebugMoves}
					isDebugMode={isDebugMode}
					onRetry={retryAIMove}
				/>
			)}

			{gameMode === 'tutorial' && (
				<DemoSelector
					demos={logicDemos}
					currentDemo={currentDemo}
					onDemoChange={handleDemoChange}
				/>
			)}

			<div className='w-full max-w-4xl mx-auto space-y-6'>
				{gameMode === 'ai' ? (
					<AIGameInstructions
						providerName={aiConfig.provider}
						modelName={aiConfig.model}
						aiConfigured={aiConfig.enabled && !!aiConfig.apiKey}
					/>
				) : (
					<TutorialInstructions
						title={getCurrentDemo().title}
						explanation={getCurrentDemo().explanation}
						tips={[
							'"Control the center and develop your pieces early."',
							'"Castle early to protect your king and connect your rooks."',
							'"Look for forks, pins, and skewers to gain material advantages."',
							'"Always consider your opponent\'s best move before making yours."',
						]}
						tipsTitle='Chess Tips'
					/>
				)}
			</div>

			<div className='flex justify-center'>
				<GameStartOverlay active={!gameStarted && gameMode !== 'tutorial'}>
					<ChessBoard
						board={currentBoard}
						selectedSquare={gameState.selectedSquare}
						possibleMoves={gameState.possibleMoves}
						onSquareClick={handleSquareClick}
						highlightSquares={currentHighlightSquares}
					/>
				</GameStartOverlay>
			</div>

			<div className='w-full max-w-4xl mx-auto space-y-6'>
				{gameMode === 'ai' && (
					<>
						<GameControls
							hasGameStarted={gameStarted}
							isGameOver={isGameOver}
							aiConfigured={aiConfig.enabled && !!aiConfig.apiKey}
							isDebugMode={isDebugMode}
							canExport={gameStarted && !!gameExporterRef.current}
							onStartOrReset={handleStartOrReset}
							onReset={resetGame}
							onToggleDebug={() => setIsDebugMode(!isDebugMode)}
							onExport={() =>
								gameExporterRef.current?.exportAndDownload(gameState.status)
							}
						/>
						{showDebugWinButton && gameStarted && !isGameOver && (
							<div className='flex gap-2 justify-center text-xs'>
								<button
									onClick={triggerDebugWin}
									className='px-3 py-1 bg-green-600 hover:bg-green-700 text-white rounded'
									title='Debug: Win'
								>
									🏆 Win
								</button>
								<button
									onClick={triggerDebugLoss}
									className='px-3 py-1 bg-red-600 hover:bg-red-700 text-white rounded'
									title='Debug: Loss'
								>
									💀 Loss
								</button>
								<button
									onClick={triggerDebugDraw}
									className='px-3 py-1 bg-gray-600 hover:bg-gray-700 text-white rounded'
									title='Debug: Draw'
								>
									🤝 Draw
								</button>
								<span className='text-gray-400 self-center'>
									(Shift+D to toggle)
								</span>
							</div>
						)}
					</>
				)}
			</div>
		</GameScaffold>
	);
};

export default ChessGame;
