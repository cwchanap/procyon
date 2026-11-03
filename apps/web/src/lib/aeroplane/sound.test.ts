import { afterEach, describe, expect, test } from 'bun:test';
import { setupReactDom } from '../../test/reactSetup';
import { AEROPLANE_CUES, cueUrl } from './assets';
import {
	AEROPLANE_MUTED_STORAGE_KEY,
	playAeroplaneCue,
	primeAeroplaneAudio,
	readAeroplaneMuted,
	resetAeroplaneAudioForTest,
	selectEffectCue,
	writeAeroplaneMuted,
} from './sound';

setupReactDom();

/**
 * Settles the preload fetch→arrayBuffer→decodeAudioData promise chain
 * without relying on real (or faked) timers.
 */
async function flushAsync(): Promise<void> {
	for (let i = 0; i < 12; i += 1) {
		await Promise.resolve();
	}
}

/** Freeze Date.now at a controllable instant for hop-spacing tests. */
function fakeDateNow(startMs = 1_000_000): (advanceMs: number) => void {
	let now = startMs;
	Date.now = () => now;
	return (advanceMs: number) => {
		now += advanceMs;
	};
}

const realDateNow = Date.now.bind(Date);

interface AudioStackOptions {
	/** Never install an AudioContext constructor (unsupported stack). */
	readonly unsupported?: boolean;
	readonly constructorThrows?: boolean;
	readonly decodeRejects?: boolean;
	/** Decode promises stay pending until this gate resolves. */
	readonly decodeGate?: Promise<void>;
	readonly fetchRejects?: boolean;
	readonly fetchNotOk?: boolean;
	readonly createBufferSourceThrows?: boolean;
	readonly state?: string;
}

interface InstalledAudioStack {
	/** Cue names whose buffer source actually started. */
	readonly cues: string[];
	/** Cue URLs fetched so far. */
	readonly fetches: string[];
	/** Cue names whose decode was attempted, whatever the outcome. */
	readonly decodes: string[];
	readonly constructs: number;
	readonly resumes: number;
	uninstall(): void;
}

interface StubBuffer {
	cue: string;
}

interface StubBufferSource {
	buffer: StubBuffer | null;
	onended: (() => void) | null;
	connect(): StubBufferSource;
	disconnect(): void;
	start(): void;
}

