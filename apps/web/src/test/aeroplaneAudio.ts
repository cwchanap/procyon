import { primeAeroplaneAudio } from '../lib/aeroplane/sound';

/**
 * Shared recording stub for the Aeroplane file-backed cue audio. One
 * install swaps in a fake AudioContext constructor, a cue-serving fetch
 * and a controllable monotonic `performance.now`; `uninstall` restores
 * every global it replaced (the previous AudioContext included, not just
 * deleted) so suites cannot leak into each other.
 */

export interface AudioStackOptions {
	/** Never install an AudioContext constructor (unsupported stack). */
	readonly unsupported?: boolean;
	readonly constructorThrows?: boolean;
	readonly decodeRejects?: boolean;
	/** Decode promises stay pending until this gate resolves. */
	readonly decodeGate?: Promise<void>;
	/** Callback-only decodeAudioData (older Safari): returns undefined. */
	readonly callbackOnlyDecode?: boolean;
	readonly fetchRejects?: boolean;
	readonly fetchNotOk?: boolean;
	readonly createBufferSourceThrows?: boolean;
	readonly state?: string;
}

export interface InstalledAudioStack {
	/** Cue names whose buffer source actually started. */
	readonly cues: string[];
	/** `/aeroplane/sfx/` URLs fetched so far. */
	readonly fetches: string[];
	/** Every request issued, with options — catches dropped init. */
	readonly requests: {
		readonly url: string;
		readonly init: RequestInit | undefined;
	}[];
	/** Cue names whose decode was attempted, whatever the outcome. */
	readonly decodes: string[];
	readonly constructs: number;
	readonly resumes: number;
	/** Flip failure flags mid-test (e.g. a network recovering). */
	patch(options: AudioStackOptions): void;
	/** Advance the fake monotonic clock (hop pacing reads it). */
	advanceNow(ms: number): void;
	setNow(ms: number): void;
	/** Prime from a gesture and settle the fetch→decode chain. */
	warm(): Promise<void>;
	uninstall(): void;
}

interface StubBuffer {
	cue: string;
}

interface StubBufferSource {
	buffer: StubBuffer | null;
	onended: (() => void) | null;
	connect(destination?: unknown): StubBufferSource;
	disconnect(): void;
	start(): void;
}

/** Settles the fetch→arrayBuffer→decodeAudioData promise chain. */
export async function flushAudioPromises(): Promise<void> {
	for (let i = 0; i < 12; i += 1) {
		await Promise.resolve();
	}
}

export function installAudioStack(
	options?: AudioStackOptions
): InstalledAudioStack {
	const cues: string[] = [];
	const fetches: string[] = [];
	const requests: { url: string; init: RequestInit | undefined }[] = [];
	const decodes: string[] = [];
	const counts = { constructs: 0, resumes: 0 };
	// Mutable so patch() can simulate a network/stack recovering mid-test.
	const flags: AudioStackOptions = { ...options };
	let now = 1_000_000;
	class StubAudioContext {
		destination = {};
		currentTime = 0;
		state = flags.state ?? 'running';
		resume() {
			counts.resumes += 1;
			return Promise.resolve();
		}
		createGain() {
			return {
				gain: { value: 1 },
				connect() {},
				disconnect() {},
			};
		}
		decodeAudioData(
			bytes: ArrayBuffer & Partial<StubBuffer>,
			success?: (buffer: ArrayBuffer) => void,
			error?: (reason: unknown) => void
		) {
			decodes.push(bytes.cue ?? '?');
			const failure = new Error('undecodable');
			if (flags.callbackOnlyDecode) {
				// Older Safari: synchronous undefined return; the result only
				// ever arrives through the completion callbacks.
				if (flags.decodeRejects) {
					error?.(failure);
					return undefined;
				}
				const decode = flags.decodeGate ?? Promise.resolve();
				void decode.then(() => success?.(bytes));
				return undefined;
			}
			if (flags.decodeRejects) return Promise.reject(failure);
			const decode = flags.decodeGate ?? Promise.resolve();
			return decode.then(() => bytes);
		}
		createBufferSource(): StubBufferSource {
			if (flags.createBufferSourceThrows) {
				throw new Error('node creation blocked');
			}
			const source: StubBufferSource = {
				buffer: null,
				onended: null,
				connect() {
					return source;
				},
				disconnect() {},
				start() {
					cues.push((source.buffer as StubBuffer).cue);
				},
			};
			return source;
		}
		constructor() {
			if (flags.constructorThrows) {
				throw new Error('autoplay blocked');
			}
			counts.constructs += 1;
		}
	}
	const root = globalThis as Record<string, unknown>;
	const hadAudioContext = 'AudioContext' in root;
	const previousAudioContext = root.AudioContext;
	const hadWebkitAudioContext = 'webkitAudioContext' in root;
	const previousWebkitAudioContext = root.webkitAudioContext;
	if (!flags.unsupported) {
		root.AudioContext = StubAudioContext;
	}
	const originalFetch = globalThis.fetch;
	root.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
		const url = typeof input === 'string' ? input : input.toString();
		requests.push({ url, init });
		if (!url.startsWith('/aeroplane/sfx/')) {
			// Non-cue traffic passes through with its options intact —
			// dropping init would silently lose POST bodies and headers.
			return originalFetch(input, init);
		}
		fetches.push(url);
		if (flags.fetchRejects) {
			throw new Error('offline');
		}
		const cue = url.slice(url.lastIndexOf('/') + 1).replace(/\.m4a$/, '');
		const bytes = new ArrayBuffer(8) as ArrayBuffer & StubBuffer;
		bytes.cue = cue;
		return {
			ok: flags.fetchNotOk !== true,
			arrayBuffer: async () => bytes,
		};
	}) as unknown as typeof fetch;
	// Hop pacing reads performance.now(); a fake monotonic clock keeps
	// spacing tests off the machine's real time.
	const performanceRoot = globalThis.performance as Performance & {
		now: () => number;
	};
	const hadOwnNow = Object.prototype.hasOwnProperty.call(
		performanceRoot,
		'now'
	);
	const previousNow = performanceRoot.now;
	Object.defineProperty(performanceRoot, 'now', {
		value: () => now,
		configurable: true,
		writable: true,
	});
	return {
		cues,
		fetches,
		requests,
		decodes,
		get constructs() {
			return counts.constructs;
		},
		get resumes() {
			return counts.resumes;
		},
		patch(patch: AudioStackOptions) {
			Object.assign(flags, patch);
		},
		advanceNow(ms: number) {
			now += ms;
		},
		setNow(ms: number) {
			now = ms;
		},
		// Decodes the preloaded cues so plays land synchronously afterwards.
		async warm() {
			primeAeroplaneAudio();
			await flushAudioPromises();
		},
		uninstall() {
			root.fetch = originalFetch;
			if (hadAudioContext) root.AudioContext = previousAudioContext;
			else delete root.AudioContext;
			if (hadWebkitAudioContext)
				root.webkitAudioContext = previousWebkitAudioContext;
			else delete root.webkitAudioContext;
			if (hadOwnNow) {
				Object.defineProperty(performanceRoot, 'now', {
					value: previousNow,
					configurable: true,
					writable: true,
				});
			} else {
				// Dropping the shadow property restores the prototype's now().
				delete (performanceRoot as { now?: () => number }).now;
			}
		},
	};
}
