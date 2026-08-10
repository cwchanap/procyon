import { describe, expect, test, mock } from 'bun:test';
import { fireEvent, render } from '@testing-library/react';
import { setupReactDom } from '../../test/reactSetup';
import { CLASSIC_CONFIG, QUICK_CONFIG } from '../../lib/aeroplane/game';
import type {
	AeroplaneEvent,
	AeroplaneState,
	ResolvedMove,
} from '../../lib/aeroplane/types';
import {
	FLIGHT_GUIDES,
	HANGAR_SLOTS,
	HOME_PATHS,
	LAUNCH_PADS,
	STACK_OFFSETS,
	TRACK_ANCHORS,
} from '../../lib/aeroplane/layout';
import AeroplaneBoard from './AeroplaneBoard';
import AeroplaneEventFeed from './AeroplaneEventFeed';
import AeroplaneSetup from './AeroplaneSetup';

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

describe('Aeroplane render anchors', () => {
	test('exposes the complete board anchor set', () => {
		expect(TRACK_ANCHORS).toHaveLength(52);
		expect(Object.keys(LAUNCH_PADS)).toHaveLength(4);
		expect(Object.values(HANGAR_SLOTS).flat()).toHaveLength(16);
		expect(Object.values(HOME_PATHS).every(path => path.length === 6)).toBe(
			true
		);
		expect(FLIGHT_GUIDES.length).toBeGreaterThan(0);
		expect(STACK_OFFSETS).toHaveLength(4);
	});

	test('rotates each colour anchor by one quarter turn', () => {
		const anchor = LAUNCH_PADS.red;
		const quarter = LAUNCH_PADS.yellow;
		expect(quarter.x).toBeCloseTo(100 - anchor.y, 4);
		expect(quarter.y).toBeCloseTo(anchor.x, 4);
	});
});

describe('Aeroplane setup interactions', () => {
	test('shows Classic as the default configuration', () => {
		const onChange = mock(() => {});
		const { getByRole } = render(
			<AeroplaneSetup
				setup={CLASSIC_CONFIG}
				onChange={onChange}
				onStart={mock(() => {})}
			/>
		);
		expect(
			getByRole('button', { name: 'Classic' }).getAttribute('aria-pressed')
		).toBe('true');
	});

	test('selects the exact Quick & Chill preset', () => {
		const changes: Partial<typeof QUICK_CONFIG>[] = [];
		const { getByRole } = render(
			<AeroplaneSetup
				setup={CLASSIC_CONFIG}
				onChange={patch => changes.push(patch)}
				onStart={mock(() => {})}
			/>
		);
		fireEvent.click(getByRole('button', { name: /quick & chill/i }));
		expect(changes.at(-1)).toEqual({ rulePreset: 'quick-chill' });
	});

	test('enabling blockades also enables stacking', () => {
		const changes: Partial<typeof CLASSIC_CONFIG>[] = [];
		const { getByRole } = render(
			<AeroplaneSetup
				setup={CLASSIC_CONFIG}
				onChange={patch => changes.push(patch)}
				onStart={mock(() => {})}
			/>
		);
		fireEvent.click(getByRole('checkbox', { name: /blockades/i }));
		expect(changes.at(-1)).toEqual({
			blockades: true,
			stacking: true,
			rulePreset: 'custom',
		});
	});

	test('turning stacking off also turns blockades off', () => {
		const config = { ...CLASSIC_CONFIG, stacking: true, blockades: true };
		const changes: Partial<typeof CLASSIC_CONFIG>[] = [];
		const { getByRole } = render(
			<AeroplaneSetup
				setup={config}
				onChange={patch => changes.push(patch)}
				onStart={mock(() => {})}
			/>
		);
		fireEvent.click(getByRole('checkbox', { name: /stacking/i }));
		expect(changes.at(-1)).toEqual({
			stacking: false,
			blockades: false,
			rulePreset: 'custom',
		});
	});

	test('manual edits are marked Custom', () => {
		const changes: Partial<typeof CLASSIC_CONFIG>[] = [];
		const { getByRole } = render(
			<AeroplaneSetup
				setup={CLASSIC_CONFIG}
				onChange={patch => changes.push(patch)}
				onStart={mock(() => {})}
			/>
		);
		fireEvent.change(getByRole('combobox', { name: /victory target/i }), {
			target: { value: '2' },
		});
		expect(changes.at(-1)).toEqual({
			rulePreset: 'custom',
			victoryTarget: 2,
		});
	});
});

