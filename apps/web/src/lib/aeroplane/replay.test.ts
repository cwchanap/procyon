import { expect, test } from 'bun:test';
import { chooseAiMove } from './ai';
import { checksumState } from './checksum';
import {
	QUICK_CONFIG,
	createAeroplaneMatch,
	playResolvedMove,
	rollTurn,
} from './game';
import { replayMatch } from './replay';
import type {
	AeroplaneActionRecord,
	AeroplaneColor,
	PersistedAeroplaneMatchV1,
} from './types';

function recordedMatch(): PersistedAeroplaneMatchV1 {
	const initial = createAeroplaneMatch(QUICK_CONFIG, 7);
	let state = initial.state;
	let diceRng = initial.diceRng;
	let aiRng = initial.aiRng;
	const actions: AeroplaneActionRecord[] = [];

	// Record enough turns to include a human action, a skipped roll, and an AI
	// choice.  Roll and move are separate records so pending-choice saves can
	// stop after the roll action without inventing a state snapshot per record.
	for (let turn = 0; turn < 4; turn += 1) {
		const color = state.currentPlayer;
		const actor = color === QUICK_CONFIG.humanColor ? 'human' : 'ai';
		const rolled = rollTurn(state, diceRng);
		diceRng = rolled.rng ?? diceRng;
		state = rolled.state;
		actions.push({
			kind: 'roll',
			actor,
			color,
			roll: rolled.roll,
			events: [],
			checksum: checksumState(state),
		});

		if (rolled.legalMoves.length === 0) continue;
		const choice =
			actor === 'ai'
				? chooseAiMove(
						state,
						rolled.legalMoves,
						initial.seats.find(seat => seat.color === color)!.personality,
						aiRng
					)
				: { move: rolled.legalMoves[0]!, rng: aiRng };
		aiRng = choice.rng;
		const transition = playResolvedMove(state, choice.move);
		state = transition.state;
		actions.push({
			kind: 'move',
			actor,
			color,
			roll: rolled.roll,
			selectedPlaneId: choice.move.planeId,
			events: transition.events,
			checksum: checksumState(state),
		});
		if (state.phase === 'finished') break;
	}

	return {
		version: 1,
		savedAt: '2026-08-09T00:00:00.000Z',
		rootSeed: initial.rootSeed,
		config: initial.state.config,
		state,
		seats: initial.seats,
		diceRng,
		aiRng,
		actions,
	};
}

test('replay reproduces recorded final checksum', () => {
	const result = replayMatch(recordedMatch());

	expect(result.kind).toBe('ok');
});

test('changed recorded AI choice reports the first mismatch', () => {
	const changed = structuredClone(recordedMatch());
	const aiMove = changed.actions.find(
		action => action.kind === 'move' && action.actor === 'ai'
	);
	expect(aiMove).toBeDefined();
	if (!aiMove) return;
	aiMove.selectedPlaneId = aiMove.color + '-3';

	const result = replayMatch(changed);

	expect(result.kind).toBe('mismatch');
	if (result.kind === 'mismatch')
		expect(result.index).toBeGreaterThanOrEqual(0);
});

test('valid restore is independent of diagnostic checksum mismatch', async () => {
	const changed = structuredClone(recordedMatch());
	changed.actions[0] = { ...changed.actions[0]!, checksum: '00000000' };
	const { restoreActiveMatch, ACTIVE_MATCH_STORAGE_KEY } = await import(
		'./persistence'
	);
	const values = new Map<string, string>([
		[ACTIVE_MATCH_STORAGE_KEY, JSON.stringify(changed)],
	]);
	const storage = {
		getItem: (key: string) => values.get(key) ?? null,
		setItem: (key: string, value: string) => void values.set(key, value),
		removeItem: (key: string) => void values.delete(key),
	};

	expect(restoreActiveMatch(storage).kind).toBe('ok');
});

test('replay never mutates the persisted match', () => {
	const match = recordedMatch();
	const before = structuredClone(match);

	replayMatch(match);

	expect(match).toEqual(before);
});

test('replay returns a mismatch rather than throwing on malformed action choice', () => {
	const changed = recordedMatch();
	const aiMove = changed.actions.find(
		action => action.kind === 'move' && action.actor === 'ai'
	);
	if (!aiMove) throw new Error('expected an AI move record');
	aiMove.selectedPlaneId = 'missing-plane';

	expect(() => replayMatch(changed)).not.toThrow();
	expect(replayMatch(changed).kind).toBe('mismatch');
});

test('recorded colors stay in the four-colour domain', () => {
	const match = recordedMatch();
	for (const action of match.actions) {
		expect(['red', 'yellow', 'blue', 'green'] as AeroplaneColor[]).toContain(
			action.color
		);
	}
});

test('checksum is stable across record-key and plane ordering and presentation data', () => {
	const match = createAeroplaneMatch(QUICK_CONFIG, 7);
	const first = {
		...match.state,
		planes: [...match.state.planes].reverse(),
		presentation: { highlightedPlane: 'red-0' },
		savedAt: 'first',
	};
	const second = {
		...match.state,
		planes: [...match.state.planes].sort((a, b) => b.id.localeCompare(a.id)),
		presentation: { highlightedPlane: 'yellow-0' },
		savedAt: 'second',
	};

	expect(checksumState(first)).toBe(checksumState(second));
});
