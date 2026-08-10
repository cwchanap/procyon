import { expect, test, type Page } from '@playwright/test';
import { AuthHelper } from './utils/auth-helpers';
import {
	CLASSIC_CONFIG,
	QUICK_CONFIG,
	createAeroplaneMatch,
} from '../src/lib/aeroplane/game';
import { rollFair } from '../src/lib/aeroplane/dice';
import type {
	AeroplaneColor,
	AeroplaneConfig,
	AeroplaneState,
	PersistedAeroplaneMatchV1,
} from '../src/lib/aeroplane/types';
import type { AeroplaneE2EFixture } from '../src/hooks/useAeroplaneMatch';

const ACTIVE_MATCH_STORAGE_KEY = 'procyon:aeroplane:active-match:v1';
const FIXTURE_CONSUMED_KEY = 'procyon:aeroplane:e2e-fixture-consumed';
const COLORS: readonly AeroplaneColor[] = ['red', 'yellow', 'blue', 'green'];

const colorLabels: Record<AeroplaneColor, string> = {
	red: 'Red',
	yellow: 'Yellow',
	blue: 'Blue',
	green: 'Green',
};

function rngForRolls(rolls: readonly number[]): { value: number } {
	for (let value = 1; value <= 1_000_000; value += 1) {
		let rng = { value };
		let matches = true;
		for (const expected of rolls) {
			const result = rollFair(rng);
			if (result.roll !== expected) {
				matches = false;
				break;
			}
			rng = result.rng;
		}
		if (matches) return { value };
	}
	throw new Error(`Could not find deterministic dice sequence: ${rolls}`);
}

function fixtureFrom(
	configInput: Partial<AeroplaneConfig>,
	seed: number,
	statePatch: Partial<AeroplaneState> = {},
	fixturePatch: Partial<AeroplaneE2EFixture> = {}
): AeroplaneE2EFixture {
	const match = createAeroplaneMatch(configInput, seed);
	const state: AeroplaneState = {
		...match.state,
		...statePatch,
		config: match.state.config,
	};
	return {
		seed: match.rootSeed,
		config: match.state.config,
		state,
		diceRng: match.diceRng,
		aiRng: match.aiRng,
		skipAnimations: true,
		...fixturePatch,
	};
}

function withPlaneProgress(
	state: AeroplaneState,
	progressById: Record<string, number | null>
): AeroplaneState {
	return {
		...state,
		planes: state.planes.map(plane =>
			Object.prototype.hasOwnProperty.call(progressById, plane.id)
				? { ...plane, progress: progressById[plane.id] ?? null }
				: { ...plane }
		),
	};
}

function nearVictoryFixture(seed: number): AeroplaneE2EFixture {
	const config = { ...QUICK_CONFIG, chatter: false };
	const match = createAeroplaneMatch(config, seed);
	const state = withPlaneProgress(
		{
			...match.state,
			config: match.state.config,
			currentPlayer: 'red',
			phase: 'awaiting-choice',
			pendingRoll: 1,
			winner: null,
			stats: {
				...match.state.stats,
				finished: { ...match.state.stats.finished, red: 1 },
			},
		},
		{ 'red-0': 56, 'red-1': 55 }
	);
	return {
		seed: match.rootSeed,
		config: match.state.config,
		state,
		seats: match.seats,
		diceRng: match.diceRng,
		aiRng: match.aiRng,
		skipAnimations: true,
	};
}

async function installFixture(page: Page, fixture: AeroplaneE2EFixture) {
	await page.addInitScript(value => {
		(
			window as unknown as { __PROCYON_AEROPLANE_FIXTURE__?: unknown }
		).__PROCYON_AEROPLANE_FIXTURE__ = value;
	}, fixture);
}

async function installFixtureOnce(page: Page, fixture: AeroplaneE2EFixture) {
	await page.addInitScript(
		({ fixture: value, consumedKey }) => {
			if (window.sessionStorage.getItem(consumedKey) === '1') return;
			(
				window as unknown as { __PROCYON_AEROPLANE_FIXTURE__?: unknown }
			).__PROCYON_AEROPLANE_FIXTURE__ = value;
			window.sessionStorage.setItem(consumedKey, '1');
		},
		{ fixture, consumedKey: FIXTURE_CONSUMED_KEY }
	);
}

async function gotoAeroplane(
	page: Page,
	fixture: AeroplaneE2EFixture
): Promise<void> {
	await installFixture(page, fixture);
	await page.goto('/aeroplane');
	await expect(
		page.getByRole('heading', { name: 'Aeroplane Chess', exact: true })
	).toBeVisible({ timeout: 15000 });
}

