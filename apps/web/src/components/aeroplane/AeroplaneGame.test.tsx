import {
	beforeEach,
	describe,
	expect,
	jest,
	mock,
	afterEach,
	test,
} from 'bun:test';
import { act, fireEvent, render } from '@testing-library/react';
import { renderToStaticMarkup } from 'react-dom/server';
import { setupReactDom } from '../../test/reactSetup';
import { installFrameClock } from '../../test/frameClock';
import {
	CLASSIC_CONFIG,
	QUICK_CONFIG,
	playResolvedMove,
	rollTurn,
} from '../../lib/aeroplane/game';
import { checksumState } from '../../lib/aeroplane/checksum';
import { applyResolvedMove, resolveLegalMove } from '../../lib/aeroplane/rules';
import { toPosition } from '../../lib/aeroplane/topology';
import { positionAnchor } from '../../lib/aeroplane/presentation';
import { rollFair } from '../../lib/aeroplane/dice';
import {
	AEROPLANE_MUTED_STORAGE_KEY,
	resetAeroplaneAudioForTest,
} from '../../lib/aeroplane/sound';
import type { AeroplaneStorage } from '../../lib/aeroplane/persistence';
import type { RngState } from '../../lib/aeroplane/rng';
import type {
	AeroplaneActionActor,
	AeroplaneColor,
	AeroplaneEvent,
	AeroplaneState,
	PlaneState,
	ResolvedMove,
} from '../../lib/aeroplane/types';
import type {
	AeroplaneE2EFixture,
	UseAeroplaneMatchOptions,
} from '../../hooks/useAeroplaneMatch';
import type { AuthUser } from '../../lib/auth-helpers';
import {
	FLIGHT_GUIDES,
	HANGAR_SLOTS,
	HOME_PATHS,
	LAUNCH_PADS,
	STACK_OFFSETS,
	TRACK_ANCHORS,
} from '../../lib/aeroplane/layout';
import AeroplaneGame from '../AeroplaneGame';
import AeroplaneBoard, { type AeroplaneBoardCue } from './AeroplaneBoard';
import AeroplaneEventFeed, {
	type AeroplanePresentationLike,
} from './AeroplaneEventFeed';
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

	test('ignores keyDown for unrelated keys', () => {
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
		fireEvent.keyDown(plane, { key: 'a' });
		fireEvent.keyDown(plane, { key: 'Spacebar' });
		// Only the Spacebar alias should activate; 'a' is ignored.
		expect(onSelectMove).toHaveBeenCalledTimes(1);
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

	test('coarse pointer preview suppresses the subsequent synthetic click', () => {
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
		// A touch pointerUp sets a coarse preview and arms click suppression.
		fireEvent.pointerUp(plane, { pointerType: 'touch' });
		expect(onSelectMove).not.toHaveBeenCalled();
		// The synthetic click that follows should be suppressed.
		fireEvent.click(plane);
		expect(onSelectMove).not.toHaveBeenCalled();
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

	test('renders presentation queue paths alongside the preview', () => {
		const legalMove = move('red-0', 30, [
			{
				type: 'flight',
				planeId: 'red-0',
				from: { kind: 'track', color: 'red', progress: 18, globalIndex: 17 },
				to: { kind: 'track', color: 'red', progress: 30, globalIndex: 29 },
			},
		]);
		const { container } = render(
			<AeroplaneBoard
				state={fixtureState()}
				legalMoves={[legalMove]}
				presentationQueue={[{ id: 1, move: legalMove }]}
				onRoll={mock(() => {})}
				onSelectMove={mock(() => {})}
			/>
		);
		// The presentation path is rendered with its own key (no testid).
		const paths = container.querySelectorAll('svg path[d]');
		expect(paths.length).toBeGreaterThan(0);
	});

	test('falls back to onSelect when onSelectMove is not provided', () => {
		const onSelect = mock((_planeId: string) => {});
		const legalMove = move();
		const { getByRole } = render(
			<AeroplaneBoard
				state={fixtureState()}
				legalMoves={[legalMove]}
				onRoll={mock(() => {})}
				onSelect={onSelect}
			/>
		);
		fireEvent.click(getByRole('button', { name: /Red plane 1/i }));
		expect(onSelect).toHaveBeenCalledTimes(1);
		expect(onSelect.mock.calls[0]![0]).toBe('red-0');
	});

	test('shows the no-legal-moves message when awaiting-choice has no moves', () => {
		const { getByText } = render(
			<AeroplaneBoard
				state={fixtureState({ phase: 'awaiting-choice', pendingRoll: 3 })}
				legalMoves={[]}
				onRoll={mock(() => {})}
				onSelectMove={mock(() => {})}
			/>
		);
		expect(
			getByText(/no legal moves — this turn passes automatically/i)
		).toBeTruthy();
	});

	test('shows the choose-a-plane message when awaiting-choice has moves', () => {
		const { getByText } = render(
			<AeroplaneBoard
				state={fixtureState({ phase: 'awaiting-choice', pendingRoll: 3 })}
				legalMoves={[move()]}
				onRoll={mock(() => {})}
				onSelectMove={mock(() => {})}
			/>
		);
		expect(
			getByText(/choose a highlighted plane, or use enter \/ space/i)
		).toBeTruthy();
	});

	test('hides legal moves and disables Roll during an AI awaiting-choice turn', () => {
		const onRoll = mock(() => {});
		const onSelectMove = mock(() => {});
		const { getByRole, queryByRole, getByText } = render(
			<AeroplaneBoard
				state={fixtureState({
					currentPlayer: 'yellow',
					phase: 'awaiting-choice',
					pendingRoll: 3,
				})}
				legalMoves={[move()]}
				isHumanTurn={false}
				onRoll={onRoll}
				onSelectMove={onSelectMove}
			/>
		);
		expect(getByText(/yellow is choosing a move/i)).toBeTruthy();
		// Legal move buttons must not be rendered for AI turns.
		expect(queryByRole('button', { name: /Red plane 1/i })).toBeNull();
		// Roll button is disabled during AI turns.
		const rollButton = getByRole('button', { name: /roll die/i });
		expect(rollButton.getAttribute('disabled')).not.toBeNull();
	});

	test('shows choosing-a-move copy during an AI awaiting-choice turn even when legalMoves is empty (hook filters to [] for AI turns)', () => {
		const { getByText, queryByText } = render(
			<AeroplaneBoard
				state={fixtureState({
					currentPlayer: 'yellow',
					phase: 'awaiting-choice',
					pendingRoll: 3,
				})}
				legalMoves={[]}
				isHumanTurn={false}
				onRoll={mock(() => {})}
				onSelectMove={mock(() => {})}
			/>
		);
		expect(getByText(/yellow is choosing a move/i)).toBeTruthy();
		expect(
			queryByText(/no legal moves — this turn passes automatically/i)
		).toBeNull();
	});

	test('disables Roll and shows AI rolling copy during an AI awaiting-roll turn', () => {
		const onRoll = mock(() => {});
		const { getByRole, getByText } = render(
			<AeroplaneBoard
				state={fixtureState({
					currentPlayer: 'blue',
					phase: 'awaiting-roll',
					pendingRoll: null,
				})}
				legalMoves={[]}
				isHumanTurn={false}
				onRoll={onRoll}
			/>
		);
		expect(getByText(/blue is rolling/i)).toBeTruthy();
		const rollButton = getByRole('button', { name: /roll die/i });
		expect(rollButton.getAttribute('disabled')).not.toBeNull();
	});

	test('renders planes in home and finished positions', () => {
		const state = fixtureState({
			planes: fixtureState().planes.map(plane => {
				if (plane.id === 'red-0') return { ...plane, progress: 53 };
				if (plane.id === 'red-1') return { ...plane, progress: 56 };
				return plane;
			}),
		});
		const { getByTestId } = render(
			<AeroplaneBoard state={state} legalMoves={[]} onRoll={mock(() => {})} />
		);
		expect(getByTestId('aeroplane-plane-control-red-0')).toBeTruthy();
		expect(getByTestId('aeroplane-plane-control-red-1')).toBeTruthy();
	});

	test('renders a launch-pad plane (progress 0)', () => {
		const state = fixtureState({
			planes: fixtureState().planes.map(plane =>
				plane.id === 'red-0' ? { ...plane, progress: 0 } : plane
			),
		});
		const { getByTestId } = render(
			<AeroplaneBoard state={state} legalMoves={[]} onRoll={mock(() => {})} />
		);
		expect(getByTestId('aeroplane-plane-control-red-0')).toBeTruthy();
	});

	test('move label describes every endpoint kind and position description', () => {
		// Planes in every position state so positionDescription covers all branches.
		const state = fixtureState({
			planes: fixtureState().planes.map(plane => {
				if (plane.id === 'red-0') return { ...plane, progress: null };
				if (plane.id === 'red-1') return { ...plane, progress: 0 };
				if (plane.id === 'red-2') return { ...plane, progress: 25 };
				if (plane.id === 'red-3') return { ...plane, progress: 53 };
				return plane;
			}),
		});
		// Moves whose events and finalEndpoint span four position kinds, so
		// positionAnchor and endpointLabel cover all switch branches.
		const endpoints: AeroplaneEvent['to'][] = [
			{ kind: 'hangar', color: 'red' },
			{ kind: 'launch', color: 'red' },
			{ kind: 'track', color: 'red', progress: 12, globalIndex: 11 },
			{ kind: 'home', color: 'red', progress: 52, homeIndex: 1 },
		];
		const moves = endpoints.map((to, index) => ({
			...move(`red-${index}`, 30, [
				{
					type: 'move',
					planeId: `red-${index}`,
					from: { kind: 'track', color: 'red', progress: 1, globalIndex: 0 },
					to,
				},
			]),
			finalEndpoint: to,
		}));
		const { getByRole, getByTestId } = render(
			<AeroplaneBoard
				state={state}
				legalMoves={moves}
				onRoll={mock(() => {})}
				onSelectMove={mock(() => {})}
			/>
		);
		// Hover over each plane to trigger the preview path (routePath) which
		// calls positionAnchor for every event position kind.
		for (let index = 0; index < endpoints.length; index += 1) {
			const plane = getByRole('button', {
				name: new RegExp(`Red plane ${index + 1}`, 'i'),
			});
			fireEvent.mouseEnter(plane);
			expect(getByTestId('aeroplane-route-preview')).toBeTruthy();
			fireEvent.mouseLeave(plane);
		}
		// The home-position plane (red-3, progress 53) exercises the
		// home-position branch of positionDescription via its aria-label.
		expect(
			getByRole('button', { name: /red plane 4.*home position 3/i })
		).toBeTruthy();
	});

	test('move label describes a finished plane and a hangar plane', () => {
		const state = fixtureState({
			planes: fixtureState().planes.map(plane => {
				if (plane.id === 'red-0') return { ...plane, progress: 56 };
				if (plane.id === 'red-1') return { ...plane, progress: null };
				return plane;
			}),
		});
		const finishedMove: ResolvedMove = {
			...move('red-0', 1, [
				{
					type: 'move',
					planeId: 'red-0',
					from: { kind: 'home', color: 'red', progress: 55, homeIndex: 4 },
					to: { kind: 'finished', color: 'red' },
				},
			]),
			finalEndpoint: { kind: 'finished', color: 'red' },
		};
		const { getByRole, getByTestId } = render(
			<AeroplaneBoard
				state={state}
				legalMoves={[finishedMove]}
				onRoll={mock(() => {})}
				onSelectMove={mock(() => {})}
			/>
		);
		expect(
			getByRole('button', { name: /red plane 1.*finished.*finish/i })
		).toBeTruthy();
		// Hover to trigger routePath which calls positionAnchor for the
		// finished event endpoint.
		fireEvent.mouseEnter(
			getByRole('button', { name: /red plane 1.*finished.*finish/i })
		);
		expect(getByTestId('aeroplane-route-preview')).toBeTruthy();
	});
});

function withDesktopMatchMedia(run: () => void): void {
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
		run();
	} finally {
		window.matchMedia = previousMatchMedia;
	}
}

describe('Aeroplane event feed', () => {
	test('server markup exposes the feed while hydration is pending', () => {
		const markup = renderToStaticMarkup(<AeroplaneEventFeed events={[]} />);
		expect(markup).toContain('data-testid="aeroplane-event-feed-content"');
		expect(markup).toContain('aria-hidden="false"');
		// Validate the hydration contract tokens as standalone whitespace-
		// delimited class tokens so a prefixed or longer class name (e.g.
		// `sm:block` satisfying a bare `block` substring) cannot satisfy the
		// unprefixed token check.
		const feedClassMatch = markup.match(
			/data-testid="aeroplane-event-feed-content"[^>]*\sclass="([^"]*)"/
		);
		const classTokens = feedClassMatch ? feedClassMatch[1]!.split(/\s+/) : [];
		expect(classTokens).toContain('block');
		expect(classTokens).toContain('sm:block');
		expect(classTokens).toContain('divide-y');
		expect(classTokens).toContain('divide-line');
		expect(markup).not.toContain('aria-hidden="true"');
		expect(markup).not.toContain('aria-label="Event feed"');
	});

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
		withDesktopMatchMedia(() => {
			const { getByTestId, queryByRole } = render(
				<AeroplaneEventFeed events={[]} />
			);
			expect(
				getByTestId('aeroplane-event-feed-content').getAttribute('aria-hidden')
			).toBe('false');
			expect(queryByRole('button', { name: /event feed/i })).toBeNull();
		});
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

	test('event copy describes every endpoint kind and route variant', () => {
		withDesktopMatchMedia(() => {
			const endpoints: AeroplaneEvent['to'][] = [
				{ kind: 'hangar', color: 'red' },
				{ kind: 'launch', color: 'red' },
				{ kind: 'track', color: 'red', progress: 12, globalIndex: 11 },
				{ kind: 'home', color: 'red', progress: 52, homeIndex: 1 },
				{ kind: 'finished', color: 'red' },
			];
			const events: AeroplanePresentationLike[] = endpoints.map(
				(to, index) => ({
					id: index,
					move: {
						...move(
							'red-0',
							30,
							index % 2 === 0
								? [
										{
											type: 'jump',
											planeId: 'red-0',
											from: {
												kind: 'track',
												color: 'red',
												progress: 1,
												globalIndex: 0,
											},
											to,
										},
									]
								: [
										{
											type: 'flight',
											planeId: 'red-0',
											from: {
												kind: 'track',
												color: 'red',
												progress: 1,
												globalIndex: 0,
											},
											to,
										},
									]
						),
						finalEndpoint: to,
					},
					events: [],
					action: {
						kind: 'move' as const,
						actor: (index % 2 === 0 ? 'human' : 'ai') as AeroplaneActionActor,
						color: 'red' as const,
						roll: 3,
						selectedPlaneId: 'red-0',
						events: [],
						checksum: '00000000',
					},
				})
			);
			const { getByText } = render(<AeroplaneEventFeed events={events} />);
			expect(getByText(/to hangar/i)).toBeTruthy();
			expect(getByText(/to launch pad/i)).toBeTruthy();
			expect(getByText(/to track 12/i)).toBeTruthy();
			expect(getByText(/to home 2/i)).toBeTruthy();
			expect(getByText(/to finish/i)).toBeTruthy();
		});
	});

	test('event feed prefers eventFeed prop over events prop', () => {
		withDesktopMatchMedia(() => {
			const { getByText, queryByText } = render(
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
					eventFeed={[
						{
							id: 2,
							move: move('red-1', 25),
							events: [],
							chatter: 'chatter line',
							action: {
								kind: 'move',
								actor: 'ai',
								color: 'red',
								roll: 3,
								selectedPlaneId: 'red-1',
								events: [],
								checksum: '00000000',
							},
						},
					]}
				/>
			);
			expect(getByText(/red plane 2/i)).toBeTruthy();
			expect(getByText(/chatter line/i)).toBeTruthy();
			// The events-only entry (red plane 1) should not appear.
			expect(queryByText(/You:.*red plane 1/i)).toBeNull();
		});
	});
});

