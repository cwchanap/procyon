import { chooseAiMove } from './ai';
import { canonicalSerialize, checksumState } from './checksum';
import {
	createAeroplaneMatch,
	playResolvedMove,
	rollTurn,
	type AeroplaneMatch,
} from './game';
import { getLegalMoves } from './rules';
import {
	validatePersistedAeroplaneMatch,
	type PersistedAeroplaneValidationResult,
} from './persistence';
import type {
	AeroplaneActionRecord,
	AeroplaneColor,
	AeroplaneEvent,
	AeroplaneState,
	PersistedAeroplaneMatchV1,
	ResolvedMove,
} from './types';

export interface ReplayOkResult {
	kind: 'ok';
	state: AeroplaneState;
	checksum: string;
	actionCount: number;
	match: AeroplaneMatch;
}

export interface ReplayMismatchResult {
	kind: 'mismatch';
	index: number;
	actionIndex: number;
	reason: string;
	field?: string;
	expected?: unknown;
	actual?: unknown;
}

export interface ReplayInvalidResult {
	kind: 'invalid';
	reason: string;
}

export type ReplayResult =
	| ReplayOkResult
	| ReplayMismatchResult
	| ReplayInvalidResult;

function isColor(value: unknown): value is AeroplaneColor {
	return (
		value === 'red' ||
		value === 'yellow' ||
		value === 'blue' ||
		value === 'green'
	);
}

function actionKind(action: AeroplaneActionRecord): 'roll' | 'move' | null {
	const kind = action.kind;
	return kind === 'roll' || kind === 'move' ? kind : null;
}

function actionColor(
	action: AeroplaneActionRecord,
	currentPlayer: AeroplaneColor
): AeroplaneColor {
	if (isColor(action.color)) return action.color;
	return currentPlayer;
}

function actionRole(action: AeroplaneActionRecord): 'human' | 'ai' | null {
	if (action.actor === 'human' || action.actor === 'ai') return action.actor;
	return null;
}

function selectedPlane(action: AeroplaneActionRecord): string | null {
	const selected = action.selectedPlaneId;
	return typeof selected === 'string' && selected.length > 0 ? selected : null;
}

function mismatch(
	index: number,
	reason: string,
	field?: string,
	expected?: unknown,
	actual?: unknown
): ReplayMismatchResult {
	return {
		kind: 'mismatch',
		index,
		actionIndex: index,
		reason,
		field,
		expected,
		actual,
	};
}

function equalValue(a: unknown, b: unknown): boolean {
	return canonicalSerialize(a) === canonicalSerialize(b);
}

function checkActionChecksum(
	action: AeroplaneActionRecord,
	state: AeroplaneState,
	index: number
): ReplayMismatchResult | null {
	const actual = checksumState(state);
	if (action.checksum !== actual) {
		return mismatch(
			index,
			'action checksum mismatch',
			'checksum',
			action.checksum,
			actual
		);
	}
	return null;
}

function checkEvents(
	action: AeroplaneActionRecord,
	events: AeroplaneEvent[],
	index: number
): ReplayMismatchResult | null {
	if (!equalValue(action.events, events)) {
		return mismatch(
			index,
			'resolved events mismatch',
			'events',
			action.events,
			events
		);
	}
	return null;
}

function checkRoleAndColor(
	action: AeroplaneActionRecord,
	state: AeroplaneState,
	index: number
): ReplayMismatchResult | null {
	const color = actionColor(action, state.currentPlayer);
	if (color !== state.currentPlayer) {
		return mismatch(
			index,
			'action colour does not own the turn',
			'color',
			color,
			state.currentPlayer
		);
	}
	const role = actionRole(action);
	const expectedRole = color === state.config.humanColor ? 'human' : 'ai';
	if (role !== expectedRole) {
		return mismatch(
			index,
			'action actor does not match the seat',
			'actor',
			role,
			expectedRole
		);
	}
	return null;
}

function checkRoll(
	action: AeroplaneActionRecord,
	rolled: ReturnType<typeof rollTurn>,
	index: number
): ReplayMismatchResult | null {
	if (action.roll !== rolled.roll) {
		return mismatch(
			index,
			'recorded roll mismatch',
			'roll',
			action.roll,
			rolled.roll
		);
	}
	return null;
}

function chooseRecordedMove(
	action: AeroplaneActionRecord,
	state: AeroplaneState,
	legalMoves: ResolvedMove[],
	seats: PersistedAeroplaneMatchV1['seats'],
	aiRng: AeroplaneMatch['aiRng'],
	index: number
):
	| { kind: 'ok'; move: ResolvedMove; rng: AeroplaneMatch['aiRng'] }
	| ReplayMismatchResult {
	const selectedId = selectedPlane(action);
	if (selectedId === null)
		return mismatch(index, 'move action has no selected plane');
	const role = actionRole(action);
	if (role === 'human') {
		const move = legalMoves.find(candidate => candidate.planeId === selectedId);
		return move
			? { kind: 'ok', move, rng: aiRng }
			: mismatch(
					index,
					'recorded human move is not legal',
					'selectedPlaneId',
					selectedId
				);
	}
	if (role !== 'ai') return mismatch(index, 'unknown move actor');
	const seat = seats.find(candidate => candidate.color === state.currentPlayer);
	if (!seat) return mismatch(index, 'missing persisted AI seat');
	const choice = chooseAiMove(state, legalMoves, seat.personality, aiRng);
	if (choice.move.planeId !== selectedId) {
		return mismatch(
			index,
			'recorded AI choice mismatch',
			'selectedPlaneId',
			selectedId,
			choice.move.planeId
		);
	}
	return { kind: 'ok', move: choice.move, rng: choice.rng };
}