function installAudioStack(options?: AudioStackOptions): InstalledAudioStack {
	const cues: string[] = [];
	const fetches: string[] = [];
	const decodes: string[] = [];
	const counts = { constructs: 0, resumes: 0 };
	class StubAudioContext {
		destination = {};
		currentTime = 0;
		state = options?.state ?? 'running';
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
		decodeAudioData(bytes: ArrayBuffer & Partial<StubBuffer>) {
			decodes.push(bytes.cue ?? '?');
			if (options?.decodeRejects) {
				return Promise.reject(new Error('undecodable'));
			}
			const decode = options?.decodeGate ?? Promise.resolve();
			return decode.then(() => bytes);
		}
		createBufferSource(): StubBufferSource {
			if (options?.createBufferSourceThrows) {
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
			if (options?.constructorThrows) {
				throw new Error('autoplay blocked');
			}
			counts.constructs += 1;
		}
	}
	const root = globalThis as Record<string, unknown>;
	if (!options?.unsupported) {
		root.AudioContext = StubAudioContext;
	}
	const originalFetch = globalThis.fetch;
	root.fetch = (async (input: RequestInfo | URL) => {
		const url = typeof input === 'string' ? input : input.toString();
		fetches.push(url);
		if (options?.fetchRejects) {
			throw new Error('offline');
		}
		const cue = url.slice(url.lastIndexOf('/') + 1).replace(/\.m4a$/, '');
		const bytes = new ArrayBuffer(8) as ArrayBuffer & StubBuffer;
		bytes.cue = cue;
		return {
			ok: options?.fetchNotOk !== true,
			arrayBuffer: async () => bytes,
		};
	}) as unknown as typeof fetch;
	return {
		cues,
		fetches,
		decodes,
		get constructs() {
			return counts.constructs;
		},
		get resumes() {
			return counts.resumes;
		},
		uninstall() {
			root.fetch = originalFetch;
			delete root.AudioContext;
			delete root.webkitAudioContext;
		},
	};
}

let activeStack: InstalledAudioStack | null = null;

afterEach(() => {
	activeStack?.uninstall();
	activeStack = null;
	Date.now = realDateNow;
	resetAeroplaneAudioForTest();
});

describe('aeroplane effect cue selection', () => {
	test('storm and crash relocations and Customs skips are traps on any colour', () => {
		// An AI mover's storm is as audible as the human's own.
		expect(
			selectEffectCue(
				[
					{
						type: 'relocation',
						planeId: 'yellow-0',
						effect: 'storm',
						toProgress: 26,
					},
				],
				'red'
			)
		).toBe('trap');
		expect(
			selectEffectCue(
				[
					{
						type: 'relocation',
						planeId: 'red-0',
						effect: 'crash',
						toProgress: null,
					},
				],
				'red'
			)
		).toBe('trap');
		expect(selectEffectCue([{ type: 'skip', color: 'blue' }], 'red')).toBe(
			'trap'
		);
	});

	test('a trap outranks human money regardless of event order', () => {
		expect(
			selectEffectCue(
				[
					{ type: 'coins', color: 'red', amount: 3, reason: 'departure' },
					{
						type: 'relocation',
						planeId: 'red-0',
						effect: 'crash',
						toProgress: null,
					},
				],
				'red'
			)
		).toBe('trap');
		expect(
			selectEffectCue(
				[
					{ type: 'skip', color: 'red' },
					{ type: 'coins', color: 'red', amount: -3, reason: 'customs' },
				],
				'red'
			)
		).toBe('trap');
	});

	test('human money collapses to one cue, loss outranking gain', () => {
		// Departure bonus plus airport purchase in one move: one coin-loss.
		expect(
			selectEffectCue(
				[
					{ type: 'coins', color: 'red', amount: 3, reason: 'departure' },
					{ type: 'coins', color: 'red', amount: -5, reason: 'airport-buy' },
				],
				'red'
			)
		).toBe('coin-loss');
		expect(
			selectEffectCue(
				[{ type: 'coins', color: 'red', amount: 4, reason: 'chance' }],
				'red'
			)
		).toBe('coin-gain');
	});

	test('AI-only money is silent', () => {
		expect(
			selectEffectCue(
				[
					{ type: 'coins', color: 'yellow', amount: 3, reason: 'departure' },
					{ type: 'coins', color: 'yellow', amount: -5, reason: 'airport-buy' },
				],
				'red'
			)
		).toBeNull();
	});

	test('transfer polarity follows the human side; AI-only transfers are silent', () => {
		expect(
			selectEffectCue(
				[
					{
						type: 'transfer',
						from: 'red',
						to: 'blue',
						amount: 2,
						reason: 'airport-toll',
					},
				],
				'red'
			)
		).toBe('coin-loss');
		expect(
			selectEffectCue(
				[
					{
						type: 'transfer',
						from: 'yellow',
						to: 'red',
						amount: 3,
						reason: 'steal',
					},
				],
				'red'
			)
		).toBe('coin-gain');
		expect(
			selectEffectCue(
				[
					{
						type: 'transfer',
						from: 'yellow',
						to: 'green',
						amount: 3,
						reason: 'steal',
					},
				],
				'red'
			)
		).toBeNull();
	});

	test('roll-only skipped, positional events and benign relocations select nothing', () => {
		// The roll-only `skipped` never re-sounds Customs: the arming `skip`
		// already trapped on the move that landed there.
		expect(
			selectEffectCue([{ type: 'skipped', color: 'red' }], 'red')
		).toBeNull();
		const hop = {
			type: 'move',
			planeId: 'red-0',
			from: { kind: 'track', color: 'red', progress: 14, globalIndex: 13 },
			to: { kind: 'track', color: 'red', progress: 16, globalIndex: 15 },
			distance: 2,
		} as const;
		expect(selectEffectCue([hop], 'red')).toBeNull();
		expect(
			selectEffectCue(
				[
					{
						type: 'relocation',
						planeId: 'red-0',
						effect: 'boost',
						toProgress: 20,
					},
				],
				'red'
			)
		).toBeNull();
		expect(selectEffectCue([], 'red')).toBeNull();
	});
});

describe('aeroplane cue audio', () => {
	test('priming begins exactly one best-effort fetch and decode per cue', async () => {
		const stack = installAudioStack();
		activeStack = stack;
		primeAeroplaneAudio();
		// The context is created and all nine fetches start synchronously
		// from the direct gesture; nothing fetched at import time.
		expect(stack.constructs).toBe(1);
		expect([...stack.fetches].sort()).toEqual(
			[...AEROPLANE_CUES].map(cueUrl).sort()
		);
		await flushAsync();
		// Decoded buffers are cached: replays never refetch.
		playAeroplaneCue('roll');
		playAeroplaneCue('roll');
		playAeroplaneCue('win');
		expect(stack.cues).toEqual(['roll', 'roll', 'win']);
		expect(stack.fetches).toHaveLength(9);
	});

	test('a cue requested before its decode finishes is dropped, never queued', async () => {
		let releaseDecode: (() => void) | undefined;
		const gate = new Promise<void>(resolve => {
			releaseDecode = resolve;
		});
		const stack = installAudioStack({ decodeGate: gate });
		activeStack = stack;
		primeAeroplaneAudio();
		playAeroplaneCue('roll');
		expect(stack.cues).toEqual([]);
		releaseDecode!();
		await flushAsync();
		// No delayed catch-up: the dropped cue never erupts once decoding ends.
		expect(stack.cues).toEqual([]);
		// The newly ready buffer serves the next request normally.
		playAeroplaneCue('roll');
		expect(stack.cues).toEqual(['roll']);
	});

	test('muted playback is a no-op that never creates audio', () => {
		const stack = installAudioStack();
		activeStack = stack;
		playAeroplaneCue('roll', true);
		playAeroplaneCue('hop', true);
		expect(stack.constructs).toBe(0);
		expect(stack.fetches).toEqual([]);
		expect(stack.cues).toEqual([]);
	});

	test('a suspended context resumes but plays nothing until running', () => {
		const stack = installAudioStack({ state: 'suspended' });
		activeStack = stack;
		primeAeroplaneAudio();
		playAeroplaneCue('roll');
		expect(stack.resumes).toBe(2);
		expect(stack.cues).toEqual([]);
		// Preload still runs so cues are ready once the context resumes.
		expect(stack.fetches).toHaveLength(9);
	});

	test('an unsupported audio stack never throws or fetches', () => {
		const stack = installAudioStack({ unsupported: true });
		activeStack = stack;
		expect(() => {
			primeAeroplaneAudio();
			playAeroplaneCue('win');
		}).not.toThrow();
		expect(stack.fetches).toEqual([]);
		expect(stack.cues).toEqual([]);
	});

	test('a throwing AudioContext constructor never throws or fetches', () => {
		const stack = installAudioStack({ constructorThrows: true });
		activeStack = stack;
		expect(() => {
			primeAeroplaneAudio();
			playAeroplaneCue('win');
		}).not.toThrow();
		expect(stack.constructs).toBe(0); // no construction ever succeeded
		expect(stack.fetches).toEqual([]);
		expect(stack.cues).toEqual([]);
	});

	test('a rejected fetch stays silent and harmless', async () => {
		const stack = installAudioStack({ fetchRejects: true });
		activeStack = stack;
		primeAeroplaneAudio();
		// The failure scenario genuinely attempted all nine fetches.
		expect(stack.fetches).toHaveLength(9);
		await flushAsync();
		expect(stack.decodes).toEqual([]);
		playAeroplaneCue('roll');
		expect(stack.cues).toEqual([]);
	});

	test('a non-200 fetch response stays silent and harmless', async () => {
		const stack = installAudioStack({ fetchNotOk: true });
		activeStack = stack;
		primeAeroplaneAudio();
		// All nine cues were fetched; each response failed the ok check
		// before any decode could be attempted.
		expect(stack.fetches).toHaveLength(9);
		await flushAsync();
		expect(stack.decodes).toEqual([]);
		playAeroplaneCue('roll');
		expect(stack.cues).toEqual([]);
	});

	test('a rejected decode stays silent and harmless', async () => {
		const stack = installAudioStack({ decodeRejects: true });
		activeStack = stack;
		primeAeroplaneAudio();
		expect(stack.fetches).toHaveLength(9);
		await flushAsync();
		// Every cue was fetched and its decode genuinely attempted.
		expect(stack.decodes).toHaveLength(9);
		playAeroplaneCue('roll');
		expect(stack.cues).toEqual([]);
	});

	test('a throwing buffer source never interrupts play', async () => {
		const stack = installAudioStack({ createBufferSourceThrows: true });
		activeStack = stack;
		primeAeroplaneAudio();
		await flushAsync();
		expect(() => playAeroplaneCue('hop')).not.toThrow();
		expect(stack.cues).toEqual([]);
	});

	test('cues requested before user activation never create or fetch audio', () => {
		const stack = installAudioStack({ state: 'suspended' });
		activeStack = stack;
		const nav = globalThis.navigator as Navigator & {
			userActivation?: { hasBeenActive: boolean };
		};
		Object.defineProperty(nav, 'userActivation', {
			value: { hasBeenActive: false },
			configurable: true,
		});
		try {
			playAeroplaneCue('roll');
			playAeroplaneCue('hop');
			// Pre-gesture cues drop instead of queuing; otherwise they would
			// erupt together on the first click as one blast.
			expect(stack.constructs).toBe(0);
			expect(stack.fetches).toEqual([]);
			expect(stack.resumes).toBe(0);
		} finally {
			delete (nav as { userActivation?: unknown }).userActivation;
		}
	});

	test('hop starts are spaced at least 150 ms apart; other cues are unlimited', async () => {
		const stack = installAudioStack();
		activeStack = stack;
		primeAeroplaneAudio();
		await flushAsync();
		const advance = fakeDateNow();
		playAeroplaneCue('hop'); // first start passes
		playAeroplaneCue('hop'); // same instant: dropped
		playAeroplaneCue('roll'); // only hop is paced
		playAeroplaneCue('roll');
		advance(149);
		playAeroplaneCue('hop'); // 149 ms later: still dropped
		advance(1);
		playAeroplaneCue('hop'); // exactly 150 ms later: passes
		expect(stack.cues).toEqual(['hop', 'roll', 'roll', 'hop']);
	});

	test('resetAeroplaneAudioForTest clears contexts, buffers and hop pacing', async () => {
		const stack = installAudioStack();
		activeStack = stack;
		primeAeroplaneAudio();
		await flushAsync();
		fakeDateNow();
		playAeroplaneCue('hop');
		expect(stack.cues).toEqual(['hop']);

		resetAeroplaneAudioForTest();
		// Buffers are gone: the cue drops again until the new context decodes.
		playAeroplaneCue('hop');
		expect(stack.cues).toEqual(['hop']);
		expect(stack.constructs).toBe(2);
		await flushAsync();
		// The pacing clock reset too: a hop may start immediately again.
		playAeroplaneCue('hop');
		expect(stack.cues).toEqual(['hop', 'hop']);
		expect(stack.fetches).toHaveLength(18);
	});

	test('a reset while decodes are pending leaves no stale buffers behind', async () => {
		let releaseDecode: (() => void) | undefined;
		const gate = new Promise<void>(resolve => {
			releaseDecode = resolve;
		});
		const stack = installAudioStack({ decodeGate: gate });
		activeStack = stack;
		primeAeroplaneAudio();
		expect(stack.constructs).toBe(1);

		// Reset before the first context's decodes resolve: those loaders
		// become obsolete and must not refill the cleared buffer cache.
		resetAeroplaneAudioForTest();
		releaseDecode!();
		await flushAsync();
		playAeroplaneCue('roll');
		expect(stack.cues).toEqual([]);
		expect(stack.constructs).toBe(2);

		// The fresh context decodes anew and the cue plays normally.
		await flushAsync();
		playAeroplaneCue('roll');
		expect(stack.cues).toEqual(['roll']);
		expect(stack.fetches).toHaveLength(18);
	});

	test('mute preference round-trips through localStorage', () => {
		window.localStorage.removeItem(AEROPLANE_MUTED_STORAGE_KEY);
		expect(readAeroplaneMuted()).toBe(false);
		writeAeroplaneMuted(true);
		expect(window.localStorage.getItem(AEROPLANE_MUTED_STORAGE_KEY)).toBe('1');
		expect(readAeroplaneMuted()).toBe(true);
		writeAeroplaneMuted(false);
		expect(window.localStorage.getItem(AEROPLANE_MUTED_STORAGE_KEY)).toBe('0');
		expect(readAeroplaneMuted()).toBe(false);
	});

	test('blocked storage reads and writes never throw', () => {
		const globalWindow = globalThis as { window?: unknown };
		const originalWindow = globalWindow.window;
		globalWindow.window = {
			get localStorage(): Storage {
				throw new Error('storage blocked');
			},
		};
		try {
			expect(readAeroplaneMuted()).toBe(false);
			expect(() => writeAeroplaneMuted(true)).not.toThrow();
		} finally {
			globalWindow.window = originalWindow;
		}
	});
});
