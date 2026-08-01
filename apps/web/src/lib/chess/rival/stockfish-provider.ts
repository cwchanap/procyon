import type { GameState } from '../types';
import type { ChessRivalProvider } from './provider';
import {
	createBestMoveCollector,
	formatGoCommand,
	formatIsReadyCommand,
	formatPositionCommand,
	formatSetSkillLevelCommand,
	formatUciNewGameCommand,
	isReadyOk,
	isUciOk,
	parseUciOption,
	type BestMoveCollector,
} from './stockfish-protocol';
import type { RivalMoveResult } from './types';

const STOCKFISH_WORKER_ASSET = 'vendor/stockfish/stockfish-18-lite-single.js';
const DEFAULT_ORIGIN = 'http://localhost';
const DEFAULT_BASE_URL = '/';
const STOCKFISH_MOVE_TIME_MS = 250;
const STOCKFISH_SKILL_LEVEL = 0;

type ImportMetaWithEnv = ImportMeta & {
	env?: {
		BASE_URL?: string;
	};
};

export interface WorkerLike {
	onmessage: ((event: MessageEvent<string>) => void) | null;
	onerror: ((event: ErrorEvent) => void) | null;
	postMessage(message: string): void;
	terminate(): void;
}

export type WorkerFactory = (url: URL) => WorkerLike;

export interface StockfishRivalProviderOptions {
	workerFactory?: WorkerFactory;
	origin?: string;
	baseUrl?: string;
}

interface Deferred<T> {
	promise: Promise<T>;
	resolve(value: T | PromiseLike<T>): void;
	reject(reason?: unknown): void;
}

interface MoveWaiter extends Deferred<RivalMoveResult> {
	requestToken: number;
	collector: BestMoveCollector;
}

function createDeferred<T>(): Deferred<T> {
	let resolve!: (value: T | PromiseLike<T>) => void;
	let reject!: (reason?: unknown) => void;
	const promise = new Promise<T>((promiseResolve, promiseReject) => {
		resolve = promiseResolve;
		reject = promiseReject;
	});

	return { promise, resolve, reject };
}

function defaultWorkerFactory(url: URL): WorkerLike {
	return new Worker(url);
}

function defaultOrigin(): string {
	return globalThis.location?.origin ?? DEFAULT_ORIGIN;
}

function defaultBaseUrl(): string {
	return (import.meta as ImportMetaWithEnv).env?.BASE_URL ?? DEFAULT_BASE_URL;
}

function resolveBaseAssetPath(baseUrl: string): string {
	if (baseUrl === '' || baseUrl === '/') {
		return `/${STOCKFISH_WORKER_ASSET}`;
	}

	const leadingBase = baseUrl.startsWith('/') ? baseUrl : `/${baseUrl}`;
	const normalizedBase = leadingBase.endsWith('/')
		? leadingBase
		: `${leadingBase}/`;
	return `${normalizedBase}${STOCKFISH_WORKER_ASSET}`;
}

export function resolveStockfishWorkerUrl(
	options: Pick<StockfishRivalProviderOptions, 'origin' | 'baseUrl'> = {}
): URL {
	return new URL(
		resolveBaseAssetPath(options.baseUrl ?? defaultBaseUrl()),
		options.origin ?? defaultOrigin()
	);
}

export class StockfishRivalProvider implements ChessRivalProvider {
	readonly kind = 'engine' as const;

	private readonly worker: WorkerLike;
	private disposed = false;
	private workerError: Error | null = null;
	private uciWaiter: Deferred<void> | null = null;
	private readyWaiter: Deferred<void> | null = null;
	private moveWaiter: MoveWaiter | null = null;
	private currentMoveRequestToken: number | null = null;
	private skillLevelAdvertised = false;

	constructor(options: StockfishRivalProviderOptions = {}) {
		const workerFactory = options.workerFactory ?? defaultWorkerFactory;
		this.worker = workerFactory(resolveStockfishWorkerUrl(options));
		this.worker.onmessage = event => {
			this.handleMessage(event.data);
		};
		this.worker.onerror = event => {
			this.handleWorkerError(event);
		};
	}

	async initialize(): Promise<void> {
		this.ensureUsable();
		this.skillLevelAdvertised = false;

		await this.requestUciHandshake();
		if (!this.skillLevelAdvertised) {
			throw new Error('Stockfish did not advertise the Skill Level option');
		}

		this.postCommand(formatSetSkillLevelCommand(STOCKFISH_SKILL_LEVEL));
		await this.requestReady();
	}

