import { describe, expect, jest, mock, test } from 'bun:test';
import { StrictMode } from 'react';
import { act, renderHook } from '@testing-library/react';
import { setupReactDom } from '../test/reactSetup';
import { deferred, FakeRivalProvider } from '../test/fakeRival';
import { createInitialGameState } from '../lib/chess/game';
import type { ChessMoveRequest, GameState } from '../lib/chess/types';
import type { ChessRivalProvider } from '../lib/chess/rival/provider';
import type { GameSetup, RivalMoveResult } from '../lib/chess/rival/types';
import type { AIConfig } from '../lib/ai/types';
import {
	ENGINE_START_TIMEOUT_MS,
	useChessRivalSession,
	type RivalMoveRequestContext,
	type StartRivalSessionInput,
	type UseChessRivalSessionOptions,
} from './useChessRivalSession';

setupReactDom();

const sampleMove: ChessMoveRequest = { from: 'e7', to: 'e5' };
const alternateMove: ChessMoveRequest = { from: 'd7', to: 'd5' };

const engineSetup: GameSetup = { rivalKind: 'engine', humanSide: 'white' };
const llmSetup: GameSetup = { rivalKind: 'llm', humanSide: 'white' };

const availableConfig: AIConfig = {
	provider: 'openai',
	model: 'gpt-4o-mini',
	apiKey: 'sk-test',
	enabled: true,
};

const unconfiguredConfig: AIConfig = {
	provider: 'openai',
	model: '',
	apiKey: '',
	enabled: false,
};

function advanceTimers(ms: number): void {
	(
		jest as unknown as { advanceTimersByTime(ms: number): void }
	).advanceTimersByTime(ms);
}

function orderedEngineFactory(...providers: ChessRivalProvider[]) {
	let index = 0;
	return mock(() => {
		const provider = providers[index];
		index += 1;
		if (!provider) {
			throw new Error('No more engine providers configured');
		}
		return provider;
	});
}

function makeGameState(overrides: Partial<GameState> = {}): GameState {
	return {
		...createInitialGameState('human-vs-ai', 'black'),
		currentPlayer: 'black',
		fen: 'fen-request',
		...overrides,
	};
}

function makeContext(
	gameState: GameState,
	overrides: Partial<RivalMoveRequestContext> = {}
): RivalMoveRequestContext {
	return {
		gameState,
		generation: 1,
		isCurrentGeneration: value => value === 1,
		isCurrentFen: fen => fen === gameState.fen,
		isRivalTurn: () => true,
		...overrides,
	};
}

function startInput(
	overrides: Partial<StartRivalSessionInput> = {}
): StartRivalSessionInput {
	return {
		setup: engineSetup,
		userId: 'user-1',
		llmConfig: availableConfig,
		...overrides,
	};
}

function renderSession(
	options: UseChessRivalSessionOptions = {},
	wrapper?: React.ComponentType<{ children: React.ReactNode }>
) {
	return renderHook(() => useChessRivalSession(options), { wrapper });
}

