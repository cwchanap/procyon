import React, { useState, useCallback, useEffect, useRef } from 'react';
import type { ShogiGameState, ShogiPosition, ShogiPiece } from '../lib/shogi';
import {
	createInitialGameState,
	selectSquare,
	selectHandPiece,
	confirmPromotion,
	makeAIMove as makeShogiAIMove,
	SHOGI_BOARD_SIZE,
} from '../lib/shogi';
import { createShogiAI } from '../lib/ai';
import { rehydrate as rehydrateAIConfig } from '../lib/ai/ai-config-store';
import {
	usePlayHistory,
	useAIConfigHydration,
	useAiMoveGenerationToken,
	useGameIdentityReset,
	useGameDebugOutcomes,
} from '../hooks';
import type { AIMove } from './ai/AIDebugDialog';
import ShogiBoard from './ShogiBoard';
import ShogiHand from './ShogiHand';
import BoardSidePanel, { type Mode } from './game/BoardSidePanel';
import BoardColumn from './game/BoardColumn';
import GamePlayLayout from './game/GamePlayLayout';
import GameStartOverlay from './game/GameStartOverlay';
import AIStatusPanel from './game/AIStatusPanel';
import GameControls from './game/GameControls';
import DemoSelector from './game/DemoSelector';
import TutorialInstructions from './game/TutorialInstructions';
import AIGameInstructions from './game/AIGameInstructions';
import { useAuth } from '../lib/auth';

interface ShogiDemo {
	id: string;
	title: string;
	description: string;
	board: (ShogiPiece | null)[][];
	focusSquare?: ShogiPosition;
	highlightSquares?: ShogiPosition[];
	explanation: string;
}

type ShogiGameMode = Mode;

