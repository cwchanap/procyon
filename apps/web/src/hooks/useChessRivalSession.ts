import { useCallback, useEffect, useRef, useState } from 'react';
import type { AIConfig } from '../lib/ai/types';
import type { GameState } from '../lib/chess/types';
import { createLlmRivalProvider } from '../lib/chess/rival/llm-provider';
import type { ChessRivalProvider } from '../lib/chess/rival/provider';
import { StockfishRivalProvider } from '../lib/chess/rival/stockfish-provider';
import {
	getRivalSide,
	type ActiveRivalSession,
	type ChessOpponent,
	type GameSetup,
	type RivalMoveFailureReason,
	type RivalMoveResult,
} from '../lib/chess/rival/types';

/**
 * Deadline for a rival Start attempt. A candidate provider that has not
 * finished `initialize()`/`beginGame()` within this window is treated as a
 * load failure — its Worker is disposed and never reused.
 */
export const ENGINE_START_TIMEOUT_MS = 60_000;

export interface StartRivalSessionInput {
	setup: GameSetup;
	userId: string | null;
	llmConfig: AIConfig;
}

/**
 * Ownership snapshot the caller passes for a single rival move request. The
 * hook captures these guards when the request is made and re-checks them when
 * the provider result returns so it can drop stale results.
 */
export interface RivalMoveRequestContext {
	/** Read-only board snapshot the provider computes its move from. */
	gameState: GameState;
	/** Generation token captured for this request. */
	generation: number;
	/** Live check: is the captured generation still current? */
	isCurrentGeneration(value: number): boolean;
	/** Live check: does the captured FEN still match the live board? */
	isCurrentFen(fen: string): boolean;
	/** Live check: is it still the rival's turn to move? */
	isRivalTurn(): boolean;
}

export type RivalSessionStartState = 'idle' | 'starting' | 'load-failed';

export interface RivalSessionError {
	kind: 'move-failed' | 'unexpected';
	reason?: RivalMoveFailureReason;
	message: string;
}

export interface UseChessRivalSessionOptions {
	createEngineProvider?: () => ChessRivalProvider;
	createLlmProvider?: (input: { config: AIConfig }) => ChessRivalProvider;
}

export interface UseChessRivalSessionResult {
	activeSession: ActiveRivalSession | null;
	startState: RivalSessionStartState;
	rivalThinking: boolean;
	rivalError: RivalSessionError | null;
	start(input: StartRivalSessionInput): Promise<ActiveRivalSession | null>;
	requestMove(
		context: RivalMoveRequestContext
	): Promise<RivalMoveResult | null>;
	reportMoveFailure(reason: RivalMoveFailureReason, message?: string): void;
	reset(): void;
	clearError(): void;
}

interface PendingMoveRequest {
	requestId: number;
	generation: number;
	sessionId: number;
	provider: ChessRivalProvider;
	fen: string;
}

const failureMessages: Record<RivalMoveFailureReason, string> = {
	'no-move': 'The opponent did not return a move.',
	'invalid-response': 'The opponent returned an invalid response.',
	'invalid-move': 'The opponent attempted an invalid move.',
	'protocol-error': 'The opponent failed to communicate a move.',
};

function defaultCreateEngineProvider(): ChessRivalProvider {
	return new StockfishRivalProvider();
}

function defaultCreateLlmProvider({
	config,
}: {
	config: AIConfig;
}): ChessRivalProvider {
	return createLlmRivalProvider({ config, debug: config.debug ?? false });
}

function isSetupUsable(input: StartRivalSessionInput): boolean {
	if (input.setup.rivalKind === 'engine') {
		return true;
	}
	const { llmConfig } = input;
	return (
		llmConfig.enabled &&
		llmConfig.apiKey.trim().length > 0 &&
		llmConfig.model.trim().length > 0
	);
}

function opponentFor(setup: GameSetup, config: AIConfig): ChessOpponent {
	if (setup.rivalKind === 'engine') {
		return { kind: 'engine', id: 'stockfish' };
	}
	return { kind: 'llm', provider: config.provider, model: config.model };
}

