import React, { useState, useCallback, useEffect } from 'react';
import type {
	JungleGameState,
	JunglePosition,
	JunglePieceColor,
	JunglePiece,
} from '../lib/jungle/types';
import {
	createInitialGameState,
	selectSquare,
	resetGame,
} from '../lib/jungle/game';
import { createInitialTerrain } from '../lib/jungle/types';
import { createInitialBoard } from '../lib/jungle/board';
import { createJungleAI } from '../lib/ai';
import {
	usePlayHistory,
	useAIConfigHydration,
	useAiMoveGenerationToken,
	useGameIdentityReset,
	useGameDebugOutcomes,
} from '../hooks';
import type { AIMove } from './ai/AIDebugDialog';
import JungleBoard from './JungleBoard';
import BoardSidePanel, { type Mode } from './game/BoardSidePanel';
import BoardColumn from './game/BoardColumn';
import GamePlayLayout from './game/GamePlayLayout';
import GameStartOverlay from './game/GameStartOverlay';
import AIStatusPanel from './game/AIStatusPanel';
import GameControls from './game/GameControls';
import DemoSelector from './game/DemoSelector';
import TutorialInstructions from './game/TutorialInstructions';
import AIGameInstructions from './game/AIGameInstructions';
import DebugOutcomeButtons from './game/DebugOutcomeButtons';
import { rehydrate as rehydrateAIConfig } from '../lib/ai/ai-config-store';
import { useAuth } from '../lib/auth';

interface JungleDemo {
	id: string;
	title: string;
	description: string;
	board: (JunglePiece | null)[][];
	focusSquare?: JunglePosition;
	highlightSquares?: JunglePosition[];
	explanation: string;
}

type JungleGameMode = Mode;

