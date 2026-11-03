/**
 * Browser-only Aeroplane cue helper (HPA-692 design §audio): the nine AAC
 * cues from the asset pack, fetched and decoded once after a permitted user
 * gesture and played back as one-shot buffer sources. Best-effort
 * everywhere — muted, unsupported, or blocked audio must never interrupt
 * play; a cue whose buffer is not ready is dropped, never queued.
 */
import { AEROPLANE_CUES, cueUrl, type AeroplaneCue } from './assets';
import type {
	AeroplaneColor,
	AeroplaneEvent,
	TycoonEffectEvent,
} from './types';

export type { AeroplaneCue };

/** The one effect cue a move's serialized events call for, if any. */
export type AeroplaneEffectCue = 'trap' | 'coin-loss' | 'coin-gain';

/**
 * Pick at most one effect cue from a move's serialized action events:
 * traps (Storm/Crash relocations and the Customs `skip`, on any colour)
 * outrank a human coin loss, which outranks a human coin gain. AI-only
 * money is silent, and the roll-only `skipped` never re-sounds Customs —
 * the arming `skip` already trapped on the move that landed there.
 */
export function selectEffectCue(
	events: readonly (AeroplaneEvent | TycoonEffectEvent)[],
	humanColor: AeroplaneColor
): AeroplaneEffectCue | null {
	let humanGain = false;
	let humanLoss = false;
	for (const event of events) {
		if (event.type === 'relocation') {
			if (event.effect === 'storm' || event.effect === 'crash') return 'trap';
		} else if (event.type === 'skip') {
			return 'trap';
		} else if (event.type === 'coins') {
			if (event.color !== humanColor) continue; // AI-only money is silent
			if (event.amount < 0) humanLoss = true;
			else if (event.amount > 0) humanGain = true;
		} else if (event.type === 'transfer') {
			if (event.from === humanColor) humanLoss = true;
			else if (event.to === humanColor) humanGain = true;
		}
	}
	if (humanLoss) return 'coin-loss';
	if (humanGain) return 'coin-gain';
	return null;
}

export const AEROPLANE_MUTED_STORAGE_KEY = 'procyon.aeroplane.muted';

/** Minimum spacing between hop starts; chained jumps would otherwise stack. */
const HOP_MIN_SPACING_MS = 150;

/** Master gain for every cue; the pack is mastered, so this stays simple. */
const CUE_GAIN = 1;

let cachedContext: AudioContext | null = null;
const cueBuffers = new Map<AeroplaneCue, AudioBuffer>();
let lastHopStartMs = 0;

/**
 * True once a permitted direct gesture (Start/Roll/unmute click) primed
 * audio. Context creation — and with it the preload fetches — must never
 * happen before one, so a restored match's pre-gesture AI cues cannot
 * fetch or play even on stacks without the activation API.
 */
let primedByGesture = false;

/**
 * A second belt for stacks that do expose the activation API: an
 * activation report of "never active" drops the cue rather than queuing
 * it, or every pre-gesture AI sound would fire as one blast on the first
 * click. Stacks lacking the API are held back by `primedByGesture` above.
 */
function userHasActivated(): boolean {
	const activation = (
		globalThis as typeof globalThis & {
			navigator?: { userActivation?: { hasBeenActive?: boolean } };
		}
	).navigator?.userActivation;
	return activation?.hasBeenActive !== false;
}

function audioContext(): AudioContext | null {
	if (cachedContext) return cachedContext;
	if (!primedByGesture) return null;
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
	preloadCues(cachedContext);
	return cachedContext;
}

/** Kick off one best-effort fetch/decode per cue for a fresh context. */
function preloadCues(context: AudioContext): void {
	for (const cue of AEROPLANE_CUES) {
		loadCue(context, cue);
	}
}

function loadCue(context: AudioContext, cue: AeroplaneCue): void {
	void (async () => {
		try {
			const response = await fetch(cueUrl(cue));
			if (!response.ok) return;
			const bytes = await response.arrayBuffer();
			const buffer = await context.decodeAudioData(bytes);
			// Callback-only decodeAudioData stacks resolve to undefined. A
			// reset since this decode began makes the context obsolete; its
			// late buffers must not refill the cleared cache.
			if (buffer && context === cachedContext) {
				cueBuffers.set(cue, buffer);
			}
		} catch {
			// A cue that cannot load or decode stays silent; best-effort.
		}
	})();
}

/** Unlock/resume the AudioContext from a direct user gesture. */
export function primeAeroplaneAudio(): void {
	primedByGesture = true;
	try {
		const context = audioContext();
		if (context && context.state === 'suspended') {
			void context.resume().catch(() => undefined);
		}
	} catch {
		// Audio is best-effort; never interrupt play.
	}
}

/** Play one decoded cue; a no-op when muted, unsupported, or blocked. */
export function playAeroplaneCue(cue: AeroplaneCue, muted = false): void {
	if (muted) return;
	try {
		if (!userHasActivated()) return;
		const context = audioContext();
		if (!context) return;
		if (context.state !== 'running') {
			if (context.state === 'suspended') {
				void context.resume().catch(() => undefined);
			}
			return;
		}
		const buffer = cueBuffers.get(cue);
		// Not decoded yet (or failed): drop the cue, never queue it.
		if (!buffer) return;
		if (cue === 'hop') {
			const now = Date.now();
			if (now - lastHopStartMs < HOP_MIN_SPACING_MS) return;
			lastHopStartMs = now;
		}
		const source = context.createBufferSource();
		source.buffer = buffer;
		const gain = context.createGain();
		gain.gain.value = CUE_GAIN;
		source.connect(gain);
		gain.connect(context.destination);
		source.onended = () => {
			try {
				source.disconnect();
				gain.disconnect();
			} catch {
				// Cleanup is best-effort.
			}
		};
		source.start();
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

/** Drop the cached AudioContext, decoded buffers and gesture state; tests only. */
export function resetAeroplaneAudioForTest(): void {
	cachedContext = null;
	cueBuffers.clear();
	lastHopStartMs = 0;
	primedByGesture = false;
}
