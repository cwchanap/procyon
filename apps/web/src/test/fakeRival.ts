import type { UseChessRivalSessionOptions } from '../hooks';
import type { ChessRivalProvider } from '../lib/chess/rival/provider';
import type {
	EngineDifficulty,
	RivalKind,
	RivalMoveResult,
} from '../lib/chess/rival/types';
import type { GameState } from '../lib/chess/types';
import { RIVAL_PREFERENCES_STORAGE_KEY } from '../lib/chess/rival/preferences';

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
	kind?: RivalKind;
	initialize?: () => Promise<void>;
	beginGame?: () => Promise<void>;
	makeMove?: (state: GameState, token: number) => Promise<RivalMoveResult>;
}

/**
 * Fake rival provider shared by ChessGame and useChessRivalSession tests.
 *
 * Behavior can be configured either at construction (via {@link FakeProviderConfig})
 * or per-instance by assigning the `onInitialize`/`onBeginGame`/`onMakeMove`
 * callbacks after construction — instance callbacks take precedence over the
 * config callbacks. Every method records its invocation on `calls` and bumps
 * the matching counter so tests can assert ordering and call counts.
 */
export class FakeRivalProvider implements ChessRivalProvider {
	readonly kind: RivalKind;
	disposeCount = 0;
	makeMoveCount = 0;
	initializeCount = 0;
	beginGameCount = 0;
	readonly calls: string[] = [];
	onInitialize?: () => Promise<void>;
	onBeginGame?: () => Promise<void>;
	onMakeMove?: (state: GameState, token: number) => Promise<RivalMoveResult>;
	private readonly cfg: FakeProviderConfig;

	constructor(cfg: FakeProviderConfig | RivalKind = {}) {
		this.cfg = typeof cfg === 'string' ? { kind: cfg } : cfg;
		this.kind = this.cfg.kind ?? 'engine';
	}

	initialize(): Promise<void> {
		this.initializeCount += 1;
		this.calls.push('initialize');
		if (this.onInitialize) return this.onInitialize();
		if (this.cfg.initialize) return this.cfg.initialize();
		return Promise.resolve();
	}

	beginGame(): Promise<void> {
		this.beginGameCount += 1;
		this.calls.push('beginGame');
		if (this.onBeginGame) return this.onBeginGame();
		if (this.cfg.beginGame) return this.cfg.beginGame();
		return Promise.resolve();
	}

	makeMove(state: GameState, token: number): Promise<RivalMoveResult> {
		this.makeMoveCount += 1;
		this.calls.push('makeMove');
		if (this.onMakeMove) return this.onMakeMove(state, token);
		if (this.cfg.makeMove) return this.cfg.makeMove(state, token);
		return Promise.resolve({ ok: true, move: { from: 'e7', to: 'e5' } });
	}

	dispose(): void {
		this.disposeCount += 1;
		this.calls.push('dispose');
	}
}

/**
 * An engine provider factory that records every constructed instance. Each
 * Start builds a fresh provider, so `instances.length` reflects retries.
 */
export interface EngineFactoryCall {
	difficulty: EngineDifficulty;
}

export function engineFactory(
	makeCfg: (index: number) => FakeProviderConfig = () => ({})
): {
	create: (input: EngineFactoryCall) => ChessRivalProvider;
	instances: FakeRivalProvider[];
	calls: EngineFactoryCall[];
} {
	const instances: FakeRivalProvider[] = [];
	const calls: EngineFactoryCall[] = [];
	const create = (input: EngineFactoryCall): ChessRivalProvider => {
		calls.push(input);
		const provider = new FakeRivalProvider({
			...makeCfg(instances.length),
			kind: 'engine',
		});
		instances.push(provider);
		return provider;
	};
	return { create, instances, calls };
}

export function engineOptions(
	makeCfg?: (index: number) => FakeProviderConfig
): {
	options: UseChessRivalSessionOptions;
	instances: FakeRivalProvider[];
	calls: EngineFactoryCall[];
} {
	const factory = engineFactory(makeCfg);
	return {
		options: { createEngineProvider: factory.create },
		instances: factory.instances,
		calls: factory.calls,
	};
}

// ---------------------------------------------------------------------------
// Rival test environment harness
//
// ChessGame and CrossVariantInvalidation tests previously each defined their
// own `installAuthedEnv` / `installSaveEnv` / `installAuthedLlmEnv` helpers
// that seeded `window.__PROCYON_INITIAL_AUTH_USER__`, swapped
// `globalThis.fetch` with a URL-based router, and exposed a `restore()` hook.
// `installRivalTestEnv` consolidates that scaffolding behind one configurable
// entry point so the three call sites differ only in their configuration.

export interface InitialAuthUser {
	id?: string;
	email?: string;
	username: string;
}

const DEFAULT_RIVAL_TEST_USER: InitialAuthUser = {
	id: 'user-a',
	email: 'a@test.com',
	username: 'userA',
};

/** Remove the rival-preference and AI-config localStorage keys. */
export function clearRivalPreferences(): void {
	try {
		window.localStorage?.removeItem(RIVAL_PREFERENCES_STORAGE_KEY);
		window.localStorage?.removeItem('procyon_ai_config');
	} catch {
		/* localStorage may be unavailable in some environments */
	}
}

export type RivalTestEnvAiConfig =
	| 'success'
	| 'failure'
	| 'empty'
	| 'llm-configured';

