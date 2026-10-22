import { afterEach, describe, expect, test } from 'bun:test';
import { setupReactDom } from '../../test/reactSetup';
import {
	AEROPLANE_MUTED_STORAGE_KEY,
	playAeroplaneCue,
	primeAeroplaneAudio,
	readAeroplaneMuted,
	resetAeroplaneAudioForTest,
	writeAeroplaneMuted,
} from './sound';

setupReactDom();

interface StubOscillator {
	type: string;
	frequency: { value: number };
	onended: (() => void) | null;
	connect(): StubOscillator;
	start(): void;
	stop(): void;
	disconnect(): void;
}

function installAudioContextStub(options?: {
	constructorThrows?: boolean;
	createOscillatorThrows?: boolean;
	state?: string;
}) {
	const oscillators: StubOscillator[] = [];
	const resumes: number[] = [];
	class StubAudioContext {
		destination = {};
		currentTime = 0;
		state = options?.state ?? 'running';
		resume = () => {
			resumes.push(1);
			return Promise.resolve();
		};
		createGain() {
			return {
				gain: {
					setValueAtTime() {},
					exponentialRampToValueAtTime() {},
				},
				connect() {},
				disconnect() {},
			};
		}
		createOscillator(): StubOscillator {
			if (options?.createOscillatorThrows) {
				throw new Error('node creation blocked');
			}
			const oscillator: StubOscillator = {
				type: '',
				frequency: { value: 0 },
				onended: null,
				connect() {
					return oscillator;
				},
				start() {},
				stop() {},
				disconnect() {},
			};
			oscillators.push(oscillator);
			return oscillator;
		}
		constructor() {
			if (options?.constructorThrows) {
				throw new Error('autoplay blocked');
			}
		}
	}
	(globalThis as Record<string, unknown>).AudioContext = StubAudioContext;
	return { oscillators, resumes };
}

afterEach(() => {
	const root = globalThis as Record<string, unknown>;
	delete root.AudioContext;
	delete root.webkitAudioContext;
	resetAeroplaneAudioForTest();
});

describe('aeroplane sound helper', () => {
	test('plays cue tones through a lazily created AudioContext', () => {
		const { oscillators } = installAudioContextStub();
		playAeroplaneCue('roll');
		expect(oscillators).toHaveLength(1);
		expect(oscillators[0]!.frequency.value).toBe(340);
		playAeroplaneCue('hop');
		expect(oscillators).toHaveLength(2);
		expect(oscillators[1]!.frequency.value).toBe(500);
	});

	test('muted cues create no oscillators', () => {
		const { oscillators } = installAudioContextStub();
		playAeroplaneCue('roll', true);
		expect(oscillators).toHaveLength(0);
	});

	test('missing, throwing, and half-broken audio stacks never throw', () => {
		const root = globalThis as Record<string, unknown>;
		delete root.AudioContext;
		expect(() => {
			playAeroplaneCue('win');
			primeAeroplaneAudio();
		}).not.toThrow();

		installAudioContextStub({ constructorThrows: true });
		expect(() => {
			playAeroplaneCue('capture');
			primeAeroplaneAudio();
		}).not.toThrow();

		installAudioContextStub({
			createOscillatorThrows: true,
			state: 'suspended',
		});
		expect(() => {
			playAeroplaneCue('finish');
			primeAeroplaneAudio();
		}).not.toThrow();
	});

	test('primes a suspended context for later cues', () => {
		const { resumes } = installAudioContextStub({ state: 'suspended' });
		primeAeroplaneAudio();
		expect(resumes).toHaveLength(1);
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