describe('Aeroplane setup selects', () => {
	test('changing human colour marks the choice Custom', () => {
		const changes: Partial<typeof CLASSIC_CONFIG>[] = [];
		const { getByRole } = render(
			<AeroplaneSetup
				setup={CLASSIC_CONFIG}
				onChange={patch => changes.push(patch)}
				onStart={mock(() => {})}
			/>
		);
		fireEvent.change(getByRole('combobox', { name: /human colour/i }), {
			target: { value: 'blue' },
		});
		expect(changes.at(-1)).toEqual({
			rulePreset: 'custom',
			humanColor: 'blue',
		});
	});

	test('changing dice mode marks the choice Custom', () => {
		const changes: Partial<typeof CLASSIC_CONFIG>[] = [];
		const { getByRole } = render(
			<AeroplaneSetup
				setup={CLASSIC_CONFIG}
				onChange={patch => changes.push(patch)}
				onStart={mock(() => {})}
			/>
		);
		fireEvent.change(getByRole('combobox', { name: /dice mode/i }), {
			target: { value: 'relaxed' },
		});
		expect(changes.at(-1)).toEqual({
			rulePreset: 'custom',
			diceMode: 'relaxed',
		});
	});

	test('changing launch rule marks the choice Custom', () => {
		const changes: Partial<typeof CLASSIC_CONFIG>[] = [];
		const { getByRole } = render(
			<AeroplaneSetup
				setup={CLASSIC_CONFIG}
				onChange={patch => changes.push(patch)}
				onStart={mock(() => {})}
			/>
		);
		fireEvent.change(getByRole('combobox', { name: /launch rule/i }), {
			target: { value: 'five-or-six' },
		});
		expect(changes.at(-1)).toEqual({
			rulePreset: 'custom',
			launchRule: 'five-or-six',
		});
	});

	test('changing finish rule marks the choice Custom', () => {
		const changes: Partial<typeof CLASSIC_CONFIG>[] = [];
		const { getByRole } = render(
			<AeroplaneSetup
				setup={CLASSIC_CONFIG}
				onChange={patch => changes.push(patch)}
				onStart={mock(() => {})}
			/>
		);
		fireEvent.change(getByRole('combobox', { name: /finish rule/i }), {
			target: { value: 'bounce' },
		});
		expect(changes.at(-1)).toEqual({
			rulePreset: 'custom',
			finishRule: 'bounce',
		});
	});

	test('toggling chatter on marks the choice Custom', () => {
		const changes: Partial<typeof CLASSIC_CONFIG>[] = [];
		const { getByRole } = render(
			<AeroplaneSetup
				setup={{ ...CLASSIC_CONFIG, chatter: false }}
				onChange={patch => changes.push(patch)}
				onStart={mock(() => {})}
			/>
		);
		fireEvent.click(getByRole('checkbox', { name: /chatter/i }));
		expect(changes.at(-1)).toEqual({
			rulePreset: 'custom',
			chatter: true,
		});
	});

	test('disabling blockades leaves stacking untouched', () => {
		const config = { ...CLASSIC_CONFIG, stacking: true, blockades: true };
		const changes: Partial<typeof config>[] = [];
		const { getByRole } = render(
			<AeroplaneSetup
				setup={config}
				onChange={patch => changes.push(patch)}
				onStart={mock(() => {})}
			/>
		);
		fireEvent.click(getByRole('checkbox', { name: /blockades/i }));
		expect(changes.at(-1)).toEqual({
			blockades: false,
			rulePreset: 'custom',
		});
	});

	test('uses onNewMatch when onStart is not provided', () => {
		const onNewMatch = mock(() => {});
		const { getByRole } = render(
			<AeroplaneSetup
				setup={CLASSIC_CONFIG}
				onChange={mock(() => {})}
				onNewMatch={onNewMatch}
			/>
		);
		fireEvent.click(getByRole('button', { name: /start match/i }));
		expect(onNewMatch).toHaveBeenCalledTimes(1);
	});

	test('renders the preset summary with a Custom rule label', () => {
		const { getByText } = render(
			<AeroplaneSetup
				setup={{ ...CLASSIC_CONFIG, rulePreset: 'custom' }}
				onChange={mock(() => {})}
				onStart={mock(() => {})}
			/>
		);
		expect(getByText(/custom rules/i)).toBeTruthy();
	});
});

