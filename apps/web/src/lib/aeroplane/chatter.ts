import { canonicalSerialize, fnv1a } from './checksum';
import type { Personality, ResolvedMove } from './types';

export type ChatterKind = 'capture' | 'flight' | 'finish' | 'win' | 'loss';

/** A small serializable cue for terminal/turn-level presentation lines. */
export interface AeroplaneChatterCue {
	kind: ChatterKind;
	token?: string | number;
}

type ChatterInput = ResolvedMove | AeroplaneChatterCue;

const CHATTER_LINES: Record<
	ChatterKind,
	Record<Personality, readonly string[]>
> = {
	capture: {
		cautious: [
			'Clean interception. Keep the formation tight.',
			'An opening appears; take it and stay disciplined.',
		],
		aggressive: [
			'Got you! The shared track is ours now.',
			'No hesitation — that plane is grounded.',
		],
		unpredictable: [
			'Plot twist: one less plane in the sky.',
			'Unexpected landing, very much on purpose.',
		],
	},
	flight: {
		cautious: [
			'Long flight complete. The next square is measured.',
			'Quietly taking the shortcut.',
		],
		aggressive: [
			'Full throttle — watch this route.',
			'We are skipping the queue and taking the lead.',
		],
		unpredictable: [
			'And now, a scenic shortcut.',
			'The map suggested this flight. Probably.',
		],
	},
	finish: {
		cautious: [
			'One plane home. The plan is working.',
			'Finish secured with room to spare.',
		],
		aggressive: [
			'Home stretch conquered!',
			'Another plane across the line — keep pushing.',
		],
		unpredictable: [
			'Parked! That was almost exactly intentional.',
			'Home sweet hangar, somehow.',
		],
	},
	win: {
		cautious: [
			'All targets met. A careful victory.',
			'Every route counted — match secured.',
		],
		aggressive: [
			'Victory lap! The track belongs to us.',
			'That is the finish — total takeoff domination.',
		],
		unpredictable: [
			'We won? Excellent. I had a route for that.',
			'Plot twist: the scoreboard says victory.',
		],
	},
	loss: {
		cautious: [
			'Not this flight. We will review the route and return.',
			'The formation fell short; the next plan starts now.',
		],
		aggressive: [
			'Grounded this time. We will take the track back.',
			'No excuses — reload and race again.',
		],
		unpredictable: [
			'An unexpected detour into defeat.',
			'The scoreboard took a strange turn. Again?',
		],
	},
};

const PERSONALITY_KEYS: readonly Personality[] = [
	'cautious',
	'aggressive',
	'unpredictable',
];

function isChatterKind(value: unknown): value is ChatterKind {
	return (
		value === 'capture' ||
		value === 'flight' ||
		value === 'finish' ||
		value === 'win' ||
		value === 'loss'
	);
}

function isPersonality(value: unknown): value is Personality {
	return PERSONALITY_KEYS.includes(value as Personality);
}

function cueFromInput(input: ChatterInput): AeroplaneChatterCue | null {
	if ('kind' in input) {
		return isChatterKind(input.kind) ? input : null;
	}

	if (input.capturedPlaneIds.length > 0) {
		return {
			kind: 'capture',
			token: input.capturedPlaneIds.join(','),
		};
	}
	if (input.events.some(event => event.type === 'flight')) {
		return { kind: 'flight', token: input.planeId };
	}
	if (input.finalEndpoint.kind === 'finished') {
		return { kind: 'finish', token: input.planeId };
	}
	return null;
}

/**
 * Return one deterministic local personality line for a notable event.
 *
 * This helper is intentionally pure: it has no dependency on the gameplay
 * RNG, provider clients, timers, or browser state. Invalid cues simply have
 * no presentation line so chatter can never interfere with a match.
 */
export function getChatterLine(
	input: ChatterInput,
	personality: Personality
): string | null {
	if (!isPersonality(personality)) return null;
	const cue = cueFromInput(input);
	if (!cue) return null;
	const lines = CHATTER_LINES[cue.kind][personality];
	const index = fnv1a(canonicalSerialize(cue)) % lines.length;
	return lines[index] ?? null;
}