/**
 * Owns the async lifecycle of a committed chess rival: Start attempts (with a
 * load deadline), the frozen {@link ActiveRivalSession}, provider ownership,
 * per-request move ownership/staleness, failure state, and disposal.
 *
 * The hook never mutates chess board state. Callers apply successful
 * {@link RivalMoveResult} moves themselves and feed the FEN/turn/generation
 * guards back in through {@link RivalMoveRequestContext} so the hook can drop
 * stale results.
 */
export function useChessRivalSession(
	options: UseChessRivalSessionOptions = {}
): UseChessRivalSessionResult {
	const engineFactoryRef = useRef(
		options.createEngineProvider ?? defaultCreateEngineProvider
	);
	engineFactoryRef.current =
		options.createEngineProvider ?? defaultCreateEngineProvider;
	const llmFactoryRef = useRef(
		options.createLlmProvider ?? defaultCreateLlmProvider
	);
	llmFactoryRef.current = options.createLlmProvider ?? defaultCreateLlmProvider;

	const [activeSession, setActiveSession] = useState<ActiveRivalSession | null>(
		null
	);
	const [startState, setStartState] = useState<RivalSessionStartState>('idle');
	const [rivalThinking, setRivalThinking] = useState(false);
	const [rivalError, setRivalError] = useState<RivalSessionError | null>(null);

	// Committed provider/session (also mirrored to refs so async callbacks can
	// re-check ownership without stale closures).
	const providerRef = useRef<ChessRivalProvider | null>(null);
	const activeSessionRef = useRef<ActiveRivalSession | null>(null);
	// The in-flight Start candidate, tracked so reset()/unmount can dispose it.
	const candidateRef = useRef<ChessRivalProvider | null>(null);
	const pendingRequestRef = useRef<PendingMoveRequest | null>(null);

	const attemptCounterRef = useRef(0);
	const currentAttemptRef = useRef<number | null>(null);
	const startInFlightRef = useRef(false);
	const sessionCounterRef = useRef(0);
	const requestCounterRef = useRef(0);

	const start = useCallback(
		async (
			input: StartRivalSessionInput
		): Promise<ActiveRivalSession | null> => {
			if (startInFlightRef.current) {
				return null;
			}
			if (!isSetupUsable(input)) {
				return null;
			}

			startInFlightRef.current = true;
			const attemptId = (attemptCounterRef.current += 1);
			currentAttemptRef.current = attemptId;
			setStartState('starting');
			setRivalError(null);

			const frozenConfig = Object.freeze({
				...input.llmConfig,
			}) as AIConfig;

			let candidate: ChessRivalProvider;
			try {
				candidate =
					input.setup.rivalKind === 'engine'
						? engineFactoryRef.current()
						: llmFactoryRef.current({ config: frozenConfig });
			} catch {
				startInFlightRef.current = false;
				if (currentAttemptRef.current === attemptId) {
					currentAttemptRef.current = null;
					setStartState('load-failed');
				}
				return null;
			}
			candidateRef.current = candidate;

			let timeoutHandle: ReturnType<typeof setTimeout> | null = null;
			const deadline = new Promise<'timeout'>(resolve => {
				timeoutHandle = setTimeout(
					() => resolve('timeout'),
					ENGINE_START_TIMEOUT_MS
				);
			});

			const sequence = (async (): Promise<'ready' | 'stale'> => {
				await candidate.initialize();
				if (currentAttemptRef.current !== attemptId) {
					return 'stale';
				}
				await candidate.beginGame();
				if (currentAttemptRef.current !== attemptId) {
					return 'stale';
				}
				return 'ready';
			})();

			let outcome: 'timeout' | 'ready' | 'stale' | 'error';
			try {
				outcome = await Promise.race([sequence, deadline]);
			} catch {
				outcome = 'error';
			}

			if (timeoutHandle !== null) {
				clearTimeout(timeoutHandle);
			}
			// Swallow any late rejection so a provider that fails after the
			// deadline cannot surface an unhandled rejection.
			sequence.catch(() => {});

			startInFlightRef.current = false;

			if (outcome !== 'ready') {
				// Only dispose when we still own the candidate — reset() may have
				// already taken and disposed it.
				if (candidateRef.current === candidate) {
					candidateRef.current = null;
					candidate.dispose();
				}
				if (
					(outcome === 'timeout' || outcome === 'error') &&
					currentAttemptRef.current === attemptId
				) {
					currentAttemptRef.current = null;
					setStartState('load-failed');
				}
				return null;
			}

			const previousProvider = providerRef.current;
			const session = Object.freeze({
				id: (sessionCounterRef.current += 1),
				opponent: Object.freeze(opponentFor(input.setup, frozenConfig)),
				humanSide: input.setup.humanSide,
				rivalSide: getRivalSide(input.setup.humanSide),
				startedByUserId: input.userId,
				...(input.setup.rivalKind === 'llm'
					? { startedConfig: frozenConfig }
					: {}),
			}) as ActiveRivalSession;

			candidateRef.current = null;
			providerRef.current = candidate;
			activeSessionRef.current = session;
			currentAttemptRef.current = null;
			pendingRequestRef.current = null;

			if (previousProvider && previousProvider !== candidate) {
				previousProvider.dispose();
			}

			setActiveSession(session);
			setStartState('idle');
			setRivalThinking(false);
			return session;
		},
		[]
	);

	const requestMove = useCallback(
		async (
			context: RivalMoveRequestContext
		): Promise<RivalMoveResult | null> => {
			const provider = providerRef.current;
			const session = activeSessionRef.current;
			if (!provider || !session) {
				return null;
			}
			if (context.gameState.currentPlayer !== session.rivalSide) {
				return null;
			}
			if (!context.isRivalTurn()) {
				return null;
			}

			const requestId = (requestCounterRef.current += 1);
			const pending: PendingMoveRequest = {
				requestId,
				generation: context.generation,
				sessionId: session.id,
				provider,
				fen: context.gameState.fen,
			};
			pendingRequestRef.current = pending;
			setRivalThinking(true);

			const isCurrent = (): boolean =>
				pendingRequestRef.current === pending &&
				context.isCurrentGeneration(pending.generation) &&
				activeSessionRef.current?.id === pending.sessionId &&
				providerRef.current === pending.provider &&
				context.isCurrentFen(pending.fen) &&
				context.isRivalTurn();

			const resolvePending = (): void => {
				if (pendingRequestRef.current === pending) {
					pendingRequestRef.current = null;
					setRivalThinking(false);
				}
			};

			let result: RivalMoveResult;
			try {
				result = await provider.makeMove(context.gameState, requestId);
			} catch (error) {
				if (!isCurrent()) {
					resolvePending();
					return null;
				}
				resolvePending();
				const message = error instanceof Error ? error.message : String(error);
				setRivalError({ kind: 'unexpected', message });
				return { ok: false, reason: 'protocol-error', message };
			}

			if (!isCurrent()) {
				resolvePending();
				return null;
			}

			resolvePending();
			if (!result.ok) {
				setRivalError({
					kind: 'move-failed',
					reason: result.reason,
					message: result.message ?? failureMessages[result.reason],
				});
			}
			return result;
		},
		[]
	);

	const reset = useCallback(() => {
		currentAttemptRef.current = null;
		startInFlightRef.current = false;
		pendingRequestRef.current = null;

		const candidate = candidateRef.current;
		candidateRef.current = null;
		const active = providerRef.current;
		providerRef.current = null;
		activeSessionRef.current = null;

		if (candidate) {
			candidate.dispose();
		}
		if (active && active !== candidate) {
			active.dispose();
		}

		setActiveSession(null);
		setStartState('idle');
		setRivalThinking(false);
		setRivalError(null);
	}, []);

	const reportMoveFailure = useCallback(
		(reason: RivalMoveFailureReason, message?: string) => {
			setRivalError({
				kind: 'move-failed',
				reason,
				message: message ?? failureMessages[reason],
			});
		},
		[]
	);

	const clearError = useCallback(() => {
		setRivalError(null);
	}, []);

	useEffect(() => {
		return () => {
			// Unmount disposes any live provider and invalidates in-flight work
			// so Strict Mode replays and real teardown never leak Workers.
			currentAttemptRef.current = null;
			startInFlightRef.current = false;
			pendingRequestRef.current = null;
			candidateRef.current?.dispose();
			candidateRef.current = null;
			providerRef.current?.dispose();
			providerRef.current = null;
			activeSessionRef.current = null;
		};
	}, []);

	return {
		activeSession,
		startState,
		rivalThinking,
		rivalError,
		start,
		requestMove,
		reportMoveFailure,
		reset,
		clearError,
	};
}