	async beginGame(): Promise<void> {
		this.ensureUsable();
		this.postCommand(formatUciNewGameCommand());
		await this.requestReady();
	}

	async makeMove(
		state: GameState,
		requestToken: number
	): Promise<RivalMoveResult> {
		this.ensureUsable();
		if (this.moveWaiter !== null) {
			throw new Error('Stockfish cannot process concurrent makeMove requests');
		}

		const waiter: MoveWaiter = {
			...createDeferred<RivalMoveResult>(),
			requestToken,
			collector: createBestMoveCollector(),
		};
		this.moveWaiter = waiter;
		this.currentMoveRequestToken = requestToken;

		this.postCommand(formatPositionCommand(state.fen));
		this.postCommand(formatGoCommand(STOCKFISH_MOVE_TIME_MS));

		return waiter.promise.finally(() => {
			if (this.moveWaiter === waiter) {
				this.moveWaiter = null;
			}
			if (this.currentMoveRequestToken === requestToken) {
				this.currentMoveRequestToken = null;
			}
		});
	}

	dispose(): void {
		if (this.disposed) {
			return;
		}

		this.disposed = true;
		this.rejectPending(new Error('Stockfish provider disposed'));
		this.worker.onmessage = null;
		this.worker.onerror = null;
		this.worker.terminate();
	}

	private requestUciHandshake(): Promise<void> {
		if (this.uciWaiter !== null) {
			return Promise.reject(
				new Error('Stockfish UCI handshake already pending')
			);
		}

		const waiter = createDeferred<void>();
		this.uciWaiter = waiter;
		this.postCommand('uci');

		return waiter.promise.finally(() => {
			if (this.uciWaiter === waiter) {
				this.uciWaiter = null;
			}
		});
	}

	private requestReady(): Promise<void> {
		if (this.readyWaiter !== null) {
			return Promise.reject(
				new Error('Stockfish readiness check already pending')
			);
		}

		const waiter = createDeferred<void>();
		this.readyWaiter = waiter;
		this.postCommand(formatIsReadyCommand());

		return waiter.promise.finally(() => {
			if (this.readyWaiter === waiter) {
				this.readyWaiter = null;
			}
		});
	}

	private handleMessage(message: unknown): void {
		if (this.disposed || typeof message !== 'string') {
			return;
		}

		if (this.uciWaiter !== null) {
			if (parseUciOption(message)?.name === 'Skill Level') {
				this.skillLevelAdvertised = true;
			}
			if (isUciOk(message)) {
				const waiter = this.uciWaiter;
				this.uciWaiter = null;
				waiter.resolve();
			}
		}

		if (this.readyWaiter !== null && isReadyOk(message)) {
			const waiter = this.readyWaiter;
			this.readyWaiter = null;
			waiter.resolve();
		}

		const waiter = this.moveWaiter;
		if (
			waiter === null ||
			waiter.requestToken !== this.currentMoveRequestToken
		) {
			return;
		}

		const result = waiter.collector.acceptLine(message);
		if (result === null || this.disposed || this.moveWaiter !== waiter) {
			return;
		}

		this.moveWaiter = null;
		this.currentMoveRequestToken = null;
		waiter.resolve(result);
	}

	private handleWorkerError(event: ErrorEvent): void {
		const message = event.message || 'Stockfish worker error';
		const error = new Error(message);
		// Mark the provider unusable so initialize/beginGame/makeMove reject
		// subsequent calls with the same worker failure rather than attempting
		// to drive a dead worker.
		this.workerError = error;
		this.rejectPending(error);
	}

	private postCommand(command: string): void {
		this.ensureUsable();
		this.worker.postMessage(command);
	}

	private ensureUsable(): void {
		if (this.disposed) {
			throw new Error('Stockfish provider disposed');
		}
		if (this.workerError !== null) {
			throw this.workerError;
		}
	}

	private rejectPending(error: Error): void {
		this.uciWaiter?.reject(error);
		this.uciWaiter = null;
		this.readyWaiter?.reject(error);
		this.readyWaiter = null;
		this.moveWaiter?.reject(error);
		this.moveWaiter = null;
		this.currentMoveRequestToken = null;
	}
}
