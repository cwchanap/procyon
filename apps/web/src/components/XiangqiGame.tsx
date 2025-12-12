import React, { useState, useCallback, useEffect } from 'react';
import type {
	XiangqiGameState,
	XiangqiPosition,
	XiangqiPiece,
} from '../lib/xiangqi/types';
import {
	createInitialXiangqiGameState,
	selectSquare,
	undoMove,
	resetGame,
} from '../lib/xiangqi/game';
import { getPossibleMoves } from '../lib/xiangqi/moves';
import { createInitialXiangqiBoard, getPieceAt } from '../lib/xiangqi/board';
import { createXiangqiAI, defaultAIConfig, loadAIConfig } from '../lib/ai';
import { env } from '../lib/env';
import type { AIConfig, AIProvider } from '../lib/ai/types';
import { AI_PROVIDERS } from '../lib/ai/types';
import XiangqiBoard from './XiangqiBoard';
import GameScaffold from './game/GameScaffold';
import GameStartOverlay from './game/GameStartOverlay';
import AIStatusPanel from './game/AIStatusPanel';
import GameControls from './game/GameControls';
import DemoSelector from './game/DemoSelector';
import TutorialInstructions from './game/TutorialInstructions';
import AIGameInstructions from './game/AIGameInstructions';
import AISettingsDialog from './ai/AISettingsDialog';
import type { AIMove } from './ai/AIDebugDialog';
import { useAuth, getAuthHeaders } from '../lib/auth';

interface XiangqiDemo {
	id: string;
	title: string;
	description: string;
	board: (XiangqiPiece | null)[][];
	focusSquare?: XiangqiPosition;
	highlightSquares?: XiangqiPosition[];
	explanation: string;
}

type XiangqiGameMode = 'tutorial' | 'ai';