function status(page: Page) {
	return page.locator('[aria-label="Aeroplane match status"] [role="status"]');
}

async function storedMatch(page: Page): Promise<PersistedAeroplaneMatchV1> {
	return page.evaluate(key => {
		const raw = window.localStorage.getItem(key);
		if (!raw) throw new Error('Aeroplane active match was not persisted');
		return JSON.parse(raw) as PersistedAeroplaneMatchV1;
	}, ACTIVE_MATCH_STORAGE_KEY);
}

async function waitForStoredMatch(
	page: Page
): Promise<PersistedAeroplaneMatchV1> {
	let saved: PersistedAeroplaneMatchV1 | null = null;
	await expect
		.poll(async () => {
			try {
				return (saved = await page.evaluate(key => {
					const raw = localStorage.getItem(key);
					return raw ? (JSON.parse(raw) as PersistedAeroplaneMatchV1) : null;
				}, ACTIVE_MATCH_STORAGE_KEY));
			} catch {
				saved = null;
				return null;
			}
		})
		.not.toBeNull();
	if (!saved) throw new Error('Aeroplane active match was not persisted');
	return saved;
}

async function clearStoredMatch(page: Page): Promise<void> {
	try {
		await page.evaluate(
			key => localStorage.removeItem(key),
			ACTIVE_MATCH_STORAGE_KEY
		);
	} catch {
		// A new Playwright page starts at an opaque about:blank origin, where
		// there is no same-origin storage to clear before first navigation.
	}
}

function expectedSeats(humanColor: AeroplaneColor) {
	const personalities = ['cautious', 'aggressive', 'unpredictable'] as const;
	return personalities.map((personality, offset) => ({
		color: COLORS[(COLORS.indexOf(humanColor) + offset + 1) % COLORS.length]!,
		personality,
	}));
}

function expectedAiTurnPrefix(humanColor: AeroplaneColor) {
	return COLORS.slice(0, COLORS.indexOf(humanColor)).map(color => ({
		actor: 'ai' as const,
		color,
	}));
}