function motionState(
	progressById: Record<string, number>,
	patch: Partial<AeroplaneState> = {}
): AeroplaneState {
	const base = fixtureState();
	return fixtureState({
		...patch,
		planes: base.planes.map(plane =>
			plane.id in progressById
				? { ...plane, progress: progressById[plane.id]! }
				: plane
		),
	});
}

/** Resolve a legal move and the committed post-move state it lands in. */
function committedMove(
	state: AeroplaneState,
	planeId: string,
	roll: number
): { move: ResolvedMove; committed: AeroplaneState } {
	const resolved = resolveLegalMove(state, planeId, roll);
	if (!resolved)
		throw new Error(`expected a legal move for ${planeId} +${roll}`);
	return {
		move: resolved,
		committed: applyResolvedMove(state, resolved).state,
	};
}

function overlayAnchor(
	queryByTestId: (id: string) => Element | null,
	testId = 'aeroplane-motion-overlay'
): { x: number; y: number } | null {
	const circle = queryByTestId(testId)?.querySelector('circle');
	if (!circle) return null;
	return {
		x: Number(circle.getAttribute('cx')),
		y: Number(circle.getAttribute('cy')),
	};
}

function cueNames(onCue: ReturnType<typeof mock>): AeroplaneBoardCue[] {
	return onCue.mock.calls.map(([cue]) => cue);
}