const XiangqiGame: React.FC = () => {
	const [gameMode, setGameMode] = useState<XiangqiGameMode>('ai');
	const [gameStarted, setGameStarted] = useState(false);
	const [gameState, setGameState] = useState<XiangqiGameState>(
		createInitialXiangqiGameState
	);
	const [currentDemo, setCurrentDemo] = useState<string>('basic-movement');
	const [aiPlayer, setAIPlayer] = useState<'red' | 'black'>('black');
	const [aiConfig, setAIConfig] = useState<AIConfig>({
		...defaultAIConfig,
		gameVariant: 'xiangqi',
	});
	const [aiService] = useState(() => createXiangqiAI(aiConfig));
	const [isAIThinking, setIsAIThinking] = useState(false);
	const [aiDebugMoves, setAIDebugMoves] = useState<AIMove[]>([]);
	const [isDebugMode, setIsDebugMode] = useState(false);
	const [_isLoadingConfig, setIsLoadingConfig] = useState(true);
	const [errorMsg, setErrorMsg] = useState<string | null>(null);
	const [showDebugWinButton, setShowDebugWinButton] = useState(false);
	const [hasGameEnded, setHasGameEnded] = useState(false);
	const { isAuthenticated } = useAuth();

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
				gameState.currentPlayer === 'red' ? 'Red (红方)' : 'Black (黑方)';

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
			setAIConfig({ ...config, gameVariant: 'xiangqi' });
			aiService.updateConfig({
				...config,
				gameVariant: 'xiangqi',
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
					if (typeof window !== 'undefined') {
						const global = window as unknown as {
							__PROCYON_DEBUG_XIANGQI_SAVE_COUNT__?: number;
						};
						global.__PROCYON_DEBUG_XIANGQI_SAVE_COUNT__ =
							(global.__PROCYON_DEBUG_XIANGQI_SAVE_COUNT__ ?? 0) + 1;
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
							chessId: 'xiangqi',
							status,
							date: new Date().toISOString(),
							opponentLlmId,
						}),
					});
				} catch (error) {
					console.error('Failed to save Xiangqi play history:', error);
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
		isAuthenticated,
	]);

	const createCustomXiangqiBoard = useCallback(
		(setup: string): (XiangqiPiece | null)[][] => {
			const board: (XiangqiPiece | null)[][] = Array(10)
				.fill(null)
				.map(() => Array(9).fill(null));

			switch (setup) {
				case 'horse-moves':
					board[5][4] = { type: 'horse', color: 'red' };
					board[3][2] = { type: 'soldier', color: 'black' };
					board[7][6] = { type: 'soldier', color: 'black' };
					break;
				case 'cannon-demo':
					board[9][4] = { type: 'king', color: 'red' };
					board[7][4] = { type: 'cannon', color: 'red' };
					board[5][4] = { type: 'soldier', color: 'black' };
					board[3][4] = { type: 'king', color: 'black' };
					break;
				case 'palace-demo':
					board[9][4] = { type: 'king', color: 'red' };
					board[9][3] = { type: 'advisor', color: 'red' };
					board[9][5] = { type: 'advisor', color: 'red' };
					board[0][4] = { type: 'king', color: 'black' };
					break;
				case 'river-crossing':
					board[6][0] = { type: 'soldier', color: 'red' };
					board[3][0] = { type: 'soldier', color: 'red' };
					board[9][4] = { type: 'king', color: 'red' };
					board[0][4] = { type: 'king', color: 'black' };
					break;
				default:
					return createInitialXiangqiBoard();
			}

			return board;
		},
		[]
	);

	const xiangqiDemos: XiangqiDemo[] = [
		{
			id: 'basic-movement',
			title: 'Basic Piece Movement',
			description: 'Learn how different Xiangqi pieces move across the board',
			board: createInitialXiangqiBoard(),
			explanation:
				'Click on any piece to see its possible moves. Each piece has unique movement patterns specific to Xiangqi.',
		},
		{
			id: 'horse-moves',
			title: 'Horse Movement Pattern',
			description:
				'The horse moves in an L-shape but can be blocked by adjacent pieces',
			board: createCustomXiangqiBoard('horse-moves'),
			focusSquare: { row: 5, col: 4 },
			highlightSquares: [
				{ row: 3, col: 3 },
				{ row: 3, col: 5 },
				{ row: 4, col: 2 },
				{ row: 4, col: 6 },
				{ row: 6, col: 2 },
				{ row: 6, col: 6 },
				{ row: 7, col: 3 },
				{ row: 7, col: 5 },
			],
			explanation:
				'The horse moves like in chess but can be blocked by pieces on adjacent points. This is called "hobbling the horse".',
		},
		{
			id: 'cannon-demo',
			title: 'Cannon Special Attack',
			description:
				'Cannons jump over pieces to capture, but move freely when not capturing',
			board: createCustomXiangqiBoard('cannon-demo'),
			focusSquare: { row: 7, col: 4 },
			explanation:
				'The cannon needs exactly one piece to jump over when capturing. It can capture the black king by jumping over the soldier.',
		},
		{
			id: 'palace-demo',
			title: 'Palace and Advisor Rules',
			description:
				'Kings and advisors are confined to the palace (nine-point fortress)',
			board: createCustomXiangqiBoard('palace-demo'),
			focusSquare: { row: 9, col: 4 },
			highlightSquares: [
				{ row: 9, col: 3 },
				{ row: 9, col: 5 },
				{ row: 8, col: 3 },
				{ row: 8, col: 4 },
				{ row: 8, col: 5 },
				{ row: 7, col: 3 },
				{ row: 7, col: 4 },
				{ row: 7, col: 5 },
			],
			explanation:
				'The king and advisors cannot leave the palace. Advisors move diagonally one point within the palace.',
		},
		{
			id: 'river-crossing',
			title: 'River and Soldier Promotion',
			description: 'Soldiers gain lateral movement after crossing the river',
			board: createCustomXiangqiBoard('river-crossing'),
			focusSquare: { row: 3, col: 0 },
			explanation:
				'Once a soldier crosses the river (between rows 4-5), it can move sideways as well as forward. This soldier has crossed the river.',
		},
	];

	const getCurrentDemo = useCallback((): XiangqiDemo => {
		return (
			xiangqiDemos.find(demo => demo.id === currentDemo) || xiangqiDemos[0]
		);
	}, [currentDemo, xiangqiDemos]);

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
			!isAIThinking
		) {
			const makeAIMove = async () => {
				setIsAIThinking(true);
				setErrorMsg(null);
				try {
					const aiResponse = await aiService.makeMove(gameState);
					if (aiResponse) {
						const fromMove = aiResponse.move?.from;
						const toMove = aiResponse.move?.to;

						if (!fromMove || !toMove) {
							throw new Error('AI response missing move coordinates');
						}

						// Parse AI move from algebraic notation
						const fromPos = algebraicToPosition(fromMove);
						const toPos = algebraicToPosition(toMove);

						// Apply the move using xiangqi game logic
						const moveResult = selectSquare(gameState, fromPos);
						const hasSelectedPiece = Boolean(moveResult.selectedSquare);

						if (!hasSelectedPiece) {
							throw new Error(
								`AI move invalid: no selectable piece at ${fromMove}`
							);
						}

						const finalResult = selectSquare(moveResult, toPos);
						const moveApplied =
							finalResult !== moveResult &&
							finalResult.selectedSquare === null &&
							finalResult.possibleMoves.length === 0;

						if (!moveApplied) {
							throw new Error(
								`AI move invalid: unable to apply ${fromMove} -> ${toMove}`
							);
						}

						setGameState(finalResult);
					}
				} catch (error) {
					const message =
						error instanceof Error
							? `${error.message}${error.stack ? `\n${error.stack}` : ''}`
							: 'Unknown AI error occurred';
					// eslint-disable-next-line no-console
					console.error('AI move failed:', error);
					setErrorMsg(
						`AI move failed. ${
							message || 'Please try again or change providers.'
						}`
					);
				} finally {
					setIsAIThinking(false);
				}
			};

			const timer = setTimeout(makeAIMove, 1000);
			return () => clearTimeout(timer);
		}
	}, [gameState, gameMode, gameStarted, aiPlayer, aiService, isAIThinking]);

	const algebraicToPosition = useCallback(
		(algebraic: string): XiangqiPosition => {
			const normalized = algebraic?.trim().toLowerCase();
			const file = normalized?.[0];
			const rank = normalized?.slice(1);
			const files = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'];
			const ranks = ['10', '9', '8', '7', '6', '5', '4', '3', '2', '1'];

			if (!file || !rank) {
				throw new Error(`Invalid algebraic notation: ${algebraic}`);
			}

			const col = files.indexOf(file);
			const row = ranks.indexOf(rank);

			if (col === -1 || row === -1) {
				throw new Error(`Invalid algebraic notation: ${algebraic}`);
			}

			return { col, row };
		},
		[]
	);

	const handleSquareClick = useCallback(
		(position: XiangqiPosition) => {
			if (gameMode === 'tutorial') {
				const demo = getCurrentDemo();
				const piece = getPieceAt(demo.board, position);

				if (piece) {
					const possibleMoves = getPossibleMoves(demo.board, position);
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

	const handleResetGame = useCallback(() => {
		setGameState(resetGame());
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
		const humanPlayer = aiPlayer === 'red' ? 'black' : 'red';
		setGameState(prev => ({
			...prev,
			status: 'checkmate',
			currentPlayer: humanPlayer,
		}));
	}, [aiPlayer]);

	const triggerDebugDraw = useCallback(() => {
		setGameState(prev => ({
			...prev,
			status: 'stalemate',
		}));
	}, []);

	useEffect(() => {
		if (!import.meta.env.DEV || typeof window === 'undefined') {
			return;
		}
		const global = window as unknown as {
			__PROCYON_DEBUG_XIANGQI_TRIGGER_WIN__?: () => void;
		};
		// Helper for tests and manual debugging to force a human win
		global.__PROCYON_DEBUG_XIANGQI_TRIGGER_WIN__ = () => {
			setGameStarted(true);
			setHasGameEnded(false);
			setShowDebugWinButton(true);
			triggerDebugWin();
		};
	}, [triggerDebugWin]);

	useEffect(() => {
		if (!import.meta.env.DEV || typeof window === 'undefined') {
			return;
		}
		const global = window as unknown as {
			__PROCYON_DEBUG_XIANGQI_STATE__?: {
				gameMode: XiangqiGameMode;
				gameStarted: boolean;
				hasGameStarted: boolean;
				currentPlayer: XiangqiGameState['currentPlayer'];
				status: XiangqiGameState['status'];
			};
		};
		global.__PROCYON_DEBUG_XIANGQI_STATE__ = {
			gameMode,
			gameStarted,
			hasGameStarted: gameStarted || gameState.moveHistory.length > 0,
			currentPlayer: gameState.currentPlayer,
			status: gameState.status,
		};
	}, [
		gameMode,
		gameStarted,
		gameState.currentPlayer,
		gameState.status,
		gameState.moveHistory.length,
	]);

	// Calculate hasGameStarted before using it in callbacks
	const hasGameStarted = gameStarted || gameState.moveHistory.length > 0;

	const handleStartOrReset = useCallback(() => {
		if (!hasGameStarted) {
			// Starting the game - ensure game state is properly initialized
			setGameState(resetGame());
			setGameStarted(true);
			setHasGameEnded(false);
		} else {
			// Resetting the game
			handleResetGame();
		}
	}, [hasGameStarted, handleResetGame]);

	const toggleToMode = useCallback(
		(newMode: XiangqiGameMode) => {
			setGameMode(newMode);
			setGameStarted(false);
			setIsAIThinking(false);
			setAIDebugMoves([]);
			setHasGameEnded(false);

			if (newMode === 'tutorial') {
				const demo = getCurrentDemo();
				setGameState({
					board: demo.board,
					currentPlayer: 'red',
					status: 'playing',
					moveHistory: [],
					selectedSquare: null,
					possibleMoves: [],
				});
			} else {
				setGameState(resetGame());
			}
		},
		[getCurrentDemo]
	);

	const handleProviderChange = useCallback(
		async (newProvider: AIProvider) => {
			const providerInfo = AI_PROVIDERS[newProvider];
			const fallbackModel =
				providerInfo.models[0] || providerInfo.defaultModel || aiConfig.model;
			setErrorMsg(null);

			try {
				if (!isAuthenticated) {
					setErrorMsg('Please sign in to manage your AI settings.');
					return;
				}

				const authHeaders = await getAuthHeaders();
				const response = await fetch(`${env.PUBLIC_API_URL}/ai-config`, {
					headers: {
						'Content-Type': 'application/json',
						...authHeaders,
					},
				});

				if (!response.ok) {
					// eslint-disable-next-line no-console
					console.error(
						`Failed to fetch AI configurations for provider ${newProvider}:`,
						response.status,
						response.statusText
					);
					setErrorMsg(
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
					setErrorMsg(
						'Add an API key for this provider in AI Settings to reuse it here.'
					);
					return;
				}

				const fullConfigResponse = await fetch(
					`${env.PUBLIC_API_URL}/ai-config/${providerConfig.id}/full`,
					{
						headers: {
							'Content-Type': 'application/json',
							...authHeaders,
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
					setErrorMsg(
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
				setErrorMsg(
					'Something went wrong loading AI settings. Please try again.'
				);
			}
		},
		[aiConfig.model, isAuthenticated]
	);

	const handleDemoChange = useCallback(
		(demoId: string) => {
			setCurrentDemo(demoId);
			const demo = xiangqiDemos.find(d => d.id === demoId);
			if (demo) {
				setGameState(prev => ({
					...prev,
					board: demo.board,
					selectedSquare: null,
					possibleMoves: [],
				}));
			}
		},
		[xiangqiDemos]
	);

	const _handleUndoMove = useCallback(() => {
		const newGameState = undoMove(gameState);
		setGameState(newGameState);
	}, [gameState]);

	const getStatusMessage = (): string => {
		const playerName = gameState.currentPlayer === 'red' ? '红方' : '黑方';
		const playerNameEn = gameState.currentPlayer === 'red' ? 'Red' : 'Black';

		// Add AI/Human indicator in AI mode
		const playerType =
			gameMode === 'ai'
				? gameState.currentPlayer === aiPlayer
					? '🤖 AI'
					: '👤 Human'
				: '';

		switch (gameState.status) {
			case 'check':
				return `${playerName} (${playerNameEn}) is in check! 将军！`;
			case 'checkmate': {
				const winner =
					gameState.currentPlayer === 'red' ? '黑方 (Black)' : '红方 (Red)';
				return `Checkmate! ${winner} wins! 将死！`;
			}
			case 'stalemate':
				return 'Stalemate! The game is a draw. 和棋！';
			case 'draw':
				return 'The game is a draw. 和棋！';
			default:
				return gameMode === 'ai'
					? `${playerType} ${playerName} (${playerNameEn}) to move`
					: `${playerName} (${playerNameEn}) to move`;
		}
	};

	const isGameOver =
		gameState.status === 'checkmate' ||
		gameState.status === 'stalemate' ||
		gameState.status === 'draw';
	const _canUndo = gameState.moveHistory.length > 0;

	const currentBoard =
		gameMode === 'tutorial' ? getCurrentDemo().board : gameState.board;
	const currentHighlightSquares =
		gameMode === 'tutorial' ? getCurrentDemo().highlightSquares : undefined;

	const title =
		gameMode === 'tutorial'
			? 'Xiangqi Logic & Tutorials'
			: 'Chinese Chess (象棋)';
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
			titleGradientClassName='bg-gradient-to-r from-red-400 via-yellow-400 to-red-600'
			subtitleClassName='text-purple-100'
			currentMode={gameMode}
			onModeChange={toggleToMode}
			showModeToggle={showModeToggle}
			inactiveModeClassName='text-purple-100 hover:bg-white hover:bg-opacity-20'
			aiSettingsButton={
				<AISettingsDialog
					aiPlayer={aiPlayer}
					onAIPlayerChange={player => setAIPlayer(player as 'red' | 'black')}
					provider={aiConfig.provider}
					model={aiConfig.model}
					onProviderChange={provider =>
						handleProviderChange(provider as AIProvider)
					}
					onModelChange={model =>
						setAIConfig(prev => ({
							...prev,
							model,
						}))
					}
					aiPlayerOptions={[
						{ value: 'black', label: 'AI plays Black (黑方)' },
						{ value: 'red', label: 'AI plays Red (红方)' },
					]}
					isActive={gameMode === 'ai'}
					onActivate={() => toggleToMode('ai')}
				/>
			}
		>
			{errorMsg && (
				<div className='w-full max-w-4xl mx-auto mb-6'>
					<div
						className='flex items-start justify-between gap-4 rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-red-100'
						role='alert'
					>
						<p className='text-sm'>{errorMsg}</p>
						<button
							type='button'
							className='text-xs font-semibold uppercase tracking-wide text-red-200 hover:text-red-100'
							onClick={() => setErrorMsg(null)}
						>
							Dismiss
						</button>
					</div>
				</div>
			)}
			{gameMode === 'ai' && (
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
			)}

			{gameMode === 'tutorial' && (
				<DemoSelector
					demos={xiangqiDemos}
					currentDemo={currentDemo}
					onDemoChange={handleDemoChange}
				/>
			)}

			<div className='w-full max-w-4xl mx-auto space-y-6'>
				{gameMode === 'ai' ? (
					<>
						<AIGameInstructions
							providerName={aiConfig.provider}
							modelName={aiConfig.model}
							aiConfigured={aiConfig.enabled && !!aiConfig.apiKey}
						>
							<div className='text-xs space-y-1 pt-2'>
								<p>
									<strong>Pieces:</strong> 帅/将=General, 仕/士=Advisor,
									相/象=Elephant
								</p>
								<p>马=Horse, 车=Chariot, 炮=Cannon, 兵/卒=Soldier</p>
								<p>
									<strong>Goal:</strong> Checkmate the opponent's General (King)
								</p>
							</div>
						</AIGameInstructions>

						{gameState.moveHistory.length > 0 && (
							<div className='text-sm text-purple-200 text-center max-w-md mx-auto bg-black bg-opacity-20 rounded-lg p-4 backdrop-blur-sm border border-white border-opacity-10'>
								<h3 className='font-semibold mb-2'>
									Move History ({gameState.moveHistory.length})
								</h3>
								<div className='max-h-32 overflow-y-auto'>
									{gameState.moveHistory.slice(-10).map((move, index) => {
										const moveNum =
											gameState.moveHistory.length - 10 + index + 1;
										const piece = move.piece;
										const symbol = piece.color === 'red' ? '红' : '黑';
										return (
											<div
												key={`${moveNum}-${move.from.row}-${move.from.col}`}
												className='flex justify-between text-xs'
											>
												<span>{moveNum}.</span>
												<span>
													{symbol} {String.fromCharCode(97 + move.from.col)}
													{10 - move.from.row} →{' '}
													{String.fromCharCode(97 + move.to.col)}
													{10 - move.to.row}
													{move.capturedPiece ? ' ×' : ''}
												</span>
											</div>
										);
									})}
								</div>
							</div>
						)}
					</>
				) : (
					<TutorialInstructions
						title={getCurrentDemo().title}
						explanation={getCurrentDemo().explanation}
						tips={[
							'"Control the central files - they are key to launching attacks across the river."',
							'"Protect your palace at all costs - an exposed general is vulnerable to mating attacks."',
							'"Cannons are powerful when they have platforms - coordinate with other pieces."',
							'"Advance soldiers across the river to gain lateral movement and attack power."',
						]}
						tipsTitle='Xiangqi Wisdom'
					/>
				)}
			</div>

			<div className='flex justify-center'>
				<GameStartOverlay active={!hasGameStarted && gameMode !== 'tutorial'}>
					<XiangqiBoard
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
							hasGameStarted={hasGameStarted}
							isGameOver={isGameOver}
							aiConfigured={aiConfig.enabled && !!aiConfig.apiKey}
							isDebugMode={isDebugMode}
							canExport={false}
							onStartOrReset={handleStartOrReset}
							onReset={handleResetGame}
							onToggleDebug={() => setIsDebugMode(!isDebugMode)}
							onExport={() => {}}
						/>
						{import.meta.env.DEV &&
							showDebugWinButton &&
							hasGameStarted &&
							!isGameOver &&
							isAuthenticated && (
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

export default XiangqiGame;