describe('useChessRivalSession — Start transaction', () => {
	test('Start validates selected usability before constructing a provider', async () => {
		const factory = mock(() => new FakeRivalProvider('llm'));
		const { result } = renderSession({ createLlmProvider: factory });

		let session: unknown;
		await act(async () => {
			session = await result.current.start(
				startInput({ setup: llmSetup, llmConfig: unconfiguredConfig })
			);
		});

		expect(session).toBeNull();
		expect(factory).not.toHaveBeenCalled();
		expect(result.current.startState).toBe('idle');
		expect(result.current.activeSession).toBeNull();
	});

	test('Start disables further Start/requestMove while pending', async () => {
		const provider = new FakeRivalProvider('engine');
		const init = deferred<void>();
		provider.onInitialize = () => init.promise;
		const factory = mock(() => provider);
		const { result } = renderSession({ createEngineProvider: factory });

		let first: Promise<unknown> | undefined;
		act(() => {
			first = result.current.start(startInput());
		});
		expect(result.current.startState).toBe('starting');

		let secondResult: unknown = 'unset';
		let moveResult: unknown = 'unset';
		await act(async () => {
			secondResult = await result.current.start(startInput());
			moveResult = await result.current.requestMove(
				makeContext(makeGameState())
			);
		});
		expect(secondResult).toBeNull();
		expect(moveResult).toBeNull();
		expect(factory).toHaveBeenCalledTimes(1);

		await act(async () => {
			init.resolve();
			await first;
		});
		expect(result.current.activeSession).not.toBeNull();
	});

	test('engine provider is not constructed before Start', () => {
		const factory = mock(() => new FakeRivalProvider('engine'));
		renderSession({ createEngineProvider: factory });
		expect(factory).not.toHaveBeenCalled();
	});

	test('engine Start calls initialize() then beginGame()', async () => {
		const provider = new FakeRivalProvider('engine');
		const { result } = renderSession({
			createEngineProvider: mock(() => provider),
		});

		let session: unknown;
		await act(async () => {
			session = await result.current.start(startInput());
		});

		expect(provider.calls).toEqual(['initialize', 'beginGame']);
		expect(session).not.toBeNull();
		expect(provider.disposeCount).toBe(0);
	});

	test('LLM Start uses a frozen config and freezes the opponent identity', async () => {
		let received: AIConfig | undefined;
		const provider = new FakeRivalProvider('llm');
		const factory = mock((input: { config: AIConfig }) => {
			received = input.config;
			return provider;
		});
		const { result } = renderSession({ createLlmProvider: factory });

		let session: Awaited<ReturnType<typeof result.current.start>> | undefined;
		await act(async () => {
			session = await result.current.start(
				startInput({ setup: llmSetup, llmConfig: availableConfig })
			);
		});

		expect(received).toBeDefined();
		expect(Object.isFrozen(received)).toBe(true);
		expect(session?.opponent).toEqual({
			kind: 'llm',
			provider: 'openai',
			model: 'gpt-4o-mini',
		});
		expect(Object.isFrozen(session?.opponent)).toBe(true);
	});

	test('60-second timeout disposes the candidate and commits nothing', async () => {
		const provider = new FakeRivalProvider('engine');
		provider.onInitialize = () => new Promise<void>(() => {});
		const { result } = renderSession({
			createEngineProvider: mock(() => provider),
		});

		jest.useFakeTimers();
		try {
			let pending: Promise<unknown> | undefined;
			act(() => {
				pending = result.current.start(startInput());
			});
			expect(result.current.startState).toBe('starting');

			let outcome: unknown = 'unset';
			await act(async () => {
				advanceTimers(ENGINE_START_TIMEOUT_MS);
				outcome = await pending;
			});
			expect(outcome).toBeNull();
			expect(provider.disposeCount).toBe(1);
			expect(result.current.activeSession).toBeNull();
		} finally {
			jest.useRealTimers();
		}
	});

	test('timeout is classified as load-failed, not unsupported', async () => {
		const provider = new FakeRivalProvider('engine');
		provider.onInitialize = () => new Promise<void>(() => {});
		const { result } = renderSession({
			createEngineProvider: mock(() => provider),
		});

		jest.useFakeTimers();
		try {
			let pending: Promise<unknown> | undefined;
			act(() => {
				pending = result.current.start(startInput());
			});
			await act(async () => {
				advanceTimers(ENGINE_START_TIMEOUT_MS);
				await pending;
			});
			expect(result.current.startState).toBe('load-failed');
			expect(result.current.rivalError).toBeNull();
		} finally {
			jest.useRealTimers();
		}
	});

	test('failed initialize commits nothing and disposes the candidate', async () => {
		const provider = new FakeRivalProvider('engine');
		provider.onInitialize = async () => {
			throw new Error('init failed');
		};
		const { result } = renderSession({
			createEngineProvider: mock(() => provider),
		});

		let session: unknown;
		await act(async () => {
			session = await result.current.start(startInput());
		});

		expect(session).toBeNull();
		expect(result.current.startState).toBe('load-failed');
		expect(result.current.activeSession).toBeNull();
		expect(provider.disposeCount).toBe(1);
	});

	test('failed beginGame commits nothing and disposes the candidate', async () => {
		const provider = new FakeRivalProvider('engine');
		provider.onBeginGame = async () => {
			throw new Error('begin failed');
		};
		const { result } = renderSession({
			createEngineProvider: mock(() => provider),
		});

		let session: unknown;
		await act(async () => {
			session = await result.current.start(startInput());
		});

		expect(session).toBeNull();
		expect(result.current.startState).toBe('load-failed');
		expect(result.current.activeSession).toBeNull();
		expect(provider.disposeCount).toBe(1);
	});

	test('successful Start returns one frozen session backed by a single provider', async () => {
		const provider = new FakeRivalProvider('engine');
		const factory = mock(() => provider);
		const { result } = renderSession({ createEngineProvider: factory });

		let session: Awaited<ReturnType<typeof result.current.start>> | undefined;
		await act(async () => {
			session = await result.current.start(startInput());
		});

		expect(session).not.toBeNull();
		expect(Object.isFrozen(session)).toBe(true);
		expect(factory).toHaveBeenCalledTimes(1);
		expect(result.current.activeSession).toEqual(session ?? null);
		expect(session?.opponent).toEqual({ kind: 'engine', id: 'stockfish' });
	});

	test('startedByUserId captures the current user or null', async () => {
		const { result } = renderSession({
			createEngineProvider: orderedEngineFactory(
				new FakeRivalProvider('engine'),
				new FakeRivalProvider('engine')
			),
		});

		let identified:
			| Awaited<ReturnType<typeof result.current.start>>
			| undefined;
		await act(async () => {
			identified = await result.current.start(
				startInput({ userId: 'user-42' })
			);
		});
		expect(identified?.startedByUserId).toBe('user-42');

		let anonymous: Awaited<ReturnType<typeof result.current.start>> | undefined;
		await act(async () => {
			anonymous = await result.current.start(startInput({ userId: null }));
		});
		expect(anonymous?.startedByUserId).toBeNull();
	});

	test('rival is eligible to move only after commit', async () => {
		const provider = new FakeRivalProvider('engine');
		const init = deferred<void>();
		provider.onInitialize = () => init.promise;
		const { result } = renderSession({
			createEngineProvider: mock(() => provider),
		});

		const rivalWhiteSetup: GameSetup = {
			rivalKind: 'engine',
			humanSide: 'black',
		};
		const gameState = makeGameState({ currentPlayer: 'white' });

		let start: Promise<unknown> | undefined;
		act(() => {
			start = result.current.start(startInput({ setup: rivalWhiteSetup }));
		});

		let beforeCommit: unknown = 'unset';
		await act(async () => {
			beforeCommit = await result.current.requestMove(makeContext(gameState));
		});
		expect(beforeCommit).toBeNull();
		expect(provider.makeMoveCount).toBe(0);

		await act(async () => {
			init.resolve();
			await start;
		});

		let afterCommit: unknown = 'unset';
		await act(async () => {
			afterCommit = await result.current.requestMove(makeContext(gameState));
		});
		expect(afterCommit).toEqual({ ok: true, move: sampleMove });
		expect(provider.makeMoveCount).toBe(1);
	});

	test('reset disposes an in-flight candidate without committing', async () => {
		const provider = new FakeRivalProvider('engine');
		const init = deferred<void>();
		provider.onInitialize = () => init.promise;
		const { result } = renderSession({
			createEngineProvider: mock(() => provider),
		});

		let start: Promise<unknown> | undefined;
		act(() => {
			start = result.current.start(startInput());
		});
		expect(result.current.startState).toBe('starting');

		act(() => {
			result.current.reset();
		});
		expect(provider.disposeCount).toBe(1);
		expect(result.current.startState).toBe('idle');
		expect(result.current.activeSession).toBeNull();

		await act(async () => {
			init.resolve();
			await start;
		});
		expect(result.current.activeSession).toBeNull();
		expect(provider.disposeCount).toBe(1);
	});

	test('a stale Start settling after a new Start cannot clear the new attempt', async () => {
		const providerA = new FakeRivalProvider('engine');
		const initA = deferred<void>();
		providerA.onInitialize = () => initA.promise;
		const providerB = new FakeRivalProvider('engine');
		const initB = deferred<void>();
		providerB.onInitialize = () => initB.promise;
		const { result, unmount } = renderSession({
			createEngineProvider: orderedEngineFactory(providerA, providerB),
		});

		let startA: Promise<unknown> | undefined;
		act(() => {
			startA = result.current.start(startInput());
		});
		expect(result.current.startState).toBe('starting');

		act(() => {
			result.current.reset();
		});
		expect(providerA.disposeCount).toBe(1);

		let startB: Promise<unknown> | undefined;
		act(() => {
			startB = result.current.start(startInput());
		});
		expect(result.current.startState).toBe('starting');

		// Stale A settles. It must not clear B's in-flight flag, commit, or
		// double-dispose A (reset already disposed it).
		await act(async () => {
			initA.resolve();
			await startA;
		});
		expect(result.current.activeSession).toBeNull();
		expect(result.current.startState).toBe('starting');
		expect(providerA.disposeCount).toBe(1);

		// A subsequent Start is rejected while B is still in flight.
		let startC: unknown = 'unset';
		await act(async () => {
			startC = await result.current.start(startInput());
		});
		expect(startC).toBeNull();

		// B commits when its initialization resolves; A stays disposed once.
		await act(async () => {
			initB.resolve();
			await startB;
		});
		expect(result.current.activeSession).not.toBeNull();
		expect(providerA.disposeCount).toBe(1);
		expect(providerB.disposeCount).toBe(0);

		// Reset disposes the active B provider.
		act(() => {
			result.current.reset();
		});
		expect(providerB.disposeCount).toBe(1);
		unmount();
	});

	test('reset disposes an active committed provider', async () => {
		const provider = new FakeRivalProvider('engine');
		const { result } = renderSession({
			createEngineProvider: mock(() => provider),
		});

		await act(async () => {
			await result.current.start(startInput());
		});
		expect(result.current.activeSession).not.toBeNull();

		act(() => {
			result.current.reset();
		});
		expect(provider.disposeCount).toBe(1);
		expect(result.current.activeSession).toBeNull();
		expect(result.current.startState).toBe('idle');
	});

	test('Strict Mode replay leaks no provider or Worker', async () => {
		const provider = new FakeRivalProvider('engine');
		const factory = mock(() => provider);
		const { result, unmount } = renderSession(
			{ createEngineProvider: factory },
			StrictMode
		);

		expect(factory).not.toHaveBeenCalled();

		await act(async () => {
			await result.current.start(startInput());
		});
		expect(factory).toHaveBeenCalledTimes(1);

		unmount();
		expect(provider.disposeCount).toBe(1);
	});
});