describe('Aeroplane board motion playback', () => {
	test('animates hops in order and emits a cue at each segment boundary', () => {
		const clock = installFrameClock();
		try {
			const { move, committed } = committedMove(
				motionState({ 'red-0': 30 }),
				'red-0',
				3
			);
			const onCue = mock((_cue: AeroplaneBoardCue) => {});
			const { getByTestId, queryByTestId } = render(
				<AeroplaneBoard
					state={committed}
					legalMoves={[]}
					presentationQueue={[{ id: 1, move }]}
					onCue={onCue}
					onRoll={mock(() => {})}
				/>
			);
			// The committed mover glyph is masked while the overlay travels.
			expect(queryByTestId('aeroplane-plane-control-red-0')).toBeNull();
			act(() => clock.advance(1));
			// First frame sits on the move's start anchor (progress 30 → node 29).
			expect(overlayAnchor(queryByTestId)).toEqual({
				x: TRACK_ANCHORS[29]!.x,
				y: TRACK_ANCHORS[29]!.y,
			});
			expect(cueNames(onCue)).toEqual(['hop']);
			act(() => clock.advance(239));
			expect(cueNames(onCue)).toEqual(['hop', 'hop', 'hop']);
			expect(queryByTestId('aeroplane-motion-overlay')).not.toBeNull();
			act(() => clock.advance(1));
			expect(cueNames(onCue)).toEqual(['hop', 'hop', 'hop', 'finish']);
			expect(queryByTestId('aeroplane-motion-overlay')).toBeNull();
			expect(getByTestId('aeroplane-plane-control-red-0')).toBeTruthy();
		} finally {
			clock.uninstall();
		}
	});

	test('interpolates the long flight on its quadratic guide midpoint', () => {
		const clock = installFrameClock();
		try {
			const { move, committed } = committedMove(
				motionState({ 'red-0': 16 }),
				'red-0',
				2
			);
			const onCue = mock((_cue: AeroplaneBoardCue) => {});
			const { queryByTestId } = render(
				<AeroplaneBoard
					state={committed}
					legalMoves={[]}
					presentationQueue={[{ id: 1, move }]}
					onCue={onCue}
					onRoll={mock(() => {})}
				/>
			);
			// Two 80 ms hops then a 240 ms flight; the midpoint lands 280 ms in.
			act(() => clock.advance(1)); // first frame starts the clock at 0
			act(() => clock.advance(280));
			const guide = FLIGHT_GUIDES[0]!;
			const landing = positionAnchor(toPosition('red', 30), 'red-0');
			const midpoint = {
				x: 0.25 * guide.from.x + 0.5 * guide.control.x + 0.25 * landing.x,
				y: 0.25 * guide.from.y + 0.5 * guide.control.y + 0.25 * landing.y,
			};
			const position = overlayAnchor(queryByTestId);
			expect(position).not.toBeNull();
			expect(Math.abs(position!.x - midpoint.x)).toBeLessThan(1e-6);
			expect(Math.abs(position!.y - midpoint.y)).toBeLessThan(1e-6);
			act(() => clock.advance(120));
			expect(cueNames(onCue)).toEqual(['hop', 'hop', 'hop', 'finish']);
		} finally {
			clock.uninstall();
		}
	});

	test('returns a captured plane to its hangar and masks it while airborne', () => {
		const clock = installFrameClock();
		try {
			const { move, committed } = committedMove(
				motionState({ 'red-0': 26, 'yellow-1': 14 }),
				'red-0',
				1
			);
			const onCue = mock((_cue: AeroplaneBoardCue) => {});
			const { getByTestId, queryByTestId } = render(
				<AeroplaneBoard
					state={committed}
					legalMoves={[]}
					presentationQueue={[{ id: 1, move }]}
					onCue={onCue}
					onRoll={mock(() => {})}
				/>
			);
			act(() => clock.advance(1)); // playback starts on the first frame
			act(() => clock.advance(80)); // hop done, capture return begins
			expect(cueNames(onCue)).toEqual(['hop', 'capture']);
			expect(queryByTestId('aeroplane-capture-ghost')).not.toBeNull();
			// The victim's committed hangar glyph is masked by its ghost.
			expect(queryByTestId('aeroplane-plane-control-yellow-1')).toBeNull();
			act(() => clock.advance(159));
			const ghost = overlayAnchor(queryByTestId, 'aeroplane-capture-ghost');
			expect(ghost).not.toBeNull();
			// Capture return is a straight lerp from node 26 to the hangar slot.
			const ghostFrom = TRACK_ANCHORS[26]!;
			const ghostTo = HANGAR_SLOTS.yellow[1]!;
			const ghostProgress = 159 / 160;
			expect(ghost!.x).toBeCloseTo(
				ghostFrom.x + (ghostTo.x - ghostFrom.x) * ghostProgress,
				6
			);
			expect(ghost!.y).toBeCloseTo(
				ghostFrom.y + (ghostTo.y - ghostFrom.y) * ghostProgress,
				6
			);
			act(() => clock.advance(1));
			expect(cueNames(onCue)).toEqual(['hop', 'capture', 'finish']);
			expect(queryByTestId('aeroplane-capture-ghost')).toBeNull();
			expect(getByTestId('aeroplane-plane-control-yellow-1')).toBeTruthy();
		} finally {
			clock.uninstall();
		}
	});

	test('stacked landings resolve to the committed glyph offset without a snap', () => {
		const clock = installFrameClock();
		try {
			const { move, committed } = committedMove(
				motionState(
					{ 'red-0': 11, 'red-1': 9 },
					{ config: { ...CLASSIC_CONFIG, stacking: true } }
				),
				'red-1',
				2
			);
			const { queryByTestId, getByTestId } = render(
				<AeroplaneBoard
					state={committed}
					legalMoves={[]}
					presentationQueue={[{ id: 1, move }]}
					onRoll={mock(() => {})}
				/>
			);
			const base = positionAnchor(toPosition('red', 11), 'red-0');
			const offset = STACK_OFFSETS[1]!;
			act(() => clock.advance(1)); // playback starts on the first frame
			act(() => clock.advance(159)); // last hop nearly finished (160 ms total)
			const position = overlayAnchor(queryByTestId);
			expect(position).not.toBeNull();
			expect(Math.abs(position!.x - (base.x + offset.x))).toBeLessThan(0.15);
			expect(Math.abs(position!.y - (base.y + offset.y))).toBeLessThan(0.15);
			act(() => clock.advance(1));
			expect(queryByTestId('aeroplane-motion-overlay')).toBeNull();
			// The revealed committed glyph sits exactly where the overlay ended.
			const revealed = overlayAnchor(
				testId => getByTestId(testId),
				'aeroplane-plane-control-red-1'
			);
			expect(revealed).toEqual({ x: base.x + offset.x, y: base.y + offset.y });
		} finally {
			clock.uninstall();
		}
	});

	test('keeps move controls live and non-intercepting during playback', () => {
		const clock = installFrameClock();
		try {
			const { move, committed } = committedMove(
				motionState({ 'red-0': 30 }),
				'red-0',
				3
			);
			const onSelectMove = mock((_move: ResolvedMove) => {});
			const { getByRole, getByTestId } = render(
				<AeroplaneBoard
					state={committed}
					legalMoves={[move]}
					presentationQueue={[{ id: 1, move }]}
					onRoll={mock(() => {})}
					onSelectMove={onSelectMove}
				/>
			);
			act(() => clock.advance(40));
			expect(
				getByTestId('aeroplane-motion-layer').getAttribute('pointer-events')
			).toBe('none');
			fireEvent.click(getByRole('button', { name: /Red plane 1/i }));
			expect(onSelectMove).toHaveBeenCalledTimes(1);
		} finally {
			clock.uninstall();
		}
	});

	test('a newer presentation id supersedes the in-flight one', () => {
		const clock = installFrameClock();
		try {
			const pre = motionState({ 'red-0': 30, 'red-1': 38 });
			const first = committedMove(pre, 'red-0', 3);
			const second = committedMove(pre, 'red-1', 2);
			const onCue = mock((_cue: AeroplaneBoardCue) => {});
			const { rerender, queryByTestId } = render(
				<AeroplaneBoard
					state={first.committed}
					legalMoves={[]}
					presentationQueue={[{ id: 1, move: first.move }]}
					onCue={onCue}
					onRoll={mock(() => {})}
				/>
			);
			act(() => clock.advance(40));
			expect(cueNames(onCue)).toEqual(['hop']);
			rerender(
				<AeroplaneBoard
					state={second.committed}
					legalMoves={[]}
					presentationQueue={[
						{ id: 1, move: first.move },
						{ id: 2, move: second.move },
					]}
					onCue={onCue}
					onRoll={mock(() => {})}
				/>
			);
			act(() => clock.advance(1));
			// Playback restarts on the newest move's first segment (red-1 at 38).
			const position = overlayAnchor(queryByTestId);
			expect(Math.abs(position!.x - TRACK_ANCHORS[37]!.x)).toBeLessThan(0.1);
			expect(Math.abs(position!.y - TRACK_ANCHORS[37]!.y)).toBeLessThan(0.1);
			act(() => clock.advance(160));
			// The superseded move never emits further cues; the completion frame
			// crosses the newest move's final hop boundary before finishing.
			expect(cueNames(onCue)).toEqual(['hop', 'hop', 'hop', 'finish']);
		} finally {
			clock.uninstall();
		}
	});

	test('removing the active id from the queue cancels playback without late cues', () => {
		const clock = installFrameClock();
		try {
			const { move, committed } = committedMove(
				motionState({ 'red-0': 30 }),
				'red-0',
				3
			);
			const onCue = mock((_cue: AeroplaneBoardCue) => {});
			const { rerender, getByTestId, queryByTestId } = render(
				<AeroplaneBoard
					state={committed}
					legalMoves={[]}
					presentationQueue={[{ id: 1, move }]}
					onCue={onCue}
					onRoll={mock(() => {})}
				/>
			);
			act(() => clock.advance(40));
			expect(cueNames(onCue)).toEqual(['hop']);
			rerender(
				<AeroplaneBoard
					state={committed}
					legalMoves={[]}
					presentationQueue={[]}
					onCue={onCue}
					onRoll={mock(() => {})}
				/>
			);
			expect(queryByTestId('aeroplane-motion-overlay')).toBeNull();
			expect(getByTestId('aeroplane-plane-control-red-0')).toBeTruthy();
			act(() => clock.advance(500));
			expect(cueNames(onCue)).toEqual(['hop']);
		} finally {
			clock.uninstall();
		}
	});

	test('unmount cancels playback and emits no late cues', () => {
		const clock = installFrameClock();
		try {
			const { move, committed } = committedMove(
				motionState({ 'red-0': 30 }),
				'red-0',
				3
			);
			const onCue = mock((_cue: AeroplaneBoardCue) => {});
			const { unmount } = render(
				<AeroplaneBoard
					state={committed}
					legalMoves={[]}
					presentationQueue={[{ id: 1, move }]}
					onCue={onCue}
					onRoll={mock(() => {})}
				/>
			);
			act(() => clock.advance(40));
			unmount();
			act(() => clock.advance(500));
			expect(cueNames(onCue)).toEqual(['hop']);
		} finally {
			clock.uninstall();
		}
	});

	test('reduced motion cancels playback and emits one terminal cue per move', () => {
		const clock = installFrameClock();
		try {
			const pre = motionState({ 'red-0': 30, 'red-1': 38 });
			const first = committedMove(pre, 'red-0', 3);
			const second = committedMove(pre, 'red-1', 2);
			const onCue = mock((_cue: AeroplaneBoardCue) => {});
			const { rerender, queryByTestId } = render(
				<AeroplaneBoard
					state={first.committed}
					legalMoves={[]}
					presentationQueue={[{ id: 1, move: first.move }]}
					reducedMotion={false}
					onCue={onCue}
					onRoll={mock(() => {})}
				/>
			);
			act(() => clock.advance(40));
			rerender(
				<AeroplaneBoard
					state={first.committed}
					legalMoves={[]}
					presentationQueue={[{ id: 1, move: first.move }]}
					reducedMotion={true}
					onCue={onCue}
					onRoll={mock(() => {})}
				/>
			);
			expect(queryByTestId('aeroplane-motion-overlay')).toBeNull();
			act(() => clock.advance(500));
			expect(cueNames(onCue)).toEqual(['hop']);
			// A fresh presentation under reduced motion never tweens: one cue.
			rerender(
				<AeroplaneBoard
					state={second.committed}
					legalMoves={[]}
					presentationQueue={[{ id: 2, move: second.move }]}
					reducedMotion={true}
					onCue={onCue}
					onRoll={mock(() => {})}
				/>
			);
			expect(queryByTestId('aeroplane-motion-overlay')).toBeNull();
			act(() => clock.advance(500));
			expect(cueNames(onCue)).toEqual(['hop', 'finish']);
		} finally {
			clock.uninstall();
		}
	});

	test('emits exactly one terminal cue without any global rAF', () => {
		expect(globalThis.requestAnimationFrame).toBeUndefined();
		const { move, committed } = committedMove(
			motionState({ 'red-0': 30 }),
			'red-0',
			3
		);
		const onCue = mock((_cue: AeroplaneBoardCue) => {});
		const { queryByTestId, getByTestId } = render(
			<AeroplaneBoard
				state={committed}
				legalMoves={[]}
				presentationQueue={[{ id: 1, move }]}
				onCue={onCue}
				onRoll={mock(() => {})}
			/>
		);
		expect(cueNames(onCue)).toEqual(['finish']);
		expect(queryByTestId('aeroplane-motion-overlay')).toBeNull();
		expect(getByTestId('aeroplane-plane-control-red-0')).toBeTruthy();
	});

	test('a winning move emits win as the terminal cue, once per playback', () => {
		const finishedState = fixtureState({
			phase: 'finished',
			winner: 'red',
		});
		const presentationMove = move('red-0', 30);
		const onCue = mock((_cue: AeroplaneBoardCue) => {});
		const { queryByTestId } = render(
			<AeroplaneBoard
				state={finishedState}
				legalMoves={[]}
				presentationQueue={[{ id: 1, move: presentationMove }]}
				onCue={onCue}
				onRoll={mock(() => {})}
			/>
		);
		expect(cueNames(onCue)).toEqual(['win']);
		expect(queryByTestId('aeroplane-motion-overlay')).toBeNull();

		// Animated playback also ends on a single win cue.
		const clock = installFrameClock();
		try {
			const animated = mock((_cue: AeroplaneBoardCue) => {});
			const { rerender } = render(
				<AeroplaneBoard
					state={finishedState}
					legalMoves={[]}
					presentationQueue={[]}
					onCue={animated}
					onRoll={mock(() => {})}
				/>
			);
			rerender(
				<AeroplaneBoard
					state={finishedState}
					legalMoves={[]}
					presentationQueue={[{ id: 7, move: presentationMove }]}
					onCue={animated}
					onRoll={mock(() => {})}
				/>
			);
			act(() => clock.advance(1000)); // first frame starts the clock
			act(() => clock.advance(200)); // crosses the single hop, then wins
			expect(cueNames(animated)).toEqual(['hop', 'win']);
		} finally {
			clock.uninstall();
		}
	});
});

