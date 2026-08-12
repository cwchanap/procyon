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
	type EngineDifficulty,
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

/**
 * Deadline for an engine's `makeMove()` to settle. An engine that has not
 * produced a result within this window is treated as hung — its provider is
 * disposed and the request fails with `'timeout'`. LLM providers are not
 * subject to this deadline.
 */
export const ENGINE_MOVE_TIMEOUT_MS = 10_000;

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
	createEngineProvider?: (input: {
		difficulty: EngineDifficulty;
	}) => ChessRivalProvider;
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
	timeout: 'The on-device computer took too long to move.',
};

function defaultCreateEngineProvider({
	difficulty,
}: {
	difficulty: EngineDifficulty;
}): ChessRivalProvider {
	return new StockfishRivalProvider({ difficulty });
}

function defaultCreateLlmProvider({
	config,
}: {
	config: AIConfig;
}): ChessRivalProvider {
	return createLlmRivalProvider({ config });
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
		return {
			kind: 'engine',
			id: 'stockfish',
			difficulty: setup.engineDifficulty,
		};
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
	const llmFactoryRef = useRef(
		options.createLlmProvider ?? defaultCreateLlmProvider
	);
	// Sync factory refs in an effect (not during render) so callers can pass
	// fresh inline factories without triggering a render-time ref mutation.
	useEffect(() => {
		engineFactoryRef.current =
			options.createEngineProvider ?? defaultCreateEngineProvider;
	});
	useEffect(() => {
		llmFactoryRef.current =
			options.createLlmProvider ?? defaultCreateLlmProvider;
	});

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
	// Candidates that reset()/unmount already disposed. A stale Start
	// completion checks membership so it does not double-dispose a candidate
	// reset already cleaned up (provider.dispose is idempotent for the real
	// providers, but the hook avoids relying on that for teardown accounting).
	const disposedCandidatesRef = useRef<WeakSet<ChessRivalProvider>>(
		new WeakSet()
	);
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
						? engineFactoryRef.current({
								difficulty: input.setup.engineDifficulty,
							})
						: llmFactoryRef.current({ config: frozenConfig });
			} catch {
				if (currentAttemptRef.current === attemptId) {
					startInFlightRef.current = false;
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

			const ownsAttempt = currentAttemptRef.current === attemptId;
			// Only clear the in-flight flag when this attempt still owns it.
			// A stale attempt (reset() ran, then a newer Start began) must not
			// clear the flag the newer attempt set.
			if (ownsAttempt) {
				startInFlightRef.current = false;
			}

			if (outcome !== 'ready') {
				// Clear our candidate slot only if we still own it, so a newer
				// attempt's candidate is not dropped. Dispose every non-committed
				// candidate that reset()/unmount has not already disposed —
				// including stale ones no longer in candidateRef. The disposed
				// set retains ownership records for reset-disposed candidates
				// so we never double-dispose.
				if (candidateRef.current === candidate) {
					candidateRef.current = null;
				}
				if (!disposedCandidatesRef.current.has(candidate)) {
					disposedCandidatesRef.current.add(candidate);
					candidate.dispose();
				}
				if (ownsAttempt && (outcome === 'timeout' || outcome === 'error')) {
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

			type ProviderOutcome =
				| { kind: 'result'; result: RivalMoveResult }
				| { kind: 'error'; error: unknown };

			// Rejection handler is attached before the race so a disposal-
			// induced late rejection of the pending move waiter cannot surface
			// as an unhandled rejection (the real Stockfish provider rejects
			// its pending waiter on dispose).
			const providerOutcome: Promise<ProviderOutcome> = provider
				.makeMove(context.gameState, requestId)
				.then(
					result => ({ kind: 'result', result }) as const,
					error => ({ kind: 'error', error }) as const
				);

			let outcome: ProviderOutcome | { kind: 'timeout' };
			if (session.opponent.kind === 'engine') {
				let timeoutHandle: ReturnType<typeof setTimeout> | null = null;
				const deadline = new Promise<{ kind: 'timeout' }>(resolve => {
					timeoutHandle = setTimeout(
						() => resolve({ kind: 'timeout' }),
						ENGINE_MOVE_TIMEOUT_MS
					);
				});
				outcome = await Promise.race([providerOutcome, deadline]);
				if (timeoutHandle !== null) clearTimeout(timeoutHandle);
			} else {
				outcome = await providerOutcome;
			}

			if (outcome.kind === 'timeout') {
				if (!isCurrent()) {
					resolvePending();
					return null;
				}

				if (pendingRequestRef.current === pending) {
					pendingRequestRef.current = null;
				}
				if (providerRef.current === provider) {
					providerRef.current = null;
				}
				setRivalThinking(false);
				provider.dispose();

				const message = failureMessages.timeout;
				setRivalError({ kind: 'move-failed', reason: 'timeout', message });
				return { ok: false, reason: 'timeout', message };
			}

			if (outcome.kind === 'error') {
				if (!isCurrent()) {
					resolvePending();
					return null;
				}
				resolvePending();
				const message =
					outcome.error instanceof Error
						? outcome.error.message
						: String(outcome.error);
				setRivalError({ kind: 'unexpected', message });
				return { ok: false, reason: 'protocol-error', message };
			}

			const result = outcome.result;

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
			disposedCandidatesRef.current.add(candidate);
			candidate.dispose();
		}
		if (active && active !== candidate) {
			disposedCandidatesRef.current.add(active);
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
			if (candidateRef.current) {
				disposedCandidatesRef.current.add(candidateRef.current);
				candidateRef.current.dispose();
			}
			candidateRef.current = null;
			if (providerRef.current) {
				disposedCandidatesRef.current.add(providerRef.current);
				providerRef.current.dispose();
			}
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
