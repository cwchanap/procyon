import React, { useState, useCallback, useEffect, useRef } from 'react';
import type { ShogiGameState, ShogiPosition, ShogiPiece } from '../lib/shogi';
import {
	createInitialGameState,
	selectSquare,
	selectHandPiece,
	clearSelection,
	confirmPromotion,
	makeAIMove as makeShogiAIMove,
	SHOGI_BOARD_SIZE,
	SHOGI_FILES,
	SHOGI_RANKS,
} from '../lib/shogi';
import { createShogiAI, defaultAIConfig, loadAIConfig } from '../lib/ai';
import type { AIConfig, AIProvider } from '../lib/ai/types';
import ShogiBoard from './ShogiBoard';
import ShogiHand from './ShogiHand';
import { env } from '../lib/env';
import { getAuthHeaders } from '../lib/auth';
import GameScaffold from './game/GameScaffold';
import GameStartOverlay from './game/GameStartOverlay';
import AIDebugDialog, { type AIMove } from './ai/AIDebugDialog';
import AISettingsDialog from './ai/AISettingsDialog';

interface ShogiDemo {
	id: string;
	title: string;
	description: string;
	board: (ShogiPiece | null)[][];
	focusSquare?: ShogiPosition;
	highlightSquares?: ShogiPosition[];
	explanation: string;
}

type ShogiGameMode = 'tutorial' | 'ai';