function diceStateForRoll(roll: number): RngState {
	for (let value = 1; value <= 100_000; value += 1) {
		const result = rollFair({ value });
		if (result.roll === roll) return { value };
	}
	throw new Error(`no deterministic seed for roll ${roll}`);
}

function hangarPlanes(): PlaneState[] {
	return COLORS.flatMap(color =>
		Array.from({ length: 4 }, (_, index) => ({
			id: `${color}-${index}`,
			color,
			progress: null as number | null,
		}))
	);
}

function gameFixture(
	diceRoll: number,
	planes?: PlaneState[]
): AeroplaneE2EFixture {
	return {
		seed: 4242,
		state: fixtureState({
			phase: 'awaiting-roll',
			pendingRoll: null,
			planes: planes ?? hangarPlanes(),
		}),
		diceRng: diceStateForRoll(diceRoll),
		aiRng: { value: 33 },
		skipAnimations: false,
	};
}

function launchReadyPlanes(): PlaneState[] {
	return hangarPlanes().map(plane =>
		plane.id === 'red-0' ? { ...plane, progress: 1 } : plane
	);
}

function gameOptions(
	fixture: AeroplaneE2EFixture,
	extra: Partial<
		Pick<UseAeroplaneMatchOptions, 'aiDelayMs' | 'presentationMs'>
	> = {}
): UseAeroplaneMatchOptions {
	const storage: AeroplaneStorage = {
		getItem: () => null,
		setItem: () => undefined,
		removeItem: () => undefined,
	};
	return { fixture, dev: true, storage, ...extra };
}

function renderGame(
	fixture: AeroplaneE2EFixture,
	extra?: Parameters<typeof gameOptions>[1]
) {
	return render(
		<AeroplaneGame controllerOptions={gameOptions(fixture, extra)} />
	);
}

/** Deterministic dice seed whose next rolls are exactly `rolls`. */
// Memoized per rolls-key: the brute-force search is expensive and the same
// roll sequences recur across tests in this file.
const rollsSeedCache = new Map<string, RngState>();
function rngForRolls(rolls: readonly number[]): RngState {
	const key = rolls.join(',');
	const cached = rollsSeedCache.get(key);
	if (cached) return cached;
	for (let value = 1; value <= 1_000_000; value += 1) {
		let rng: RngState = { value };
		let matches = true;
		for (const expected of rolls) {
			const result = rollFair(rng);
			if (result.roll !== expected) {
				matches = false;
				break;
			}
			rng = result.rng;
		}
		if (matches) {
			const seed = { value };
			rollsSeedCache.set(key, seed);
			return seed;
		}
	}
	throw new Error(`no deterministic dice sequence: ${rolls}`);
}

function gameFixtureForRolls(
	rolls: readonly number[],
	planes?: PlaneState[],
	currentPlayer: AeroplaneColor = 'red'
): AeroplaneE2EFixture {
	return {
		seed: 4242,
		state: fixtureState({
			currentPlayer,
			phase: 'awaiting-roll',
			pendingRoll: null,
			planes: planes ?? hangarPlanes(),
		}),
		diceRng: rngForRolls(rolls),
		aiRng: { value: 33 },
		skipAnimations: false,
	};
}

function finishedFixture(): AeroplaneE2EFixture {
	const config = { ...CLASSIC_CONFIG, victoryTarget: 2 as const };
	return {
		seed: 4242,
		state: fixtureState({
			config,
			phase: 'finished',
			pendingRoll: null,
			winner: 'red',
			planes: hangarPlanes().map(plane =>
				plane.id === 'red-0' || plane.id === 'red-1'
					? { ...plane, progress: 56 }
					: plane
			),
			stats: {
				capturesMade: { red: 0, yellow: 0, blue: 0, green: 0 },
				capturesSuffered: { red: 0, yellow: 0, blue: 0, green: 0 },
				finished: { red: 2, yellow: 0, blue: 0, green: 0 },
			},
		}),
		diceRng: { value: 4242 },
		aiRng: { value: 33 },
		skipAnimations: false,
	};
}