test.describe('Aeroplane Chess critical journey', () => {
	test('assigns fixed AI seats and automates red-first turns for every human colour', async ({
		page,
	}) => {
		const diceRng = rngForRolls([1, 1, 1, 1]);

		for (const [index, humanColor] of COLORS.entries()) {
			await clearStoredMatch(page);
			const fixture = fixtureFrom(
				{ humanColor },
				41000 + index,
				{},
				{ diceRng }
			);
			await gotoAeroplane(page, fixture);
			await expect(status(page)).toContainText(colorLabels[humanColor]);
			const saved = await waitForStoredMatch(page);
			expect(saved.seats).toEqual(expectedSeats(humanColor));
			expect(
				saved.actions
					.filter(action => action.kind === 'roll')
					.slice(0, index)
					.map(action => ({ actor: action.actor, color: action.color }))
			).toEqual(expectedAiTurnPrefix(humanColor));
		}
	});

	test('launches a human plane and completes one human plus three AI turns', async ({
		page,
	}) => {
		const fixture = fixtureFrom(
			QUICK_CONFIG,
			41100,
			{},
			{ diceRng: rngForRolls([5, 1, 1, 1]) }
		);
		await gotoAeroplane(page, fixture);
		await expect(page.getByLabel('Dice mode')).toHaveValue('relaxed');
		await expect(page.getByLabel('Launch rule')).toHaveValue('five-or-six');
		await expect(status(page)).toContainText('Red');

		await page.getByRole('button', { name: 'Roll die' }).click();
		await page.getByRole('button', { name: /Red plane 1/i }).click();
		await expect(status(page)).toContainText('Red');
		await expect
			.poll(async () =>
				page.evaluate(key => {
					const raw = localStorage.getItem(key);
					return raw ? JSON.parse(raw).actions.length : -1;
				}, ACTIVE_MATCH_STORAGE_KEY)
			)
			.toBeGreaterThanOrEqual(5);

		const saved = await storedMatch(page);
		expect(
			saved.state.planes.find(plane => plane.id === 'red-0')?.progress
		).toBe(0);
		expect(saved.actions.map(action => action.actor)).toEqual([
			'human',
			'human',
			'ai',
			'ai',
			'ai',
		]);
	});

	test('resolves base arrival 30 to 34 while flight arrival 18 stops at 30', async ({
		page,
	}) => {
		const scenarios = [
			{ progress: 28, expectedProgress: 34, event: 'jump' },
			{ progress: 16, expectedProgress: 30, event: 'flight' },
		] as const;

		for (const scenario of scenarios) {
			await clearStoredMatch(page);
			const base = fixtureFrom(CLASSIC_CONFIG, 41200 + scenario.progress, {
				currentPlayer: 'red',
				phase: 'awaiting-choice',
				pendingRoll: 2,
			});
			base.state = withPlaneProgress(base.state!, {
				'red-0': scenario.progress,
			});
			await gotoAeroplane(page, base);
			await page.getByRole('button', { name: /Red plane 1/i }).click();
			await expect
				.poll(
					async () =>
						(await storedMatch(page)).state.planes.find(
							plane => plane.id === 'red-0'
						)?.progress
				)
				.toBe(scenario.expectedProgress);
			const saved = await storedMatch(page);
			const move = saved.actions.find(
				action => action.actor === 'human' && action.kind === 'move'
			);
			expect(move?.events.map(event => event.type)).toContain(scenario.event);
		}
	});

	test('captures only at the final endpoint after jump or flight resolution', async ({
		page,
	}) => {
		const scenarios = [
			{
				label: 'base endpoint',
				progressById: { 'red-0': 16, 'yellow-0': 5 },
				expectedCaptured: false,
			},
			{
				label: 'final endpoint',
				progressById: { 'red-0': 16, 'yellow-0': 17 },
				expectedCaptured: true,
			},
		] as const;

		for (const scenario of scenarios) {
			await clearStoredMatch(page);
			const fixture = fixtureFrom(
				CLASSIC_CONFIG,
				41300 + (scenario.expectedCaptured ? 1 : 0),
				{
					currentPlayer: 'red',
					phase: 'awaiting-choice',
					pendingRoll: 2,
				}
			);
			fixture.state = withPlaneProgress(fixture.state!, scenario.progressById);
			await gotoAeroplane(page, fixture);
			await page.getByRole('button', { name: /Red plane 1/i }).click();
			await expect
				.poll(async () =>
					(await storedMatch(page)).actions.some(
						action => action.actor === 'human' && action.kind === 'move'
					)
				)
				.toBe(true);
			const saved = await storedMatch(page);
			expect(
				saved.state.planes.find(plane => plane.id === 'red-0')?.progress
			).toBe(30);
			expect(saved.state.stats.capturesMade.red).toBe(
				scenario.expectedCaptured ? 1 : 0
			);
		}
	});

	test('rejects blockade crossing and landing while preserving the plane positions', async ({
		page,
	}) => {
		const scenarios = [
			{
				progressById: { 'red-0': 1, 'yellow-0': 41, 'yellow-1': 41 },
				roll: 3,
			},
			{
				progressById: {
					'red-0': 1,
					'red-1': 2,
					'red-2': 2,
					'yellow-0': 42,
					'yellow-1': 42,
				},
				roll: 1,
			},
			{
				progressById: { 'red-0': 2, 'red-1': 3 },
				roll: 1,
				expectFriendlyStack: true,
			},
		] as const;

		for (const [index, scenario] of scenarios.entries()) {
			const expectFriendlyStack =
				'expectFriendlyStack' in scenario &&
				scenario.expectFriendlyStack === true;
			await clearStoredMatch(page);
			const fixture = fixtureFrom(
				expectFriendlyStack
					? {
							...CLASSIC_CONFIG,
							rulePreset: 'custom',
							stacking: true,
							blockades: false,
						}
					: {
							...CLASSIC_CONFIG,
							rulePreset: 'custom',
							stacking: true,
							blockades: true,
						},
				41400 + index,
				{ currentPlayer: 'red', phase: 'awaiting-roll', pendingRoll: null },
				{ diceRng: rngForRolls([scenario.roll, 1, 1, 1]) }
			);
			fixture.state = withPlaneProgress(fixture.state!, scenario.progressById);
			await gotoAeroplane(page, fixture);
			await page.getByRole('button', { name: 'Roll die' }).click();
			if (expectFriendlyStack) {
				await page.getByRole('button', { name: /Red plane 1/i }).click();
			}
			await expect
				.poll(async () => {
					try {
						return (await storedMatch(page)).actions.some(
							action =>
								action.actor === 'human' &&
								action.kind === (expectFriendlyStack ? 'move' : 'roll')
						);
					} catch {
						return false;
					}
				})
				.toBe(true);
			const saved = await storedMatch(page);
			expect(
				saved.actions
					.filter(action => action.actor === 'human')
					.map(action => action.kind)
			).toEqual(expectFriendlyStack ? ['roll', 'move'] : ['roll']);
			if (expectFriendlyStack) {
				expect(
					saved.state.planes.filter(
						plane => plane.color === 'red' && plane.progress === 3
					)
				).toHaveLength(2);
				await expect(
					page.getByTestId('aeroplane-plane-control-red-0')
				).toHaveCount(1);
				await expect(
					page.getByTestId('aeroplane-plane-control-red-1')
				).toHaveCount(1);
				continue;
			}
			for (const [planeId, progress] of Object.entries(scenario.progressById)) {
				if (!planeId.startsWith('red-')) continue;
				expect(
					saved.state.planes.find(plane => plane.id === planeId)?.progress
				).toBe(progress);
			}
		}
	});

	test('reloads an awaiting-choice match without consuming the next RNG value', async ({
		page,
	}) => {
		const fixture = fixtureFrom(CLASSIC_CONFIG, 41500, {
			currentPlayer: 'red',
			phase: 'awaiting-choice',
			pendingRoll: 1,
		});
		fixture.state = withPlaneProgress(fixture.state!, { 'red-0': 1 });
		await installFixtureOnce(page, fixture);
		await page.goto('/aeroplane');
		await expect(
			page.getByRole('button', { name: /Red plane 1/i })
		).toBeVisible();
		const before = await waitForStoredMatch(page);
		await page.evaluate(() => {
			delete (window as unknown as { __PROCYON_AEROPLANE_FIXTURE__?: unknown })
				.__PROCYON_AEROPLANE_FIXTURE__;
		});

		await page.reload();
		await expect(
			page.getByRole('button', { name: /Red plane 1/i })
		).toBeVisible();
		const after = await waitForStoredMatch(page);
		expect(after.state.phase).toBe('awaiting-choice');
		expect(after.state.pendingRoll).toBe(1);
		expect(after.diceRng).toEqual(before.diceRng);
	});

	test('completes a deterministic Quick & Chill two-plane victory', async ({
		page,
	}) => {
		const config = { ...QUICK_CONFIG, chatter: false };
		const fixture = fixtureFrom(config, 41600, {
			currentPlayer: 'red',
			phase: 'awaiting-choice',
			pendingRoll: 1,
		});
		fixture.state = withPlaneProgress(fixture.state!, {
			'red-0': 56,
			'red-1': 55,
		});
		fixture.state.stats = {
			...fixture.state.stats,
			finished: { ...fixture.state.stats.finished, red: 1 },
		};
		await gotoAeroplane(page, fixture);
		await page.getByRole('button', { name: /Red plane 2/i }).click();
		await expect(status(page)).toContainText('Red wins the match.');
		await expect
			.poll(async () =>
				page.evaluate(
					key => localStorage.getItem(key),
					ACTIVE_MATCH_STORAGE_KEY
				)
			)
			.toBeNull();
	});

	test('submits exactly one Aeroplane history POST for a signed-in completion', async ({
		page,
	}) => {
		const authHelper = new AuthHelper(page);
		const testUser = AuthHelper.generateTestUser();
		await authHelper.register(testUser);
		await authHelper.expectAuthenticated(testUser.username, testUser.email);

		const posts: string[] = [];
		await page.route('**/api/play-history', async route => {
			if (route.request().method() !== 'POST') {
				await route.continue();
				return;
			}
			posts.push(route.request().postData() ?? '');
			await route.fulfill({
				status: 201,
				contentType: 'application/json',
				body: JSON.stringify({ playHistory: { id: 'e2e-aeroplane' } }),
			});
		});

		await gotoAeroplane(page, nearVictoryFixture(41700));
		await expect(
			page.getByRole('button', { name: /Red plane 2/i })
		).toBeVisible();
		await page.getByRole('button', { name: /Red plane 2/i }).click();
		await expect(status(page)).toContainText('Red wins the match.');
		await expect.poll(() => posts.length).toBe(1);
		expect(JSON.parse(posts[0] ?? '{}')).toMatchObject({
			gameId: 'aeroplane',
			opponentEngineId: 'aeroplane-trio-v1',
			status: 'win',
		});
		await authHelper.logout();
	});

	test('does not render provider configuration on desktop or mobile Aeroplane', async ({
		page,
	}) => {
		await gotoAeroplane(page, fixtureFrom(CLASSIC_CONFIG, 41800));
		await expect(page.getByRole('heading', { name: 'AI Config' })).toHaveCount(
			0
		);
		await expect(page.getByLabel('AI Provider')).toHaveCount(0);

		await page.setViewportSize({ width: 390, height: 844 });
		await page.reload();
		await expect(
			page.getByRole('button', { name: 'Toggle AI config' })
		).toHaveCount(0);
		await expect(page.getByLabel('AI Provider')).toHaveCount(0);
	});
});