const ShogiGame: React.FC = () => {
	const [gameMode, setGameMode] = useState<ShogiGameMode>('ai');
	const [gameStarted, setGameStarted] = useState(false);
	const [gameState, setGameState] = useState<ShogiGameState>(
		createInitialGameState
	);
	const [currentDemo, setCurrentDemo] = useState<string>('basic-movement');
	const [aiPlayer, setAIPlayer] = useState<'sente' | 'gote'>('gote');
	const [aiConfig, setAIConfig] = useState<AIConfig>({
		...defaultAIConfig,
		gameVariant: 'shogi',
	});
	const [aiService] = useState(() => createShogiAI(aiConfig));
	const [isAIThinking, setIsAIThinking] = useState(false);
	const [aiDebugMoves, setAIDebugMoves] = useState<AIMove[]>([]);
	const [isDebugMode, setIsDebugMode] = useState(false);
	const [_isLoadingConfig, setIsLoadingConfig] = useState(true);
	const [showDebugWinButton, setShowDebugWinButton] = useState(false);
	const [hasGameEnded, setHasGameEnded] = useState(false);

	// Refs for promotion modal focus management
	const modalRef = useRef<HTMLDivElement>(null);
	const previousActiveElementRef = useRef<HTMLElement | null>(null);

	// Helper function to convert move history to debug format
	const createAIMove = useCallback(
		(
			move: string,
			isAI: boolean,
			thinking?: string,
			error?: string
		): AIMove => {
			const moveNumber = gameState.moveHistory.length + 1;
			const player =
				gameState.currentPlayer === 'sente' ? 'Sente (先手)' : 'Gote (後手)';

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

	// Load AI config on client side only to avoid SSR hydration mismatch
	useEffect(() => {
		const loadConfig = async () => {
			const config = await loadAIConfig();
			setAIConfig({ ...config, gameVariant: 'shogi' });
			aiService.updateConfig({
				...config,
				gameVariant: 'shogi',
				debug: isDebugMode,
			});
			setIsLoadingConfig(false);
		};
		loadConfig();
	}, [aiService, isDebugMode]);

	// Trigger debug button with Shift+D (development only)
	useEffect(() => {
		if (!import.meta.env.DEV || typeof window === 'undefined') {
			return;
		}
		const handleKeyDown = (e: KeyboardEvent) => {
			if (e.shiftKey && e.key.toLowerCase() === 'd') {
				setShowDebugWinButton(prev => !prev);
			}
		};
		window.addEventListener('keydown', handleKeyDown);
		return () => window.removeEventListener('keydown', handleKeyDown);
	}, []);

	// Save play history when game ends
	useEffect(() => {
		const isGameOver =
			gameState.status === 'checkmate' || gameState.status === 'draw';

		if (isGameOver && gameStarted && gameMode === 'ai' && !hasGameEnded) {
			setHasGameEnded(true);

			const savePlayHistory = async () => {
				try {
					if (typeof window !== 'undefined') {
						const global = window as unknown as {
							__PROCYON_DEBUG_SHOGI_SAVE_COUNT__?: number;
						};
						global.__PROCYON_DEBUG_SHOGI_SAVE_COUNT__ =
							(global.__PROCYON_DEBUG_SHOGI_SAVE_COUNT__ ?? 0) + 1;
					}

					let status: 'win' | 'loss' | 'draw';
					if (gameState.status === 'checkmate') {
						status = gameState.currentPlayer === aiPlayer ? 'win' : 'loss';
					} else {
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

					const authHeaders = await getAuthHeaders();
					await fetch(`${env.PUBLIC_API_URL}/play-history`, {
						method: 'POST',
						headers: {
							'Content-Type': 'application/json',
							...authHeaders,
						},
						body: JSON.stringify({
							chessId: 'shogi',
							status,
							date: new Date().toISOString(),
							opponentLlmId,
						}),
					});
				} catch (error) {
					// eslint-disable-next-line no-console
					console.error('Failed to save Shogi play history:', error);
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
		aiPlayer,
		aiConfig.provider,
		aiConfig.model,
	]);

	const createCustomShogiBoard = useCallback(
		(setup: string): (ShogiPiece | null)[][] => {
			const board: (ShogiPiece | null)[][] = Array(SHOGI_BOARD_SIZE)
				.fill(null)
				.map(() => Array(SHOGI_BOARD_SIZE).fill(null));

			switch (setup) {
				case 'lance-moves':
					board[8][0] = { type: 'lance', color: 'sente' };
					board[6][0] = { type: 'pawn', color: 'gote' };
					board[4][0] = { type: 'pawn', color: 'gote' };
					break;
				case 'gold-silver':
					board[8][4] = { type: 'king', color: 'sente' };
					board[8][3] = { type: 'gold', color: 'sente' };
					board[8][5] = { type: 'silver', color: 'sente' };
					board[0][4] = { type: 'king', color: 'gote' };
					break;
				case 'promotion-zone':
					board[2][4] = { type: 'pawn', color: 'sente' };
					board[6][4] = { type: 'pawn', color: 'gote' };
					board[8][4] = { type: 'king', color: 'sente' };
					board[0][4] = { type: 'king', color: 'gote' };
					break;
				case 'knight-jump':
					board[8][1] = { type: 'knight', color: 'sente' };
					board[7][0] = { type: 'pawn', color: 'sente' };
					board[6][2] = { type: 'pawn', color: 'gote' };
					break;
				default:
					return createInitialGameState().board;
			}

			return board;
		},
		[]
	);

	const shogiDemos: ShogiDemo[] = [
		{
			id: 'basic-movement',
			title: 'Basic Piece Movement',
			description: 'Learn how different Shogi pieces move across the board',
			board: createInitialGameState().board,
			explanation:
				'Click on any piece to see its possible moves. Each piece has unique movement patterns in Shogi.',
		},
		{
			id: 'lance-moves',
			title: 'Lance Forward Movement',
			description:
				'Lances move forward any number of squares but cannot move backward',
			board: createCustomShogiBoard('lance-moves'),
			focusSquare: { row: 8, col: 0 },
			highlightSquares: [
				{ row: 7, col: 0 },
				{ row: 5, col: 0 },
				{ row: 3, col: 0 },
				{ row: 2, col: 0 },
				{ row: 1, col: 0 },
				{ row: 0, col: 0 },
			],
			explanation:
				'The lance can move forward any number of squares until blocked. It cannot move backward or sideways.',
		},
		{
			id: 'gold-silver',
			title: 'Gold vs Silver Movement',
			description:
				'Gold generals and silver generals have different movement patterns',
			board: createCustomShogiBoard('gold-silver'),
			focusSquare: { row: 8, col: 3 },
			highlightSquares: [
				{ row: 7, col: 2 },
				{ row: 7, col: 3 },
				{ row: 7, col: 4 },
				{ row: 8, col: 2 },
				{ row: 8, col: 4 },
			],
			explanation:
				'Gold generals move one square in six directions (not diagonally backward). Silver generals move diagonally and straight forward.',
		},
		{
			id: 'promotion-zone',
			title: 'Promotion Zones',
			description:
				"Pieces can promote when entering the opponent's camp (last 3 rows)",
			board: createCustomShogiBoard('promotion-zone'),
			focusSquare: { row: 2, col: 4 },
			highlightSquares: [
				{ row: 0, col: 0 },
				{ row: 0, col: 1 },
				{ row: 0, col: 2 },
				{ row: 0, col: 3 },
				{ row: 0, col: 4 },
				{ row: 0, col: 5 },
				{ row: 0, col: 6 },
				{ row: 0, col: 7 },
				{ row: 0, col: 8 },
				{ row: 1, col: 0 },
				{ row: 1, col: 1 },
				{ row: 1, col: 2 },
				{ row: 1, col: 3 },
				{ row: 1, col: 4 },
				{ row: 1, col: 5 },
				{ row: 1, col: 6 },
				{ row: 1, col: 7 },
				{ row: 1, col: 8 },
				{ row: 2, col: 0 },
				{ row: 2, col: 1 },
				{ row: 2, col: 2 },
				{ row: 2, col: 3 },
				{ row: 2, col: 5 },
				{ row: 2, col: 6 },
				{ row: 2, col: 7 },
				{ row: 2, col: 8 },
			],
			explanation:
				'The highlighted area is the promotion zone for Sente (bottom player). When pieces enter this zone, they can promote to become stronger.',
		},
		{
			id: 'knight-jump',
			title: 'Knight L-shaped Jump',
			description:
				'Knights jump in an L-shape: two squares forward, one square left or right',
			board: createCustomShogiBoard('knight-jump'),
			focusSquare: { row: 8, col: 1 },
			highlightSquares: [
				{ row: 6, col: 0 },
				{ row: 6, col: 2 },
			],
			explanation:
				'The knight jumps over pieces in an L-shape. It can only move two squares forward and one square sideways.',
		},
	];

	const getCurrentDemo = useCallback((): ShogiDemo => {
		return shogiDemos.find(demo => demo.id === currentDemo) || shogiDemos[0];
	}, [currentDemo, shogiDemos]);

	// AI setup and debug callback
	useEffect(() => {
		aiService.updateConfig({ ...aiConfig, debug: isDebugMode });

		// Set up debug callback
		if (isDebugMode) {
			aiService.setDebugCallback((type, message, _data) => {
				const thinking = type === 'ai-thinking' ? message : undefined;
				const error = type === 'ai-error' ? message : undefined;

				setAIDebugMoves(prev => [
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
	}, [aiService, aiConfig, createAIMove, isDebugMode]);

	// AI move handling
	useEffect(() => {
		if (
			gameMode === 'ai' &&
			gameStarted &&
			gameState.currentPlayer === aiPlayer &&
			gameState.status === 'playing' &&
			!isAIThinking &&
			!gameState.pendingPromotion
		) {
			const makeAIMove = async () => {
				setIsAIThinking(true);
				try {
					const aiResponse = await aiService.makeMove(gameState);
					if (aiResponse) {
						// Parse AI move from algebraic notation
						if (aiResponse.move.from === '*') {
							// Drop move
							const to = aiResponse.move.to;
							const pieceType = aiResponse.move.pieceType;

							if (!pieceType) {
								// Log detailed error with aiResponse for debugging
								console.error(
									'[Shogi AI] Invalid drop move: missing pieceType',
									{ aiResponse, move: aiResponse.move }
								);

								// Add to debug moves if debug mode is enabled
								if (isDebugMode) {
									setAIDebugMoves(prev => [
										...prev,
										createAIMove(
											`Invalid drop (missing pieceType): ${aiResponse.move.to}`,
											true,
											undefined,
											`Missing pieceType in AI response: ${JSON.stringify(
												aiResponse.move
											)}`
										),
									]);
								}
								// Explicit no-op: state remains unchanged, error is logged
							} else {
								// Apply drop move using makeShogiAIMove
								const moveResult = makeShogiAIMove(
									gameState,
									'*',
									to,
									false,
									pieceType
								);
								if (moveResult) {
									setGameState(moveResult);
								} else {
									// eslint-disable-next-line no-console
									console.warn(
										`Failed to apply AI drop move: pieceType=${pieceType}, to=${to}`
									);
								}
							}
						} else {
							// Regular move
							const fromPos = algebraicToPosition(aiResponse.move.from);
							const toPos = algebraicToPosition(aiResponse.move.to);

							// Apply move using shogi game logic
							const moveResult = selectSquare(gameState, fromPos);
							if (moveResult.selectedSquare) {
								const finalResult = selectSquare(moveResult, toPos);
								setGameState(finalResult);
							}
						}
					}
				} catch (_error) {
					// console.error('AI move failed:', error);
				} finally {
					setIsAIThinking(false);
				}
			};

			const timer = setTimeout(makeAIMove, 1000);
			return () => clearTimeout(timer);
		}
	}, [
		gameState,
		gameMode,
		gameStarted,
		aiPlayer,
		aiService,
		isAIThinking,
		isDebugMode,
		createAIMove,
	]);

	const algebraicToPosition = useCallback(
		(algebraic: string): ShogiPosition => {
			const file = algebraic[0];
			const rank = algebraic[1];
			return {
				col: SHOGI_FILES.indexOf(file),
				row: SHOGI_RANKS.indexOf(rank),
			};
		},
		[]
	);

	const handleSquareClick = useCallback(
		(position: ShogiPosition) => {
			if (gameMode === 'tutorial') {
				const demo = getCurrentDemo();
				const piece = demo.board[position.row]?.[position.col];

				if (piece) {
					// Simple tutorial moves for demonstration
					let possibleMoves: ShogiPosition[] = [];
					if (piece.type === 'pawn') {
						const direction = piece.color === 'sente' ? -1 : 1;
						const targetRow = position.row + direction;
						if (
							targetRow >= 0 &&
							targetRow < SHOGI_BOARD_SIZE &&
							!demo.board[targetRow]?.[position.col]
						) {
							possibleMoves = [{ row: targetRow, col: position.col }];
						}
					}
					setGameState(prev => ({
						...prev,
						board: demo.board,
						selectedSquare: position,
						possibleMoves,
					}));
				} else {
					setGameState(prev => ({
						...prev,
						board: demo.board,
						selectedSquare: null,
						possibleMoves: [],
					}));
				}
			} else if (gameMode === 'ai') {
				// AI mode - handle both human and AI moves
				const newGameState = selectSquare(gameState, position);
				setGameState(newGameState);
			}
		},
		[gameMode, gameState, getCurrentDemo, aiPlayer]
	);

	const handleHandPieceClick = useCallback(
		(piece: ShogiPiece) => {
			if (piece.color === gameState.currentPlayer) {
				const newGameState = selectHandPiece(gameState, piece);
				setGameState(newGameState);
			}
		},
		[gameState]
	);

	const handlePromotionChoice = useCallback(
		(promote: boolean) => {
			const newGameState = confirmPromotion(gameState, promote);
			if (newGameState) {
				setGameState(newGameState);
			}
		},
		[gameState]
	);

	// Focus management for promotion modal
	useEffect(() => {
		if (gameState.pendingPromotion && modalRef.current) {
			// Store the currently focused element
			previousActiveElementRef.current = document.activeElement as HTMLElement;

			// Move focus into the dialog
			modalRef.current.focus();

			// Focus trap: ensure Tab key cycles within the dialog
			const handleTabKey = (e: KeyboardEvent) => {
				if (!modalRef.current) return;

				const focusableElements =
					modalRef.current.querySelectorAll<HTMLElement>(
						'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
					);
				const firstElement = focusableElements[0];
				const lastElement = focusableElements[focusableElements.length - 1];

				if (e.key === 'Tab') {
					if (e.shiftKey) {
						// Shift+Tab
						if (document.activeElement === firstElement) {
							e.preventDefault();
							lastElement?.focus();
						}
					} else {
						// Tab
						if (document.activeElement === lastElement) {
							e.preventDefault();
							firstElement?.focus();
						}
					}
				}
			};

			document.addEventListener('keydown', handleTabKey);

			return () => {
				document.removeEventListener('keydown', handleTabKey);
				// Restore focus to the previously focused element when dialog closes
				previousActiveElementRef.current?.focus();
			};
		}
	}, [gameState.pendingPromotion]);

	// Keyboard event handler for promotion modal
	const handleModalKeyDown = useCallback(
		(e: React.KeyboardEvent) => {
			if (e.key === 'Enter') {
				e.preventDefault();
				// Check which element is focused - if Decline button is focused, decline promotion
				const activeElement = document.activeElement;
				const isDeclineButtonFocused =
					activeElement?.getAttribute('aria-label') === 'Decline promotion';
				handlePromotionChoice(!isDeclineButtonFocused);
			} else if (e.key === 'Escape') {
				e.preventDefault();
				handlePromotionChoice(false);
			}
		},
		[handlePromotionChoice]
	);

	const resetGame = useCallback(() => {
		setGameState(createInitialGameState());
		setGameStarted(false);
		setHasGameEnded(false);
	}, []);

	const triggerDebugWin = useCallback(() => {
		setGameState(prev => ({
			...prev,
			status: 'checkmate',
			currentPlayer: aiPlayer,
		}));
	}, [aiPlayer]);

	const triggerDebugLoss = useCallback(() => {
		const humanPlayer = aiPlayer === 'sente' ? 'gote' : 'sente';
		setGameState(prev => ({
			...prev,
			status: 'checkmate',
			currentPlayer: humanPlayer,
		}));
	}, [aiPlayer]);

	const triggerDebugDraw = useCallback(() => {
		setGameState(prev => ({
			...prev,
			status: 'draw',
		}));
	}, []);

	useEffect(() => {
		if (!import.meta.env.DEV || typeof window === 'undefined') {
			return;
		}
		const global = window as unknown as {
			__PROCYON_DEBUG_SHOGI_TRIGGER_WIN__?: () => void;
			__PROCYON_DEBUG_SHOGI_TRIGGER_PROMOTION__?: (promote: boolean) => void;
		};
		// Helper for tests and manual debugging to force a human win
		global.__PROCYON_DEBUG_SHOGI_TRIGGER_WIN__ = () => {
			setGameStarted(true);
			setHasGameEnded(false);
			setShowDebugWinButton(true);
			triggerDebugWin();
		};

		// Helper for tests to trigger promotion dialog
		global.__PROCYON_DEBUG_SHOGI_TRIGGER_PROMOTION__ = (_promote: boolean) => {
			setGameStarted(true);
			setHasGameEnded(false);
			setGameState(prev => ({
				...prev,
				pendingPromotion: {
					piece: { type: 'pawn', color: 'sente' },
					from: { row: 3, col: 8 },
					to: { row: 2, col: 8 },
				},
			}));
		};
	}, [triggerDebugWin]);

	// Calculate hasGameStarted before using it in callbacks
	const hasGameStarted = gameStarted || gameState.moveHistory.length > 0;

	useEffect(() => {
		if (!import.meta.env.DEV || typeof window === 'undefined') {
			return;
		}
		const global = window as unknown as {
			__PROCYON_DEBUG_SHOGI_STATE__?: {
				gameMode: ShogiGameMode;
				gameStarted: boolean;
				hasGameStarted: boolean;
				currentPlayer: ShogiGameState['currentPlayer'];
				status: ShogiGameState['status'];
				pendingPromotion: ShogiGameState['pendingPromotion'];
			};
		};
		global.__PROCYON_DEBUG_SHOGI_STATE__ = {
			gameMode,
			gameStarted,
			hasGameStarted,
			currentPlayer: gameState.currentPlayer,
			status: gameState.status,
			pendingPromotion: gameState.pendingPromotion,
		};
	}, [
		gameMode,
		gameStarted,
		hasGameStarted,
		gameState.currentPlayer,
		gameState.status,
		gameState.pendingPromotion,
	]);

	const handleStartOrReset = useCallback(() => {
		if (!hasGameStarted) {
			// Starting the game - ensure game state is properly initialized
			setGameState(createInitialGameState());
			setGameStarted(true);
			setHasGameEnded(false);
		} else {
			// Resetting the game
			resetGame();
		}
	}, [hasGameStarted, resetGame]);

	const toggleToMode = useCallback(
		(newMode: ShogiGameMode) => {
			setGameMode(newMode);
			setGameStarted(false);
			setIsAIThinking(false);
			setAIDebugMoves([]);
			setHasGameEnded(false);

			if (newMode === 'tutorial') {
				const demo = getCurrentDemo();
				setGameState({
					board: demo.board,
					currentPlayer: 'sente',
					status: 'playing',
					moveHistory: [],
					selectedSquare: null,
					possibleMoves: [],
					senteHand: [],
					goteHand: [],
					selectedHandPiece: null,
				});
			} else {
				setGameState(createInitialGameState());
			}
		},
		[getCurrentDemo]
	);

	const handleDemoChange = useCallback(
		(demoId: string) => {
			setCurrentDemo(demoId);
			const demo = shogiDemos.find(d => d.id === demoId);
			if (demo) {
				setGameState(prev => ({
					...prev,
					board: demo.board,
					selectedSquare: null,
					possibleMoves: [],
				}));
			}
		},
		[shogiDemos]
	);

	const _clearCurrentSelection = useCallback(() => {
		const newGameState = clearSelection(gameState);
		setGameState(newGameState);
	}, [gameState]);

	const getStatusMessage = (): string => {
		const playerName = gameState.currentPlayer === 'sente' ? '先手' : '後手';

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
				return `Checkmate! ${gameState.currentPlayer === 'sente' ? '後手' : '先手'} wins!`;
			case 'draw':
				return 'The game is a draw.';
			default:
				return gameMode === 'ai'
					? `${playerType} ${playerName} to move`
					: `${playerName} to move`;
		}
	};

	const isGameOver =
		gameState.status === 'checkmate' || gameState.status === 'draw';

	const currentBoard =
		gameMode === 'tutorial' ? getCurrentDemo().board : gameState.board;
	const currentHighlightSquares =
		gameMode === 'tutorial' ? getCurrentDemo().highlightSquares : undefined;

	const title =
		gameMode === 'tutorial' ? 'Shogi Logic & Tutorials' : '将棋 (Shogi)';
	const subtitle =
		gameMode === 'tutorial'
			? getCurrentDemo().description
			: hasGameStarted
				? getStatusMessage()
				: '';
	const showModeToggle = gameMode === 'tutorial' || !hasGameStarted;

	return (
		<GameScaffold
			title={title}
			subtitle={subtitle}
			titleGradientClassName='bg-gradient-to-r from-red-400 via-orange-400 to-yellow-400'
			subtitleClassName='text-orange-100'
			currentMode={gameMode}
			onModeChange={toggleToMode}
			showModeToggle={showModeToggle}
			inactiveModeClassName='text-orange-100 hover:bg-white hover:bg-opacity-20'
			aiSettingsButton={
				<AISettingsDialog
					aiPlayer={aiPlayer}
					onAIPlayerChange={player => setAIPlayer(player as 'sente' | 'gote')}
					provider={aiConfig.provider}
					model={aiConfig.model}
					onProviderChange={provider =>
						setAIConfig(prev => ({
							...prev,
							provider: provider as AIProvider,
						}))
					}
					onModelChange={model =>
						setAIConfig(prev => ({
							...prev,
							model,
						}))
					}
					aiPlayerOptions={[
						{ value: 'gote', label: 'AI plays Gote (後手)' },
						{ value: 'sente', label: 'AI plays Sente (先手)' },
					]}
					isActive={gameMode === 'ai'}
					onActivate={() => toggleToMode('ai')}
				/>
			}
		>
			{gameMode === 'ai' && (
				<div className='flex flex-col gap-4 max-w-2xl mx-auto'>
					<div className='text-center'>
						{isAIThinking && (
							<div className='flex items-center justify-center gap-2 text-cyan-200'>
								<div className='animate-spin w-4 h-4 border-2 border-cyan-400 border-t-transparent rounded-full'></div>
								AI is thinking...
							</div>
						)}

						<AIDebugDialog moves={aiDebugMoves} isVisible={isDebugMode} />
					</div>
				</div>
			)}

			{gameMode === 'tutorial' && (
				<div className='flex flex-wrap gap-3 justify-center max-w-4xl'>
					{shogiDemos.map(demoItem => (
						<button
							key={demoItem.id}
							onClick={() => handleDemoChange(demoItem.id)}
							className={`glass-effect px-4 py-2 rounded-xl text-sm font-medium transition-all duration-300 hover:scale-105 border border-white border-opacity-30 ${
								currentDemo === demoItem.id
									? 'bg-gradient-to-r from-orange-500 to-red-500 text-white shadow-lg'
									: 'text-orange-100 hover:bg-white hover:bg-opacity-20'
							}`}
						>
							{demoItem.title}
						</button>
					))}
				</div>
			)}

			<div className='w-full max-w-4xl mx-auto space-y-6'>
				{gameMode === 'ai' ? (
					<>
						<div className='text-sm text-orange-200 text-center max-w-2xl mx-auto space-y-2 bg-black bg-opacity-20 rounded-lg p-4 backdrop-blur-sm border border-white border-opacity-10'>
							<p className='flex items-center justify-center gap-2'>
								Click on a piece to select it, then click on a highlighted
								square to move.
							</p>
							<p className='flex items-center justify-center gap-2'>
								<span>✋</span>
								Click on pieces in your hand to drop them on the board.
							</p>
							<p className='flex items-center justify-center gap-2'>
								<span className='w-3 h-3 bg-green-400 rounded-full inline-block'></span>
								Possible moves
								<span className='mx-2'>•</span>
								<span className='w-3 h-3 border-2 border-red-500 rounded inline-block'></span>
								Captures
							</p>
							<p className='text-xs text-orange-300'>
								先手 (Sente) plays first and pieces point upward. 後手 (Gote)
								pieces are rotated and point downward.
							</p>
						</div>
					</>
				) : (
					<>
						<div className='glass-effect p-6 rounded-2xl border border-white border-opacity-20'>
							<h2 className='text-2xl font-bold text-white mb-3'>
								{getCurrentDemo().title}
							</h2>
							<div className='bg-black bg-opacity-30 p-4 rounded-xl border border-orange-500 border-opacity-30'>
								<p className='text-orange-200 leading-relaxed'>
									{getCurrentDemo().explanation}
								</p>
							</div>
						</div>

						<div className='glass-effect p-6 rounded-2xl border border-white border-opacity-20'>
							<h3 className='text-xl font-semibold text-white mb-3 flex items-center gap-2'>
								<span>🎯</span>
								How to Use This Demo
							</h3>
							<div className='space-y-3 text-orange-200'>
								<p className='flex items-center gap-3'>
									<span className='text-green-400'>•</span>
									Click on any piece to see its possible moves
								</p>
								<p className='flex items-center gap-3'>
									<span className='text-blue-400'>•</span>
									Green highlights show legal moves
								</p>
								<p className='flex items-center gap-3'>
									<span className='text-purple-400'>•</span>
									Red outlines indicate capture moves
								</p>
								<p className='flex items-center gap-3'>
									<span className='text-yellow-400'>•</span>
									Yellow rings show tutorial highlights
								</p>
							</div>
						</div>

						<div className='glass-effect p-6 rounded-2xl border border-white border-opacity-20'>
							<h3 className='text-xl font-semibold text-white mb-3 flex items-center gap-2'>
								<span>💡</span>
								Shogi Wisdom
							</h3>
							<div className='space-y-2 text-orange-200 text-sm'>
								<p>
									"Promotion is key - advance your pieces to gain strength in
									the enemy camp."
								</p>
								<p>
									"The drop rule makes Shogi unique - captured pieces join your
									army."
								</p>
								<p>
									"Protect your king while building attacking formations with
									gold and silver."
								</p>
								<p>
									"Lance and knight are powerful but vulnerable - support them
									well."
								</p>
							</div>
						</div>
					</>
				)}
			</div>

			{/* Promotion Dialog */}
			{gameState.pendingPromotion && (
				<div
					className='fixed inset-0 flex items-center justify-center z-50 bg-black bg-opacity-50'
					role='dialog'
					aria-modal='true'
					aria-labelledby='promotion-title'
				>
					<div
						ref={modalRef}
						tabIndex={-1}
						onKeyDown={handleModalKeyDown}
						className='glass-effect p-6 rounded-2xl border border-white border-opacity-30 max-w-sm mx-4'
					>
						<h3
							id='promotion-title'
							className='text-xl font-bold text-white mb-2 text-center'
						>
							成りますか？
						</h3>
						<p className='text-orange-200 text-center mb-4'>
							Promote your{' '}
							{gameState.pendingPromotion.piece.type.replace('_', ' ')}?
						</p>
						<div className='flex gap-4 justify-center'>
							<button
								onClick={() => handlePromotionChoice(true)}
								autoFocus
								aria-label='Promote piece'
								className='bg-gradient-to-r from-orange-500 to-red-500 hover:from-red-500 hover:to-orange-500 px-6 py-2 text-white font-semibold rounded-xl hover:scale-105 transition-all duration-300 shadow-lg'
							>
								✓ Promote
							</button>
							<button
								onClick={() => handlePromotionChoice(false)}
								aria-label='Decline promotion'
								className='glass-effect px-6 py-2 text-white font-semibold rounded-xl hover:bg-white hover:bg-opacity-20 hover:scale-105 transition-all duration-300 border border-white border-opacity-30'
							>
								✗ Decline
							</button>
						</div>
					</div>
				</div>
			)}

			{gameMode === 'ai' ? (
				<div className='flex justify-center'>
					<GameStartOverlay active={!hasGameStarted && gameMode !== 'tutorial'}>
						<div className='flex gap-8 items-start'>
							<div className='flex flex-col gap-4'>
								<ShogiHand
									pieces={gameState.goteHand}
									color='gote'
									selectedPiece={gameState.selectedHandPiece}
									onPieceClick={
										hasGameStarted || gameMode === 'tutorial'
											? handleHandPieceClick
											: () => {}
									}
								/>
							</div>

							<ShogiBoard
								board={currentBoard}
								selectedSquare={gameState.selectedSquare}
								possibleMoves={gameState.possibleMoves}
								onSquareClick={
									hasGameStarted || gameMode === 'tutorial'
										? handleSquareClick
										: () => {}
								}
								highlightSquares={currentHighlightSquares}
							/>

							<div className='flex flex-col gap-4'>
								<ShogiHand
									pieces={gameState.senteHand}
									color='sente'
									selectedPiece={gameState.selectedHandPiece}
									onPieceClick={
										hasGameStarted || gameMode === 'tutorial'
											? handleHandPieceClick
											: () => {}
									}
								/>
							</div>
						</div>
					</GameStartOverlay>
				</div>
			) : (
				<div className='flex justify-center'>
					<ShogiBoard
						board={currentBoard}
						selectedSquare={gameState.selectedSquare}
						possibleMoves={gameState.possibleMoves}
						onSquareClick={handleSquareClick}
						highlightSquares={currentHighlightSquares}
					/>
				</div>
			)}

			<div className='w-full max-w-4xl mx-auto space-y-6'>
				{gameMode === 'ai' && (
					<>
						<div className='flex gap-4 justify-center'>
							<button
								onClick={handleStartOrReset}
								className='glass-effect px-6 py-3 text-white font-semibold rounded-xl hover:bg-white hover:bg-opacity-20 hover:scale-105 transition-all duration-300 border border-white border-opacity-30'
							>
								{hasGameStarted ? '🆕 New Game' : '▶️ Start'}
							</button>

							{aiConfig.enabled && aiConfig.apiKey && (
								<button
									onClick={() => setIsDebugMode(!isDebugMode)}
									className={`glass-effect px-4 py-2 text-xs font-medium rounded-lg hover:scale-105 transition-all duration-300 border border-opacity-30 ${
										isDebugMode
											? 'bg-yellow-500 bg-opacity-20 text-yellow-300 border-yellow-400'
											: 'text-gray-300 border-gray-400 hover:bg-white hover:bg-opacity-10'
									}`}
								>
									🐛 {isDebugMode ? 'Debug ON' : 'Debug Mode'}
								</button>
							)}

							{isGameOver && (
								<button
									onClick={resetGame}
									className='bg-gradient-to-r from-orange-500 to-red-500 hover:from-red-500 hover:to-orange-500 px-6 py-3 text-white font-semibold rounded-xl hover:scale-105 transition-all duration-300 shadow-lg'
								>
									🎮 Play Again
								</button>
							)}
						</div>
						{import.meta.env.DEV &&
							showDebugWinButton &&
							hasGameStarted &&
							!isGameOver && (
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

export default ShogiGame;