const ShogiGame: React.FC = () => {
	const [gameMode, setGameMode] = useState<ShogiGameMode>('ai');
	const [gameStarted, setGameStarted] = useState(false);
	const [gameState, setGameState] = useState<ShogiGameState>(
		createInitialGameState
	);
	const [currentDemo, setCurrentDemo] = useState<string>('basic-movement');
	const [aiPlayer, setAIPlayer] = useState<'sente' | 'gote'>('gote');
	const {
		user,
		isAuthenticated,
		loading: authLoading,
		revalidated,
	} = useAuth();
	const {
		config: aiConfig,
		hydrateError,
		isRehydrating: aiConfigRehydrating,
		configPending,
		aiStarting,
	} = useAIConfigHydration({
		isAuthenticated,
		loading: authLoading,
		revalidated,
		isAiMode: gameMode === 'ai',
	});
	const [aiService] = useState(() => createShogiAI(aiConfig));
	const [isAIThinking, setIsAIThinking] = useState(false);
	const [aiDebugMoves, setAIDebugMoves] = useState<AIMove[]>([]);
	const [isDebugMode, setIsDebugMode] = useState(false);
	const [errorMsg, setErrorMsg] = useState<string | null>(null);

	// Monotonic generation token for in-flight AI moves. Invalidated on
	// logout / identity change / mode switch / reset so a makeAIMove
	// callback still awaiting an AI response can detect it is stale and
	// skip its setGameState call — otherwise the resolved promise would
	// resurrect the pre-reset board position.
	const { genRef, invalidate, isStale } = useAiMoveGenerationToken();

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

	const getWinnerColor = useCallback(
		() => (gameState.currentPlayer === 'sente' ? 'gote' : 'sente'),
		[gameState.currentPlayer]
	);

	usePlayHistory({
		gameVariant: 'shogi',
		gameStatus: gameState.status,
		aiPlayer,
		aiConfig,
		moveCount: gameState.moveHistory.length,
		getWinnerColor,
		enabled: gameMode === 'ai' && gameStarted,
		isAuthenticated,
		userId: user?.id,
		debugVariantKey: 'SHOGI',
	});

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
			aiService.setDebugCallback((type, message, data) => {
				// Skip if a reset/account-switch invalidated the in-flight
				// request that triggered this callback. Each makeMove call
				// stamps its gen into data.requestId, so a late callback
				// from a superseded request sees a stale requestId and
				// bails instead of appending to the new game's history.
				if (isStale(data?.requestId as number | undefined)) return;
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
	}, [aiService, aiConfig, createAIMove, isDebugMode, isStale]);

	// AI move handling
	useEffect(() => {
		if (
			gameMode === 'ai' &&
			gameStarted &&
			!configPending &&
			gameState.currentPlayer === aiPlayer &&
			(gameState.status === 'playing' || gameState.status === 'check') &&
			!isAIThinking &&
			!gameState.pendingPromotion
		) {
			const makeAIMove = async () => {
				const gen = genRef.current;
				setIsAIThinking(true);
				try {
					const aiResponse = await aiService.makeMove(gameState, gen);
					if (gen !== genRef.current) return;
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
								// Validate pieceType is a valid Shogi drop piece type
								const validDropPieceTypes = [
									'pawn',
									'lance',
									'knight',
									'silver',
									'gold',
									'bishop',
									'rook',
								] as const;
								type ValidDropPieceType = (typeof validDropPieceTypes)[number];

								if (
									!validDropPieceTypes.includes(pieceType as ValidDropPieceType)
								) {
									// Log detailed error with aiResponse for debugging
									console.error(
										'[Shogi AI] Invalid drop move: invalid pieceType',
										{ aiResponse, move: aiResponse.move }
									);

									// Add to debug moves if debug mode is enabled
									if (isDebugMode) {
										setAIDebugMoves(prev => [
											...prev,
											createAIMove(
												`Invalid drop (invalid pieceType): ${aiResponse.move.to}`,
												true,
												undefined,
												`Invalid pieceType in AI response: ${JSON.stringify(
													aiResponse.move
												)}`
											),
										]);
									}
								} else {
									// Apply drop move using makeShogiAIMove
									const moveResult = makeShogiAIMove(
										gameState,
										'*',
										to,
										false,
										pieceType as ValidDropPieceType
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
							}
						} else {
							// Regular move
							const promote = aiResponse.move.promote ?? false;

							// Apply move directly using makeShogiAIMove (bypasses pendingPromotion UI)
							const moveResult = makeShogiAIMove(
								gameState,
								aiResponse.move.from,
								aiResponse.move.to,
								promote
							);

							if (moveResult) {
								setGameState(moveResult);
							} else {
								// eslint-disable-next-line no-console
								console.warn(
									`Failed to apply AI move: from=${aiResponse.move.from}, to=${aiResponse.move.to}, promote=${promote}`
								);
							}
						}
					}
				} catch (_error) {
					// console.error('AI move failed:', error);
				} finally {
					if (gen === genRef.current) {
						setIsAIThinking(false);
					}
				}
			};

			const timer = setTimeout(makeAIMove, 1000);
			return () => clearTimeout(timer);
		}
	}, [
		gameState,
		gameMode,
		gameStarted,
		configPending,
		aiPlayer,
		aiService,
		isAIThinking,
		isDebugMode,
		createAIMove,
		genRef,
	]);

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
		[gameMode, gameState, getCurrentDemo]
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

			// Only move focus if no element inside the modal is already focused
			// This prevents stealing focus from elements with autoFocus
			if (
				!modalRef.current.contains(document.activeElement) ||
				document.activeElement === document.body
			) {
				const promoteButton = modalRef.current.querySelector<HTMLButtonElement>(
					'[aria-label="Promote piece"]'
				);
				if (promoteButton) {
					promoteButton.focus();
				}
			}

			// Handle Enter and Escape keys at document level for reliable keyboard handling
			const handleKeyDown = (e: KeyboardEvent) => {
				if (e.key === 'Enter' || e.key === 'Escape') {
					e.preventDefault();
					const activeElement = document.activeElement;
					const isDeclineButtonFocused =
						activeElement?.getAttribute('aria-label') === 'Decline promotion';
					if (e.key === 'Escape') {
						handlePromotionChoice(false);
					} else {
						// Enter key - promote unless decline button is focused
						handlePromotionChoice(!isDeclineButtonFocused);
					}
				}

				// Focus trap: ensure Tab key cycles within the dialog
				if (e.key === 'Tab' && modalRef.current) {
					const focusableElements =
						modalRef.current.querySelectorAll<HTMLElement>(
							'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
						);
					const firstElement = focusableElements[0];
					const lastElement = focusableElements[focusableElements.length - 1];

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

			document.addEventListener('keydown', handleKeyDown);

			return () => {
				document.removeEventListener('keydown', handleKeyDown);
				// Restore focus to the previously focused element when dialog closes
				previousActiveElementRef.current?.focus();
			};
		}
	}, [gameState.pendingPromotion, handlePromotionChoice]);

	const handleResetGame = useCallback(() => {
		// Invalidate any in-flight makeAIMove callback so it cannot
		// apply a stale setGameState after the reset. Clear isAIThinking
		// because the callback's finally-block skips on gen mismatch.
		invalidate();
		setIsAIThinking(false);
		setGameState(createInitialGameState());
		setGameStarted(false);
		// Clear AI UI state so a logout or cross-account identity change
		// (handled by useGameIdentityReset) does not leave the previous
		// session's error message or debug move history visible.
		setErrorMsg(null);
		setAIDebugMoves([]);
	}, [invalidate]);

	// Reset local game state when authentication is lost (logout) OR when
	// the authenticated user identity changes (account switch in another
	// tab). The hook invalidates the AI move generation token so any
	// in-flight makeAIMove callback skips its setGameState calls.
	useGameIdentityReset({
		isAuthenticated,
		userId: user?.id,
		invalidate,
		onReset: () => {
			handleResetGame();
			setAIPlayer('gote');
		},
	});

	const {
		triggerDebugWin,
		triggerDebugLoss,
		triggerDebugDraw,
		showDebugWinButton,
	} = useGameDebugOutcomes<'sente' | 'gote'>({
		aiPlayer,
		getHumanPlayer: ai => (ai === 'sente' ? 'gote' : 'sente'),
		setOutcome: patch =>
			setGameState(prev => ({
				...prev,
				status: patch.status as ShogiGameState['status'],
				...(patch.currentPlayer !== undefined
					? { currentPlayer: patch.currentPlayer }
					: {}),
			})),
		debugVariantKey: 'SHOGI',
		winStatus: 'checkmate',
		drawStatus: 'draw',
		onPrepareTriggerWin: () => {
			setGameMode('ai');
			setGameStarted(true);
		},
	});

	// Shogi-only promotion dialog trigger for E2E / manual debugging.
	useEffect(() => {
		if (!import.meta.env.DEV || typeof window === 'undefined') {
			return;
		}
		const global = window as unknown as {
			__PROCYON_DEBUG_SHOGI_TRIGGER_PROMOTION__?: () => void;
		};
		global.__PROCYON_DEBUG_SHOGI_TRIGGER_PROMOTION__ = () => {
			setGameStarted(true);
			setGameState(prev => ({
				...prev,
				pendingPromotion: {
					piece: { type: 'pawn', color: 'sente' },
					from: { row: 3, col: 8 },
					to: { row: 2, col: 8 },
				},
			}));
		};
		return () => {
			delete global.__PROCYON_DEBUG_SHOGI_TRIGGER_PROMOTION__;
		};
	}, []);

	// Calculate hasGameStarted before using it in callbacks
	const hasGameStarted = gameStarted || gameState.moveHistory.length > 0;

	// Local debug state mirror for E2E tests (not covered by shared hooks).
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

	const isGameOver =
		gameState.status === 'checkmate' || gameState.status === 'draw';

	// Lock AI-side select while a game is in progress (started and not over).
	const gameActive = hasGameStarted && !isGameOver;

	const handleStartOrReset = useCallback(() => {
		if (!hasGameStarted) {
			if (aiStarting) return; // config still loading; Start is disabled
			// Starting the game - ensure game state is properly initialized
			setGameState(createInitialGameState());
			setGameStarted(true);
		} else {
			// Resetting the game
			handleResetGame();
		}
	}, [hasGameStarted, handleResetGame, aiStarting]);

	const toggleToMode = useCallback(
		(newMode: ShogiGameMode) => {
			// Invalidate any in-flight makeAIMove callback so a stale
			// AI response from the previous mode cannot overwrite the newly
			// selected game state.
			invalidate();
			setGameMode(newMode);
			setGameStarted(false);
			setIsAIThinking(false);
			setAIDebugMoves([]);
			setErrorMsg(null);

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
		[getCurrentDemo, invalidate]
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

	const handsDisabled = !hasGameStarted && gameMode !== 'tutorial';

	// Custom board column: always stack gote hand → board → sente hand so the
	// column stays within GamePageLayout's max-w-6xl at 1024/1280 (hands are
	// w-48 each and would overflow if they flanked the 9×9 board). Side panel
	// is never placed in this column (GamePlayLayout stacks it until xl).
	const boardWithHands =
		gameMode === 'ai' ? (
			<div className='flex flex-col items-center justify-center gap-4'>
				<ShogiHand
					pieces={gameState.goteHand}
					color='gote'
					selectedPiece={gameState.selectedHandPiece}
					onPieceClick={handleHandPieceClick}
					disabled={handsDisabled}
				/>
				<ShogiBoard
					board={currentBoard}
					selectedSquare={gameState.selectedSquare}
					possibleMoves={gameState.possibleMoves}
					onSquareClick={hasGameStarted ? handleSquareClick : () => {}}
					highlightSquares={currentHighlightSquares}
				/>
				<ShogiHand
					pieces={gameState.senteHand}
					color='sente'
					selectedPiece={gameState.selectedHandPiece}
					onPieceClick={handleHandPieceClick}
					disabled={handsDisabled}
				/>
			</div>
		) : (
			<ShogiBoard
				board={currentBoard}
				selectedSquare={gameState.selectedSquare}
				possibleMoves={gameState.possibleMoves}
				onSquareClick={handleSquareClick}
				highlightSquares={currentHighlightSquares}
			/>
		);

	const errorBanner =
		errorMsg || (gameMode === 'ai' && hydrateError) ? (
			<div className='w-full max-w-4xl mx-auto mb-6 space-y-3'>
				{errorMsg && (
					<div
						className='flex items-start justify-between gap-4 rounded-lg border border-shogi/40 bg-shogi/10 px-4 py-3 text-ivory'
						role='alert'
					>
						<p className='text-sm'>{errorMsg}</p>
						<button
							type='button'
							className='text-xs font-semibold uppercase tracking-wide text-destructive hover:text-ivory'
							onClick={() => setErrorMsg(null)}
						>
							Dismiss
						</button>
					</div>
				)}
				{gameMode === 'ai' && hydrateError && (
					<div
						className='flex items-center justify-between gap-4 rounded-lg border border-shogi/40 bg-shogi/10 px-4 py-3 text-ivory'
						role='alert'
					>
						<p className='text-sm'>
							We couldn&rsquo;t load your AI settings. Check your connection and
							try again.
						</p>
						<button
							type='button'
							className='text-xs font-semibold uppercase tracking-wide text-brass hover:underline'
							onClick={() => void rehydrateAIConfig()}
							disabled={aiConfigRehydrating}
						>
							{aiConfigRehydrating ? 'Retrying…' : 'Retry'}
						</button>
					</div>
				)}
			</div>
		) : undefined;

	return (
		<>
			<GamePlayLayout
				title={title}
				subtitle={subtitle}
				banner={errorBanner}
				sideBySideFrom='xl'
				boardColumn={
					<BoardColumn
						board={
							<GameStartOverlay
								active={!hasGameStarted && gameMode !== 'tutorial'}
							>
								{boardWithHands}
							</GameStartOverlay>
						}
						controls={
							gameMode === 'ai' ? (
								<GameControls
									hasGameStarted={hasGameStarted}
									isGameOver={isGameOver}
									aiConfigured={aiConfig.enabled && !!aiConfig.apiKey}
									startDisabled={aiStarting}
									isDebugMode={isDebugMode}
									canExport={false}
									onStartOrReset={handleStartOrReset}
									onReset={handleResetGame}
									onToggleDebug={() => setIsDebugMode(!isDebugMode)}
									onExport={() => {}}
								/>
							) : undefined
						}
						debugTools={
							import.meta.env.DEV &&
							showDebugWinButton &&
							hasGameStarted &&
							!isGameOver ? (
								<div className='flex gap-2 justify-center text-xs'>
									<button
										onClick={triggerDebugWin}
										className='px-3 py-1 bg-jungle hover:opacity-90 text-ink-900 rounded'
										title='Debug: Win'
									>
										🏆 Win
									</button>
									<button
										onClick={triggerDebugLoss}
										className='px-3 py-1 bg-destructive hover:opacity-90 text-ivory rounded'
										title='Debug: Loss'
									>
										💀 Loss
									</button>
									<button
										onClick={triggerDebugDraw}
										className='px-3 py-1 bg-ink-600 hover:bg-ink-700 text-ivory rounded'
										title='Debug: Draw'
									>
										🤝 Draw
									</button>
									<span className='text-ivory-dim self-center'>
										(Shift+D to toggle)
									</span>
								</div>
							) : undefined
						}
					/>
				}
				sidePanel={
					<BoardSidePanel gameMode={gameMode} onModeChange={toggleToMode}>
						{gameMode === 'ai' ? (
							<>
								<div className='flex items-center justify-between gap-3'>
									<label
										htmlFor='shogi-ai-side'
										className='text-sm font-medium text-ivory-dim'
									>
										AI plays
									</label>
									<select
										id='shogi-ai-side'
										value={aiPlayer}
										onChange={e =>
											setAIPlayer(e.target.value as 'sente' | 'gote')
										}
										disabled={gameActive}
										className='rounded-md border border-line bg-ink-800 px-2 py-1.5 text-sm text-ivory focus:outline-none focus-visible:ring-2 focus-visible:ring-brass disabled:cursor-not-allowed disabled:opacity-50'
									>
										<option value='gote'>AI plays Gote (後手)</option>
										<option value='sente'>AI plays Sente (先手)</option>
									</select>
								</div>
								<AIStatusPanel
									aiConfigured={aiConfig.enabled && !!aiConfig.apiKey}
									hasGameStarted={hasGameStarted}
									isAIThinking={isAIThinking}
									isAIPaused={false}
									aiError={null}
									aiDebugMoves={aiDebugMoves}
									isDebugMode={isDebugMode}
									onRetry={() => {}}
								/>
								<AIGameInstructions
									variant='shogi'
									providerName={aiConfig.provider}
									modelName={aiConfig.model}
									aiConfigured={aiConfig.enabled && !!aiConfig.apiKey}
								>
									<p className='flex items-center justify-center gap-2'>
										<span>✋</span>
										Click on pieces in your hand to drop them on the board.
									</p>
									<p className='text-xs text-ivory-dim'>
										先手 (Sente) plays first and pieces point upward. 後手
										(Gote) pieces are rotated and point downward.
									</p>
								</AIGameInstructions>
							</>
						) : (
							<>
								<DemoSelector
									demos={shogiDemos}
									currentDemo={currentDemo}
									onDemoChange={handleDemoChange}
								/>
								<TutorialInstructions
									title={getCurrentDemo().title}
									explanation={getCurrentDemo().explanation}
									tips={[
										'"Promotion is key - advance your pieces to gain strength in the enemy camp."',
										'"The drop rule makes Shogi unique - captured pieces join your army."',
										'"Protect your king while building attacking formations with gold and silver."',
										'"Lance and knight are powerful but vulnerable - support them well."',
									]}
									tipsTitle='Shogi Wisdom'
								/>
							</>
						)}
					</BoardSidePanel>
				}
			/>

			{/* Promotion Dialog */}
			{gameState.pendingPromotion && (
				<div className='fixed inset-0 flex items-center justify-center z-50 bg-ink-900/50'>
					<div
						ref={modalRef}
						tabIndex={-1}
						role='dialog'
						aria-modal='true'
						aria-labelledby='promotion-title'
						className='bg-ink-700 border border-line p-6 rounded-lg max-w-sm mx-4'
					>
						<h3
							id='promotion-title'
							className='text-xl font-bold text-ivory mb-2 text-center'
						>
							成りますか？
						</h3>
						<p className='text-ivory-dim text-center mb-4'>
							Promote your{' '}
							{gameState.pendingPromotion.piece.type.replace('_', ' ')}?
						</p>
						<div className='flex gap-4 justify-center'>
							<button
								type='button'
								onClick={() => handlePromotionChoice(true)}
								autoFocus
								aria-label='Promote piece'
								className='bg-shogi text-ivory px-6 py-2 font-semibold rounded-lg transition-colors duration-150 shadow-lg hover:bg-shogi-light'
							>
								✓ Promote
							</button>
							<button
								type='button'
								onClick={() => handlePromotionChoice(false)}
								aria-label='Decline promotion'
								className='bg-ink-600 border border-line px-6 py-2 text-ivory font-semibold rounded-lg hover:bg-ink-700 transition-colors duration-150'
							>
								✗ Decline
							</button>
						</div>
					</div>
				</div>
			)}
		</>
	);
};

export default ShogiGame;
