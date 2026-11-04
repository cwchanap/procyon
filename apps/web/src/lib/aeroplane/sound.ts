/**
 * Browser-only Aeroplane cue helper (HPA-692 design §audio): the nine AAC
 * cues from the asset pack, fetched and decoded once after a permitted user
 * gesture and played back as one-shot buffer sources. Best-effort
 * everywhere — muted, unsupported, or blocked audio must never interrupt
 * play; a cue whose load is already in flight waits a bounded grace window
 * for its buffer rather than dropping instantly, and one with no load
 * pending is dropped, never queued.
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

/**
 * How long a cue may wait for a load already in flight — the Start/Roll
 * gesture's own preload — before dropping. Bounded so a stalled network
 * can never erupt far behind the move that asked for it.
 */
const CUE_LOAD_GRACE_MS = 750;

let cachedContext: AudioContext | null = null;
const cueBuffers = new Map<AeroplaneCue, AudioBuffer>();
/** In-flight fetch/decode per cue; presence is also the retry-dedupe key. */
const pendingLoads = new Map<AeroplaneCue, Promise<void>>();
let lastHopStartMs: number | null = null;

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

/**
 * Both states accept `resume()`: 'suspended' is the autoplay hold, while
 * Safari reports 'interrupted' after a phone call, Siri or an app switch —
 * treating only the former leaves iOS audio dead for the session.
 */
function resumableState(state: string): boolean {
	return state === 'suspended' || state === 'interrupted';
}

/** Monotonic clock for hop pacing; a wall-clock jump must not mute hops. */
function nowMs(): number {
	const perf = (globalThis as { performance?: { now?: () => number } })
		.performance;
	return typeof perf?.now === 'function' ? perf.now() : Date.now();
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
	ensureCueLoads(cachedContext);
	return cachedContext;
}

/**
 * One call covers both stacks: the Web Audio decode algorithm detaches
 * its ArrayBuffer, so probing the promise form and retrying with
 * callbacks would hand the retry a detached buffer and silence every
 * cue on callback-only stacks (older Safari). Passing the callbacks up
 * front serves those stacks, which return undefined synchronously;
 * promise stacks also settle the returned promise — whichever fires
 * first wins the wrapper.
 */
function decodeAudio(
	context: AudioContext,
	bytes: ArrayBuffer
): Promise<AudioBuffer | undefined> {
	return new Promise((resolve, reject) => {
		try {
			const result: unknown = context.decodeAudioData(bytes, resolve, reject);
			if (
				result &&
				typeof (result as Promise<AudioBuffer>).then === 'function'
			) {
				void (result as Promise<AudioBuffer>).then(resolve, reject);
			}
		} catch (error) {
			reject(error);
		}
	});
}

/**
 * Fetch+decode one cue unless already buffered or in flight. A failure
 * resolves the task without a buffer, so the next prime — or the next
 * request for the cue — retries instead of staying silent until reload.
 */
function loadCue(context: AudioContext, cue: AeroplaneCue): void {
	if (cueBuffers.has(cue) || pendingLoads.has(cue)) return;
	const task = (async (): Promise<void> => {
		try {
			const response = await fetch(cueUrl(cue));
			if (!response.ok) return;
			const bytes = await response.arrayBuffer();
			const buffer = await decodeAudio(context, bytes);
			// Callback-only decodeAudioData stacks resolve to undefined. A
			// reset since this load began makes the context obsolete; its
			// late buffers must not refill the cleared cache.
			if (buffer && context === cachedContext) {
				cueBuffers.set(cue, buffer);
			}
		} catch {
			// A cue that cannot load or decode stays silent; best-effort.
		}
	})();
	pendingLoads.set(cue, task);
	// The failed task's absence is the retry signal; clear only this
	// task so a replacement started meanwhile is not evicted.
	void task.finally(() => {
		if (pendingLoads.get(cue) === task) pendingLoads.delete(cue);
	});
}

/** Kick off one best-effort fetch/decode per not-yet-decoded cue. */
function ensureCueLoads(context: AudioContext): void {
	for (const cue of AEROPLANE_CUES) {
		loadCue(context, cue);
	}
}

function delay(ms: number): Promise<void> {
	return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Unlock/resume the AudioContext from a direct user gesture. A muted
 * player never pays for the context or the nine cue downloads — the
 * saved preference gates this no matter which gesture arrived.
 */
export function primeAeroplaneAudio(): void {
	primedByGesture = true;
	try {
		if (readAeroplaneMuted()) return;
		const context = audioContext();
		if (!context) return;
		if (resumableState(context.state)) {
			void context.resume().catch(() => undefined);
		}
		// Also retries cues an earlier load failed to decode.
		ensureCueLoads(context);
	} catch {
		// Audio is best-effort; never interrupt play.
	}
}

/** Emit one decoded cue on a running context; hop starts stay spaced. */
function startCue(
	context: AudioContext,
	cue: AeroplaneCue,
	buffer: AudioBuffer
): void {
	if (context.state !== 'running') {
		if (resumableState(context.state)) {
			void context.resume().catch(() => undefined);
		}
		return;
	}
	if (cue === 'hop') {
		const now = nowMs();
		if (lastHopStartMs !== null && now - lastHopStartMs < HOP_MIN_SPACING_MS)
			return;
		lastHopStartMs = now;
	}
	const source = context.createBufferSource();
	source.buffer = buffer;
	source.connect(context.destination);
	source.onended = () => {
		try {
			source.disconnect();
		} catch {
			// Cleanup is best-effort.
		}
	};
	source.start();
}

/** Play one decoded cue; a no-op when muted, unsupported, or blocked. */
export function playAeroplaneCue(cue: AeroplaneCue, muted = false): void {
	// The stored preference is authoritative: a caller passing the wrong
	// flag must not recreate the context and downloads a mute saved.
	if (muted || readAeroplaneMuted()) return;
	try {
		if (!userHasActivated()) return;
		const context = audioContext();
		if (!context) return;
		const buffer = cueBuffers.get(cue);
		if (buffer) {
			startCue(context, cue, buffer);
			return;
		}
		const pending = pendingLoads.get(cue);
		if (pending) {
			// The gesture's own preload is already fetching this cue (the
			// first roll after a reload, say): give it a bounded grace
			// window instead of dropping the cue it was started for.
			void Promise.race([pending, delay(CUE_LOAD_GRACE_MS)]).then(() => {
				try {
					if (context !== cachedContext || readAeroplaneMuted()) return;
					const ready = cueBuffers.get(cue);
					if (ready) startCue(context, cue, ready);
				} catch {
					// Best-effort playback must never interrupt play.
				}
			});
			return;
		}
		// No load in flight (an earlier attempt failed or this cue was
		// never preloaded): retry on demand; this request still drops.
		loadCue(context, cue);
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
	pendingLoads.clear();
	lastHopStartMs = null;
	primedByGesture = false;
}