describe('Aeroplane board interactions', () => {
	test('renders a clear zero-move state', () => {
		const { getByRole } = render(
			<AeroplaneBoard
				state={fixtureState({ phase: 'awaiting-roll', pendingRoll: null })}
				legalMoves={[]}
				onRoll={mock(() => {})}
				onSelectMove={mock(() => {})}
			/>
		);
		expect(getByRole('button', { name: /roll die/i })).toBeTruthy();
	});

	test('activates one legal move with Enter and Space', () => {
		const onSelectMove = mock(() => {});
		const legalMove = move();
		const { getByRole } = render(
			<AeroplaneBoard
				state={fixtureState()}
				legalMoves={[legalMove]}
				onRoll={mock(() => {})}
				onSelectMove={onSelectMove}
			/>
		);
		const plane = getByRole('button', { name: /Red plane 1/i });
		fireEvent.keyDown(plane, { key: 'Enter' });
		fireEvent.keyDown(plane, { key: ' ' });
		expect(onSelectMove).toHaveBeenCalledTimes(2);
	});

	test('previews before applying on coarse pointer activation', () => {
		const onSelectMove = mock(() => {});
		const legalMove = move('red-0', 30, [
			{
				type: 'jump',
				planeId: 'red-0',
				from: { kind: 'track', color: 'red', progress: 18, globalIndex: 17 },
				to: { kind: 'track', color: 'red', progress: 22, globalIndex: 21 },
			},
		]);
		const { getByRole, getByTestId } = render(
			<AeroplaneBoard
				state={fixtureState()}
				legalMoves={[legalMove]}
				onRoll={mock(() => {})}
				onSelectMove={onSelectMove}
			/>
		);
		const plane = getByRole('button', { name: /Red plane 1/i });
		fireEvent.pointerUp(plane, { pointerType: 'touch' });
		expect(onSelectMove).not.toHaveBeenCalled();
		expect(getByTestId('aeroplane-route-preview')).toBeTruthy();
		fireEvent.pointerUp(plane, { pointerType: 'touch' });
		expect(onSelectMove).toHaveBeenCalledTimes(1);
	});

	test('routes each legal plane to its own control without disabled overlays intercepting', () => {
		const onSelectMove = mock((_selected: ResolvedMove) => {});
		const first = move('red-0', 20);
		const second = move('red-1', 30);
		const { getByRole, getByTestId } = render(
			<AeroplaneBoard
				state={fixtureState()}
				legalMoves={[first, second]}
				onRoll={mock(() => {})}
				onSelectMove={onSelectMove}
			/>
		);

		fireEvent.click(getByRole('button', { name: /Red plane 1/i }));
		fireEvent.click(getByRole('button', { name: /Red plane 2/i }));
		expect(
			onSelectMove.mock.calls.map(([selected]) => selected.planeId)
		).toEqual(['red-0', 'red-1']);
		expect(
			getByTestId('aeroplane-plane-control-yellow-0').getAttribute(
				'pointer-events'
			)
		).toBe('none');
	});

	test('exposes a labelled region with nested native plane controls', () => {
		const { getByRole } = render(
			<AeroplaneBoard
				state={fixtureState()}
				legalMoves={[move()]}
				onRoll={mock(() => {})}
				onSelectMove={mock(() => {})}
			/>
		);
		expect(
			getByRole('region', { name: /aeroplane chess board/i })
		).toBeTruthy();
		expect(getByRole('button', { name: /Red plane 1/i })).toBeTruthy();
	});

	test('keeps all sixteen hangar slots visible after planes launch', () => {
		const launched = fixtureState({
			planes: fixtureState().planes.map(plane =>
				plane.id === 'red-0' ? { ...plane, progress: 4 } : plane
			),
		});
		const { getAllByTestId } = render(
			<AeroplaneBoard
				state={launched}
				legalMoves={[]}
				onRoll={mock(() => {})}
			/>
		);
		expect(getAllByTestId('aeroplane-hangar-slot')).toHaveLength(16);
	});
});

describe('Aeroplane event feed', () => {
	test('starts compact and expands on narrow-screen toggle', () => {
		const previousMatchMedia = window.matchMedia;
		window.matchMedia = (() => ({
			matches: false,
			media: '(min-width: 640px)',
			onchange: null,
			addEventListener: () => {},
			removeEventListener: () => {},
			addListener: () => {},
			removeListener: () => {},
			dispatchEvent: () => false,
		})) as typeof window.matchMedia;
		try {
			const { getByRole, getByText, getByTestId } = render(
				<AeroplaneEventFeed
					events={[
						{
							id: 1,
							move: move(),
							events: [],
							action: {
								kind: 'move',
								actor: 'human',
								color: 'red',
								roll: 3,
								selectedPlaneId: 'red-0',
								events: [],
								checksum: '00000000',
							},
						},
					]}
				/>
			);
			const toggle = getByRole('button', { name: /event feed/i });
			expect(toggle.getAttribute('aria-expanded')).toBe('false');
			expect(
				getByTestId('aeroplane-event-feed-content').getAttribute('aria-hidden')
			).toBe('true');
			fireEvent.click(toggle);
			expect(toggle.getAttribute('aria-expanded')).toBe('true');
			expect(getByText(/red plane 1/i)).toBeTruthy();
		} finally {
			window.matchMedia = previousMatchMedia;
		}
	});

	test('keeps the event feed available to assistive tech on desktop', () => {
		const previousMatchMedia = window.matchMedia;
		window.matchMedia = (() => ({
			matches: true,
			media: '(min-width: 640px)',
			onchange: null,
			addEventListener: () => {},
			removeEventListener: () => {},
			addListener: () => {},
			removeListener: () => {},
			dispatchEvent: () => false,
		})) as typeof window.matchMedia;
		try {
			const { getByTestId, queryByRole } = render(
				<AeroplaneEventFeed events={[]} />
			);
			expect(
				getByTestId('aeroplane-event-feed-content').getAttribute('aria-hidden')
			).toBe('false');
			expect(queryByRole('button', { name: /event feed/i })).toBeNull();
		} finally {
			window.matchMedia = previousMatchMedia;
		}
	});

	test('skip animations can be requested repeatedly without changing feed data', () => {
		const onSkipAnimations = mock(() => {});
		const { getByRole } = render(
			<AeroplaneEventFeed events={[]} onSkipAnimations={onSkipAnimations} />
		);
		const skip = getByRole('button', { name: /skip animations/i });
		fireEvent.click(skip);
		fireEvent.click(skip);
		expect(onSkipAnimations).toHaveBeenCalledTimes(2);
	});
});
