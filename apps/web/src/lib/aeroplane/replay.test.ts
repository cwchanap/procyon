import { expect, test } from 'bun:test';
import { chooseAiMove } from './ai';
import { checksumState } from './checksum';
import { rollFair } from './dice';
import {
	CLASSIC_CONFIG,
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
	const actionIndex = changed.actions.indexOf(aiMove);

	const result = replayMatch(changed);

	expect(result.kind).toBe('mismatch');
	if (result.kind === 'mismatch') {
		expect(result.index).toBe(actionIndex);
		expect(result.reason).toBe('recorded AI choice mismatch');
	}
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

test('checksum is stable across plane ordering and presentation data', () => {
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

	// A materially different authoritative state must produce a different
	// checksum so the contract remains meaningful.
	const movedRed = {
		...match.state,
		planes: match.state.planes.map(plane =>
			plane.id === 'red-0' ? { ...plane, progress: 12 } : plane
		),
	};
	expect(checksumState(movedRed)).not.toBe(checksumState(match.state));
});

// --- Mismatch-branch coverage for the diagnostic replay path ---

function firstRollAction(
	match: PersistedAeroplaneMatchV1
): AeroplaneActionRecord {
	const action = match.actions.find(record => record.kind === 'roll');
	if (!action) throw new Error('expected a roll action in the recorded match');
	return action;
}

function firstMoveAction(
	match: PersistedAeroplaneMatchV1
): AeroplaneActionRecord {
	const action = match.actions.find(record => record.kind === 'move');
	if (!action) throw new Error('expected a move action in the recorded match');
	return action;
}

function firstHumanMoveAction(
	match: PersistedAeroplaneMatchV1
): AeroplaneActionRecord {
	const action = match.actions.find(
		record => record.kind === 'move' && record.actor === 'human'
	);
	if (!action) throw new Error('expected a human move action');
	return action;
}

function expectMismatch(
	match: PersistedAeroplaneMatchV1,
	reasonFragment?: string
): void {
	const result = replayMatch(match);
	expect(result.kind).toBe('mismatch');
	if (result.kind === 'mismatch' && reasonFragment)
		expect(result.reason).toContain(reasonFragment);
}

test('replay reports a checksum mismatch when an action checksum is corrupted', () => {
	const changed = structuredClone(recordedMatch());
	const roll = firstRollAction(changed);
	roll.checksum = 'deadbeef';
	expectMismatch(changed, 'checksum');
});

test('replay reports an events mismatch when a roll record carries spurious events', () => {
	const changed = structuredClone(recordedMatch());
	const roll = firstRollAction(changed);
	const move = firstMoveAction(changed);
	// Reuse a real event from a move record so the action still validates.
	roll.events = [...move.events];
	expectMismatch(changed, 'events');
});

test('replay reports a colour mismatch when a roll record names the wrong owner', () => {
	const changed = structuredClone(recordedMatch());
	const roll = firstRollAction(changed);
	// red starts; pick another valid colour that is not the current player.
	roll.color = roll.color === 'red' ? 'yellow' : 'red';
	expectMismatch(changed, 'colour');
});

test('replay reports an actor mismatch when a human seat records an AI roll', () => {
	const changed = structuredClone(recordedMatch());
	const roll = firstRollAction(changed);
	// The first roll is red's; red is the human colour in QUICK_CONFIG.
	roll.actor = 'ai';
	expectMismatch(changed, 'actor');
});

test('replay reports a roll mismatch when the recorded roll is wrong', () => {
	const changed = structuredClone(recordedMatch());
	const roll = firstRollAction(changed);
	roll.roll = roll.roll === 6 ? 1 : roll.roll + 1;
	expectMismatch(changed, 'roll');
});

test('replay reports a mismatch when a recorded human move selects an illegal plane', () => {
	const changed = structuredClone(recordedMatch());
	const humanMove = firstHumanMoveAction(changed);
	humanMove.selectedPlaneId = 'red-9';
	expectMismatch(changed, 'not legal');
});

test('replay reports a final authoritative state checksum mismatch', () => {
	const changed = structuredClone(recordedMatch());
	// Mutate a checksum-bearing field while keeping the state valid.
	changed.state = {
		...changed.state,
		turnNumber: changed.state.turnNumber + 1,
	};
	expectMismatch(changed, 'final authoritative state');
});

test('replay reports a final dice RNG mismatch', () => {
	const changed = structuredClone(recordedMatch());
	changed.diceRng = { value: changed.diceRng.value + 1 };
	expectMismatch(changed, 'dice RNG');
});

test('replay reports a final AI RNG mismatch', () => {
	const changed = structuredClone(recordedMatch());
	changed.aiRng = { value: changed.aiRng.value + 1 };
	expectMismatch(changed, 'AI RNG');
});

test('replay reports a pending-roll mismatch for a move record that disagrees with the roll', () => {
	const changed = structuredClone(recordedMatch());
	const move = firstMoveAction(changed);
	// The move starts from awaiting-choice; flip its roll to another valid die.
	move.roll = move.roll === 6 ? 1 : move.roll + 1;
	expectMismatch(changed, 'pending roll');
});

// --- Unified turn records (move-only history) ---

/** Find a root seed whose first fair dice roll matches the target. */
function rootSeedWithFirstRoll(target: number): number {
	for (let seed = 1; seed <= 100_000; seed += 1) {
		const match = createAeroplaneMatch(CLASSIC_CONFIG, seed);
		if (rollFair(match.diceRng).roll === target) return seed;
	}
	throw new Error(`no root seed whose first roll is ${target}`);
}

/** A move-only history: fresh start, first roll launches red, one unified move. */
function unifiedMoveMatch(): PersistedAeroplaneMatchV1 {
	const rootSeed = rootSeedWithFirstRoll(6);
	const initial = createAeroplaneMatch(CLASSIC_CONFIG, rootSeed);
	const rolled = rollTurn(initial.state, initial.diceRng);
	if (rolled.legalMoves.length === 0)
		throw new Error('expected a launch on the first roll of 6');
	const move = rolled.legalMoves[0]!;
	const transition = playResolvedMove(rolled.state, move);
	const action: AeroplaneActionRecord = {
		kind: 'move',
		actor: 'human',
		color: 'red',
		roll: rolled.roll,
		selectedPlaneId: move.planeId,
		events: transition.events,
		checksum: checksumState(transition.state),
	};
	return {
		version: 1,
		savedAt: '2026-08-09T00:00:00.000Z',
		rootSeed: initial.rootSeed,
		config: initial.state.config,
		state: transition.state,
		seats: initial.seats,
		diceRng: rolled.rng ?? initial.diceRng,
		aiRng: initial.aiRng,
		actions: [action],
	};
}

/** Play a full QUICK game with separate roll+move records until it finishes. */
function fullRecordedMatch(): PersistedAeroplaneMatchV1 {
	const initial = createAeroplaneMatch(QUICK_CONFIG, 7);
	let state = initial.state;
	let diceRng = initial.diceRng;
	let aiRng = initial.aiRng;
	const actions: AeroplaneActionRecord[] = [];
	for (let turn = 0; turn < 5000 && state.phase !== 'finished'; turn += 1) {
		const color = state.currentPlayer;
		const actor: 'human' | 'ai' =
			color === QUICK_CONFIG.humanColor ? 'human' : 'ai';
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
	}
	if (state.phase !== 'finished')
		throw new Error('recorded match did not finish within the turn cap');
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

test('replay reproduces a unified move-only history that rolls inline', () => {
	const result = replayMatch(unifiedMoveMatch());
	expect(result.kind).toBe('ok');
});

test('replay reports a mismatch when a unified move rolls into no legal moves', () => {
	const rootSeed = rootSeedWithFirstRoll(1);
	const initial = createAeroplaneMatch(CLASSIC_CONFIG, rootSeed);
	// Fresh start, all planes in the hangar; a non-six roll launches nothing.
	const rolled = rollTurn(initial.state, initial.diceRng);
	expect(rolled.legalMoves.length).toBe(0);
	const action: AeroplaneActionRecord = {
		kind: 'move',
		actor: 'human',
		color: 'red',
		roll: rolled.roll,
		selectedPlaneId: 'red-0',
		events: [],
		checksum: checksumState(rolled.state),
	};
	const match: PersistedAeroplaneMatchV1 = {
		version: 1,
		savedAt: '2026-08-09T00:00:00.000Z',
		rootSeed: initial.rootSeed,
		config: initial.state.config,
		state: initial.state,
		seats: initial.seats,
		diceRng: rolled.rng ?? initial.diceRng,
		aiRng: initial.aiRng,
		actions: [action],
	};
	expectMismatch(match, 'no legal move');
});

test('replay reports a mismatch when a move record follows a finished turn', () => {
	const finished = structuredClone(fullRecordedMatch());
	const last = finished.actions[finished.actions.length - 1]!;
	// Append a move record after the game is already finished.
	finished.actions = [
		...finished.actions,
		{ ...last, selectedPlaneId: 'red-0' },
	];
	expectMismatch(finished, 'playable turn');
});

test('replay reports a mismatch for a unified move whose roll disagrees with the dice stream', () => {
	const changed = structuredClone(unifiedMoveMatch());
	const move = changed.actions[0]!;
	move.roll = move.roll === 6 ? 1 : move.roll + 1;
	expectMismatch(changed, 'roll');
});
