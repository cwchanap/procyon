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
import {
	getPieceAt,
	positionToAlgebraic,
	algebraicToPosition,
} from '../lib/chess/board';
import ChessBoard from './ChessBoard';
import ChessPromotionDialog from './ChessPromotionDialog';
import BoardSidePanel, { type Mode } from './game/BoardSidePanel';
import BoardColumn from './game/BoardColumn';
import GamePlayLayout from './game/GamePlayLayout';
import GameStartOverlay from './game/GameStartOverlay';
import GameControls from './game/GameControls';
import DemoSelector from './game/DemoSelector';
import TutorialInstructions from './game/TutorialInstructions';
import DebugOutcomeButtons from './game/DebugOutcomeButtons';
import ChessRivalSetup from './game/ChessRivalSetup';
import EngineRivalDetails from './game/EngineRivalDetails';
import LlmRivalDetails from './game/LlmRivalDetails';
import type { AIMove } from './ai/AIDebugDialog';
import {
	usePlayHistory,
	useAIConfigHydration,
	useAiMoveGenerationToken,
	useGameIdentityReset,
	useGameDebugOutcomes,
	useChessRivalSetup,
	useChessRivalSession,
	type UseChessRivalSessionOptions,
} from '../hooks';
import { useAuth } from '../lib/auth';
import { GameExporter } from '../lib/ai/game-export';
import type { AIConfig } from '../lib/ai/types';
import {
	getRivalSide,
	type LlmUsability,
	type RivalMoveResult,
} from '../lib/chess/rival/types';
import type { ChessRivalProvider } from '../lib/chess/rival/provider';
import {
	createLlmRivalProvider,
	type RivalDebugEvent,
} from '../lib/chess/rival/llm-provider';
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

// Human-readable copy for the automatic opponent fallbacks surfaced by
// `useChessRivalSetup`. The hook only exposes a code; the preview owns the
// player-facing wording.
const fallbackNoticeMessages: Record<
	'engine-to-llm' | 'llm-to-engine',
	string
> = {
	'engine-to-llm':
		'The on-device computer is unavailable on this device, so a language-model opponent was selected.',
	'llm-to-engine':
		'A language-model opponent is unavailable, so the on-device computer was selected.',
};

export interface ChessGameProps {
	/**
	 * Test-only override for the rival session provider factories. Production
	 * renders `<ChessGame />` with no props, so the real Stockfish/LLM
	 * providers are used; tests inject deterministic fakes to exercise Start,
	 * rival moves, and disposal without constructing a real Worker or hitting
	 * the network.
	 */
	rivalSessionOptions?: UseChessRivalSessionOptions;
}

