import { afterEach, describe, expect, jest, test } from 'bun:test';
import { act, renderHook } from '@testing-library/react';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { hydrateRoot } from 'react-dom/client';
import { setupReactDom } from '../test/reactSetup';
import AeroplaneBoard from '../components/aeroplane/AeroplaneBoard';
import AeroplaneEventFeed from '../components/aeroplane/AeroplaneEventFeed';
import AeroplaneSetup from '../components/aeroplane/AeroplaneSetup';
import AeroplaneStatus from '../components/aeroplane/AeroplaneStatus';
import { CLASSIC_CONFIG } from '../lib/aeroplane/game';
import {
	ACTIVE_MATCH_STORAGE_KEY,
	useAeroplaneMatch,
	type UseAeroplaneMatchOptions,
	type UseAeroplaneMatchResult,
} from './useAeroplaneMatch';
import { rollFair } from '../lib/aeroplane/dice';
import { deriveRngStreams } from '../lib/aeroplane/rng';
import type { AuthSnapshot } from '../lib/auth';
import type { AeroplaneStorage } from '../lib/aeroplane/persistence';

setupReactDom();

const SIGNED_OUT_AUTH: AuthSnapshot = {
	user: null,
	loading: false,
	revalidated: true,
	isAuthenticated: false,
};

interface MemoryStorage extends AeroplaneStorage {
	values: Map<string, string>;
}

function memoryStorage(initial: Record<string, string> = {}): MemoryStorage {
	const values = new Map(Object.entries(initial));
	return {
		values,
		getItem: key => values.get(key) ?? null,
		setItem: (key, value) => void values.set(key, value),
		removeItem: key => void values.delete(key),
	};
}

/**
 * Root seed whose derived dice stream opens with exactly |rolls| faces, so a
 * seed-only fixture replays deterministically (replay rebuilds the streams
 * from the saved root seed).
 */
function rootSeedForRolls(rolls: readonly number[]): number {
	for (let seed = 1; seed <= 1_000_000; seed += 1) {
		let rng = deriveRngStreams(seed).dice;
		let matches = true;
		for (const expected of rolls) {
			const result = rollFair(rng);
			if (result.roll !== expected) {
				matches = false;
				break;
			}
			rng = result.rng;
		}
		if (matches) return seed;
	}
	throw new Error(`Could not find deterministic root seed: ${rolls}`);
}

/**
 * Drive a real match whose saved snapshot is visually identical to a fresh
 * default board — every plane hangared, Red's turn, awaiting a roll — while
 * its action history holds four no-move passes (Red's human roll, then the
 * three AI seats each rolling blocked and passing back around to Red). The
 * reconstructed feed is therefore non-empty even though board and status
 * agree with the server's fresh render, isolating the feed from any other
 * hydration difference.
 */
function saveAllHangarNoMoveHistory(storage: MemoryStorage): string {
	const { result, unmount } = renderHook(() =>
		useAeroplaneMatch(SIGNED_OUT_AUTH, {
			storage,
			dev: true,
			// skipAnimations makes each AI pass commit synchronously within the
			// act flush; the saved envelope's actions are what restore replays.
			// Seed-only: replay rebuilds the dice stream from this root seed.
			fixture: {
				seed: rootSeedForRolls([1, 1, 1, 1, 1]),
				skipAnimations: true,
			},
		})
	);
	// One blocked human roll cascades through all four seats: each no-move
	// roll passes the turn, landing back on Red ready to roll.
	act(() => {
		result.current.roll();
	});
	expect(result.current.actions).toHaveLength(4);
	expect(result.current.actions.map(action => action.actor)).toEqual([
		'human',
		'ai',
		'ai',
		'ai',
	]);
	expect(result.current.actions.every(action => action.kind === 'roll')).toBe(
		true
	);
	// The board/status the server will render matches this state exactly.
	expect(result.current.state.currentPlayer).toBe('red');
	expect(result.current.state.phase).toBe('awaiting-roll');
	expect(result.current.state.pendingRoll).toBeNull();
	const raw = storage.getItem(ACTIVE_MATCH_STORAGE_KEY);
	expect(raw).not.toBeNull();
	unmount();
	return raw!;
}

/**
 * Minimal island matching the production Aeroplane page wiring: the hook's
 * default storage resolution (no injected storage), rendering the feed the
 * way the game island does.
 */
function SsrHydrationProbe(props: {
	captured: { current: UseAeroplaneMatchResult | null };
	options?: UseAeroplaneMatchOptions;
}): React.ReactElement {
	const match = useAeroplaneMatch(SIGNED_OUT_AUTH, {
		dev: true,
		...props.options,
	});
	props.captured.current = match;
	return (
		<AeroplaneEventFeed
			events={match.eventFeed}
			onSkipAnimations={match.skipAnimations}
		/>
	);
}