/** Advance the hook's paced timers (fake timers) inside act. */
function advanceTimers(ms: number): void {
	act(() => {
		// Bun's `jest` exposes no typed advanceTimersByTime (ChessGame pattern).
		(
			jest as unknown as { advanceTimersByTime(ms: number): void }
		).advanceTimersByTime(ms);
	});
}

/** Recording AudioContext stub; frequencies double as cue names. */
function installCueAudioStub(): number[] {
	const frequencies: number[] = [];
	class StubOscillator {
		type = '';
		frequency = { value: 0 };
		onended: (() => void) | null = null;
		connect() {
			return this;
		}
		start() {
			frequencies.push(this.frequency.value);
		}
		stop() {}
		disconnect() {}
	}
	class StubAudioContext {
		destination = {};
		currentTime = 0;
		state = 'running';
		resume() {
			return Promise.resolve();
		}
		createGain() {
			return {
				gain: {
					setValueAtTime() {},
					exponentialRampToValueAtTime() {},
				},
				connect() {},
				disconnect() {},
			};
		}
		createOscillator() {
			return new StubOscillator();
		}
	}
	(globalThis as Record<string, unknown>).AudioContext = StubAudioContext;
	return frequencies;
}

function uninstallCueAudioStub() {
	delete (globalThis as Record<string, unknown>).AudioContext;
	resetAeroplaneAudioForTest();
}

