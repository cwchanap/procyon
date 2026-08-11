import { describe, expect, test } from 'bun:test';
import { render } from '@testing-library/react';
import { setupReactDom } from '../../test/reactSetup';
import { CLASSIC_CONFIG } from '../../lib/aeroplane/game';
import type {
	AeroplaneEvent,
	AeroplaneState,
	ResolvedMove,
} from '../../lib/aeroplane/types';
import AeroplaneStatus from './AeroplaneStatus';

setupReactDom();

const COLORS = ['red', 'yellow', 'blue', 'green'] as const;

function fixtureState(patch: Partial<AeroplaneState> = {}): AeroplaneState {
	return {
		config: CLASSIC_CONFIG,
		currentPlayer: 'red',
		phase: 'awaiting-choice',
		pendingRoll: 3,
		planes: COLORS.flatMap(color =>
			Array.from({ length: 4 }, (_, index) => ({
				id: `${color}-${index}`,
				color,
				progress: color === 'red' && index === 0 ? 14 : null,
			}))
		),
		winner: null,
		turnNumber: 1,
		noMoveStreak: { red: 0, yellow: 0, blue: 0, green: 0 },
		lastPlaceRounds: { red: 0, yellow: 0, blue: 0, green: 0 },
		roundNumber: 1,
		stats: {
			capturesMade: { red: 0, yellow: 0, blue: 0, green: 0 },
			capturesSuffered: { red: 0, yellow: 0, blue: 0, green: 0 },
			finished: { red: 0, yellow: 0, blue: 0, green: 0 },
		},
		...patch,
	};
}

function move(
	planeId = 'red-0',
	toProgress = 30,
	events: AeroplaneEvent[] = []
): ResolvedMove {
	return {
		planeId,
		color: 'red',
		roll: 3,
		start: { kind: 'track', color: 'red', progress: 14, globalIndex: 13 },
		baseEndpoint: {
			kind: 'track',
			color: 'red',
			progress: toProgress,
			globalIndex: toProgress - 1,
		},
		finalEndpoint: {
			kind: 'track',
			color: 'red',
			progress: toProgress,
			globalIndex: toProgress - 1,
		},
		events,
		capturedPlaneIds: [],
	};
}

describe('Aeroplane status copy', () => {
	test('shows the no-legal-moves pass message during a human awaiting-choice turn with no moves', () => {
		const { getAllByText } = render(
			<AeroplaneStatus
				state={fixtureState({ phase: 'awaiting-choice', pendingRoll: 3 })}
				legalMoves={[]}
				isHumanTurn
			/>
		);
		expect(
			getAllByText(/no legal moves — turn passes automatically/i).length
		).toBeGreaterThan(0);
	});

	test('shows choosing-a-move copy during an AI awaiting-choice turn even when legalMoves is empty (hook filters to [] for AI turns)', () => {
		const { getAllByText, queryAllByText } = render(
			<AeroplaneStatus
				state={fixtureState({
					currentPlayer: 'yellow',
					phase: 'awaiting-choice',
					pendingRoll: 3,
				})}
				legalMoves={[]}
				isHumanTurn={false}
			/>
		);
		expect(getAllByText(/yellow is choosing a move/i).length).toBeGreaterThan(
			0
		);
		expect(
			queryAllByText(/no legal moves — turn passes automatically/i)
		).toHaveLength(0);
	});

	test('shows AI choosing-a-move copy during an AI awaiting-choice turn with moves', () => {
		const { getAllByText } = render(
			<AeroplaneStatus
				state={fixtureState({
					currentPlayer: 'yellow',
					phase: 'awaiting-choice',
					pendingRoll: 3,
				})}
				legalMoves={[move()]}
				isHumanTurn={false}
			/>
		);
		expect(getAllByText(/yellow is choosing a move/i).length).toBeGreaterThan(
			0
		);
	});

	test('shows AI rolling copy during an AI awaiting-roll turn', () => {
		const { getAllByText } = render(
			<AeroplaneStatus
				state={fixtureState({
					currentPlayer: 'blue',
					phase: 'awaiting-roll',
					pendingRoll: null,
				})}
				legalMoves={[]}
				isHumanTurn={false}
			/>
		);
		expect(getAllByText(/blue is rolling/i).length).toBeGreaterThan(0);
	});

	test('shows the winner when finished', () => {
		const { getAllByText } = render(
			<AeroplaneStatus
				state={fixtureState({ phase: 'finished', winner: 'red' })}
				legalMoves={[]}
				isHumanTurn
			/>
		);
		expect(getAllByText(/red wins the match/i).length).toBeGreaterThan(0);
	});
});