/**
 * Full-surface island probe matching AeroplaneGame's board, status, setup, and
 * feed wiring so any state/config/feed hydration mismatch is surfaced.
 */
function FullSurfaceSsrProbe(props: {
	captured: { current: UseAeroplaneMatchResult | null };
	options?: UseAeroplaneMatchOptions;
}): React.ReactElement {
	const match = useAeroplaneMatch(SIGNED_OUT_AUTH, {
		dev: true,
		...props.options,
	});
	props.captured.current = match;
	return (
		<div>
			<AeroplaneBoard
				state={match.state}
				legalMoves={match.legalMoves}
				isHumanTurn={match.isHumanTurn}
				presentationQueue={match.presentationQueue}
				onRoll={match.roll}
				onSelectMove={match.selectMove}
			/>
			<AeroplaneStatus
				state={match.state}
				legalMoves={match.legalMoves}
				isHumanTurn={match.isHumanTurn}
				isAnimating={match.isAnimating}
				rollPresentation={match.rollPresentation}
				noMoveNotice={match.noMoveNotice}
			/>
			<AeroplaneSetup
				setup={match.setup}
				onChange={match.setSetup}
				onStart={() => match.newMatch()}
			/>
			<AeroplaneEventFeed
				events={match.eventFeed}
				onSkipAnimations={match.skipAnimations}
			/>
		</div>
	);
}

/** Remove the browser surface only for the server pass, as real SSR has. */
function withoutBrowserGlobals(render: () => string): string {
	const globals = globalThis as Record<string, unknown>;
	const savedWindow = globals.window;
	const savedLocalStorage = globals.localStorage;
	delete globals.window;
	delete globals.localStorage;
	try {
		return render();
	} finally {
		if (savedWindow !== undefined) globals.window = savedWindow;
		if (savedLocalStorage !== undefined) {
			globals.localStorage = savedLocalStorage;
		}
	}
}

function hydrationProblems(messages: string[]): string[] {
	return messages.filter(message =>
		/hydrat|did not match|Expected server HTML|Server:|server rendered/i.test(
			message
		)
	);
}

interface HydratedPage {
	container: HTMLElement;
	captured: { current: UseAeroplaneMatchResult | null };
	errors: string[];
	unmount: () => void;
}

/** Hydrate server HTML in the browser-like environment, collecting errors. */
async function hydrateFromServerHtml(
	html: string,
	Probe: typeof SsrHydrationProbe = SsrHydrationProbe
): Promise<HydratedPage> {
	const container = document.createElement('div');
	container.innerHTML = html;
	document.body.appendChild(container);
	const captured: { current: UseAeroplaneMatchResult | null } = {
		current: null,
	};
	const errors: string[] = [];
	const errorSpy = jest
		.spyOn(console, 'error')
		.mockImplementation((...args: unknown[]) => {
			errors.push(args.map(String).join(' '));
		});
	let root: ReturnType<typeof hydrateRoot> | null = null;
	try {
		act(() => {
			root = hydrateRoot(
				container,
				<Probe
					captured={captured}
					// Keep any post-append AI scheduling quiet until unmount.
					options={{ aiDelayMs: 100_000 }}
				/>,
				{
					// Collect hydration recovery errors through React's official
					// channel instead of window.reportError.
					onRecoverableError: (error: unknown) => {
						errors.push(String(error));
					},
				}
			);
		});
		// Drain scheduler rounds inside act so every recovery render runs (and
		// any thrown mismatch propagates) inside this try block.
		for (let round = 0; round < 4; round += 1) {
			await act(async () => {
				await new Promise(resolve => setTimeout(resolve, 0));
			});
		}
	} catch (error) {
		// React re-throws hydration recovery errors through act; record them
		// so the mismatch assertions below report the cause.
		errors.push(String(error));
	} finally {
		errorSpy.mockRestore();
	}
	return {
		container,
		captured,
		errors,
		unmount: () => {
			act(() => {
				root?.unmount();
			});
			container.remove();
		},
	};
}

