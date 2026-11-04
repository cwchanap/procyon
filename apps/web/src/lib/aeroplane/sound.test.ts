import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { setupReactDom } from '../../test/reactSetup';
import {
	flushAudioPromises,
	installAudioStack,
	type InstalledAudioStack,
} from '../../test/aeroplaneAudio';
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

let activeStack: InstalledAudioStack | null = null;

afterEach(() => {
	activeStack?.uninstall();
	activeStack = null;
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
	beforeEach(() => {
		window.localStorage.removeItem(AEROPLANE_MUTED_STORAGE_KEY);
	});

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
		await flushAudioPromises();
		// Decoded buffers are cached: replays never refetch.
		playAeroplaneCue('roll');
		playAeroplaneCue('roll');
		playAeroplaneCue('win');
		expect(stack.cues).toEqual(['roll', 'roll', 'win']);
		expect(stack.fetches).toHaveLength(9);
	});

	test('priming while muted creates no context and starts no downloads', async () => {
		const stack = installAudioStack();
		activeStack = stack;
		window.localStorage.setItem(AEROPLANE_MUTED_STORAGE_KEY, '1');
		try {
			primeAeroplaneAudio();
			expect(stack.constructs).toBe(0);
			expect(stack.fetches).toEqual([]);
			// A cue call that forgets the muted flag still creates nothing:
			// the saved preference is the authoritative gate.
			playAeroplaneCue('roll');
			expect(stack.constructs).toBe(0);
			expect(stack.fetches).toEqual([]);
			// The same gesture after unmuting primes normally.
			writeAeroplaneMuted(false);
			primeAeroplaneAudio();
			expect(stack.constructs).toBe(1);
			expect(stack.fetches).toHaveLength(9);
		} finally {
			window.localStorage.removeItem(AEROPLANE_MUTED_STORAGE_KEY);
		}
	});

	test('a cue requested during its load waits a bounded grace, then plays', async () => {
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
		await flushAudioPromises();
		// The first roll after priming waits out the in-flight decode
		// rather than dropping silently.
		expect(stack.cues).toEqual(['roll']);
		playAeroplaneCue('roll');
		expect(stack.cues).toEqual(['roll', 'roll']);
	});

	test('a cue whose load never settles is still dropped', () => {
		const stack = installAudioStack({
			decodeGate: new Promise<void>(() => {}),
		});
		activeStack = stack;
		primeAeroplaneAudio();
		playAeroplaneCue('roll');
		expect(stack.cues).toEqual([]);
	});

	test('a failed load retries on the next priming gesture', async () => {
		const stack = installAudioStack({ fetchNotOk: true });
		activeStack = stack;
		primeAeroplaneAudio();
		expect(stack.fetches).toHaveLength(9);
		await flushAudioPromises();
		expect(stack.decodes).toEqual([]);
		// A network blip must not silence the cue until reload: the next
		// Start/Roll/unmute gesture refetches what failed.
		stack.patch({ fetchNotOk: false });
		primeAeroplaneAudio();
		await flushAudioPromises();
		expect(stack.decodes).toHaveLength(9);
		playAeroplaneCue('roll');
		expect(stack.cues).toEqual(['roll']);
	});

	test('a failed cue retries when next requested', async () => {
		const stack = installAudioStack({ fetchNotOk: true });
		activeStack = stack;
		primeAeroplaneAudio();
		await flushAudioPromises();
		stack.patch({ fetchNotOk: false });
		playAeroplaneCue('roll'); // drops, but starts the retry
		expect(stack.cues).toEqual([]);
		await flushAudioPromises();
		playAeroplaneCue('roll'); // the retry's buffer serves normally
		expect(stack.cues).toEqual(['roll']);
	});

	test('callback-only decodeAudioData stacks decode through the callback signature', async () => {
		const stack = installAudioStack({ callbackOnlyDecode: true });
		activeStack = stack;
		primeAeroplaneAudio();
		await flushAudioPromises();
		// Each cue got one promise-form probe (undefined) then the real
		// callback-form decode — older Safari keeps its cues.
		expect(stack.decodes).toHaveLength(18);
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

	test('a suspended context resumes but plays nothing until running', async () => {
		const stack = installAudioStack({ state: 'suspended' });
		activeStack = stack;
		primeAeroplaneAudio();
		// Preload still runs so cues are ready once the context resumes.
		expect(stack.fetches).toHaveLength(9);
		await flushAudioPromises();
		playAeroplaneCue('roll');
		expect(stack.resumes).toBe(2);
		expect(stack.cues).toEqual([]);
	});

	test('an interrupted context resumes like a suspended one', async () => {
		// Safari reports 'interrupted' after a phone call, Siri or an app
		// switch; ignoring it left iOS audio dead for the session.
		const stack = installAudioStack({ state: 'interrupted' });
		activeStack = stack;
		primeAeroplaneAudio();
		await flushAudioPromises();
		playAeroplaneCue('roll');
		expect(stack.resumes).toBe(2);
		expect(stack.cues).toEqual([]);
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
		await flushAudioPromises();
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
		await flushAudioPromises();
		expect(stack.decodes).toEqual([]);
		playAeroplaneCue('roll');
		expect(stack.cues).toEqual([]);
	});

	test('a rejected decode stays silent and harmless', async () => {
		const stack = installAudioStack({ decodeRejects: true });
		activeStack = stack;
		primeAeroplaneAudio();
		expect(stack.fetches).toHaveLength(9);
		await flushAudioPromises();
		// Every cue was fetched and its decode genuinely attempted.
		expect(stack.decodes).toHaveLength(9);
		playAeroplaneCue('roll');
		expect(stack.cues).toEqual([]);
	});

	test('a throwing buffer source never interrupts play', async () => {
		const stack = installAudioStack({ createBufferSourceThrows: true });
		activeStack = stack;
		primeAeroplaneAudio();
		await flushAudioPromises();
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

	test('without the activation API, audio is created only after the direct priming gesture', async () => {
		const stack = installAudioStack();
		activeStack = stack;
		const nav = globalThis.navigator as Navigator & {
			userActivation?: unknown;
		};
		delete (nav as { userActivation?: unknown }).userActivation; // stacks without the API must not pass by default
		// A restored match's AI cues fire before any click: without the
		// activation API to vouch for a gesture, nothing may be created,
		// fetched or played yet.
		playAeroplaneCue('roll');
		playAeroplaneCue('hop');
		expect(stack.constructs).toBe(0);
		expect(stack.fetches).toEqual([]);
		expect(stack.cues).toEqual([]);
		// The permitted direct priming gesture (Start/Roll/unmute click)
		// is what unlocks creation and the nine-cue preload.
		primeAeroplaneAudio();
		expect(stack.constructs).toBe(1);
		expect(stack.fetches).toHaveLength(9);
		await flushAudioPromises();
		playAeroplaneCue('roll');
		expect(stack.cues).toEqual(['roll']);
	});

	test('hop starts are spaced at least 150 ms apart; other cues are unlimited', async () => {
		const stack = installAudioStack();
		activeStack = stack;
		primeAeroplaneAudio();
		await flushAudioPromises();
		playAeroplaneCue('hop'); // first start passes
		playAeroplaneCue('hop'); // same instant: dropped
		playAeroplaneCue('roll'); // only hop is paced
		playAeroplaneCue('roll');
		stack.advanceNow(149);
		playAeroplaneCue('hop'); // 149 ms later: still dropped
		stack.advanceNow(1);
		playAeroplaneCue('hop'); // exactly 150 ms later: passes
		expect(stack.cues).toEqual(['hop', 'roll', 'roll', 'hop']);
	});

	test('resetAeroplaneAudioForTest clears contexts, buffers, hop pacing and gesture state', async () => {
		const stack = installAudioStack();
		activeStack = stack;
		primeAeroplaneAudio();
		await flushAudioPromises();
		playAeroplaneCue('hop');
		expect(stack.cues).toEqual(['hop']);

		resetAeroplaneAudioForTest();
		// Gesture state cleared too: a cue before the next permitted gesture
		// constructs nothing.
		playAeroplaneCue('hop');
		expect(stack.cues).toEqual(['hop']);
		expect(stack.constructs).toBe(1);
		primeAeroplaneAudio();
		expect(stack.constructs).toBe(2);
		// Buffers are gone: the cue waits on the fresh context's decode
		// and lands once it finishes inside the grace window.
		playAeroplaneCue('hop');
		expect(stack.cues).toEqual(['hop']);
		await flushAudioPromises();
		expect(stack.cues).toEqual(['hop', 'hop']);
		// The pacing clock reset only holds the new context to the same
		// 150 ms spacing as any other hop start.
		stack.advanceNow(200);
		playAeroplaneCue('hop');
		expect(stack.cues).toEqual(['hop', 'hop', 'hop']);
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
		await flushAudioPromises();
		// With gesture state cleared, the cue drops without constructing.
		playAeroplaneCue('roll');
		expect(stack.cues).toEqual([]);
		expect(stack.constructs).toBe(1);
		primeAeroplaneAudio();
		expect(stack.constructs).toBe(2);

		// The fresh context decodes anew and the cue plays normally.
		playAeroplaneCue('roll');
		await flushAudioPromises();
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