const ChessGame: React.FC<ChessGameProps> = ({ rivalSessionOptions }) => {
	const [gameMode, setGameMode] = useState<ChessGameMode>('ai');
	const [gameStarted, setGameStarted] = useState(false);
	// Preview always models a human-vs-AI game; the rival side is derived from
	// the resolved setup once preference hydration completes (see the preview
	// effect below). The initial value is never shown — the board stays behind
	// a neutral skeleton until `rivalSetup.resolved`.
	const [gameState, setGameState] = useState<GameState>(() =>
		createInitialGameState('human-vs-ai', 'black')
	);
	const [forcedOutcome, setForcedOutcome] = useState<ForcedChessOutcome>(null);
	const effectiveStatus = forcedOutcome?.status ?? gameState.status;
	const effectiveCurrentPlayer =
		forcedOutcome?.currentPlayer ?? gameState.currentPlayer;
	const gameOver = forcedOutcome !== null || isTerminalState(gameState);
	const [currentDemo, setCurrentDemo] = useState<string>('basic-movement');
	const {
		user,
		isAuthenticated,
		loading: authLoading,
		revalidated,
	} = useAuth();
	const {
		config: aiConfig,
		hydrated,
		hydrateError,
		configPending,
	} = useAIConfigHydration({
		isAuthenticated,
		loading: authLoading,
		revalidated,
		isAiMode: gameMode === 'ai',
	});

	// Live refs so async rival-move callbacks re-check the CURRENT board /
	// terminal state after awaiting a provider, without capturing a stale
	// closure. Updated every render.
	const gameStateRef = useRef(gameState);
	gameStateRef.current = gameState;
	const gameOverRef = useRef(gameOver);
	gameOverRef.current = gameOver;
	// Generation captured for the in-flight rival move request. Provider debug
	// events arriving after a reset/mode-switch bumped the token are dropped by
	// comparing against this.
	const pendingRivalGenRef = useRef(0);
	// Forwarded provider debug events land here; the ref lets the LLM provider
	// factory (frozen at Start) reach the latest handler.
	const rivalDebugHandlerRef = useRef<(event: RivalDebugEvent) => void>(
		() => {}
	);

	// Default LLM provider factory wires provider debug events back into the
	// component's debug history. Tests may override engine/LLM factories via
	// `rivalSessionOptions`; production uses the real Stockfish/LLM providers.
	const createLlmProvider = useCallback(
		({ config }: { config: AIConfig }): ChessRivalProvider =>
			createLlmRivalProvider({
				config,
				onDebugEvent: event => rivalDebugHandlerRef.current(event),
			}),
		[]
	);
	const rivalSession = useChessRivalSession({
		createLlmProvider,
		...rivalSessionOptions,
	});
	const activeSession = rivalSession.activeSession;

	// Rival setup drives the Play-mode opponent/side selection and the preview.
	// It is preference-hydration-safe: `resolved` gates the board reveal. The
	// lifecycle flags freeze the mutable setup for the lifetime of a rival
	// session: a real Start in flight (`startState === 'starting'`, not AI-config
	// hydration) and any committed game — active OR terminal, since `activeSession`
	// and `gameStarted` stay committed until reset. Without this, automatic
	// resolution could flip the opponent while a Start loads or after the game.
	const rivalSetup = useChessRivalSetup({
		auth: { isAuthenticated, loading: authLoading, revalidated },
		aiConfig: {
			config: aiConfig,
			hydrated,
			hydrateError,
			configPending,
		},
		isGameActive: activeSession !== null || gameStarted,
		isStarting: rivalSession.startState === 'starting',
		// A pre-Start opponent/side change cancels any in-flight candidate
		// Start and disposes its provider so a stale readiness can't commit.
		onSetupChange: rivalSession.reset,
	});
	const previewRivalSide = getRivalSide(rivalSetup.setup.humanSide);
	// The side the computer controls. Once a session is active this is the
	// frozen session side; before Start it is the derived preview side so the
	// pre-game board orientation/interaction still reflects the live selection.
	const activeRivalSide = activeSession?.rivalSide ?? previewRivalSide;

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

	const getWinnerColor = useCallback(
		() => (effectiveCurrentPlayer === 'white' ? 'black' : 'white'),
		[effectiveCurrentPlayer]
	);

	// Engine history is only eligible when the still-signed-in starting user
	// is the same identity that began the session. An anonymous start
	// (`startedByUserId === null`) or an account switch after Start makes the
	// terminal engine result ineligible — it is never attributed to another
	// user, and an anonymous engine game is never saved.
	const isSameStartingUser =
		activeSession != null &&
		activeSession.startedByUserId !== null &&
		isAuthenticated &&
		user?.id === activeSession.startedByUserId;

	// Engine and LLM sessions record play-history through the same hook but
	// with different opponent metadata: the engine passes the frozen rival
	// side and the unrated `{ kind: 'engine', id: 'stockfish' }` descriptor
	// (and omits `aiConfig`), while the LLM keeps the existing rated path
	// (Start-frozen config, no descriptor). The hook must be called
	// unconditionally, so the options are branched here rather than the call.
	const llmHistoryConfig =
		activeSession?.opponent.kind === 'llm'
			? (activeSession.startedConfig ?? aiConfig)
			: aiConfig;
	usePlayHistory(
		activeSession?.opponent.kind === 'engine'
			? {
					gameVariant: 'chess',
					gameStatus: effectiveStatus,
					aiPlayer: activeSession.rivalSide,
					opponentDescriptor: { kind: 'engine', id: 'stockfish' },
					moveCount: gameState.moveHistory.length,
					getWinnerColor,
					enabled:
						gameMode === 'ai' &&
						gameStarted &&
						activeSession.opponent.kind === 'engine' &&
						isSameStartingUser,
					isAuthenticated,
					userId: user?.id,
					debugVariantKey: 'CHESS',
				}
			: {
					gameVariant: 'chess',
					gameStatus: effectiveStatus,
					aiPlayer: activeSession?.rivalSide ?? previewRivalSide,
					aiConfig: llmHistoryConfig,
					moveCount: gameState.moveHistory.length,
					getWinnerColor,
					enabled: gameMode === 'ai' && gameStarted,
					isAuthenticated,
					userId: user?.id,
					debugVariantKey: 'CHESS',
				}
	);

	// Latch game-ended when the game finishes (the hook owns the actual
	// play-history save + dedup).
	useEffect(() => {
		if (gameOver && !hasGameEnded) {
			setHasGameEnded(true);
		}
	}, [gameOver, hasGameEnded]);

	// Translate provider debug events (thinking / suggested move / errors)
	// into the shared AI debug history. A late event whose request was
	// superseded by a reset/mode-switch is dropped: `pendingRivalGenRef`
	// still holds the request's generation, so once the token is invalidated
	// `isStale` returns true and the stale entry is not appended.
	const handleRivalDebugEvent = useCallback(
		(event: RivalDebugEvent) => {
			if (!isDebugMode) return;
			if (isStale(pendingRivalGenRef.current)) return;
			const { type, message } = event;
			const thinking =
				type === 'ai-debug' || type === 'ai-thinking' ? message : undefined;
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
		},
		[isDebugMode, isStale, createAIMove]
	);

	useEffect(() => {
		rivalDebugHandlerRef.current = handleRivalDebugEvent;
	}, [handleRivalDebugEvent]);

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

	// Rival move handling. Ownership (side/opponent) is read only from the
	// frozen active session — never from the mutable pre-game setup — so a
	// setup change that somehow raced a live game cannot flip who moves.
	const makeRivalMoveAsync = useCallback(async () => {
		const session = rivalSession.activeSession;
		if (!session) return;
		if (
			gameOverRef.current ||
			gameState.isAiThinking ||
			gameState.pendingPromotion ||
			gameState.currentPlayer !== session.rivalSide
		) {
			return;
		}

		const gen = genRef.current;
		pendingRivalGenRef.current = gen;
		const requestState = gameState;

		setGameState(prev => setAIThinking(prev, true));
		setAiError(null);

		const result: RivalMoveResult | null = await rivalSession.requestMove({
			gameState: requestState,
			generation: gen,
			isCurrentGeneration: value => !isStale(value),
			isCurrentFen: fen => gameStateRef.current.fen === fen,
			isRivalTurn: () => {
				const live = gameStateRef.current;
				return (
					!gameOverRef.current &&
					!live.pendingPromotion &&
					live.currentPlayer === session.rivalSide
				);
			},
		});

		// A reset / mode-switch / identity change invalidated this request
		// while the provider was thinking — the board has already been
		// replaced, so bail before touching any state.
		if (isStale(gen)) return;

		const isLlm = session.opponent.kind === 'llm';

		// The hook dropped a stale result (superseded generation / session /
		// provider / FEN, or no longer the rival's turn). Just clear the
		// thinking indicator; the board is preserved.
		if (result === null) {
			setGameState(prev => setAIThinking(prev, false));
			return;
		}

		if (!result.ok) {
			// Typed failure. The board is preserved. Engine failures offer
			// New Game only; LLM failures retain the pause/retry affordance.
			setAiError(
				result.message ?? 'The computer could not produce a valid move.'
			);
			if (isLlm) setIsAiPaused(true);
			setGameState(prev => setAIThinking(prev, false));
			return;
		}

		const newGameState = makeAIMove(
			requestState,
			result.move.from,
			result.move.to,
			result.move.promotion
		);

		if (!newGameState) {
			// The provider returned a move the legality gate rejected. Preserve
			// the board; engine → New Game only, LLM → pause/retry.
			const message = 'The computer suggested an invalid move.';
			rivalSession.reportMoveFailure('invalid-move', message);
			setAiError(message);
			if (isLlm) setIsAiPaused(true);
			setGameState(prev => setAIThinking(prev, false));
			return;
		}

		const updatedGameState = setAIThinking(newGameState, false);
		setGameState(updatedGameState);

		if (isDebugMode) {
			setAiDebugMoves(prev => [
				...prev,
				createAIMove(
					`${result.move.from} → ${result.move.to}`,
					true,
					`✅ Move successful! Status: ${updatedGameState.status}`
				),
			]);
		}

		// Export metadata is preserved for LLM sessions only — the engine
		// carries no prompt/response to export.
		if (gameExporterRef.current && isLlm) {
			const piece = getPieceAt(
				requestState.board,
				algebraicToPosition(result.move.from)
			);
			gameExporterRef.current.addMove(
				Math.floor(requestState.moveHistory.length / 2) + 1,
				requestState.currentPlayer,
				result.move.from,
				result.move.to,
				result.move.promotion ?? piece?.type ?? 'unknown',
				{
					prompt: result.meta?.interaction?.prompt,
					response: result.meta?.interaction?.response,
					reasoning: result.meta?.thinking,
					confidence: result.meta?.confidence,
				}
			);
		}
	}, [gameState, rivalSession, isDebugMode, createAIMove, genRef, isStale]);

	// Retry a paused LLM rival move.
	const retryAIMove = useCallback(() => {
		setAiError(null);
		setIsAiPaused(false);
		rivalSession.clearError();
		// The turn effect re-triggers makeRivalMoveAsync automatically.
	}, [rivalSession]);

	// Effect to trigger rival moves. Turn ownership is read from the frozen
	// active session (never the mutable setup). Config readiness was already
	// validated at Start (the LLM provider froze its config), so this no
	// longer gates on `configPending`.
	useEffect(() => {
		if (
			gameMode === 'ai' &&
			gameStarted &&
			activeSession &&
			gameState.currentPlayer === activeSession.rivalSide &&
			isAITurn(gameState) &&
			!gameOver &&
			!gameState.isAiThinking &&
			!isAiPaused &&
			!gameState.pendingPromotion &&
			!rivalSession.rivalThinking &&
			!rivalSession.rivalError
		) {
			const timer = setTimeout(() => {
				void makeRivalMoveAsync();
			}, 1000); // 1 second delay for better UX

			return () => clearTimeout(timer);
		}
	}, [
		gameState,
		gameMode,
		gameStarted,
		activeSession,
		rivalSession.rivalThinking,
		rivalSession.rivalError,
		makeRivalMoveAsync,
		isAiPaused,
		gameOver,
	]);

	// Keep the pre-game preview a clean human-vs-AI board using the derived
	// rival side. Runs on preference resolution and whenever the selected side
	// (and thus the rival side) changes — but never once a game has started,
	// so a live board is not clobbered. Setup selection is locked while a game
	// is active, so `previewRivalSide` is stable during play.
	useEffect(() => {
		if (gameMode !== 'ai') return;
		if (!rivalSetup.resolved) return;
		if (gameStarted) return;
		setGameState(createInitialGameState('human-vs-ai', previewRivalSide));
	}, [gameMode, rivalSetup.resolved, previewRivalSide, gameStarted]);

	// Game mode handlers
	const toggleToMode = useCallback(
		(newMode: ChessGameMode) => {
			// Same-mode click (the active toggle is still rendered after a
			// game starts via BoardSidePanel): skip the unconditional reset
			// so re-clicking the active mode doesn't wipe the current game
			// and history.
			if (newMode === gameMode) return;
			// Invalidate any in-flight rival move so a stale provider result
			// from the previous mode cannot overwrite the newly selected game
			// state, and dispose the active/candidate provider (Tutorial and
			// every mode switch tears down the rival session). Drop the
			// exporter so the previous session's frozen config (incl. its API
			// key) and prompts are not retained into the new mode.
			invalidate();
			rivalSession.reset();
			gameExporterRef.current = null;
			setGameMode(newMode);
			setGameStarted(false);
			setIsAiPaused(false);
			setAiDebugMoves([]);
			setHasGameEnded(false);
			setForcedOutcome(null);

			if (newMode === 'tutorial') {
				loadTutorial(currentDemo);
			} else if (newMode === 'ai') {
				// Every Play preview is human-vs-AI with the derived rival side;
				// there is no human-vs-human fallback. The preview effect also
				// refreshes this once setup has resolved.
				setGameState(createInitialGameState('human-vs-ai', previewRivalSide));
			}
		},
		[
			loadTutorial,
			currentDemo,
			previewRivalSide,
			invalidate,
			gameMode,
			rivalSession,
		]
	);

	const handleSquareClick = useCallback(
		(position: Position) => {
			if (
				gameOver ||
				gameState.pendingPromotion ||
				(gameMode === 'ai' && gameState.currentPlayer === activeRivalSide) ||
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
		[gameMode, gameState, activeRivalSide, gameOver, recordCompletedHumanMove]
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
		// Invalidate any in-flight rival move so it cannot apply stale
		// setGameState/setAiError results after the reset, and dispose the
		// active/candidate provider so New Game / Play Again / identity reset
		// never leak a Worker or reuse a committed session. The exporter is
		// dropped too so the previous session's frozen config (incl. its API
		// key) and recorded prompts are not retained until the next Start.
		invalidate();
		rivalSession.reset();
		gameExporterRef.current = null;
		setGameState(createInitialGameState('human-vs-ai', previewRivalSide));
		setGameStarted(false);
		setAiDebugMoves([]);
		setIsAiPaused(false);
		setAiError(null);
		setHasGameEnded(false);
		setForcedOutcome(null);
	}, [previewRivalSide, invalidate, rivalSession]);

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
	// makeAIMoveAsync callback skips its setGameState/setAiError calls. The
	// rival setup re-resolves its own opponent/side from the fresh auth
	// snapshot, so no explicit side reset is needed here.
	useGameIdentityReset({
		isAuthenticated,
		userId: user?.id,
		invalidate,
		onReset: () => {
			resetGame();
		},
		// A committed engine session is device-local and unrated, so it
		// continues across logout / account change / config change. Only LLM
		// ownership (setup, Start, and an active LLM session) resets on an
		// identity transition — an active engine session opts out.
		enabled: activeSession?.opponent.kind !== 'engine',
	});

	const {
		triggerDebugWin,
		triggerDebugLoss,
		triggerDebugDraw,
		showDebugWinButton,
	} = useGameDebugOutcomes<'white' | 'black'>({
		aiPlayer: previewRivalSide,
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

	// Atomic Start: create + ready a provider under the session hook, and only
	// commit a fresh human-vs-AI game (and freeze the exporter for LLM) after
	// the provider is ready. A load failure / block commits nothing — the
	// clean editable preview is left intact for a retry.
	const startRivalGame = useCallback(async () => {
		// Freeze the config the LLM provider (and exporter) will use. `debug`
		// is sourced from the live toggle, mirroring the previous behavior of
		// updating the AI service with the current debug flag at Start.
		const startedConfig: AIConfig = { ...aiConfig, debug: isDebugMode };
		const session = await rivalSession.start({
			setup: rivalSetup.setup,
			userId: user?.id ?? null,
			llmConfig: startedConfig,
		});
		if (!session) return;

		// A fresh generation so the first rival move (and any stale in-flight
		// work from a prior game) is cleanly separated.
		invalidate();
		setForcedOutcome(null);
		setGameState(createInitialGameState('human-vs-ai', session.rivalSide));
		setAiDebugMoves([]);
		setIsAiPaused(false);
		setAiError(null);
		setHasGameEnded(false);
		setGameStarted(true);

		gameExporterRef.current =
			session.opponent.kind === 'llm'
				? new GameExporter('chess', startedConfig)
				: null;
	}, [
		aiConfig,
		isDebugMode,
		rivalSession,
		rivalSetup.setup,
		user?.id,
		invalidate,
	]);

	const handleStartOrReset = useCallback(() => {
		if (gameStarted) {
			resetGame();
			return;
		}
		if (!rivalSetup.resolved) return; // preference hydration not ready
		if (rivalSession.startState === 'starting') return; // Start in flight
		// The selected opponent is not usable: an LLM that is still loading /
		// signed-out / unconfigured (`llm-loading` / `llm-unusable`), or an
		// unsupported engine. An LLM hydration failure resolves the setup back
		// to the engine, whose block reason is null, so an engine Start is not
		// affected by LLM config problems.
		if (rivalSetup.startBlockedReason) return;
		void startRivalGame();
	}, [
		gameStarted,
		resetGame,
		rivalSetup.resolved,
		rivalSetup.startBlockedReason,
		rivalSession.startState,
		startRivalGame,
	]);

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

	const isPlayMode = gameMode === 'ai';
	// In Play mode the board stays hidden behind a neutral skeleton until
	// preference hydration resolves, so it never flashes a White-oriented
	// interactive board or an opponent fallback before the setup is known.
	const showBoard = !isPlayMode || rivalSetup.resolved;
	// Orientation follows the frozen session side once active, otherwise the
	// live pre-game selection.
	const boardOrientation: PieceColor = isPlayMode
		? (activeSession?.humanSide ?? rivalSetup.setup.humanSide)
		: 'white';
	const rivalStarting = rivalSession.startState === 'starting';
	// Pre-game the Start control always reads "▶️ Start" (so it stays findable
	// even when disabled by a block reason); an engine Start attempt swaps in
	// the loading copy, and once started the default "🆕 New Game" label
	// applies (`startLabel` left undefined).
	const startControlLabel: React.ReactNode = gameStarted
		? undefined
		: rivalStarting && rivalSetup.setup.rivalKind === 'engine'
			? '⏳ Loading on-device computer…'
			: '▶️ Start';
	const boardDisabled =
		Boolean(gameState.pendingPromotion) ||
		Boolean(gameState.isAiThinking) ||
		(isPlayMode && gameState.currentPlayer === activeRivalSide) ||
		gameOver ||
		rivalStarting ||
		(isPlayMode && !rivalSetup.resolved);

	// Selectors lock while a game is committed OR a Start attempt is in
	// flight, and stay locked through a terminal position (until New Game /
	// Play Again). Pre-game they are editable.
	const selectorsLocked = gameStarted || rivalStarting;
	// Engine rival: surface load-failed / thinking / move-failed status and a
	// Try-again affordance via EngineRivalDetails. LLM rival keeps the existing
	// AIStatusPanel pause/retry UI.
	const showEngineDetails =
		rivalSetup.resolved &&
		rivalSetup.setup.rivalKind === 'engine' &&
		activeSession?.opponent.kind !== 'llm';

	const aiConfigured = !!aiConfig.enabled && !!aiConfig.apiKey;
	// The prompt-oriented debug/export tools apply only to a language-model
	// opponent — the engine carries no prompt/response to inspect or export.
	// Pre-Start this follows the selected rival gated on a usable live AI
	// config; once a game is committed it follows the frozen session opponent
	// so an active engine session hides the tools even when an AI provider is
	// configured, and an active LLM session keeps them visible even if the
	// live config is later cleared (Start already proved usability).
	const rivalIsLlm =
		activeSession != null
			? activeSession.opponent.kind === 'llm'
			: rivalSetup.setup.rivalKind === 'llm';
	const showLlmTools =
		activeSession !== null
			? activeSession.opponent.kind === 'llm'
			: rivalSetup.setup.rivalKind === 'llm' && aiConfigured;

	// The LLM details block renders only for a language-model rival. Its
	// provider/model copy is frozen to the active session once a game is
	// committed, so an account switch or config change mid-game cannot swap
	// the shown identity from the one actually playing.
	const sessionLlm =
		activeSession?.opponent.kind === 'llm' ? activeSession.opponent : null;
	const llmUsabilityForDetails: LlmUsability = sessionLlm
		? {
				status: 'available',
				provider: sessionLlm.provider,
				model: sessionLlm.model,
			}
		: rivalSetup.llmUsability;

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
								{showBoard ? (
									<ChessBoard
										board={currentBoard}
										selectedSquare={gameState.selectedSquare}
										possibleMoves={gameState.possibleMoves}
										onSquareClick={handleSquareClick}
										highlightSquares={currentHighlightSquares}
										orientation={boardOrientation}
										disabled={boardDisabled}
									/>
								) : (
									<div
										data-testid='board-loading-skeleton'
										aria-hidden='true'
										className='inline-block h-[34rem] w-[34rem] max-w-full animate-pulse rounded-lg border-2 border-line bg-ink-700'
									/>
								)}
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
								aiConfigured={aiConfigured}
								showLlmTools={showLlmTools}
								startDisabled={
									!gameStarted &&
									(!rivalSetup.resolved ||
										rivalStarting ||
										Boolean(rivalSetup.startBlockedReason))
								}
								startLabel={startControlLabel}
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
				<BoardSidePanel
					gameMode={gameMode}
					onModeChange={toggleToMode}
					aiModeLabel='Play'
				>
					{gameMode === 'ai' ? (
						<>
							{rivalSetup.resolved ? (
								<ChessRivalSetup
									setup={rivalSetup.setup}
									enginePreflight={rivalSetup.enginePreflight}
									llmUsability={llmUsabilityForDetails}
									activeSession={activeSession}
									disabled={selectorsLocked}
									lockReason={
										selectorsLocked
											? 'Finish or reset the current game to change your opponent.'
											: null
									}
									fallbackNotice={
										rivalSetup.fallbackNotice
											? fallbackNoticeMessages[rivalSetup.fallbackNotice]
											: null
									}
									onSelectRival={rivalSetup.selectRival}
									onSelectHumanSide={rivalSetup.selectHumanSide}
									onSelectDifficulty={rivalSetup.selectDifficulty}
								/>
							) : null}
							{showEngineDetails ? (
								<EngineRivalDetails
									enginePreflight={rivalSetup.enginePreflight}
									startState={rivalSession.startState}
									rivalThinking={rivalSession.rivalThinking}
									rivalError={rivalSession.rivalError}
									onRetry={() => void startRivalGame()}
								/>
							) : null}
							{rivalIsLlm ? (
								<LlmRivalDetails
									llmUsability={llmUsabilityForDetails}
									hasGameStarted={gameStarted}
									isAIThinking={gameState.isAiThinking ?? false}
									isAIPaused={isAiPaused}
									aiError={aiError}
									aiDebugMoves={aiDebugMoves}
									isDebugMode={isDebugMode}
									onRetry={retryAIMove}
								/>
							) : null}
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