function finishResult(
	initial: AeroplaneMatch,
	snapshot: PersistedAeroplaneMatchV1,
	state: AeroplaneState,
	diceRng: AeroplaneMatch['diceRng'],
	aiRng: AeroplaneMatch['aiRng'],
	actionCount: number
): ReplayResult {
	const actualChecksum = checksumState(state);
	const expectedChecksum = checksumState(snapshot.state);
	if (actualChecksum !== expectedChecksum) {
		return mismatch(
			actionCount,
			'final authoritative state mismatch',
			'checksum',
			expectedChecksum,
			actualChecksum
		);
	}
	if (!equalValue(diceRng, snapshot.diceRng)) {
		return mismatch(
			actionCount,
			'final dice RNG mismatch',
			'diceRng',
			snapshot.diceRng,
			diceRng
		);
	}
	if (!equalValue(aiRng, snapshot.aiRng)) {
		return mismatch(
			actionCount,
			'final AI RNG mismatch',
			'aiRng',
			snapshot.aiRng,
			aiRng
		);
	}
	return {
		kind: 'ok',
		state,
		checksum: actualChecksum,
		actionCount,
		match: {
			...initial,
			state,
			seats: snapshot.seats.map(seat => ({ ...seat })),
			diceRng,
			aiRng,
		},
	};
}

/**
 * DEV/test-only diagnostic.  Rebuild from the deterministic root and report
 * the first roll, move, event, checksum, or final-state mismatch.  The input
 * envelope and its nested records are never mutated.
 */
export function replayMatch(value: PersistedAeroplaneMatchV1): ReplayResult {
	const validation: PersistedAeroplaneValidationResult =
		validatePersistedAeroplaneMatch(value);
	if (!validation.ok) return { kind: 'invalid', reason: validation.reason };
	const snapshot = validation.value;
	const initial = createAeroplaneMatch(snapshot.config, snapshot.rootSeed);
	let state = initial.state;
	let diceRng = initial.diceRng;
	let aiRng = initial.aiRng;

	for (let index = 0; index < snapshot.actions.length; index += 1) {
		const action = snapshot.actions[index]!;
		const kind = actionKind(action);
		if (!kind) return mismatch(index, 'unknown action kind');
		if (kind === 'roll') {
			const ownerMismatch = checkRoleAndColor(action, state, index);
			if (ownerMismatch) return ownerMismatch;
			if (state.phase !== 'awaiting-roll')
				return mismatch(index, 'roll action does not start from awaiting-roll');
			const rolled = rollTurn(state, diceRng);
			diceRng = rolled.rng ?? diceRng;
			const rollMismatch = checkRoll(action, rolled, index);
			if (rollMismatch) return rollMismatch;
			state = rolled.state;
			const eventMismatch = checkEvents(action, [], index);
			if (eventMismatch) return eventMismatch;
			const checksumMismatch = checkActionChecksum(action, state, index);
			if (checksumMismatch) return checksumMismatch;
			continue;
		}

		// Unified turn records may omit a separate roll record.  If this move
		// starts a turn, consume the real dice roll before resolving its choice.
		if (state.phase === 'awaiting-roll') {
			const ownerMismatch = checkRoleAndColor(action, state, index);
			if (ownerMismatch) return ownerMismatch;
			const rolled = rollTurn(state, diceRng);
			diceRng = rolled.rng ?? diceRng;
			const rollMismatch = checkRoll(action, rolled, index);
			if (rollMismatch) return rollMismatch;
			if (rolled.legalMoves.length === 0)
				return mismatch(index, 'move action has no legal move after its roll');
			state = rolled.state;
		} else if (state.phase !== 'awaiting-choice') {
			return mismatch(index, 'move action does not start from a playable turn');
		} else if (action.roll !== state.pendingRoll) {
			return mismatch(
				index,
				'move roll does not match pending roll',
				'roll',
				action.roll,
				state.pendingRoll
			);
		} else {
			const ownerMismatch = checkRoleAndColor(action, state, index);
			if (ownerMismatch) return ownerMismatch;
		}

		const legalMoves = getLegalMoves(state, state.pendingRoll!);
		const choice = chooseRecordedMove(
			action,
			state,
			legalMoves,
			snapshot.seats,
			aiRng,
			index
		);
		if (choice.kind !== 'ok') return choice;
		aiRng = choice.rng;
		let transition;
		try {
			transition = playResolvedMove(state, choice.move);
		} catch {
			return mismatch(index, 'recorded move could not be applied');
		}
		state = transition.state;
		const eventMismatch = checkEvents(action, transition.events, index);
		if (eventMismatch) return eventMismatch;
		const checksumMismatch = checkActionChecksum(action, state, index);
		if (checksumMismatch) return checksumMismatch;
	}

	return finishResult(
		initial,
		snapshot,
		state,
		diceRng,
		aiRng,
		snapshot.actions.length
	);
}