describe('Aeroplane game composition', () => {
	// Composed mounts run the real `useAuth`. Seeding the SSR initial-user
	// hook (the ChessGame.test.tsx convention) resolves auth synchronously
	// inside render's act() instead of via an async `fetchSession()` whose
	// setState lands outside act after the synchronous test body.
	const TEST_AUTH_USER: AuthUser = {
		id: 'user-a',
		email: 'a@test.com',
		username: 'userA',
	};
	let hadInitialAuthUser = false;
	let originalInitialAuthUser: AuthUser | null | undefined;

	beforeEach(() => {
		hadInitialAuthUser = '__PROCYON_INITIAL_AUTH_USER__' in window;
		originalInitialAuthUser = window.__PROCYON_INITIAL_AUTH_USER__;
		window.__PROCYON_INITIAL_AUTH_USER__ = TEST_AUTH_USER;
	});

	afterEach(() => {
		// bun:test fake timers leak across tests in a file; restore real ones so
		// timer-free tests below stay timer-free regardless of order.
		jest.useRealTimers();
		if (hadInitialAuthUser && originalInitialAuthUser !== undefined) {
			window.__PROCYON_INITIAL_AUTH_USER__ = originalInitialAuthUser;
		} else {
			delete window.__PROCYON_INITIAL_AUTH_USER__;
		}
	});

	test('renders exactly one status die readout', () => {
		const { getAllByTestId } = renderGame(gameFixture(3));
		expect(getAllByTestId('aeroplane-status-die')).toHaveLength(1);
	});

	test('plays one roll cue per roll id plus board cues, never duplicated on rerender', () => {
		const clock = installFrameClock();
		const frequencies = installCueAudioStub();
		try {
			const fixture = gameFixture(1, launchReadyPlanes());
			const { rerender, getByRole } = renderGame(fixture);
			fireEvent.click(getByRole('button', { name: /roll die/i }));
			// The roll cue fires once for the roll id, before any board frame.
			expect(frequencies).toEqual([340]);
			act(() => clock.advance(1)); // first frame crosses the initial hop
			expect(frequencies).toEqual([340, 500]);
			act(() => clock.advance(600)); // playback completes (hop + jump + finish)
			// Both motion segments cue 'hop'; the move ends on finish.
			expect(frequencies).toEqual([340, 500, 500, 640]);
			rerender(<AeroplaneGame controllerOptions={gameOptions(fixture)} />);
			act(() => clock.advance(600));
			expect(frequencies).toEqual([340, 500, 500, 640]);
		} finally {
			clock.uninstall();
			uninstallCueAudioStub();
		}
	});

	test('the mute toggle round-trips through localStorage and silences cues immediately', () => {
		const frequencies = installCueAudioStub();
		window.localStorage.removeItem(AEROPLANE_MUTED_STORAGE_KEY);
		try {
			const fixture = gameFixture(3);
			const first = renderGame(fixture);
			const toggle = first.getByTestId('aeroplane-mute-toggle');
			expect(toggle.getAttribute('aria-pressed')).toBe('false');
			fireEvent.click(first.getByRole('button', { name: /roll die/i }));
			expect(frequencies).toEqual([340]);
			fireEvent.click(toggle);
			expect(toggle.getAttribute('aria-pressed')).toBe('true');
			expect(window.localStorage.getItem(AEROPLANE_MUTED_STORAGE_KEY)).toBe(
				'1'
			);
			first.unmount();

			// The preference survives remount and suppresses the next roll cue.
			const second = renderGame(fixture);
			expect(
				second.getByTestId('aeroplane-mute-toggle').getAttribute('aria-pressed')
			).toBe('true');
			fireEvent.click(second.getByRole('button', { name: /roll die/i }));
			expect(frequencies).toEqual([340]);
			// Muting never affects the authoritative action.
			expect(second.getByTestId('aeroplane-die-face').textContent).toBe('3');
			fireEvent.click(second.getByTestId('aeroplane-mute-toggle'));
			expect(window.localStorage.getItem(AEROPLANE_MUTED_STORAGE_KEY)).toBe(
				'0'
			);
		} finally {
			window.localStorage.removeItem(AEROPLANE_MUTED_STORAGE_KEY);
			uninstallCueAudioStub();
		}
	});

	test('the die keeps the roller colour after the turn advances', () => {
		const { getByRole, getByTestId, getAllByText } = renderGame(gameFixture(3));
		fireEvent.click(getByRole('button', { name: /roll die/i }));
		expect(getByTestId('aeroplane-die-face').textContent).toBe('3');
		expect(getByTestId('aeroplane-die-roller').textContent).toContain('Red');
		// The no-move roll already passed the turn to yellow.
		expect(getAllByText('Yellow').length).toBeGreaterThan(0);
	});

	test('skip during a no-route roll stops the tumble and preserves the face', () => {
		const clock = installFrameClock();
		try {
			const view = renderGame(gameFixture(3));
			fireEvent.click(view.getByRole('button', { name: /roll die/i }));
			act(() => clock.advance(10));
			expect(view.queryByTestId('aeroplane-die-tumble')).not.toBeNull();
			fireEvent.click(view.getByRole('button', { name: /skip animations/i }));
			expect(view.queryByTestId('aeroplane-die-tumble')).toBeNull();
			expect(view.getByTestId('aeroplane-die-face').textContent).toBe('3');
			act(() => clock.advance(700)); // no late tumble frames
			expect(view.queryByTestId('aeroplane-die-tumble')).toBeNull();
		} finally {
			clock.uninstall();
		}
	});

	test('blocked Web Audio and storage errors never interrupt play', () => {
		class BlockedAudioContext {
			constructor() {
				throw new Error('autoplay blocked');
			}
		}
		(globalThis as Record<string, unknown>).AudioContext = BlockedAudioContext;
		const originalDescriptor = Object.getOwnPropertyDescriptor(
			window,
			'localStorage'
		);
		Object.defineProperty(window, 'localStorage', {
			configurable: true,
			get() {
				throw new Error('storage blocked');
			},
		});
		try {
			const view = renderGame(gameFixture(3));
			fireEvent.click(view.getByRole('button', { name: /roll die/i }));
			expect(view.getByTestId('aeroplane-die-face').textContent).toBe('3');
			expect(view.getByTestId('aeroplane-die-roller').textContent).toContain(
				'Red'
			);
			fireEvent.click(view.getByTestId('aeroplane-mute-toggle'));
			expect(
				view.getByTestId('aeroplane-mute-toggle').getAttribute('aria-pressed')
			).toBe('true');
		} finally {
			if (originalDescriptor) {
				Object.defineProperty(window, 'localStorage', originalDescriptor);
			}
			uninstallCueAudioStub();
		}
	});

	test('missing rAF or reduced motion settles the move and die without an exception', () => {
		// Baseline environment has no global rAF.
		expect(globalThis.requestAnimationFrame).toBeUndefined();
		const view = renderGame(gameFixture(1, launchReadyPlanes()));
		fireEvent.click(view.getByRole('button', { name: /roll die/i }));
		expect(view.getByTestId('aeroplane-die-face').textContent).toBe('1');
		expect(view.queryByTestId('aeroplane-die-tumble')).toBeNull();
		expect(view.queryByTestId('aeroplane-motion-overlay')).toBeNull();
		expect(view.getByTestId('aeroplane-plane-control-red-0')).toBeTruthy();
		view.unmount();

		// Reduced motion with rAF available settles the same way.
		const clock = installFrameClock();
		const windowWithMedia = window as unknown as {
			matchMedia: unknown;
		};
		const originalMatchMedia = windowWithMedia.matchMedia;
		windowWithMedia.matchMedia = (query: string) => ({
			matches: query.includes('prefers-reduced-motion'),
			addEventListener() {},
			removeEventListener() {},
			addListener() {},
			removeListener() {},
		});
		try {
			const reduced = renderGame(gameFixture(1, launchReadyPlanes()));
			fireEvent.click(reduced.getByRole('button', { name: /roll die/i }));
			expect(reduced.getByTestId('aeroplane-die-face').textContent).toBe('1');
			expect(reduced.queryByTestId('aeroplane-die-tumble')).toBeNull();
			expect(reduced.queryByTestId('aeroplane-motion-overlay')).toBeNull();
			expect(reduced.getByTestId('aeroplane-plane-control-red-0')).toBeTruthy();
		} finally {
			clock.uninstall();
			windowWithMedia.matchMedia = originalMatchMedia;
		}
	});

	test('a human no-move roll keeps its face until the paced AI roll replaces it', () => {
		jest.useFakeTimers();
		const clock = installFrameClock();
		try {
			const view = renderGame(gameFixtureForRolls([1, 1, 1, 1]), {
				aiDelayMs: 100,
			});
			fireEvent.click(view.getByRole('button', { name: /roll die/i }));
			expect(view.getByTestId('aeroplane-die-face').textContent).toBe('1');
			expect(view.getByTestId('aeroplane-die-roller').textContent).toContain(
				'Red'
			);
			// The turn already passed; the face is not replaced before the AI delay.
			// The rolling status renders in the board hint and both status panels.
			expect(view.getAllByText(/yellow is rolling/i).length).toBeGreaterThan(0);
			advanceTimers(99);
			expect(view.getByTestId('aeroplane-die-roller').textContent).toContain(
				'Red'
			);
			advanceTimers(1);
			expect(view.getByTestId('aeroplane-die-roller').textContent).toContain(
				'Yellow'
			);
			// Blue and green cascade one delay each (each roll's scheduling flushes
			// with the act that rolled), then the human returns.
			advanceTimers(100);
			expect(view.getByTestId('aeroplane-die-roller').textContent).toContain(
				'Blue'
			);
			advanceTimers(100);
			expect(view.getByTestId('aeroplane-die-roller').textContent).toContain(
				'Green'
			);
			expect(view.getByTestId('aeroplane-die-face').textContent).toBe('1');
			advanceTimers(100);
			expect(
				view.getByRole('button', { name: /roll die/i }).getAttribute('disabled')
			).toBeNull();
			// Rolls fire exactly once per delay.
			advanceTimers(1000);
			expect(view.getByTestId('aeroplane-die-roller').textContent).toContain(
				'Green'
			);
		} finally {
			clock.uninstall();
		}
	});

	test('a human auto-select roll shows its face and paces the next AI roll', () => {
		jest.useFakeTimers();
		const clock = installFrameClock();
		try {
			const view = renderGame(
				gameFixtureForRolls([1, 1, 1, 1], launchReadyPlanes()),
				{ aiDelayMs: 100 }
			);
			fireEvent.click(view.getByRole('button', { name: /roll die/i }));
			// The roll is signalled even though the single legal move auto-committed.
			expect(view.getByTestId('aeroplane-die-face').textContent).toBe('1');
			expect(view.getByTestId('aeroplane-die-roller').textContent).toContain(
				'Red'
			);
			act(() => clock.advance(1));
			expect(view.queryByTestId('aeroplane-motion-overlay')).not.toBeNull();
			expect(view.queryByTestId('aeroplane-plane-control-red-0')).toBeNull();
			// The appended move does not accelerate the next AI roll.
			advanceTimers(99);
			expect(view.getByTestId('aeroplane-die-roller').textContent).toContain(
				'Red'
			);
			expect(view.getAllByText(/yellow is rolling/i).length).toBeGreaterThan(0);
			advanceTimers(1);
			expect(view.getByTestId('aeroplane-die-roller').textContent).toContain(
				'Yellow'
			);
			// Expiry (at 650ms) reveals the committed move without artifacts; the
			// pending tumble frames are never advanced so nothing decorative shows.
			advanceTimers(700);
			expect(view.queryByTestId('aeroplane-motion-overlay')).toBeNull();
			expect(view.queryByTestId('aeroplane-die-tumble')).toBeNull();
			// The mover is back on the board at its committed (non-airborne) spot.
			expect(view.getByTestId('aeroplane-plane-control-red-0')).toBeTruthy();
			// The cascade finishes green's roll before the human may roll again.
			advanceTimers(100);
			expect(
				view.getByRole('button', { name: /roll die/i }).getAttribute('disabled')
			).toBeNull();
		} finally {
			clock.uninstall();
		}
	});

	test('a complete move-and-capture flow preserves the authoritative state, checksums, and original feed output', () => {
		jest.useFakeTimers();
		const clock = installFrameClock();
		const writes: string[] = [];
		const storage: AeroplaneStorage = {
			getItem: () => null,
			setItem: (_key, value) => {
				writes.push(value);
			},
			removeItem: () => undefined,
		};
		try {
			const fixture = gameFixtureForRolls(
				[1, 1, 1, 1],
				launchReadyPlanes().map(plane =>
					plane.id === 'blue-0' ? { ...plane, progress: 32 } : plane
				)
			);
			// Pure-rules reference for the same seeded roll and auto-selected move.
			const rolled = rollTurn(fixture.state!, fixture.diceRng!);
			const reference = playResolvedMove(
				rolled.state,
				rolled.legalMoves[0]!
			).state;
			const view = render(
				<AeroplaneGame
					controllerOptions={{ fixture, dev: true, storage, aiDelayMs: 100 }}
				/>
			);
			fireEvent.click(view.getByRole('button', { name: /roll die/i }));
			// The original event-feed output is unchanged.
			expect(
				view.getByText('You: Red plane 1 via jump to track 6.')
			).toBeTruthy();
			// The persisted envelope equals the pure engine outcome, checksums included.
			const saved = JSON.parse(writes.at(-1)!) as {
				state: AeroplaneState;
				actions: { kind: string; checksum: string }[];
			};
			expect(saved.actions.map(action => action.kind)).toEqual([
				'roll',
				'move',
			]);
			expect(saved.actions[0]!.checksum).toBe(checksumState(rolled.state));
			expect(saved.actions[1]!.checksum).toBe(checksumState(reference));
			expect(saved.state).toEqual(reference);
			// Playback completes and reveals exactly the committed board: the mover
			// landed and the captured plane returned to its hangar slot.
			act(() => clock.advance(1));
			act(() => clock.advance(700));
			expect(view.queryByTestId('aeroplane-motion-overlay')).toBeNull();
			expect(view.queryByTestId('aeroplane-capture-ghost')).toBeNull();
			expect(view.getByTestId('aeroplane-plane-control-red-0')).toBeTruthy();
			expect(view.getByTestId('aeroplane-plane-control-blue-0')).toBeTruthy();
			// The captured blue-0's committed glyph sits exactly on its hangar anchor.
			const blueHangar = positionAnchor(toPosition('blue', null), 'blue-0');
			expect(
				overlayAnchor(view.queryByTestId, 'aeroplane-plane-control-blue-0')
			).toEqual({ x: blueHangar.x, y: blueHangar.y });
			// The flow continues across actors: paced AI rolls return the turn one
			// link per paced step, and the presentation envelope settles at 650ms.
			advanceTimers(100);
			advanceTimers(100);
			advanceTimers(100);
			advanceTimers(400);
			expect(
				view.getByRole('button', { name: /roll die/i }).getAttribute('disabled')
			).toBeNull();
		} finally {
			clock.uninstall();
		}
	});

	test('AI no-move rolls cascade through each rival back to the human', () => {
		jest.useFakeTimers();
		const view = renderGame(
			gameFixtureForRolls([1, 1, 1, 1], undefined, 'yellow'),
			{ aiDelayMs: 100 }
		);
		expect(view.getByTestId('aeroplane-die-face').textContent).toBe('—');
		expect(view.getAllByText(/yellow is rolling/i).length).toBeGreaterThan(0);
		const rollButton = view.getByRole('button', { name: /roll die/i });
		expect(rollButton.getAttribute('disabled')).not.toBeNull();
		advanceTimers(100);
		expect(view.getByTestId('aeroplane-die-roller').textContent).toContain(
			'Yellow'
		);
		advanceTimers(100);
		expect(view.getByTestId('aeroplane-die-roller').textContent).toContain(
			'Blue'
		);
		advanceTimers(100);
		expect(view.getByTestId('aeroplane-die-roller').textContent).toContain(
			'Green'
		);
		advanceTimers(100);
		expect(
			view.getByRole('button', { name: /roll die/i }).getAttribute('disabled')
		).toBeNull();
		expect(view.getByTestId('aeroplane-die-face').textContent).toBe('1');
	});

	test('a rapid AI move supersedes the in-flight human presentation without late cues', () => {
		jest.useFakeTimers();
		const clock = installFrameClock();
		window.localStorage.removeItem(AEROPLANE_MUTED_STORAGE_KEY);
		const frequencies = installCueAudioStub();
		try {
			const fixture = gameFixtureForRolls(
				[1, 1],
				launchReadyPlanes().map(plane =>
					plane.id === 'yellow-0' ? { ...plane, progress: 1 } : plane
				)
			);
			const view = renderGame(fixture, {
				aiDelayMs: 100,
				// Keep the human route alive past the AI move so supersession is real.
				presentationMs: 5000,
			});
			fireEvent.click(view.getByRole('button', { name: /roll die/i }));
			// Roll cue, then the human timeline's first hop.
			act(() => clock.advance(1));
			act(() => clock.advance(40));
			expect(frequencies).toEqual([340, 500]);
			// The paced AI roll and its auto-selected move supersede the overlay.
			advanceTimers(200);
			act(() => clock.advance(1));
			const yellowStart = positionAnchor(toPosition('yellow', 1), 'yellow-0');
			const position = overlayAnchor(
				testId => view.queryByTestId(testId),
				'aeroplane-motion-overlay'
			);
			expect(position).toEqual(yellowStart);
			// Only the newest timeline's cues fire: the yellow roll cue (one per
			// roll id) plus its hops and finish; the superseded red hop, jump,
			// capture, and finish never do.
			act(() => clock.advance(1000));
			expect(frequencies).toEqual([340, 500, 340, 500, 500, 640]);
			expect(view.queryByTestId('aeroplane-motion-overlay')).toBeNull();
			// Both moves committed in order in the unchanged original feed.
			expect(
				view.getByText('You: Red plane 1 via jump to track 6.')
			).toBeTruthy();
			expect(
				view.getByText('AI: Yellow plane 1 via jump to track 6.')
			).toBeTruthy();
		} finally {
			window.localStorage.removeItem(AEROPLANE_MUTED_STORAGE_KEY);
			clock.uninstall();
			uninstallCueAudioStub();
		}
	});

	test('the status live region carries only the authoritative face and route state', () => {
		jest.useFakeTimers();
		const clock = installFrameClock();
		try {
			const view = renderGame(
				gameFixtureForRolls([1, 1, 1, 1], launchReadyPlanes()),
				{ aiDelayMs: 100 }
			);
			fireEvent.click(view.getByRole('button', { name: /roll die/i }));
			act(() => clock.advance(10));
			// The decorative tumble is aria-hidden; the spoken face stays authoritative.
			expect(
				view.getByTestId('aeroplane-die-tumble').getAttribute('aria-hidden')
			).toBe('true');
			expect(view.getByTestId('aeroplane-die-face').textContent).toBe('1');
			const regions = view.getAllByRole('status');
			expect(regions).toHaveLength(2);
			const dieRegion = regions.find(region =>
				region.querySelector('[data-testid="aeroplane-status-die"]')
			)!;
			const gameRegion = regions.find(region => region !== dieRegion)!;
			expect(dieRegion.textContent).toContain('Rolled by Red');
			expect(gameRegion.textContent).toContain('A route is being presented.');
			expect(dieRegion.textContent).toContain('Route in flight');
			// Settling and expiry clear the decorative and ephemeral announcements.
			act(() => clock.advance(700));
			expect(view.queryByTestId('aeroplane-die-tumble')).toBeNull();
			advanceTimers(700);
			expect(gameRegion.textContent).not.toContain(
				'A route is being presented.'
			);
			expect(dieRegion.textContent).not.toContain('Route in flight');
		} finally {
			clock.uninstall();
		}
	});

	test('the skipAnimations fixture path settles immediately and cascades AI rolls without timers', () => {
		const clock = installFrameClock();
		try {
			const fixture = gameFixtureForRolls([1, 1, 1, 1], launchReadyPlanes());
			fixture.skipAnimations = true;
			const view = renderGame(fixture);
			fireEvent.click(view.getByRole('button', { name: /roll die/i }));
			// No tumble, no route playback, no queue entry — the fast fixture path.
			expect(view.getByTestId('aeroplane-die-face').textContent).toBe('1');
			expect(view.queryByTestId('aeroplane-die-tumble')).toBeNull();
			expect(view.queryByTestId('aeroplane-motion-overlay')).toBeNull();
			expect(view.getByText('Your flight log will appear here.')).toBeTruthy();
			// The whole AI cascade (yellow→blue→green) executed synchronously
			// inside the click's act, without advancing any clock.
			expect(view.getByTestId('aeroplane-die-roller').textContent).toContain(
				'Green'
			);
			act(() => clock.advance(500)); // never produces late artifacts
			expect(view.queryByTestId('aeroplane-die-tumble')).toBeNull();
			expect(view.queryByTestId('aeroplane-motion-overlay')).toBeNull();
			expect(view.getByTestId('aeroplane-die-roller').textContent).toContain(
				'Green'
			);
			expect(
				view.getByRole('button', { name: /roll die/i }).getAttribute('disabled')
			).toBeNull();
		} finally {
			clock.uninstall();
		}
	});

	test('a completed match announces the winner and reset starts clean without artifacts', () => {
		const clock = installFrameClock();
		const originalFetch = globalThis.fetch;
		globalThis.fetch = (async () =>
			new Response('{}', {
				status: 201,
				headers: { 'Content-Type': 'application/json' },
			})) as unknown as typeof fetch;
		try {
			const view = renderGame(finishedFixture());
			// The winner is announced; a finished match has no motion artifacts.
			// The status copy renders in both status panels.
			expect(view.getAllByText(/red wins the match/i).length).toBeGreaterThan(
				0
			);
			const regions = view.getAllByRole('status');
			const gameRegion = regions.find(
				region => !region.querySelector('[data-testid="aeroplane-status-die"]')
			)!;
			expect(gameRegion.textContent).toContain('red wins.');
			act(() => clock.advance(300));
			expect(view.queryByTestId('aeroplane-motion-overlay')).toBeNull();
			expect(view.queryByTestId('aeroplane-die-tumble')).toBeNull();
			// One reset starts a fresh match without animation artifacts.
			fireEvent.click(view.getByRole('button', { name: /reset match/i }));
			expect(view.getByTestId('aeroplane-die-face').textContent).toBe('—');
			expect(view.getByText('Your flight log will appear here.')).toBeTruthy();
			expect(
				view.getByRole('button', { name: /roll die/i }).getAttribute('disabled')
			).toBeNull();
			act(() => clock.advance(300));
			expect(view.queryByTestId('aeroplane-motion-overlay')).toBeNull();
			expect(view.queryByTestId('aeroplane-die-tumble')).toBeNull();
		} finally {
			globalThis.fetch = originalFetch;
			clock.uninstall();
		}
	});
});
