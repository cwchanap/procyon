import { describe, expect, test } from 'bun:test';
import { act, render } from '@testing-library/react';
import { setupReactDom } from '../../test/reactSetup';
import { installFrameClock } from '../../test/frameClock';
import { CLASSIC_CONFIG } from '../../lib/aeroplane/game';
import type { AeroplaneRollPresentation } from '../../hooks/useAeroplaneMatch';
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

function rollPresentation(
	patch: Partial<AeroplaneRollPresentation>
): AeroplaneRollPresentation {
	return { id: 1, face: 5, color: 'red', animate: true, ...patch };
}

describe('Aeroplane status die', () => {
	test('shows the rollPresentation face and roller colour after player advancement', () => {
		// After a no-move roll the turn already advanced to yellow; the die
		// must still show red's face labelled as red's roll.
		const { getByTestId } = render(
			<AeroplaneStatus
				state={fixtureState({ currentPlayer: 'yellow', pendingRoll: null })}
				rollPresentation={rollPresentation({ face: 5, color: 'red' })}
			/>
		);
		expect(getByTestId('aeroplane-die-face').textContent).toBe('5');
		expect(getByTestId('aeroplane-die-roller').textContent).toContain('Red');
	});

	test('falls back to pendingRoll and the current player without a roll signal', () => {
		const { getByTestId } = render(
			<AeroplaneStatus
				state={fixtureState({ currentPlayer: 'blue', pendingRoll: 2 })}
			/>
		);
		expect(getByTestId('aeroplane-die-face').textContent).toBe('2');
		expect(getByTestId('aeroplane-die-roller').textContent).toContain('Blue');
	});

	test('decorative tumble frames never change the settled face or ARIA text', () => {
		const clock = installFrameClock();
		try {
			const { getByTestId, queryByTestId } = render(
				<AeroplaneStatus
					state={fixtureState({ currentPlayer: 'yellow', pendingRoll: null })}
					rollPresentation={rollPresentation({ id: 7, face: 5 })}
				/>
			);
			act(() => clock.advance(1));
			const tumble = getByTestId('aeroplane-die-tumble');
			expect(tumble.getAttribute('aria-hidden')).toBe('true');
			// The authoritative face stays in the live region (sr-only) and the
			// decorative frame never replaces it.
			expect(getByTestId('aeroplane-die-face').textContent).toBe('5');
			act(() => clock.advance(599));
			expect(getByTestId('aeroplane-die-face').textContent).toBe('5');
			act(() => clock.advance(1));
			// Bounded tumble settles back onto the visible authoritative face.
			expect(queryByTestId('aeroplane-die-tumble')).toBeNull();
			expect(getByTestId('aeroplane-die-face').textContent).toBe('5');
		} finally {
			clock.uninstall();
		}
	});

	test('consecutive equal-face rolls with distinct ids restart the tumble', () => {
		const clock = installFrameClock();
		try {
			const { rerender, queryByTestId } = render(
				<AeroplaneStatus
					state={fixtureState({ pendingRoll: null })}
					rollPresentation={rollPresentation({ id: 1, face: 3 })}
				/>
			);
			act(() => clock.advance(1));
			expect(queryByTestId('aeroplane-die-tumble')).not.toBeNull();
			act(() => clock.advance(700)); // first tumble settles
			expect(queryByTestId('aeroplane-die-tumble')).toBeNull();
			rerender(
				<AeroplaneStatus
					state={fixtureState({ pendingRoll: null })}
					rollPresentation={rollPresentation({ id: 2, face: 3 })}
				/>
			);
			act(() => clock.advance(1));
			expect(queryByTestId('aeroplane-die-tumble')).not.toBeNull();
		} finally {
			clock.uninstall();
		}
	});

	test('skip (animate=false) stops the tumble and preserves the face', () => {
		const clock = installFrameClock();
		try {
			const { rerender, getByTestId, queryByTestId } = render(
				<AeroplaneStatus
					state={fixtureState({ pendingRoll: null })}
					rollPresentation={rollPresentation({ id: 3, face: 3 })}
				/>
			);
			act(() => clock.advance(10));
			expect(queryByTestId('aeroplane-die-tumble')).not.toBeNull();
			rerender(
				<AeroplaneStatus
					state={fixtureState({ pendingRoll: null })}
					rollPresentation={rollPresentation({
						id: 3,
						face: 3,
						animate: false,
					})}
				/>
			);
			expect(queryByTestId('aeroplane-die-tumble')).toBeNull();
			expect(getByTestId('aeroplane-die-face').textContent).toBe('3');
			act(() => clock.advance(500)); // no late frames
			expect(queryByTestId('aeroplane-die-tumble')).toBeNull();
		} finally {
			clock.uninstall();
		}
	});

	test('reduced motion or missing rAF settles the die immediately without an exception', () => {
		const reduced = render(
			<AeroplaneStatus
				state={fixtureState({ pendingRoll: null })}
				rollPresentation={rollPresentation({ face: 4 })}
				reducedMotion={true}
			/>
		);
		expect(reduced.queryByTestId('aeroplane-die-tumble')).toBeNull();
		expect(reduced.getByTestId('aeroplane-die-face').textContent).toBe('4');
		reduced.unmount();

		// This environment has no global rAF: animate=true must also settle.
		expect(globalThis.requestAnimationFrame).toBeUndefined();
		const noRaf = render(
			<AeroplaneStatus
				state={fixtureState({ pendingRoll: null })}
				rollPresentation={rollPresentation({ id: 9, face: 6 })}
			/>
		);
		expect(noRaf.queryByTestId('aeroplane-die-tumble')).toBeNull();
		expect(noRaf.getByTestId('aeroplane-die-face').textContent).toBe('6');
	});
});
