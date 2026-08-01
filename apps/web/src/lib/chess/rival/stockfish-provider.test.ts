import { describe, expect, test } from 'bun:test';
import { createInitialGameState } from '../game';
import {
	StockfishRivalProvider,
	type WorkerFactory,
	type WorkerLike,
} from './stockfish-provider';

const skillLevelOption =
	'option name Skill Level type spin default 20 min 0 max 20';
const origin = 'https://play.procyon.test';

class FakeWorker implements WorkerLike {
	readonly commands: string[] = [];
	onmessage: ((event: MessageEvent<string>) => void) | null = null;
	onerror: ((event: ErrorEvent) => void) | null = null;
	terminationCount = 0;

	postMessage(message: string): void {
		this.commands.push(message);
	}

	terminate(): void {
		this.terminationCount += 1;
	}

	emit(message: string): void {
		this.onmessage?.({ data: message } as MessageEvent<string>);
	}

	fail(message = 'worker crashed'): void {
		this.onerror?.({ message } as ErrorEvent);
	}
}

function createHarness(options: { baseUrl?: string } = {}) {
	const factoryHarness = createFactoryHarness();
	const provider = new StockfishRivalProvider({
		workerFactory: factoryHarness.workerFactory,
		origin,
		...options,
	});

	return {
		provider,
		worker: factoryHarness.workers[0]!,
		workers: factoryHarness.workers,
		urls: factoryHarness.urls,
	};
}

function createFactoryHarness() {
	const workers: FakeWorker[] = [];
	const urls: URL[] = [];
	const workerFactory: WorkerFactory = url => {
		urls.push(url);
		const worker = new FakeWorker();
		workers.push(worker);
		return worker;
	};

	return {
		workerFactory,
		workers,
		urls,
	};
}

async function expectPending<T>(promise: Promise<T>): Promise<void> {
	const state = await Promise.race([
		promise.then(
			() => 'resolved' as const,
			() => 'rejected' as const
		),
		Promise.resolve('pending' as const),
	]);

	expect(state).toBe('pending');
}

async function flushProviderTasks(): Promise<void> {
	// The initialization continuation crosses the deferred promise and its
	// cleanup/finally promise. Drain a bounded number of microtask turns rather
	// than relying on a runtime-specific exact count.
	for (let i = 0; i < 10; i++) {
		await Promise.resolve();
	}
}

async function initialize(
	provider: StockfishRivalProvider,
	worker: FakeWorker
) {
	const pending = provider.initialize();
	worker.emit(skillLevelOption);
	worker.emit('uciok');
	await flushProviderTasks();
	worker.emit('readyok');
	await pending;
}

async function beginGame(provider: StockfishRivalProvider, worker: FakeWorker) {
	const pending = provider.beginGame();
	worker.emit('readyok');
	await pending;
}

