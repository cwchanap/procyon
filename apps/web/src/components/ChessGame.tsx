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
import { createInitialBoard, getPieceAt, getRow } from '../lib/chess/board';
import ChessBoard from './ChessBoard';
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

interface LogicDemo {
	id: string;
	title: string;
	description: string;
	board: (ChessPiece | null)[][];
	focusSquare?: Position;
	highlightSquares?: Position[];
	explanation: string;
}

type ChessGameMode = Mode;

const ChessGame: React.FC = () => {
	const [gameMode, setGameMode] = useState<ChessGameMode>('ai');
	const [gameStarted, setGameStarted] = useState(false);
	const [gameState, setGameState] = useState<GameState>(() =>
		createInitialGameState()
	);
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
		() => (gameState.currentPlayer === 'white' ? 'black' : 'white'),
		[gameState.currentPlayer]
	);

	usePlayHistory({
		gameVariant: 'chess',
		gameStatus: gameState.status,
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
		const over =
			gameState.status === 'checkmate' ||
			gameState.status === 'stalemate' ||
			gameState.status === 'draw';
		if (over && !hasGameEnded) {
			setHasGameEnded(true);
			setGameActive(false);
		}
	}, [gameState.status, hasGameEnded]);

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

	const createCustomBoard = useCallback(
		(setup: string): (ChessPiece | null)[][] => {
			const board: (ChessPiece | null)[][] = Array(8)
				.fill(null)
				.map(() => Array(8).fill(null));

			switch (setup) {
				case 'knight-moves':
					getRow(board, 4)[4] = {
						type: 'knight',
						color: 'white',
						hasMoved: false,
					};
					getRow(board, 2)[1] = {
						type: 'pawn',
						color: 'black',
						hasMoved: false,
					};
					getRow(board, 6)[3] = {
						type: 'pawn',
						color: 'black',
						hasMoved: false,
					};
					break;
				case 'check-demo':
					getRow(board, 7)[4] = {
						type: 'king',
						color: 'white',
						hasMoved: false,
					};
					getRow(board, 0)[0] = {
						type: 'rook',
						color: 'black',
						hasMoved: false,
					};
					getRow(board, 7)[0] = {
						type: 'rook',
						color: 'white',
						hasMoved: false,
					};
					break;
				case 'castling':
					getRow(board, 7)[4] = {
						type: 'king',
						color: 'white',
						hasMoved: false,
					};
					getRow(board, 7)[7] = {
						type: 'rook',
						color: 'white',
						hasMoved: false,
					};
					getRow(board, 7)[0] = {
						type: 'rook',
						color: 'white',
						hasMoved: false,
					};
					break;
				case 'pawn-promotion':
					getRow(board, 1)[3] = {
						type: 'pawn',
						color: 'white',
						hasMoved: true,
					};
					getRow(board, 0)[4] = {
						type: 'king',
						color: 'black',
						hasMoved: false,
					};
					getRow(board, 7)[4] = {
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
		return logicDemos.find(demo => demo.id === currentDemo) ?? logicDemos[0]!;
	}, [currentDemo, logicDemos]);

	// AI Move handling
	const makeAIMoveAsync = useCallback(async () => {
		if (!isAITurn(gameState) || gameState.isAiThinking) {
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
	}, [gameState, aiService, isDebugMode, createAIMove, genRef, isStale]);

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
	}, [
		gameState,
		gameMode,
		gameStarted,
		configPending,
		aiPlayer,
		makeAIMoveAsync,
		isAiPaused,
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
		[
			getCurrentDemo,
			aiPlayer,
			aiConfig.enabled,
			aiConfig.apiKey,
			invalidate,
			gameMode,
		]
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
	}, [gameMode, aiPlayer, invalidate]);

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
		setOutcome: patch =>
			setGameState(prev => ({
				...prev,
				status: patch.status as GameState['status'],
				...(patch.currentPlayer !== undefined
					? { currentPlayer: patch.currentPlayer }
					: {}),
			})),
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

	return (
		<GamePlayLayout
			title={title}
			subtitle={subtitle}
			boardColumn={
				<BoardColumn
					board={
						<GameStartOverlay active={!gameStarted && gameMode !== 'tutorial'}>
							<ChessBoard
								board={currentBoard}
								selectedSquare={gameState.selectedSquare}
								possibleMoves={gameState.possibleMoves}
								onSquareClick={handleSquareClick}
								highlightSquares={currentHighlightSquares}
								disabled={!gameStarted && gameMode !== 'tutorial'}
							/>
						</GameStartOverlay>
					}
					controls={
						gameMode === 'ai' ? (
							<GameControls
								hasGameStarted={gameStarted}
								isGameOver={isGameOver}
								aiConfigured={!!aiConfig.enabled && !!aiConfig.apiKey}
								startDisabled={aiStarting}
								isDebugMode={isDebugMode}
								canExport={gameStarted && !!gameExporterRef.current}
								onStartOrReset={handleStartOrReset}
								onReset={resetGame}
								onToggleDebug={() => setIsDebugMode(!isDebugMode)}
								onExport={() =>
									gameExporterRef.current?.exportAndDownload(gameState.status)
								}
							/>
						) : undefined
					}
					debugTools={
						import.meta.env.DEV &&
						showDebugWinButton &&
						gameStarted &&
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
								demos={logicDemos}
								currentDemo={currentDemo}
								onDemoChange={handleDemoChange}
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
