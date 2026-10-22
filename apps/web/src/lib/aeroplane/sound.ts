/**
 * Browser-only Aeroplane cue helper (HPA-428 design §5): five understated
 * placeholder tones, lazily initialized after a user gesture, best-effort
 * everywhere — muted, unsupported, or blocked audio must never interrupt
 * play. HPA-437 may later map cues to real audio URLs inside this module.
 */

export type AeroplaneCue = 'roll' | 'hop' | 'capture' | 'finish' | 'win';

export const AEROPLANE_MUTED_STORAGE_KEY = 'procyon.aeroplane.muted';

interface CueTone {
	frequency: number;
	durationMs: number;
	type: OscillatorType;
}

const CUE_TONES: Record<AeroplaneCue, CueTone> = {
	roll: { frequency: 340, durationMs: 90, type: 'triangle' },
	hop: { frequency: 500, durationMs: 60, type: 'sine' },
	capture: { frequency: 175, durationMs: 170, type: 'sawtooth' },
	finish: { frequency: 640, durationMs: 140, type: 'sine' },
	win: { frequency: 790, durationMs: 260, type: 'triangle' },
};

let cachedContext: AudioContext | null = null;

function audioContext(): AudioContext | null {
	if (cachedContext) return cachedContext;
	const root = globalThis as typeof globalThis & {
		AudioContext?: typeof AudioContext;
		webkitAudioContext?: typeof AudioContext;
	};
	const Ctor = root.AudioContext ?? root.webkitAudioContext;
	if (typeof Ctor !== 'function') return null;
	try {
		cachedContext = new Ctor();
	} catch {
		// Autoplay policy or construction failure; retry on the next cue.
		return null;
	}
	return cachedContext;
}

/** Unlock/resume the AudioContext from a direct user gesture. */
export function primeAeroplaneAudio(): void {
	try {
		const context = audioContext();
		if (context && context.state === 'suspended') {
			void context.resume().catch(() => undefined);
		}
	} catch {
		// Audio is best-effort; never interrupt play.
	}
}

/** Play one placeholder tone; a no-op when muted, unsupported, or blocked. */
export function playAeroplaneCue(cue: AeroplaneCue, muted = false): void {
	if (muted) return;
	try {
		const context = audioContext();
		if (!context) return;
		if (context.state === 'suspended') {
			void context.resume().catch(() => undefined);
		}
		const tone = CUE_TONES[cue];
		const seconds = tone.durationMs / 1000;
		const start = context.currentTime;
		const oscillator = context.createOscillator();
		const gain = context.createGain();
		oscillator.type = tone.type;
		oscillator.frequency.value = tone.frequency;
		gain.gain.setValueAtTime(0.0001, start);
		gain.gain.exponentialRampToValueAtTime(0.06, start + 0.012);
		gain.gain.exponentialRampToValueAtTime(0.0001, start + seconds);
		oscillator.connect(gain);
		gain.connect(context.destination);
		oscillator.onended = () => {
			try {
				oscillator.disconnect();
				gain.disconnect();
			} catch {
				// Cleanup is best-effort.
			}
		};
		oscillator.start(start);
		oscillator.stop(start + seconds);
	} catch {
		// Blocked or half-broken audio stacks must never interrupt play.
	}
}

/**
 * Read the persisted mute preference. SSR and unavailable storage read as
 * unmuted (the default), following the lib/theme.ts window-guard pattern.
 */
export function readAeroplaneMuted(): boolean {
	if (typeof window === 'undefined') return false;
	try {
		return window.localStorage.getItem(AEROPLANE_MUTED_STORAGE_KEY) === '1';
	} catch {
		return false;
	}
}

/** Persist the mute preference; storage failures are swallowed. */
export function writeAeroplaneMuted(muted: boolean): void {
	if (typeof window === 'undefined') return;
	try {
		window.localStorage.setItem(AEROPLANE_MUTED_STORAGE_KEY, muted ? '1' : '0');
	} catch {
		// Preference persistence must never interrupt play.
	}
}

/** Drop the cached AudioContext; intended for tests stubbing the constructor. */
export function resetAeroplaneAudioForTest(): void {
	cachedContext = null;
}