describe('StockfishRivalProvider', () => {
	test('constructs a same-origin worker URL for the packaged Stockfish script', () => {
		const { urls } = createHarness();

		expect(urls).toHaveLength(1);
		expect(urls[0]?.origin).toBe(origin);
		expect(urls[0]?.pathname).toBe(
			'/vendor/stockfish/stockfish-18-lite-single.js'
		);
	});

	test('honors an injected Astro-style base path for the worker URL', () => {
		const { urls } = createHarness({ baseUrl: '/games/' });

		expect(urls[0]?.origin).toBe(origin);
		expect(urls[0]?.pathname).toBe(
			'/games/vendor/stockfish/stockfish-18-lite-single.js'
		);
	});

	test('initializes UCI, configures Skill Level 0, and waits for readyok', async () => {
		const { provider, worker } = createHarness();

		const pending = provider.initialize();
		expect(worker.commands).toEqual(['uci']);

		worker.emit('id name Stockfish 18');
		worker.emit(skillLevelOption);
		await expectPending(pending);

		worker.emit('uciok');
		await flushProviderTasks();
		expect(worker.commands).toEqual([
			'uci',
			'setoption name Skill Level value 0',
			'isready',
		]);
		expect(worker.commands).not.toContain('ucinewgame');
		await expectPending(pending);

		worker.emit('readyok');
		await expect(pending).resolves.toBeUndefined();
	});

	test('fails initialization when Skill Level is not advertised', async () => {
		const { provider, worker } = createHarness();

		const pending = provider.initialize();
		worker.emit('option name Hash type spin default 16 min 1 max 1024');
		worker.emit('uciok');

		await expect(pending).rejects.toThrow('Skill Level');
		expect(worker.commands).toEqual(['uci']);
	});

	test('dispose is idempotent and terminates the worker once', () => {
		const { provider, worker } = createHarness();

		provider.dispose();
		provider.dispose();

		expect(worker.terminationCount).toBe(1);
	});

	test('beginGame sends ucinewgame, waits for isready, and resolves on readyok', async () => {
		const { provider, worker } = createHarness();
		await initialize(provider, worker);

		const pending = provider.beginGame();

		expect(worker.commands.slice(-2)).toEqual(['ucinewgame', 'isready']);
		await expectPending(pending);

		worker.emit('readyok');
		await expect(pending).resolves.toBeUndefined();
	});

	test('beginGame rejects if the provider is disposed before readyok', async () => {
		const { provider, worker } = createHarness();
		await initialize(provider, worker);

		const pending = provider.beginGame();
		provider.dispose();
		worker.emit('readyok');

		await expect(pending).rejects.toThrow('disposed');
	});

	test('beginGame rejects on worker error', async () => {
		const { provider, worker } = createHarness();
		await initialize(provider, worker);

		const pending = provider.beginGame();
		worker.fail('engine crashed');

		await expect(pending).rejects.toThrow('engine crashed');
	});

	test('a new provider instance owns a fresh worker for a repeated Start', async () => {
		const harness = createFactoryHarness();
		const first = new StockfishRivalProvider({
			workerFactory: harness.workerFactory,
			origin,
		});
		const firstWorker = harness.workers[0]!;
		await initialize(first, firstWorker);
		await beginGame(first, firstWorker);
		first.dispose();

		const second = new StockfishRivalProvider({
			workerFactory: harness.workerFactory,
			origin,
		});
		const secondWorker = harness.workers[1]!;
		await initialize(second, secondWorker);
		await beginGame(second, secondWorker);

		expect(firstWorker).not.toBe(secondWorker);
		expect(harness.urls).toHaveLength(2);
		expect(
			firstWorker.commands.filter(command => command === 'ucinewgame')
		).toHaveLength(1);
		expect(
			secondWorker.commands.filter(command => command === 'ucinewgame')
		).toHaveLength(1);
	});

	test('makeMove sends the current FEN and movetime before resolving one typed move', async () => {
		const { provider, worker } = createHarness();
		await initialize(provider, worker);
		await beginGame(provider, worker);
		const state = createInitialGameState('human-vs-ai', 'black');
		const before = JSON.stringify(state);

		const pending = provider.makeMove(state, 1);

		expect(worker.commands.slice(-2)).toEqual([
			`position fen ${state.fen}`,
			'go movetime 250',
		]);
		worker.emit('info depth 10 score cp 12');
		worker.emit('bestmove e7e5');

		await expect(pending).resolves.toEqual({
			ok: true,
			move: { from: 'e7', to: 'e5' },
		});
		expect(JSON.stringify(state)).toBe(before);
	});

	test('makeMove rejects concurrent requests', async () => {
		const { provider, worker } = createHarness();
		await initialize(provider, worker);
		await beginGame(provider, worker);
		const state = createInitialGameState('human-vs-ai', 'black');

		const first = provider.makeMove(state, 1);
		const second = provider.makeMove(state, 2);

		await expect(second).rejects.toThrow('concurrent');
		worker.emit('bestmove e7e5');
		await expect(first).resolves.toEqual({
			ok: true,
			move: { from: 'e7', to: 'e5' },
		});
	});

	test('makeMove returns typed failures for no move and malformed bestmove output', async () => {
		const noMove = createHarness();
		await initialize(noMove.provider, noMove.worker);
		await beginGame(noMove.provider, noMove.worker);

		const noMoveResult = noMove.provider.makeMove(
			createInitialGameState('human-vs-ai', 'black'),
			1
		);
		noMove.worker.emit('bestmove (none)');
		await expect(noMoveResult).resolves.toEqual({
			ok: false,
			reason: 'no-move',
		});

		const malformed = createHarness();
		await initialize(malformed.provider, malformed.worker);
		await beginGame(malformed.provider, malformed.worker);

		const malformedResult = malformed.provider.makeMove(
			createInitialGameState('human-vs-ai', 'black'),
			2
		);
		malformed.worker.emit('bestmove e9e5');
		await expect(malformedResult).resolves.toEqual({
			ok: false,
			reason: 'invalid-response',
		});
	});

	test('makeMove ignores duplicate later bestmove lines', async () => {
		const { provider, worker } = createHarness();
		await initialize(provider, worker);
		await beginGame(provider, worker);
		const state = createInitialGameState('human-vs-ai', 'black');

		const first = provider.makeMove(state, 1);
		worker.emit('bestmove e7e5');
		await expect(first).resolves.toEqual({
			ok: true,
			move: { from: 'e7', to: 'e5' },
		});

		worker.emit('bestmove a7a5');
		const second = provider.makeMove(state, 2);
		worker.emit('bestmove g8f6');

		await expect(second).resolves.toEqual({
			ok: true,
			move: { from: 'g8', to: 'f6' },
		});
	});

	test('makeMove rejects on disposal and ignores later worker output', async () => {
		const { provider, worker } = createHarness();
		await initialize(provider, worker);
		await beginGame(provider, worker);
		const state = createInitialGameState('human-vs-ai', 'black');

		const pending = provider.makeMove(state, 1);
		provider.dispose();
		worker.emit('bestmove e7e5');

		await expect(pending).rejects.toThrow('disposed');
		expect(worker.terminationCount).toBe(1);
	});
});