const JungleGame: React.FC = () => {
	const [gameMode, setGameMode] = useState<JungleGameMode>('ai');
	const [gameStarted, setGameStarted] = useState(false);
	const [gameState, setGameState] = useState<JungleGameState>(
		createInitialGameState()
	);
	const [currentDemo, setCurrentDemo] = useState<string>('basic-movement');
	const [aiPlayer, setAIPlayer] = useState<JunglePieceColor>('blue');
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
	const [aiService] = useState(() => createJungleAI(aiConfig));
	const [isAIThinking, setIsAIThinking] = useState(false);
	const [isAiPaused, setIsAiPaused] = useState(false);
	const [aiError, setAiError] = useState<string | null>(null);
	const [aiDebugMoves, setAIDebugMoves] = useState<AIMove[]>([]);
	const [isDebugMode, setIsDebugMode] = useState(false);
	const [errorMsg, setErrorMsg] = useState<string | null>(null);

	// Monotonic generation token for in-flight AI moves. Invalidated on
	// logout / identity change / mode switch / reset so a makeAIMove
	// callback still awaiting an AI response can detect it is stale and
	// skip its setGameState call — otherwise the resolved promise would
	// resurrect the pre-reset board position.
	const { genRef, invalidate, isStale } = useAiMoveGenerationToken();

	// On unmount, invalidate the generation token so any in-flight makeAIMove
	// callback belonging to this instance bails instead of writing to a
	// stale component.
	useEffect(() => () => invalidate(), [invalidate]);

	// Helper function to convert move history to debug format
	const createAIMove = useCallback(
		(
			move: string,
			isAI: boolean,
			thinking?: string,
			error?: string
		): AIMove => {
			const moveNumber = Math.floor(gameState.moveHistory.length / 2) + 1;
			const player =
				gameState.currentPlayer === 'red' ? 'Red (红方)' : 'Blue (蓝方)';

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
		() => (gameState.currentPlayer === 'red' ? 'blue' : 'red'),
		[gameState.currentPlayer]
	);

	usePlayHistory({
		gameVariant: 'jungle',
		gameStatus: gameState.status,
		aiPlayer,
		aiConfig,
		moveCount: gameState.moveHistory.length,
		getWinnerColor,
		enabled: gameMode === 'ai' && gameStarted,
		isAuthenticated,
		userId: user?.id,
		debugVariantKey: 'JUNGLE',
	});

	const createCustomJungleBoard = useCallback(
		(setup: string): (JunglePiece | null)[][] => {
			const board: (JunglePiece | null)[][] = Array(9)
				.fill(null)
				.map(() => Array(7).fill(null));

			switch (setup) {
				case 'lion-moves':
					board[4]![3] = {
						type: 'lion',
						color: 'red',
						rank: 7,
					};
					board[2]![2] = {
						type: 'rat',
						color: 'blue',
						rank: 1,
					};
					board[2]![4] = {
						type: 'rat',
						color: 'blue',
						rank: 1,
					};
					break;
				case 'river-jumping':
					board[4]![1] = {
						type: 'tiger',
						color: 'red',
						rank: 6,
					};
					board[4]![5] = {
						type: 'lion',
						color: 'red',
						rank: 7,
					};
					break;
				case 'trap-demonstration':
					board[4]![3] = {
						type: 'elephant',
						color: 'red',
						rank: 8,
					};
					board[4]![2] = {
						type: 'wolf',
						color: 'blue',
						rank: 3,
					};
					break;
				case 'basic':
					// Populate with initial board setup for basic movement tutorial
					return createInitialBoard();
				default:
					return board;
			}

			return board;
		},
		[]
	);

	const jungleDemos: JungleDemo[] = [
		{
			id: 'basic-movement',
			title: 'Basic Piece Movement',
			description: 'Learn how different Jungle pieces move across the board',
			board: createCustomJungleBoard('basic'),
			explanation:
				'Click on any piece to see its possible moves. Each piece has unique movement patterns and special abilities.',
		},
		{
			id: 'lion-moves',
			title: 'Lion Movement Pattern',
			description: 'The lion is powerful and can jump across rivers',
			board: createCustomJungleBoard('lion-moves'),
			focusSquare: { row: 4, col: 3 },
			highlightSquares: [
				{ row: 2, col: 3 },
				{ row: 3, col: 3 },
				{ row: 4, col: 2 },
				{ row: 4, col: 4 },
				{ row: 5, col: 3 },
				{ row: 6, col: 3 },
			],
			explanation:
				'The lion can move one square in any direction and jump across rivers if there are no pieces blocking the path.',
		},
		{
			id: 'river-jumping',
			title: 'River Jumping',
			description: 'Tigers and lions can jump across rivers',
			board: createCustomJungleBoard('river-jumping'),
			focusSquare: { row: 4, col: 1 },
			highlightSquares: [
				{ row: 4, col: 3 },
				{ row: 4, col: 5 },
			],
			explanation:
				'Tigers and lions can jump across rivers in a straight line, but cannot jump if there are pieces in the water blocking the path.',
		},
		{
			id: 'trap-demonstration',
			title: 'Trap Mechanics',
			description: 'Pieces in enemy traps become vulnerable',
			board: createCustomJungleBoard('trap-demonstration'),
			focusSquare: { row: 4, col: 3 },
			highlightSquares: [{ row: 4, col: 2 }],
			explanation:
				'When a piece enters an enemy trap, its rank becomes 0, making it capturable by any piece. Elephants are especially vulnerable to rats.',
		},
	];
	const getCurrentDemo = useCallback((): JungleDemo => {
		const demo = jungleDemos.find(demo => demo.id === currentDemo);
		return (demo || jungleDemos[0]) as JungleDemo;
	}, [currentDemo, jungleDemos]);

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
				if (isStale(data?.requestId)) return;
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
	}, [aiService, aiConfig, isDebugMode, createAIMove, isStale]);

	// AI move handling
	useEffect(() => {
		if (
			gameMode === 'ai' &&
			gameStarted &&
			!configPending &&
			gameState.currentPlayer === aiPlayer &&
			(gameState.status === 'playing' || gameState.status === 'check') &&
			!isAIThinking &&
			!isAiPaused
		) {
			const makeAIMove = async () => {
				const gen = genRef.current;
				setIsAIThinking(true);
				setAiError(null);
				try {
					const aiResponse = await aiService.makeMove(gameState, gen);
					if (isStale(gen)) return;
					if (aiResponse) {
						// Parse AI move from algebraic notation
						const fromPos = aiService.adapter.algebraicToPosition(
							aiResponse.move.from
						);
						const toPos = aiService.adapter.algebraicToPosition(
							aiResponse.move.to
						);

						// Apply the move using jungle game logic
						const moveResult = selectSquare(gameState, fromPos);
						const hasSelectedPiece = Boolean(moveResult.selectedSquare);

						if (!hasSelectedPiece) {
							throw new Error(
								`AI move invalid: no selectable piece at ${aiResponse.move.from}`
							);
						}

						const finalResult = selectSquare(moveResult, toPos);
						// selectSquare always returns a fresh object (copyGameState),
						// so reference inequality cannot detect a failed move. An
						// illegal destination clears selection but leaves the board,
						// history, and turn untouched - the same shape produced after
						// a legal move. Compare move history length instead: a valid
						// move appends exactly one entry; an illegal one appends none.
						const moveApplied =
							finalResult.moveHistory.length > moveResult.moveHistory.length;

						if (!moveApplied) {
							throw new Error(
								`AI move invalid: unable to apply ${aiResponse.move.from} -> ${aiResponse.move.to}`
							);
						}

						setGameState(finalResult);
					} else {
						setAiError('AI did not return a valid response');
						setIsAiPaused(true);
					}
				} catch (error) {
					if (isStale(gen)) return;
					const message =
						error instanceof Error
							? error.message
							: 'Unknown AI error occurred';
					// eslint-disable-next-line no-console
					console.error('AI move failed:', error);
					setAiError(message || 'Please try again or change providers.');
					setIsAiPaused(true);
				} finally {
					if (!isStale(gen)) {
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
		isAiPaused,
		genRef,
		isStale,
	]);

	const retryAIMove = useCallback(() => {
		setAiError(null);
		setIsAiPaused(false);
	}, []);

	const handleSquareClick = useCallback(
		(position: JunglePosition) => {
			if (gameMode === 'tutorial') {
				const demo = getCurrentDemo();
				const newGameState = {
					...gameState,
					board: demo.board,
					selectedSquare: position,
					possibleMoves: [], // Simplified for tutorial
				};
				setGameState(newGameState);
			} else {
				if (
					(gameMode === 'ai' && gameState.currentPlayer === aiPlayer) ||
					isAIThinking
				) {
					return;
				}
				const newGameState = selectSquare(gameState, position);
				setGameState(newGameState);
			}
		},
		[gameMode, gameState, getCurrentDemo, aiPlayer, isAIThinking]
	);

	const handleResetGame = useCallback(() => {
		// Invalidate any in-flight makeAIMove callback so it cannot
		// apply a stale setGameState after the reset. Clear isAIThinking
		// because the callback's finally-block skips on gen mismatch.
		invalidate();
		setIsAIThinking(false);
		setIsAiPaused(false);
		setAiError(null);
		setGameState(resetGame());
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
			setAIPlayer('blue');
		},
	});

	const {
		triggerDebugWin,
		triggerDebugLoss,
		triggerDebugDraw,
		showDebugWinButton,
	} = useGameDebugOutcomes<JunglePieceColor>({
		aiPlayer,
		getHumanPlayer: ai => (ai === 'red' ? 'blue' : 'red'),
		setOutcome: patch =>
			setGameState(prev => ({
				...prev,
				status: patch.status as JungleGameState['status'],
				...(patch.currentPlayer !== undefined
					? { currentPlayer: patch.currentPlayer }
					: {}),
			})),
		debugVariantKey: 'JUNGLE',
		winStatus: 'checkmate',
		drawStatus: 'stalemate',
		invalidate,
		onPrepareTriggerWin: () => {
			setGameMode('ai');
			setGameStarted(true);
		},
	});

	// Calculate hasGameStarted before using it in callbacks
	const hasGameStarted = gameStarted || gameState.moveHistory.length > 0;

	const isGameOver =
		gameState.status === 'checkmate' ||
		gameState.status === 'stalemate' ||
		gameState.status === 'draw';

	// Lock AI-side select while a game is in progress (started and not over).
	const gameActive = hasGameStarted && !isGameOver;

	const handleStartOrReset = useCallback(() => {
		if (!hasGameStarted) {
			if (aiStarting) return; // config still loading; Start is disabled
			// Starting game - ensure game state is properly initialized
			setGameState(createInitialGameState());
			setGameStarted(true);
		} else {
			// Resetting the game
			handleResetGame();
		}
	}, [hasGameStarted, handleResetGame, aiStarting]);

	const handleDemoChange = useCallback(
		(demoId: string) => {
			setCurrentDemo(demoId);
			const demo = jungleDemos.find(d => d.id === demoId);
			if (demo) {
				setGameState(prev => ({
					...prev,
					board: demo.board,
					selectedSquare: null,
					possibleMoves: [],
				}));
			}
		},
		[jungleDemos]
	);

	const toggleToMode = useCallback(
		(newMode: JungleGameMode) => {
			// Invalidate any in-flight makeAIMove callback so a stale
			// AI response from the previous mode cannot overwrite the newly
			// selected game state.
			invalidate();
			setIsAIThinking(false);
			setIsAiPaused(false);
			setAiError(null);
			setGameMode(newMode);
			setGameStarted(false);
			setAIDebugMoves([]);
			setErrorMsg(null);

			if (newMode === 'tutorial') {
				const demo = getCurrentDemo();
				setGameState({
					board: demo.board,
					terrain: createInitialTerrain(),
					currentPlayer: 'red',
					status: 'playing',
					moveHistory: [],
					selectedSquare: null,
					possibleMoves: [],
				});
			} else {
				setGameState(createInitialGameState());
			}
		},
		[getCurrentDemo, invalidate]
	);

	const getStatusMessage = (): string => {
		const playerName = gameState.currentPlayer === 'red' ? '红方' : '蓝方';
		const playerNameEn = gameState.currentPlayer === 'red' ? 'Red' : 'Blue';

		// Add AI/Human indicator in AI mode
		const playerType =
			gameMode === 'ai'
				? gameState.currentPlayer === aiPlayer
					? '🤖 AI'
					: '👤 Human'
				: '';

		switch (gameState.status) {
			case 'check':
				return `${playerName} is in check! 将军！`;
			case 'checkmate': {
				const winner =
					gameState.currentPlayer === 'red' ? '蓝方 (Blue)' : '红方 (Red)';
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

	const currentBoard =
		gameMode === 'tutorial' ? getCurrentDemo().board : gameState.board;
	const currentHighlightSquares =
		gameMode === 'tutorial' ? getCurrentDemo().highlightSquares : undefined;

	const title =
		gameMode === 'tutorial'
			? 'Jungle Chess Logic & Tutorials'
			: 'Jungle Chess (鬥獸棋)';
	const subtitle =
		gameMode === 'tutorial'
			? getCurrentDemo().description
			: hasGameStarted
				? getStatusMessage()
				: '';

	const errorBanner =
		errorMsg || (gameMode === 'ai' && hydrateError) ? (
			<div className='w-full max-w-4xl mx-auto mb-6 space-y-3'>
				{errorMsg && (
					<div
						className='flex items-start justify-between gap-4 rounded-lg border border-jungle/40 bg-jungle/10 px-4 py-3 text-ivory'
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
						className='flex items-center justify-between gap-4 rounded-lg border border-jungle/40 bg-jungle/10 px-4 py-3 text-ivory'
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
		<GamePlayLayout
			title={title}
			subtitle={subtitle}
			banner={errorBanner}
			boardColumn={
				<BoardColumn
					board={
						<GameStartOverlay
							active={!hasGameStarted && gameMode !== 'tutorial'}
						>
							<JungleBoard
								board={currentBoard}
								terrain={gameState.terrain}
								selectedSquare={gameState.selectedSquare}
								possibleMoves={gameState.possibleMoves}
								onSquareClick={handleSquareClick}
								highlightSquares={currentHighlightSquares}
								disabled={!hasGameStarted && gameMode !== 'tutorial'}
							/>
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
							/>
						) : undefined
					}
					debugTools={
						import.meta.env.DEV &&
						showDebugWinButton &&
						hasGameStarted &&
						!isGameOver ? (
							<DebugOutcomeButtons
								onWin={triggerDebugWin}
								onLoss={triggerDebugLoss}
								onDraw={triggerDebugDraw}
							/>
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
									htmlFor='jungle-ai-side'
									className='text-sm font-medium text-ivory-dim'
								>
									AI plays
								</label>
								<select
									id='jungle-ai-side'
									value={aiPlayer}
									onChange={e =>
										setAIPlayer(e.target.value as JunglePieceColor)
									}
									disabled={gameActive}
									className='rounded-md border border-line bg-ink-800 px-2 py-1.5 text-sm text-ivory focus:outline-none focus-visible:ring-2 focus-visible:ring-brass disabled:cursor-not-allowed disabled:opacity-50'
								>
									<option value='blue'>AI plays Blue (蓝方)</option>
									<option value='red'>AI plays Red (红方)</option>
								</select>
							</div>
							<AIStatusPanel
								aiConfigured={aiConfig.enabled && !!aiConfig.apiKey}
								hasGameStarted={hasGameStarted}
								isAIThinking={isAIThinking}
								isAIPaused={isAiPaused}
								aiError={aiError}
								aiDebugMoves={aiDebugMoves}
								isDebugMode={isDebugMode}
								onRetry={retryAIMove}
							/>
							<AIGameInstructions
								variant='jungle'
								providerName={aiConfig.provider}
								modelName={aiConfig.model}
								aiConfigured={aiConfig.enabled && !!aiConfig.apiKey}
							>
								<div className='text-xs space-y-1 pt-2'>
									<p>
										<strong>Pieces:</strong> 象=Elephant (8), 獅=Lion (7),
										虎=Tiger (6)
									</p>
									<p>
										豹=Leopard (5), 狗=Dog (4), 狼=Wolf (3), 貓=Cat (2), 鼠=Rat
										(1)
									</p>
									<p>
										<strong>Special Rules:</strong> Rat can defeat Elephant,
										Lions/Tigers can jump rivers
									</p>
									<p>
										<strong>Goal:</strong> Enter opponent&apos;s den (◆) to win
									</p>
								</div>
							</AIGameInstructions>
						</>
					) : (
						<>
							<DemoSelector
								demos={jungleDemos}
								currentDemo={currentDemo}
								onDemoChange={handleDemoChange}
							/>
							<TutorialInstructions
								title={getCurrentDemo().title}
								explanation={getCurrentDemo().explanation}
								tips={[
									'"Protect your high-ranking pieces but use rats strategically against elephants."',
									'"Control the center of the board - it provides more movement options."',
									'"Use river jumps to quickly advance pieces across the board."',
									'"Pieces in enemy traps become vulnerable - use this to your advantage."',
									'"Lions and tigers are powerful - use them for both offense and defense."',
								]}
								tipsTitle='Jungle Chess Wisdom'
							/>
						</>
					)}
				</BoardSidePanel>
			}
		/>
	);
};

export default JungleGame;