export interface RivalTestEnvConfig {
	/** Auth user to seed; `null` seeds none (anonymous). Defaults to user-a. */
	user?: InitialAuthUser | null;
	/** `/api/auth/session` response. Defaults to `authed`. */
	session?: 'authed' | 'unauth';
	/** `/api/ai-config` response shape. Defaults to `success`. */
	aiConfig?: RivalTestEnvAiConfig;
	/** Capture `/api/play-history` POST bodies and expose a count. */
	capturePlayHistory?: boolean;
	/** Hold the model-generation fetch in-flight until `resolveLLM` is called. */
	deferModelGeneration?: boolean;
	/** Set `import.meta.env.DEV = true` for the env's lifetime. */
	devFlag?: boolean;
}

export interface RivalTestEnv {
	bodies: Array<Record<string, unknown>>;
	playHistoryCount(): number;
	resolveLLM(text: string): void;
	readonly llmFetchCalled: boolean;
	restore(): void;
}

/**
 * Install a rival test environment: seed an auth user, redirect
 * `globalThis.fetch` to deterministic handlers, and (optionally) flip the DEV
 * flag. Always call `restore()` on the returned handle (typically in a
 * `finally` block) to roll back every mutation.
 */
export function installRivalTestEnv(
	config: RivalTestEnvConfig = {}
): RivalTestEnv {
	const user = config.user ?? DEFAULT_RIVAL_TEST_USER;
	const sessionMode = config.session ?? 'authed';
	const aiConfigMode = config.aiConfig ?? 'success';
	const capturePlayHistory = config.capturePlayHistory ?? false;
	const deferModel = config.deferModelGeneration ?? false;

	const authGlobals = window as unknown as Record<string, unknown>;
	const hadInitialAuthUser = '__PROCYON_INITIAL_AUTH_USER__' in authGlobals;
	const originalInitialAuthUser = authGlobals.__PROCYON_INITIAL_AUTH_USER__;
	if (config.user !== null) {
		authGlobals.__PROCYON_INITIAL_AUTH_USER__ = user;
	}
	const originalFetch = globalThis.fetch;
	const originalLocalStorageDesc = Object.getOwnPropertyDescriptor(
		globalThis,
		'localStorage'
	);
	Object.defineProperty(globalThis, 'localStorage', {
		configurable: true,
		value: window.localStorage,
	});
	try {
		window.localStorage.clear();
	} catch {
		/* ignore */
	}

	const bodies: Array<Record<string, unknown>> = [];
	let count = 0;
	const llm = deferred<string>();
	let llmFetchCalled = false;

	(globalThis as unknown as { fetch: unknown }).fetch = ((
		url: string,
		init?: RequestInit
	) => {
		if (capturePlayHistory && url.includes('/play-history')) {
			count++;
			if (init?.body) {
				bodies.push(JSON.parse(init.body as string) as Record<string, unknown>);
			}
			return Promise.resolve({
				ok: true,
				status: 200,
				statusText: 'OK',
				json: () => Promise.resolve({}),
			});
		}
		if (url.includes('/auth/session')) {
			if (sessionMode === 'unauth') {
				return Promise.resolve({
					ok: false,
					status: 401,
					json: () => Promise.resolve({}),
				});
			}
			return Promise.resolve({
				ok: true,
				status: 200,
				json: () => Promise.resolve({ user }),
			});
		}
		if (url.includes('/ai-config')) {
			if (aiConfigMode === 'failure') {
				return Promise.resolve({
					ok: false,
					status: 500,
					json: () => Promise.resolve({}),
					text: () => Promise.resolve(''),
				});
			}
			if (aiConfigMode === 'empty') {
				return Promise.resolve({
					ok: true,
					status: 200,
					json: () => Promise.resolve({ configurations: [] }),
				});
			}
			// 'success' or 'llm-configured' both hydrate a usable OpenAI config.
			if (url.includes('/full')) {
				return Promise.resolve({
					ok: true,
					status: 200,
					json: () =>
						Promise.resolve({
							provider: 'openai',
							apiKey: 'sk-test',
							modelName: 'gpt-4o-mini',
							gameVariant: 'chess',
						}),
				});
			}
			return Promise.resolve({
				ok: true,
				status: 200,
				json: () =>
					Promise.resolve({
						configurations: [
							{
								id: 'c1',
								provider: 'openai',
								isActive: true,
								hasApiKey: true,
							},
						],
					}),
			});
		}
		if (deferModel) {
			llmFetchCalled = true;
			return llm.promise.then(text => ({
				ok: true,
				status: 200,
				json: () =>
					Promise.resolve({
						choices: [{ message: { content: text } }],
						candidates: [
							{ content: { parts: [{ text }] }, finishReason: 'STOP' },
						],
					}),
			}));
		}
		return Promise.resolve({
			ok: true,
			status: 200,
			json: () => Promise.resolve({}),
		});
	}) as unknown as typeof fetch;

	const devEnv = import.meta.env as unknown as { DEV: boolean };
	const originalDev = devEnv.DEV;
	if (config.devFlag) {
		devEnv.DEV = true;
	}

	return {
		bodies,
		playHistoryCount: () => count,
		resolveLLM: (text: string) => llm.resolve(text),
		get llmFetchCalled() {
			return llmFetchCalled;
		},
		restore() {
			(globalThis as unknown as { fetch: unknown }).fetch = originalFetch;
			if (hadInitialAuthUser) {
				authGlobals.__PROCYON_INITIAL_AUTH_USER__ = originalInitialAuthUser;
			} else {
				delete authGlobals.__PROCYON_INITIAL_AUTH_USER__;
			}
			if (originalLocalStorageDesc) {
				Object.defineProperty(
					globalThis,
					'localStorage',
					originalLocalStorageDesc
				);
			} else {
				delete (globalThis as Record<string, unknown>).localStorage;
			}
			devEnv.DEV = originalDev;
		},
	};
}
