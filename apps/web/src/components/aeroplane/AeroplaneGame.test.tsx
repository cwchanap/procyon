import { describe, expect, test, mock } from 'bun:test';
import { fireEvent, render } from '@testing-library/react';
import { renderToStaticMarkup } from 'react-dom/server';
import { setupReactDom } from '../../test/reactSetup';
import { CLASSIC_CONFIG, QUICK_CONFIG } from '../../lib/aeroplane/game';
import type {
	AeroplaneActionActor,
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