describe('useChessRivalSession — move ownership', () => {
	async function startedSession(provider: FakeRivalProvider) {
		const rendered = renderSession({
			createEngineProvider: mock(() => provider),
		});
		await act(async () => {
			await rendered.result.current.start(startInput());
		});
		return rendered;
	}

	test('requestMove returns null without an active session', async () => {
		const { result } = renderSession();
		let moveResult: unknown = 'unset';
		await act(async () => {
			moveResult = await result.current.requestMove(
				makeContext(makeGameState())
			);
		});
		expect(moveResult).toBeNull();
	});

	test('accepts a current result and stops thinking', async () => {
		const provider = new FakeRivalProvider('engine');
		const { result } = await startedSession(provider);

		let moveResult: unknown = 'unset';
		await act(async () => {
			moveResult = await result.current.requestMove(
				makeContext(makeGameState())
			);
		});

		expect(moveResult).toEqual({ ok: true, move: sampleMove });
		expect(result.current.rivalThinking).toBe(false);
		expect(provider.makeMoveCount).toBe(1);
	});

	test('ignores a result from a stale generation', async () => {
		const provider = new FakeRivalProvider('engine');
		const move = deferred<RivalMoveResult>();
		provider.onMakeMove = () => move.promise;
		const { result } = await startedSession(provider);

		let generationCurrent = true;
		const context = makeContext(makeGameState(), {
			isCurrentGeneration: value => generationCurrent && value === 1,
		});

		let pending: Promise<unknown> | undefined;
		act(() => {
			pending = result.current.requestMove(context);
		});
		expect(result.current.rivalThinking).toBe(true);

		generationCurrent = false;
		let moveResult: unknown = 'unset';
		await act(async () => {
			move.resolve({ ok: true, move: sampleMove });
			moveResult = await pending;
		});

		expect(moveResult).toBeNull();
		expect(result.current.rivalThinking).toBe(false);
	});

	test('ignores a result after the session was reset', async () => {
		const provider = new FakeRivalProvider('engine');
		const move = deferred<RivalMoveResult>();
		provider.onMakeMove = () => move.promise;
		const { result } = await startedSession(provider);

		let pending: Promise<unknown> | undefined;
		act(() => {
			pending = result.current.requestMove(makeContext(makeGameState()));
		});

		act(() => {
			result.current.reset();
		});

		let moveResult: unknown = 'unset';
		await act(async () => {
			move.resolve({ ok: true, move: sampleMove });
			moveResult = await pending;
		});
		expect(moveResult).toBeNull();
	});

	test('ignores a result after the provider was replaced', async () => {
		const providerA = new FakeRivalProvider('engine');
		const move = deferred<RivalMoveResult>();
		providerA.onMakeMove = () => move.promise;
		const providerB = new FakeRivalProvider('engine');
		const { result } = renderSession({
			createEngineProvider: orderedEngineFactory(providerA, providerB),
		});
		await act(async () => {
			await result.current.start(startInput());
		});

		let pending: Promise<unknown> | undefined;
		act(() => {
			pending = result.current.requestMove(makeContext(makeGameState()));
		});

		await act(async () => {
			await result.current.start(startInput());
		});
		expect(providerA.disposeCount).toBe(1);

		let moveResult: unknown = 'unset';
		await act(async () => {
			move.resolve({ ok: true, move: sampleMove });
			moveResult = await pending;
		});
		expect(moveResult).toBeNull();
	});

	test('ignores a result when the board FEN changed', async () => {
		const provider = new FakeRivalProvider('engine');
		const move = deferred<RivalMoveResult>();
		provider.onMakeMove = () => move.promise;
		const { result } = await startedSession(provider);

		let fenCurrent = true;
		const gameState = makeGameState();
		const context = makeContext(gameState, {
			isCurrentFen: fen => fenCurrent && fen === gameState.fen,
		});

		let pending: Promise<unknown> | undefined;
		act(() => {
			pending = result.current.requestMove(context);
		});

		fenCurrent = false;
		let moveResult: unknown = 'unset';
		await act(async () => {
			move.resolve({ ok: true, move: sampleMove });
			moveResult = await pending;
		});
		expect(moveResult).toBeNull();
	});

	test('ignores a result when it is no longer the rival turn', async () => {
		const provider = new FakeRivalProvider('engine');
		const move = deferred<RivalMoveResult>();
		provider.onMakeMove = () => move.promise;
		const { result } = await startedSession(provider);

		let rivalTurn = true;
		const context = makeContext(makeGameState(), {
			isRivalTurn: () => rivalTurn,
		});

		let pending: Promise<unknown> | undefined;
		act(() => {
			pending = result.current.requestMove(context);
		});

		rivalTurn = false;
		let moveResult: unknown = 'unset';
		await act(async () => {
			move.resolve({ ok: true, move: sampleMove });
			moveResult = await pending;
		});
		expect(moveResult).toBeNull();
	});

	test('accepts at most one result per request', async () => {
		const provider = new FakeRivalProvider('engine');
		const first = deferred<RivalMoveResult>();
		const second = deferred<RivalMoveResult>();
		let call = 0;
		provider.onMakeMove = () => {
			const promise = call === 0 ? first.promise : second.promise;
			call += 1;
			return promise;
		};
		const { result } = await startedSession(provider);
		const gameState = makeGameState();

		let firstPending: Promise<unknown> | undefined;
		let secondPending: Promise<unknown> | undefined;
		act(() => {
			firstPending = result.current.requestMove(makeContext(gameState));
		});
		act(() => {
			secondPending = result.current.requestMove(makeContext(gameState));
		});

		let firstResult: unknown = 'unset';
		await act(async () => {
			first.resolve({ ok: true, move: sampleMove });
			firstResult = await firstPending;
		});
		expect(firstResult).toBeNull();

		let secondResult: unknown = 'unset';
		await act(async () => {
			second.resolve({ ok: true, move: alternateMove });
			secondResult = await secondPending;
		});
		expect(secondResult).toEqual({ ok: true, move: alternateMove });
	});

	test('typed failure preserves the board and exposes a basic error', async () => {
		const provider = new FakeRivalProvider('engine');
		provider.onMakeMove = async () => ({ ok: false, reason: 'no-move' });
		const { result } = await startedSession(provider);

		let moveResult: unknown = 'unset';
		await act(async () => {
			moveResult = await result.current.requestMove(
				makeContext(makeGameState())
			);
		});

		expect(moveResult).toEqual({ ok: false, reason: 'no-move' });
		expect(result.current.rivalThinking).toBe(false);
		expect(result.current.rivalError?.kind).toBe('move-failed');
		expect(result.current.rivalError?.reason).toBe('no-move');
		expect(result.current.rivalError?.message).toBeTruthy();
	});

	test('unexpected thrown failure preserves the board and exposes an error', async () => {
		const provider = new FakeRivalProvider('engine');
		provider.onMakeMove = async () => {
			throw new Error('worker crashed');
		};
		const { result } = await startedSession(provider);

		let moveResult: unknown = 'unset';
		await act(async () => {
			moveResult = await result.current.requestMove(
				makeContext(makeGameState())
			);
		});

		expect(moveResult).toEqual({
			ok: false,
			reason: 'protocol-error',
			message: 'worker crashed',
		});
		expect(result.current.rivalThinking).toBe(false);
		expect(result.current.rivalError?.kind).toBe('unexpected');
		expect(result.current.rivalError?.message).toBe('worker crashed');
	});

	test('clearError clears a surfaced rival error', async () => {
		const provider = new FakeRivalProvider('engine');
		provider.onMakeMove = async () => ({ ok: false, reason: 'no-move' });
		const { result } = await startedSession(provider);

		await act(async () => {
			await result.current.requestMove(makeContext(makeGameState()));
		});
		expect(result.current.rivalError).not.toBeNull();

		act(() => {
			result.current.clearError();
		});
		expect(result.current.rivalError).toBeNull();
	});

	test('unmount disposes the active provider', async () => {
		const provider = new FakeRivalProvider('engine');
		const { result, unmount } = renderSession({
			createEngineProvider: mock(() => provider),
		});
		await act(async () => {
			await result.current.start(startInput());
		});

		unmount();
		expect(provider.disposeCount).toBe(1);
	});

	test('active engine session survives auth/config-driven rerenders', async () => {
		const provider = new FakeRivalProvider('engine');
		const { result, rerender } = renderHook(
			(props: UseChessRivalSessionOptions) => useChessRivalSession(props),
			{ initialProps: { createEngineProvider: mock(() => provider) } }
		);
		await act(async () => {
			await result.current.start(startInput());
		});
		const session = result.current.activeSession;
		expect(session).not.toBeNull();

		rerender({
			createEngineProvider: mock(() => new FakeRivalProvider('engine')),
		});

		expect(result.current.activeSession).toBe(session);
		expect(provider.disposeCount).toBe(0);
	});

	test('active LLM identity reset is delegated to caller policy', async () => {
		const provider = new FakeRivalProvider('llm');
		const { result, rerender } = renderHook(
			(props: UseChessRivalSessionOptions) => useChessRivalSession(props),
			{ initialProps: { createLlmProvider: () => provider } }
		);
		await act(async () => {
			await result.current.start(
				startInput({ setup: llmSetup, llmConfig: availableConfig })
			);
		});
		const session = result.current.activeSession;

		rerender({ createLlmProvider: () => new FakeRivalProvider('llm') });
		expect(result.current.activeSession).toBe(session);
		expect(provider.disposeCount).toBe(0);

		act(() => {
			result.current.reset();
		});
		expect(provider.disposeCount).toBe(1);
		expect(result.current.activeSession).toBeNull();
	});
});