describe('useAeroplaneMatch SSR→hydrate feed restoration', () => {
	afterEach(() => {
		window.localStorage.removeItem(ACTIVE_MATCH_STORAGE_KEY);
	});

	test('a saved visually-default match hydrates cleanly and publishes its feed after mount', async () => {
		const raw = saveAllHangarNoMoveHistory(memoryStorage());

		// Server pass: production SSR has no window/localStorage, so the feed
		// renders empty regardless of any saved snapshot.
		const html = withoutBrowserGlobals(() =>
			renderToString(<SsrHydrationProbe captured={{ current: null }} />)
		);
		expect(html).toContain('Your flight log will appear here.');
		expect(html).toContain('Event feed');
		expect(html).not.toContain('aeroplane-feed-roll-only');

		// Client pass: the saved snapshot exists during hydration, but the
		// first render must match the server markup exactly.
		window.localStorage.setItem(ACTIVE_MATCH_STORAGE_KEY, raw);
		const page = await hydrateFromServerHtml(html);
		try {
			expect(hydrationProblems(page.errors)).toEqual([]);
			// The restored feed is published after mount, in original order,
			// with unique sequential ids.
			const feed = page.captured.current!.eventFeed;
			expect(feed).toHaveLength(4);
			expect(feed.map(entry => entry.id)).toEqual([1, 2, 3, 4]);
			expect(feed.every(entry => entry.move === null)).toBe(true);
			expect(
				page.container.querySelectorAll(
					'[data-testid="aeroplane-feed-roll-only"]'
				)
			).toHaveLength(4);

			// A live append after publish preserves every restored entry and
			// takes an id beyond the restored maximum. The saved dice stream's
			// fifth face is blocked, so Red's roll appends one no-move entry.
			const restoredIds = feed.map(entry => entry.id);
			act(() => {
				page.captured.current!.roll();
			});
			const appended = page.captured.current!.eventFeed;
			expect(appended.map(entry => entry.id)).toEqual([...restoredIds, 5]);
			expect(new Set(appended.map(entry => entry.id)).size).toBe(
				appended.length
			);
			expect(
				page.container.querySelectorAll(
					'[data-testid="aeroplane-feed-roll-only"]'
				)
			).toHaveLength(5);
		} finally {
			page.unmount();
		}
	});

	test('a visitor without a saved match hydrates cleanly with an empty feed', async () => {
		const html = withoutBrowserGlobals(() =>
			renderToString(<SsrHydrationProbe captured={{ current: null }} />)
		);
		expect(html).toContain('Your flight log will appear here.');
		expect(html).not.toContain('aeroplane-feed-roll-only');

		window.localStorage.removeItem(ACTIVE_MATCH_STORAGE_KEY);
		const page = await hydrateFromServerHtml(html);
		try {
			expect(hydrationProblems(page.errors)).toEqual([]);
			expect(page.captured.current!.eventFeed).toEqual([]);
			expect(
				page.container.querySelectorAll(
					'[data-testid="aeroplane-feed-roll-only"]'
				)
			).toHaveLength(0);
			expect(page.container.textContent).toContain(
				'Your flight log will appear here.'
			);
		} finally {
			page.unmount();
		}
	});

	test('a real mid-game saved match (non-default config, moved planes, changed turn) hydrates cleanly without mismatch', async () => {
		// Save a non-default Sky Tycoon / Quick Chill match after Red launches
		// and passes the turn to Yellow — board, status, setup, and feed all
		// differ from the fresh server render.
		const storage = memoryStorage();
		const { result, unmount } = renderHook(() =>
			useAeroplaneMatch(SIGNED_OUT_AUTH, {
				storage,
				dev: true,
				aiDelayMs: 100_000,
				fixture: {
					seed: rootSeedForRolls([6, 3]),
					config: { ...CLASSIC_CONFIG, mode: 'sky-tycoon' },
					skipAnimations: false,
				},
			})
		);
		act(() => {
			result.current.roll();
		});
		act(() => {
			result.current.select('red-0');
		});
		act(() => {
			result.current.roll();
		});
		expect(result.current.state.currentPlayer).toBe('yellow');
		expect(
			result.current.state.planes.find(p => p.id === 'red-0')?.progress
		).toBeGreaterThan(0);
		const raw = storage.getItem(ACTIVE_MATCH_STORAGE_KEY)!;
		expect(raw).toBeTruthy();
		const expectedState = result.current.state;
		unmount();

		const html = withoutBrowserGlobals(() =>
			renderToString(<FullSurfaceSsrProbe captured={{ current: null }} />)
		);
		expect(html).not.toContain('aria-label="Sky Tycoon balances"');

		window.localStorage.setItem(ACTIVE_MATCH_STORAGE_KEY, raw);
		const page = await hydrateFromServerHtml(html, FullSurfaceSsrProbe);
		try {
			expect(hydrationProblems(page.errors)).toEqual([]);
			expect(page.captured.current!.state).toEqual(expectedState);
			expect(page.captured.current!.setup.mode).toBe('sky-tycoon');
			expect(page.captured.current!.eventFeed.length).toBeGreaterThan(0);
			expect(page.container.textContent).toContain('Yellow is rolling');
			expect(
				page.container.querySelector('[aria-label="Sky Tycoon balances"]')
			).not.toBeNull();
		} finally {
			page.unmount();
		}
	});
});
