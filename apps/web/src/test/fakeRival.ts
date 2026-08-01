import type { UseChessRivalSessionOptions } from '../hooks';
import type { ChessRivalProvider } from '../lib/chess/rival/provider';
import type { RivalMoveResult } from '../lib/chess/rival/types';
import type { GameState } from '../lib/chess/types';

// Injectable fake rival providers for ChessGame tests.
//
// Task 14 wires `useChessRivalSession` into ChessGame. To exercise Start,
// rival moves, and disposal without constructing a real Stockfish Worker or
// hitting the LLM network, tests inject deterministic provider factories via
// the `rivalSessionOptions` prop. Production renders `<ChessGame />` with no
// props and uses the real providers.

/** A promise whose resolution/rejection is controlled externally. */
export function deferred<T>(): {
	promise: Promise<T>;
	resolve: (value: T) => void;
	reject: (reason?: unknown) => void;
} {
	let resolve!: (value: T) => void;
	let reject!: (reason?: unknown) => void;
	const promise = new Promise<T>((res, rej) => {
		resolve = res;
		reject = rej;
	});
	return { promise, resolve, reject };
}

export interface FakeProviderConfig {
	kind?: 'engine' | 'llm';
	initialize?: () => Promise<void>;
	beginGame?: () => Promise<void>;
	makeMove?: (state: GameState, token: number) => Promise<RivalMoveResult>;
}

export class FakeRivalProvider implements ChessRivalProvider {
	readonly kind: 'engine' | 'llm';
	disposeCount = 0;
	makeMoveCount = 0;
	private readonly cfg: FakeProviderConfig;

	constructor(cfg: FakeProviderConfig = {}) {
		this.cfg = cfg;
		this.kind = cfg.kind ?? 'engine';
	}

	initialize(): Promise<void> {
		return this.cfg.initialize ? this.cfg.initialize() : Promise.resolve();
	}

	beginGame(): Promise<void> {
		return this.cfg.beginGame ? this.cfg.beginGame() : Promise.resolve();
	}

	makeMove(state: GameState, token: number): Promise<RivalMoveResult> {
		this.makeMoveCount += 1;
		return this.cfg.makeMove
			? this.cfg.makeMove(state, token)
			: Promise.resolve({ ok: true, move: { from: 'e2', to: 'e4' } });
	}

	dispose(): void {
		this.disposeCount += 1;
	}
}

/**
 * An engine provider factory that records every constructed instance. Each
 * Start builds a fresh provider, so `instances.length` reflects retries.
 */
export function engineFactory(
	makeCfg: (index: number) => FakeProviderConfig = () => ({})
): { create: () => ChessRivalProvider; instances: FakeRivalProvider[] } {
	const instances: FakeRivalProvider[] = [];
	const create = (): ChessRivalProvider => {
		const provider = new FakeRivalProvider({
			...makeCfg(instances.length),
			kind: 'engine',
		});
		instances.push(provider);
		return provider;
	};
	return { create, instances };
}

export function engineOptions(
	makeCfg?: (index: number) => FakeProviderConfig
): {
	options: UseChessRivalSessionOptions;
	instances: FakeRivalProvider[];
} {
	const factory = engineFactory(makeCfg);
	return {
		options: { createEngineProvider: factory.create },
		instances: factory.instances,
	};
}
