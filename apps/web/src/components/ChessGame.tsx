import React, { useState, useCallback, useEffect, useRef } from 'react';
import type {
	GameState,
	Position,
	PieceColor,
	PromotionPiece,
} from '../lib/chess/types';
import {
	createInitialGameState,
	selectSquare,
	makeMove,
	makeAIMove,
	setAIThinking,
	isAITurn,
	confirmPromotion,
	cancelPromotion,
} from '../lib/chess/game';
import { isTerminalState } from '../lib/chess/rules';
import { getPieceAt, positionToAlgebraic } from '../lib/chess/board';
import ChessBoard from './ChessBoard';
import ChessPromotionDialog from './ChessPromotionDialog';
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
import type { AIMove } from './ai/AIDebugDialog';
import { createChessAI } from '../lib/ai';
import { defaultAIConfig } from '../lib/ai/storage';
import {
	usePlayHistory,
	useAIConfigHydration,
	useAiMoveGenerationToken,
	useGameIdentityReset,
	useGameDebugOutcomes,
} from '../hooks';
import { useAuth } from '../lib/auth';
import { GameExporter } from '../lib/ai/game-export';
import {
	CHESS_TUTORIALS,
	createChessTutorialState,
} from '../lib/chess/tutorials';

type ChessGameMode = Mode;

type ForcedChessStatus = Extract<
	GameState['status'],
	'checkmate' | 'stalemate'
>;
type ForcedChessOutcome = {
	status: ForcedChessStatus;
	currentPlayer?: PieceColor;
} | null;

const terminalCopy: Record<
	NonNullable<GameState['terminationReason']>,
	string
> = {
	checkmate: 'Checkmate!',
	stalemate: 'Draw by stalemate',
	'threefold-repetition': 'Draw by threefold repetition',
	'fifty-move': 'Draw by the fifty-move rule',
	'insufficient-material': 'Draw by insufficient material',
};

const ChessGame: React.FC = () => {
	const [gameMode, setGameMode] = useState<ChessGameMode>('ai');
	const [gameStarted, setGameStarted] = useState(false);
	const [gameState, setGameState] = useState<GameState>(() =>
		createInitialGameState()
	);
	const [forcedOutcome, setForcedOutcome] = useState<ForcedChessOutcome>(null);
	const effectiveStatus = forcedOutcome?.status ?? gameState.status;
	const effectiveCurrentPlayer =
		forcedOutcome?.currentPlayer ?? gameState.currentPlayer;
	const gameOver = forcedOutcome !== null || isTerminalState(gameState);
	const [currentDemo, setCurrentDemo] = useState<string>('basic-movement');
	const [aiPlayer, setAIPlayer] = useState<'white' | 'black'>('black');
	const [gameActive, setGameActive] = useState(false);
	const {
		user,
		isAuthenticated,
		loading: authLoading,
		revalidated,
	} = useAuth();
	const {
		config: aiConfig,
		configPending,
		aiStarting,
	} = useAIConfigHydration({
		isAuthenticated,
		loading: authLoading,
		revalidated,
		isAiMode: gameMode === 'ai',
	});
	const [isDebugMode, setIsDebugMode] = useState(false);
	const [aiDebugMoves, setAiDebugMoves] = useState<AIMove[]>([]);
	const [isAiPaused, setIsAiPaused] = useState(false);
	const [aiError, setAiError] = useState<string | null>(null);
	const gameExporterRef = useRef<GameExporter | null>(null);
	// Monotonic generation token for in-flight AI moves. Invalidated on
	// logout / identity change / mode switch / reset so a makeAIMoveAsync
	// callback still awaiting an AI response can detect it is stale and
	// skip its setGameState/setAiError calls — otherwise the resolved
	// promise would resurrect the pre-reset board or set a stale error.
	const { genRef, invalidate, isStale } = useAiMoveGenerationToken();

	// On unmount, invalidate the generation token so any in-flight makeAIMove
	// callback belonging to this instance bails instead of writing to a
	// stale component.
	useEffect(() => () => invalidate(), [invalidate]);

	const [hasGameEnded, setHasGameEnded] = useState(false);

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

	const getWinnerColor = useCallback(
		() => (effectiveCurrentPlayer === 'white' ? 'black' : 'white'),
		[effectiveCurrentPlayer]
	);

	usePlayHistory({
		gameVariant: 'chess',
		gameStatus: effectiveStatus,
		aiPlayer,
		aiConfig,
		moveCount: gameState.moveHistory.length,
		getWinnerColor,
		enabled: gameMode === 'ai' && gameStarted,
		isAuthenticated,
		userId: user?.id,
		debugVariantKey: 'CHESS',
	});

	// Latch game-ended + clear gameActive when the game finishes (the hook owns
	// the actual play-history save + dedup).
	useEffect(() => {
		if (gameOver && !hasGameEnded) {
			setHasGameEnded(true);
			setGameActive(false);
		}
	}, [gameOver, hasGameEnded]);

	// Update AI service when debug mode changes
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
	}, [isDebugMode, aiConfig, aiService, createAIMove, isStale]);

	const getCurrentDemo = useCallback(() => {
		const found = CHESS_TUTORIALS.find(demo => demo.id === currentDemo);
		if (found) return found;
		const fallback = CHESS_TUTORIALS[0];
		if (!fallback) throw new Error('Chess tutorials must not be empty');
		return fallback;
	}, [currentDemo]);

	const loadTutorial = useCallback((demoId: string) => {
		const tutorialState = createChessTutorialState(demoId);
		setCurrentDemo(demoId);
		setGameState(tutorialState);
		setForcedOutcome(null);
	}, []);

	const recordCompletedHumanMove = useCallback(
		(before: GameState, after: GameState) => {
			const move = after.moveHistory.at(-1);
			if (!move || after.moveHistory.length !== before.moveHistory.length + 1) {
				return;
			}
			const from = positionToAlgebraic(move.from);
			const to = positionToAlgebraic(move.to);

			if (isDebugMode && gameMode === 'ai') {
				setAiDebugMoves(prev => [
					...prev,
					createAIMove(`${from} → ${to}`, false),
				]);
			}
			gameExporterRef.current?.addMove(
				Math.floor(before.moveHistory.length / 2) + 1,
				before.currentPlayer,
				from,
				to,
				move.promotion ?? move.piece.type
			);
		},
		[createAIMove, gameMode, isDebugMode]
	);

	// AI Move handling
	const makeAIMoveAsync = useCallback(async () => {
		if (gameOver || !isAITurn(gameState) || gameState.isAiThinking) {
			return;
		}
		const gen = genRef.current;

		setGameState(prev => setAIThinking(prev, true));
		setAiError(null); // Clear previous errors

		try {
			const aiResponse = await aiService.makeMove(gameState, gen);
			if (isStale(gen)) return;

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
					aiResponse.move.to,
					aiResponse.move.promotion
				);

				if (newGameState) {
					const updatedGameState = setAIThinking(newGameState, false);
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
							aiResponse.move.promotion ?? piece?.type ?? 'unknown',
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
			if (isStale(gen)) return;
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
			if (!isStale(gen)) {
				setGameState(prev => setAIThinking(prev, false));
			}
		}
	}, [
		gameState,
		aiService,
		isDebugMode,
		createAIMove,
		genRef,
		isStale,
		gameOver,
	]);

	// Retry AI move
	const retryAIMove = useCallback(() => {
		setAiError(null);
		setIsAiPaused(false);
		// The effect will trigger makeAIMoveAsync automatically
	}, []);

	// Effect to trigger AI moves
	useEffect(() => {
		if (
			gameMode === 'ai' &&
			gameStarted &&
			!configPending &&
			isAITurn(gameState) &&
			!gameOver &&
			!gameState.isAiThinking &&
			!isAiPaused &&
			!gameState.pendingPromotion
		) {
			const timer = setTimeout(() => {
				makeAIMoveAsync();
			}, 1000); // 1 second delay for better UX

			return () => clearTimeout(timer);
		}
	}, [
		gameState,
		gameMode,
		gameStarted,
		configPending,
		makeAIMoveAsync,
		isAiPaused,
		gameOver,
	]);

	// Game mode handlers
	const toggleToMode = useCallback(
		(newMode: ChessGameMode) => {
			// Same-mode click (the active toggle is still rendered after a
			// game starts via BoardSidePanel): skip the unconditional reset
			// so re-clicking the active mode doesn't wipe the current game
			// and history.
			if (newMode === gameMode) return;
			// Invalidate any in-flight makeAIMoveAsync callback so a stale
			// AI response from the previous mode cannot overwrite the newly
			// selected game state. Mirrors Xiangqi/Shogi/Jungle toggles.
			invalidate();
			setGameMode(newMode);
			setGameStarted(false);
			setIsAiPaused(false);
			setAiDebugMoves([]);
			setHasGameEnded(false);
			setGameActive(false);
			setForcedOutcome(null);

			if (newMode === 'tutorial') {
				loadTutorial(currentDemo);
			} else if (newMode === 'ai') {
				if (aiConfig.enabled && aiConfig.apiKey) {
					setGameState(createInitialGameState('human-vs-ai', aiPlayer));
				} else {
					// AI mode without proper config - default to human vs human
					setGameState(createInitialGameState('human-vs-human'));
				}
			}
		},
		[
			loadTutorial,
			currentDemo,
			aiPlayer,
			aiConfig.enabled,
			aiConfig.apiKey,
			invalidate,
			gameMode,
		]
	);

	const handleSquareClick = useCallback(
		(position: Position) => {
			if (
				gameOver ||
				gameState.pendingPromotion ||
				(gameMode === 'ai' && gameState.currentPlayer === aiPlayer) ||
				gameState.isAiThinking
			) {
				return;
			}

			const selected = gameState.selectedSquare;
			if (!selected) {
				setGameState(selectSquare(gameState, position));
				return;
			}

			const next = makeMove(gameState, selected, position);
			if (next) {
				setGameState(next);
				if (next.pendingPromotion) return;
				recordCompletedHumanMove(gameState, next);
				return;
			}

			setGameState(selectSquare(gameState, position));
		},
		[gameMode, gameState, aiPlayer, gameOver, recordCompletedHumanMove]
	);

	const handlePromotionChoice = useCallback(
		(promotion: PromotionPiece) => {
			const next = confirmPromotion(gameState, promotion);
			if (!next) return;
			setGameState(next);
			recordCompletedHumanMove(gameState, next);
		},
		[gameState, recordCompletedHumanMove]
	);

	const handlePromotionCancel = useCallback(() => {
		setGameState(prev => cancelPromotion(prev));
	}, []);

	const resetGame = useCallback(() => {
		// Invalidate any in-flight makeAIMoveAsync callback so it cannot
		// apply stale setGameState/setAiError results after the reset.
		invalidate();
		if (gameMode === 'ai') {
			setGameState(createInitialGameState('human-vs-ai', aiPlayer));
		} else {
			setGameState(createInitialGameState('human-vs-human'));
		}
		setGameStarted(false);
		setAiDebugMoves([]);
		setIsAiPaused(false);
		setAiError(null);
		setHasGameEnded(false);
		setGameActive(false);
		setForcedOutcome(null);
	}, [gameMode, aiPlayer, invalidate]);

	const setForcedDebugOutcome = useCallback(
		(patch: { status: string; currentPlayer?: PieceColor }) => {
			setForcedOutcome({
				status: patch.status as ForcedChessStatus,
				...(patch.currentPlayer !== undefined
					? { currentPlayer: patch.currentPlayer }
					: {}),
			});
		},
		[]
	);

	// Reset local game state when authentication is lost (logout) OR when
	// the authenticated user identity changes (account switch in another
	// tab). Also invalidates the AI move generation token so any in-flight
	// makeAIMoveAsync callback skips its setGameState/setAiError calls.
	useGameIdentityReset({
		isAuthenticated,
		userId: user?.id,
		invalidate,
		onReset: () => {
			resetGame();
			setAIPlayer('black');
		},
	});

	const {
		triggerDebugWin,
		triggerDebugLoss,
		triggerDebugDraw,
		showDebugWinButton,
	} = useGameDebugOutcomes<'white' | 'black'>({
		aiPlayer,
		getHumanPlayer: ai => (ai === 'white' ? 'black' : 'white'),
		setOutcome: setForcedDebugOutcome,
		debugVariantKey: 'CHESS',
		winStatus: 'checkmate',
		drawStatus: 'stalemate',
		invalidate,
		onClearThinking: () => setGameState(prev => setAIThinking(prev, false)),
		onPrepareTriggerWin: () => {
			setGameMode('ai');
			setGameStarted(true);
			setHasGameEnded(false);
		},
	});

	const handleStartOrReset = useCallback(() => {
		if (!gameStarted) {
			if (aiStarting) return; // config still loading; Start is disabled
			setForcedOutcome(null);
			// Starting the game - ensure game state is properly initialized
			if (gameMode === 'ai') {
				setGameState(createInitialGameState('human-vs-ai', aiPlayer));
				setGameActive(true);
			} else {
				setGameState(createInitialGameState('human-vs-human'));
				setGameActive(false);
			}
			setGameStarted(true);
			setHasGameEnded(false);

			// Initialize game exporter
			gameExporterRef.current = new GameExporter('chess', aiConfig);
		} else {
			// Resetting the game
			resetGame();
		}
	}, [gameStarted, resetGame, gameMode, aiPlayer, aiConfig, aiStarting]);

	const getStatusText = (): string => {
		if (forcedOutcome?.status === 'checkmate') return 'Checkmate!';
		if (forcedOutcome?.status === 'stalemate') return 'Draw by stalemate';
		if (gameState.terminationReason) {
			return terminalCopy[gameState.terminationReason];
		}
		if (gameState.status === 'check') {
			return `${effectiveCurrentPlayer === 'white' ? 'White' : 'Black'} is in check`;
		}
		return `${effectiveCurrentPlayer === 'white' ? 'White' : 'Black'} to move`;
	};

	const currentBoard = gameState.board;
	const currentHighlightSquares =
		gameMode === 'tutorial' ? getCurrentDemo().highlightSquares : undefined;

	const title =
		gameMode === 'tutorial' ? 'Chess Logic & Tutorials' : 'Chess Game';
	const subtitle =
		gameMode === 'tutorial'
			? getCurrentDemo().description
			: gameStarted
				? getStatusText()
				: '';

	return (
		<GamePlayLayout
			title={title}
			subtitle={subtitle}
			boardColumn={
				<BoardColumn
					board={
						<>
							<GameStartOverlay
								active={!gameStarted && gameMode !== 'tutorial'}
							>
								<ChessBoard
									board={currentBoard}
									selectedSquare={gameState.selectedSquare}
									possibleMoves={gameState.possibleMoves}
									onSquareClick={handleSquareClick}
									highlightSquares={currentHighlightSquares}
									disabled={
										Boolean(gameState.pendingPromotion) ||
										Boolean(gameState.isAiThinking) ||
										(gameMode === 'ai' &&
											gameState.currentPlayer === aiPlayer) ||
										gameOver
									}
								/>
							</GameStartOverlay>
							{gameState.pendingPromotion ? (
								<ChessPromotionDialog
									color={gameState.pendingPromotion.color}
									choices={gameState.pendingPromotion.choices}
									onChoose={handlePromotionChoice}
									onCancel={handlePromotionCancel}
								/>
							) : null}
						</>
					}
					controls={
						gameMode === 'ai' ? (
							<GameControls
								hasGameStarted={gameStarted}
								isGameOver={gameOver}
								aiConfigured={!!aiConfig.enabled && !!aiConfig.apiKey}
								startDisabled={aiStarting}
								isDebugMode={isDebugMode}
								canExport={gameStarted && !!gameExporterRef.current}
								onStartOrReset={handleStartOrReset}
								onReset={resetGame}
								onToggleDebug={() => setIsDebugMode(!isDebugMode)}
								onExport={() =>
									gameExporterRef.current?.exportAndDownload(effectiveStatus)
								}
							/>
						) : undefined
					}
					debugTools={
						import.meta.env.DEV &&
						showDebugWinButton &&
						gameStarted &&
						!gameOver ? (
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
									htmlFor='chess-ai-side'
									className='text-sm font-medium text-ivory-dim'
								>
									AI plays
								</label>
								<select
									id='chess-ai-side'
									value={aiPlayer}
									onChange={e =>
										setAIPlayer(e.target.value as 'white' | 'black')
									}
									disabled={gameActive}
									className='rounded-md border border-line bg-ink-800 px-2 py-1.5 text-sm text-ivory focus:outline-none focus-visible:ring-2 focus-visible:ring-brass disabled:cursor-not-allowed disabled:opacity-50'
								>
									<option value='black'>Black</option>
									<option value='white'>White</option>
								</select>
							</div>
							<AIStatusPanel
								aiConfigured={!!aiConfig.enabled && !!aiConfig.apiKey}
								hasGameStarted={gameStarted}
								isAIThinking={gameState.isAiThinking ?? false}
								isAIPaused={isAiPaused}
								aiError={aiError}
								aiDebugMoves={aiDebugMoves}
								isDebugMode={isDebugMode}
								onRetry={retryAIMove}
							/>
							<AIGameInstructions
								variant='chess'
								providerName={aiConfig.provider}
								modelName={aiConfig.model}
								aiConfigured={aiConfig.enabled && !!aiConfig.apiKey}
							/>
						</>
					) : (
						<>
							<DemoSelector
								demos={CHESS_TUTORIALS}
								currentDemo={currentDemo}
								onDemoChange={loadTutorial}
							/>
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
						</>
					)}
				</BoardSidePanel>
			}
		/>
	);
};

export default ChessGame;
