import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { AuthSnapshot } from '../lib/auth';
import { chooseAiMove } from '../lib/aeroplane/ai';
import {
	CLASSIC_CONFIG,
	createAeroplaneMatch,
	normalizeConfig,
	playResolvedMove,
	rollTurn,
} from '../lib/aeroplane/game';
import { checksumState } from '../lib/aeroplane/checksum';
import {
	ACTIVE_MATCH_STORAGE_KEY,
	clearActiveMatch,
	isRecord,
	isUint32,
	restoreActiveMatch,
	saveActiveMatch,
	validConfig,
	validSeats,
	validatePersistedAeroplaneMatch,
	type AeroplaneStorage,
} from '../lib/aeroplane/persistence';
import { getLegalMoves } from '../lib/aeroplane/rules';
import { getChatterLine } from '../lib/aeroplane/chatter';
import { deriveHumanMoment, type HumanMoment } from '../lib/aeroplane/rewards';
import { replayMatch } from '../lib/aeroplane/replay';
import { normalizeRngState, type RngState } from '../lib/aeroplane/rng';
import type { SubmitPlayHistoryInput } from '../lib/play-history';
import { useTerminalHistorySave } from './useTerminalHistorySave';
import type {
	AeroplaneActionActor,
	AeroplaneActionRecord,
	AeroplaneColor,
	AeroplaneConfig,
	AeroplaneEvent,
	AeroplaneState,
	AiSeat,
	PersistedAeroplaneMatchV2,
	ResolvedMove,
	TycoonEffectEvent,
} from '../lib/aeroplane/types';

export const AEROPLANE_AI_DELAY_MS = 650;
export const AEROPLANE_PRESENTATION_MS = 650;

/**
 * The only browser-injected data understood by the Aeroplane controller.  It
 * is deliberately a serializable partial recovery envelope rather than a
 * production setup API; the hook reads it only while `import.meta.env.DEV` is
 * true.
 */
export interface AeroplaneE2EFixture {
	seed?: number;
	config?: AeroplaneConfig;
	state?: AeroplaneState;
	seats?: AiSeat[];
	diceRng?: RngState;
	aiRng?: RngState;
	skipAnimations?: boolean;
}

/** Identical shape to the fixture; resolved dev overrides share its contract. */
export type AeroplaneDevOverrides = AeroplaneE2EFixture;

export interface ReadDevOverridesOptions {
	dev: boolean;
	search?: string;
	fixture?: AeroplaneE2EFixture;
	warn?: (message: string) => void;
}

export interface AeroplanePresentation {
	id: number;
	move: ResolvedMove;
	events: AeroplaneEvent[];
	action: AeroplaneActionRecord;
	chatter?: string;
}

/**
 * Roll-only feed entry for a committed roll with no legal move: it carries
 * the real die and roll action, never a fabricated move, and is not queued
 * for the board. `nextPlayer` is the committed next player.
 */
export interface AeroplaneRollOnlyFeedEntry {
	id: number;
	move: null;
	events: [];
	action: AeroplaneActionRecord;
	nextPlayer: AeroplaneColor;
	chatter?: never;
}

export type AeroplaneFeedEntry =
	| AeroplanePresentation
	| AeroplaneRollOnlyFeedEntry;

/**
 * Display-only reconstruction step (from live commit or the replay
 * diagnostic): the recorded action, the effective resolved move (null for a
 * no-move roll), and the committed post-action state the formatter reads
 * turn/phase/result from.
 */
export interface AeroplaneFeedStep {
	readonly action: AeroplaneActionRecord;
	readonly move: ResolvedMove | null;
	readonly state: AeroplaneState;
}

/**
 * The one pure feed-entry formatter, shared by live play and saved-match
 * restoration.  Move entries carry the effective move with deterministic
 * `getChatterLine` selection (terminal win/loss copy included); no-move
 * rolls become roll-only entries carrying the committed next player and the
 * HPA-761 action-event semantics (Customs skip, capture details).  The id is
 * assigned by the caller so restoration can use sequential ids.
 */
export function buildAeroplaneFeedEntry(
	step: AeroplaneFeedStep & { readonly move: ResolvedMove },
	id: number,
	seats: readonly AiSeat[]
): AeroplanePresentation;
export function buildAeroplaneFeedEntry(
	step: AeroplaneFeedStep & { readonly move: null },
	id: number,
	seats: readonly AiSeat[]
): AeroplaneRollOnlyFeedEntry;
export function buildAeroplaneFeedEntry(
	step: AeroplaneFeedStep,
	id: number,
	seats: readonly AiSeat[]
): AeroplaneFeedEntry;
export function buildAeroplaneFeedEntry(
	step: AeroplaneFeedStep,
	id: number,
	seats: readonly AiSeat[]
): AeroplaneFeedEntry {
	if (step.move === null) {
		return {
			id,
			move: null,
			events: [],
			action: step.action,
			nextPlayer: step.state.currentPlayer,
		};
	}
	const move = step.move;
	const personality =
		seats.find(seat => seat.color === move.color)?.personality ?? 'cautious';
	let chatter: string | undefined;
	if (step.state.config.chatter) {
		try {
			chatter =
				(step.state.phase === 'finished'
					? getChatterLine(
							{
								kind:
									step.state.winner === step.state.config.humanColor
										? 'win'
										: 'loss',
								token: step.state.winner ?? move.color,
							},
							personality
						)
					: getChatterLine(move, personality)) ?? undefined;
		} catch {
			// Chatter is presentation-only; a malformed line must not affect
			// the committed match or its persistence.
			chatter = undefined;
		}
	}
	return {
		id,
		move,
		events: [...move.events],
		action: step.action,
		...(chatter === undefined ? {} : { chatter }),
	};
}

/**
 * Ephemeral die presentation for the most recent roll.  It is controller UI
 * state only: never persisted, never replayed from a save.
 */
export interface AeroplaneRollPresentation {
	id: number;
	face: number;
	color: AeroplaneColor;
	animate: boolean;
}

export interface ActiveAeroplaneMatch {
	startedAt: string;
	completedAt?: string;
	rootSeed: number;
	config: AeroplaneConfig;
	state: AeroplaneState;
	seats: AiSeat[];
	diceRng: RngState;
	aiRng: RngState;
	actions: AeroplaneActionRecord[];
}

/**
 * Options are captured into refs on the first render and treated as stable for
 * the life of the match. Callers must keep `options` and every referenced
 * callback/configuration value referentially stable across re-renders; later
 * changes to these values are not picked up after the initial render.
 */
export interface UseAeroplaneMatchOptions {
	/** Injected active-match storage, primarily for unit/E2E harnesses. */
	storage?: AeroplaneStorage;
	/** Optional injected diagnostics storage for corrupt-save reports. */
	diagnostics?: AeroplaneStorage;
	/** Initial editable setup before a match is started. */
	initialConfig?: Partial<AeroplaneConfig>;
	/** Alias accepted by callers that already call the setup `config`. */
	config?: Partial<AeroplaneConfig>;
	/** Seed or seed factory for a new match. */
	seed?: number | (() => number);
	/** Test fixture. In production this is ignored unless DEV is enabled. */
	fixture?: AeroplaneE2EFixture;
	/** Test override for import.meta.env.DEV. */
	dev?: boolean;
	/** Test override for window.location.search. */
	search?: string;
	/** Clock injection keeps persisted timestamps deterministic in tests. */
	now?: () => string;
	/** Override the skippable AI delay; production defaults to 650 ms. */
	aiDelayMs?: number;
	/** Override route presentation cleanup delay. */
	presentationMs?: number;
}

export interface UseAeroplaneMatchResult {
	/** Editable setup; it is not changed when the active match is resumed. */
	setup: AeroplaneConfig;
	setSetup(patch: Partial<AeroplaneConfig>): void;
	updateConfig(patch: Partial<AeroplaneConfig>): void;
	/** Frozen config/seats/root seed and mutable authoritative state. */
	activeMatch: ActiveAeroplaneMatch;
	/** Convenience aliases used by board/status components. */
	match: ActiveAeroplaneMatch;
	config: AeroplaneConfig;
	activeConfig: AeroplaneConfig;
	state: AeroplaneState;
	seats: AiSeat[];
	rootSeed: number;
	diceRng: RngState;
	aiRng: RngState;
	actions: AeroplaneActionRecord[];
	legalMoves: ResolvedMove[];
	presentationQueue: AeroplanePresentation[];
	eventFeed: AeroplaneFeedEntry[];
	rollPresentation: AeroplaneRollPresentation | null;
	/**
	 * Latest committed roll with no legal move, for the status live region;
	 * replaced or cleared on the next roll. Ephemeral like rollPresentation —
	 * never persisted, replayed, or gated by skipAnimations.
	 */
	noMoveNotice: AeroplaneRollOnlyFeedEntry | null;
	/** Ephemeral notable human moments; never persisted, cleared on reset/new match/resume. */
	humanMoments: HumanMoment[];
	isAnimating: boolean;
	isHumanTurn: boolean;
	/** Incremented once per successful terminal history POST (via onSaved). */
	historySavedRevision: number;
	roll(): void;
	select(planeId: string): void;
	selectMove(move: ResolvedMove): void;
	reset(input?: Partial<AeroplaneConfig> | number, seed?: number): void;
	newMatch(input?: Partial<AeroplaneConfig> | number, seed?: number): void;
	resume(): boolean;
	skipAnimations(): void;
}

declare global {
	interface Window {
		__PROCYON_AEROPLANE_FIXTURE__?: AeroplaneE2EFixture;
	}
}

function isRng(value: unknown): value is RngState {
	return isRecord(value) && isUint32(value.value) && value.value !== 0;
}

function fixtureFromWindow(): AeroplaneE2EFixture | undefined {
	if (typeof window === 'undefined') return undefined;
	return window.__PROCYON_AEROPLANE_FIXTURE__;
}

function querySeed(search: string | undefined): number | undefined {
	if (!search) return undefined;
	try {
		const value = new URLSearchParams(search).get('e2eSeed');
		if (value === null || !/^\d+$/.test(value)) return undefined;
		const parsed = Number(value);
		return isUint32(parsed) ? parsed : undefined;
	} catch {
		return undefined;
	}
}

function warnDev(message: string, warn?: (message: string) => void): void {
	(warn ?? (messageValue => globalThis.console?.warn(messageValue)))(message);
}

function candidateEnvelope(
	fixture: AeroplaneE2EFixture,
	config: AeroplaneConfig,
	seed: number
): PersistedAeroplaneMatchV2 | null {
	const base = createAeroplaneMatch(config, seed);
	const state = fixture.state ?? base.state;
	const seats = fixture.seats ?? base.seats;
	const diceRng = fixture.diceRng ?? base.diceRng;
	const aiRng = fixture.aiRng ?? base.aiRng;
	if (!validSeats(seats, config.humanColor) || !isRng(diceRng) || !isRng(aiRng))
		return null;
	return {
		version: 2,
		savedAt: new Date(0).toISOString(),
		rootSeed: seed,
		config,
		state,
		seats,
		diceRng,
		aiRng,
		actions: [],
	};
}

/**
 * Resolve the DEV-only query/global fixture contract.  The helper is exported
 * so E2E/unit harnesses can assert the precedence without mounting React.
 */
export function readDevOverrides(
	options: ReadDevOverridesOptions
): AeroplaneDevOverrides {
	if (!options.dev) return {};

	const rawFixture: unknown = options.fixture ?? fixtureFromWindow();
	const query = querySeed(options.search);
	if (rawFixture === undefined)
		return query === undefined ? {} : { seed: query, skipAnimations: true };

	if (!isRecord(rawFixture)) {
		warnDev('Ignoring invalid Aeroplane DEV fixture.', options.warn);
		return query === undefined ? {} : { seed: query, skipAnimations: true };
	}
	const fixture = rawFixture as AeroplaneE2EFixture;

	let seed = query;
	if (fixture.seed !== undefined) {
		if (!isUint32(fixture.seed)) {
			warnDev('Ignoring invalid Aeroplane DEV fixture seed.', options.warn);
		} else {
			seed = fixture.seed;
		}
	}

	let config: AeroplaneConfig | undefined;
	if (fixture.config !== undefined) {
		if (!validConfig(fixture.config)) {
			warnDev('Ignoring invalid Aeroplane DEV fixture config.', options.warn);
		} else {
			config = Object.freeze({ ...fixture.config });
		}
	}
	if (!config && isRecord(fixture.state) && validConfig(fixture.state.config)) {
		config = Object.freeze({ ...fixture.state.config });
	}

	const hasAuthoritativeOverrides =
		fixture.state !== undefined ||
		fixture.seats !== undefined ||
		fixture.diceRng !== undefined ||
		fixture.aiRng !== undefined;
	let state: AeroplaneState | undefined;
	let seats: AiSeat[] | undefined;
	let diceRng: RngState | undefined;
	let aiRng: RngState | undefined;
	if (hasAuthoritativeOverrides) {
		const candidateConfig = config ?? CLASSIC_CONFIG;
		const candidateSeed = seed ?? 1;
		const candidate = candidateEnvelope(
			{
				...fixture,
				config: candidateConfig,
			},
			candidateConfig,
			candidateSeed
		);
		if (!candidate || !validatePersistedAeroplaneMatch(candidate).ok) {
			warnDev('Ignoring invalid Aeroplane DEV fixture state.', options.warn);
		} else {
			state = fixture.state;
			seats = fixture.seats;
			diceRng = fixture.diceRng;
			aiRng = fixture.aiRng;
		}
	}

	const hasSeed = seed !== undefined;
	const explicitSkip = typeof fixture.skipAnimations === 'boolean';
	return {
		...(seed === undefined ? {} : { seed }),
		...(config === undefined ? {} : { config }),
		...(state === undefined ? {} : { state }),
		...(seats === undefined ? {} : { seats }),
		...(diceRng === undefined ? {} : { diceRng }),
		...(aiRng === undefined ? {} : { aiRng }),
		...(explicitSkip
			? { skipAnimations: fixture.skipAnimations }
			: hasSeed
				? { skipAnimations: true }
				: {}),
	};
}

function freezeConfig(config: AeroplaneConfig): AeroplaneConfig {
	return Object.freeze({ ...config });
}

function freezeSeats(seats: AiSeat[]): AiSeat[] {
	return Object.freeze(
		seats.map(seat => Object.freeze({ ...seat }))
	) as unknown as AiSeat[];
}

function activeFromPersisted(
	value: PersistedAeroplaneMatchV2
): ActiveAeroplaneMatch {
	const config = freezeConfig(value.config);
	const completedAt =
		value.completedAt ??
		(value.state.phase === 'finished' ? value.savedAt : undefined);
	return {
		startedAt: value.startedAt ?? value.savedAt,
		...(completedAt === undefined ? {} : { completedAt }),
		rootSeed: value.rootSeed,
		config,
		state: { ...value.state, config },
		seats: freezeSeats(value.seats),
		diceRng: { value: value.diceRng.value },
		aiRng: { value: value.aiRng.value },
		actions: value.actions.map(action => ({
			...action,
			events: [...action.events],
		})),
	};
}

function nextSeed(input: number | (() => number) | undefined): number {
	const candidate = typeof input === 'function' ? input() : input;
	return normalizeRngState(candidate ?? Date.now()).value;
}

function activeFromFresh(
	configInput: Partial<AeroplaneConfig>,
	seed: number,
	overrides: AeroplaneDevOverrides = {},
	startedAt: string
): ActiveAeroplaneMatch {
	const normalizedSeed = normalizeRngState(seed).value;
	const fixtureConfig =
		overrides.config ??
		(overrides.state?.config as AeroplaneConfig | undefined);
	const config = freezeConfig(normalizeConfig(fixtureConfig ?? configInput));
	const base = createAeroplaneMatch(config, normalizedSeed);
	const state = overrides.state ? { ...overrides.state, config } : base.state;
	const completedAt = state.phase === 'finished' ? startedAt : undefined;
	return {
		startedAt,
		...(completedAt === undefined ? {} : { completedAt }),
		rootSeed: normalizedSeed,
		config,
		state,
		seats: freezeSeats(overrides.seats ?? base.seats),
		diceRng: { ...(overrides.diceRng ?? base.diceRng) },
		aiRng: { ...(overrides.aiRng ?? base.aiRng) },
		actions: [],
	};
}

function isHumanTurn(match: ActiveAeroplaneMatch): boolean {
	return match.state.currentPlayer === match.config.humanColor;
}

function actionRecord(
	actor: AeroplaneActionActor,
	color: AeroplaneColor,
	roll: number,
	state: AeroplaneState,
	options: {
		selectedPlaneId?: string | null;
		events?: (AeroplaneEvent | TycoonEffectEvent)[];
	} = {}
): AeroplaneActionRecord {
	return {
		kind: options.selectedPlaneId === undefined ? 'roll' : 'move',
		actor,
		color,
		roll,
		selectedPlaneId:
			options.selectedPlaneId === undefined ? null : options.selectedPlaneId,
		events: options.events ? [...options.events] : [],
		checksum: checksumState(state),
	};
}

function persistedEnvelope(
	match: ActiveAeroplaneMatch,
	now: () => string
): PersistedAeroplaneMatchV2 {
	return {
		version: 2,
		savedAt: now(),
		startedAt: match.startedAt,
		...(match.completedAt === undefined
			? {}
			: { completedAt: match.completedAt }),
		rootSeed: match.rootSeed,
		config: match.config,
		state: match.state,
		seats: match.seats,
		diceRng: match.diceRng,
		aiRng: match.aiRng,
		actions: match.actions,
	};
}

function asPartialConfig(
	input: Partial<AeroplaneConfig> | number | undefined,
	setup: AeroplaneConfig
): Partial<AeroplaneConfig> {
	if (typeof input === 'number' || input === undefined) return setup;
	return input;
}

function mergeSetup(
	previous: AeroplaneConfig,
	patch: Partial<AeroplaneConfig>
): AeroplaneConfig {
	if (
		patch.rulePreset !== undefined &&
		patch.rulePreset !== previous.rulePreset &&
		patch.rulePreset !== 'custom'
	) {
		const preset = normalizeConfig({ rulePreset: patch.rulePreset });
		return normalizeConfig({
			...preset,
			mode: patch.mode ?? previous.mode,
			humanColor: patch.humanColor ?? previous.humanColor,
			chatter: patch.chatter ?? previous.chatter,
			...patch,
		});
	}
	// Mode is independent of the rule preset: a mode-only patch keeps it.
	const modeOnly = Object.keys(patch).every(key => key === 'mode');
	return normalizeConfig({
		...previous,
		...patch,
		rulePreset: patch.rulePreset ?? (modeOnly ? previous.rulePreset : 'custom'),
	});
}

function humanStats(match: ActiveAeroplaneMatch) {
	const color = match.config.humanColor;
	return {
		finished: match.state.stats.finished[color],
		capturesMade: match.state.stats.capturesMade[color],
		capturesSuffered: match.state.stats.capturesSuffered[color],
	};
}

function elapsedSeconds(
	match: ActiveAeroplaneMatch,
	completionTimestamp: string
): number {
	const startedMs = Date.parse(match.startedAt);
	const completedMs = Date.parse(completionTimestamp);
	if (!Number.isFinite(startedMs) || !Number.isFinite(completedMs)) return 0;
	return Math.max(0, Math.floor((completedMs - startedMs) / 1000));
}

export function buildAeroplaneHistoryPayload(
	match: ActiveAeroplaneMatch,
	now: () => string = () => new Date().toISOString()
): SubmitPlayHistoryInput {
	const stats = humanStats(match);
	const date = now();
	return {
		gameId: 'aeroplane',
		status: match.state.winner === match.config.humanColor ? 'win' : 'loss',
		date,
		opponentEngineId: 'aeroplane-trio-v1',
		details: {
			mode: match.config.mode,
			...(match.state.tycoon ? { coins: { ...match.state.tycoon.coins } } : {}),
			rulePreset: match.config.rulePreset,
			victoryTarget: match.config.victoryTarget,
			diceMode: match.config.diceMode,
			launchRule: match.config.launchRule,
			finishRule: match.config.finishRule,
			stacking: match.config.stacking,
			blockades: match.config.blockades,
			chatter: match.config.chatter,
			humanColor: match.config.humanColor,
			durationSeconds: elapsedSeconds(
				match,
				match.completedAt ?? match.startedAt
			),
			planesFinished: stats.finished,
			capturesMade: stats.capturesMade,
			capturesSuffered: stats.capturesSuffered,
			aiPlayers: match.seats.map(seat => ({
				color: seat.color,
				personality: seat.personality,
			})),
		},
	};
}

/**
 * Derive the display-only feed from the saved action history once.  The
 * authoritative match is never touched: a replay mismatch or invalid history
 * yields an empty feed plus a DEV-only diagnostic and keeps live play, AI
 * resume scheduling and persistence exactly as before.
 */
function reconstructFeed(
	value: PersistedAeroplaneMatchV2,
	seats: readonly AiSeat[],
	nextId: () => number,
	dev: boolean
): AeroplaneFeedEntry[] {
	const result = replayMatch(value);
	if (result.kind !== 'ok') {
		if (dev) {
			globalThis.console?.warn(
				`Aeroplane feed reconstruction skipped (${result.kind}): ${result.reason}`
			);
		}
		return [];
	}
	return result.steps.map(step =>
		buildAeroplaneFeedEntry(step, nextId(), seats)
	);
}

/**
 * Own the local Aeroplane match lifecycle while keeping all movement/dice/AI
 * decisions in the reviewed pure modules.  The controller stores one active
 * authoritative envelope and only then schedules route presentation.
 */
export function useAeroplaneMatch(
	auth: AuthSnapshot,
	options: UseAeroplaneMatchOptions = {}
): UseAeroplaneMatchResult {
	const { isAuthenticated, user } = auth;
	const optionsRef = useRef(options);
	const storageRef = useRef(options.storage);
	const diagnosticsRef = useRef(options.diagnostics);
	const nowRef = useRef(options.now ?? (() => new Date().toISOString()));
	const aiDelayRef = useRef(options.aiDelayMs ?? AEROPLANE_AI_DELAY_MS);
	const presentationMsRef = useRef(
		options.presentationMs ?? AEROPLANE_PRESENTATION_MS
	);
	const initialRef = useRef<{
		active: ActiveAeroplaneMatch;
		overrides: AeroplaneDevOverrides;
		setup: AeroplaneConfig;
		feed: AeroplaneFeedEntry[];
	} | null>(null);
	const devRef = useRef(options.dev ?? import.meta.env.DEV);
	if (initialRef.current === null) {
		const dev = devRef.current;
		const search =
			options.search ??
			(typeof window === 'undefined' ? undefined : window.location?.search);
		const overrides = readDevOverrides({
			dev,
			search,
			fixture: options.fixture,
		});
		const seed = overrides.seed ?? nextSeed(options.seed);
		const restored = restoreActiveMatch(
			storageRef.current,
			diagnosticsRef.current
		);
		const fixtureIsAuthoritative =
			overrides.seed !== undefined ||
			overrides.config !== undefined ||
			overrides.state !== undefined ||
			overrides.seats !== undefined ||
			overrides.diceRng !== undefined ||
			overrides.aiRng !== undefined;
		const active =
			!fixtureIsAuthoritative && restored.kind === 'ok'
				? activeFromPersisted(restored.match)
				: activeFromFresh(
						options.initialConfig ?? options.config ?? {},
						seed,
						overrides,
						nowRef.current()
					);
		let restoredFeed: AeroplaneFeedEntry[] = [];
		if (!fixtureIsAuthoritative && restored.kind === 'ok') {
			// Sequential display ids 1..N; presentationIdRef seeds from the count.
			let nextId = 0;
			restoredFeed = reconstructFeed(
				restored.match,
				active.seats,
				() => {
					nextId += 1;
					return nextId;
				},
				dev
			);
		}
		initialRef.current = {
			active,
			overrides,
			setup: { ...active.config },
			feed: restoredFeed,
		};
	}

	const initial = initialRef.current;
	if (!initial) throw new Error('Aeroplane controller failed to initialize');

	const [activeMatch, setActiveMatch] = useState<ActiveAeroplaneMatch>(
		initial.active
	);
	const [setup, setSetupState] = useState<AeroplaneConfig>(initial.setup);
	const [presentationQueue, setPresentationQueue] = useState<
		AeroplanePresentation[]
	>([]);
	// Start empty on server and client: production SSR has no storage, so
	// the server renders an empty feed and the first client render must match
	// it to hydrate cleanly. The derived feed publishes after mount.
	const [eventFeed, setEventFeed] = useState<AeroplaneFeedEntry[]>([]);
	const [rollPresentation, setRollPresentation] =
		useState<AeroplaneRollPresentation | null>(null);
	const [noMoveNotice, setNoMoveNotice] =
		useState<AeroplaneRollOnlyFeedEntry | null>(null);
	const [humanMoments, setHumanMoments] = useState<HumanMoment[]>([]);
	// Bumped by every successful terminal POST (via onSaved, not the guarded
	// onSuccess) so server-sourced progress can refresh, including for a save
	// that resolves after the terminal match was reset.
	const [historySavedRevision, setHistorySavedRevision] = useState<number>(0);
	const activeRef = useRef(activeMatch);
	activeRef.current = activeMatch;
	const setupRef = useRef(setup);
	setupRef.current = setup;
	const generationRef = useRef(0);
	const aiTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const presentationTimersRef = useRef(
		new Set<ReturnType<typeof setTimeout>>()
	);
	const presentationIdRef = useRef(initial.feed.length);
	const rollIdRef = useRef(0);
	const skipAnimationsRef = useRef(initial.overrides.skipAnimations ?? false);

	const clearPresentation = useCallback(() => {
		for (const timer of presentationTimersRef.current) clearTimeout(timer);
		presentationTimersRef.current.clear();
		setPresentationQueue([]);
	}, []);

	const invalidateTimers = useCallback(() => {
		generationRef.current += 1;
		if (aiTimerRef.current !== null) {
			clearTimeout(aiTimerRef.current);
			aiTimerRef.current = null;
		}
		for (const timer of presentationTimersRef.current) clearTimeout(timer);
		presentationTimersRef.current.clear();
		setPresentationQueue([]);
		setEventFeed([]);
		setRollPresentation(null);
		setNoMoveNotice(null);
	}, []);

	const save = useCallback((match: ActiveAeroplaneMatch) => {
		saveActiveMatch(
			persistedEnvelope(match, nowRef.current),
			storageRef.current
		);
	}, []);

	const commit = useCallback(
		(next: ActiveAeroplaneMatch) => {
			activeRef.current = next;
			setActiveMatch(next);
			// The synchronous save is intentional: a reload immediately after a
			// roll must retain awaiting-choice and the consumed dice stream.
			save(next);
		},
		[save]
	);

	const enqueuePresentation = useCallback(
		(step: AeroplaneFeedStep & { readonly move: ResolvedMove }) => {
			if (skipAnimationsRef.current) return;
			const item = buildAeroplaneFeedEntry(
				step,
				(presentationIdRef.current += 1),
				activeRef.current.seats
			);
			setPresentationQueue(previous => [...previous, item]);
			setEventFeed(previous => [...previous, item]);
			const timer = setTimeout(
				() => {
					presentationTimersRef.current.delete(timer);
					setPresentationQueue(previous =>
						previous.filter(candidate => candidate.id !== item.id)
					);
				},
				Math.max(0, presentationMsRef.current)
			);
			presentationTimersRef.current.add(timer);
		},
		[]
	);

	const applyMove = useCallback(
		(
			move: ResolvedMove,
			actor: AeroplaneActionActor,
			aiRng: RngState | undefined = undefined
		) => {
			const current = activeRef.current;
			if (
				current.state.phase !== 'awaiting-choice' ||
				current.state.currentPlayer !== move.color
			)
				return false;
			let transition;
			try {
				transition = playResolvedMove(current.state, move);
			} catch {
				return false;
			}
			const action = actionRecord(
				actor,
				move.color,
				move.roll,
				transition.state,
				{
					selectedPlaneId: move.planeId,
					events: [...transition.events, ...transition.effectEvents],
				}
			);
			const next: ActiveAeroplaneMatch = {
				...current,
				...(transition.state.phase === 'finished'
					? {
							completedAt: current.completedAt ?? nowRef.current(),
						}
					: { completedAt: undefined }),
				state: transition.state,
				aiRng: aiRng ?? current.aiRng,
				actions: [...current.actions, action],
			};
			// Commit both authoritative state and its action before exposing any
			// route animation. A renderer can therefore be interrupted safely.
			commit(next);
			// Notable moments are ephemeral and independent of the feed: recorded
			// before the (possibly skipped) presentation so Skip animations never
			// suppress them.
			const moment = deriveHumanMoment(
				current.state,
				transition,
				current.config.humanColor
			);
			if (moment) {
				setHumanMoments(previous => [...previous, moment]);
			}
			// The board/feed/cues animate the effective result, not the selection.
			enqueuePresentation({
				action,
				move: transition.move,
				state: transition.state,
			});
			return true;
		},
		[commit, enqueuePresentation]
	);

	const scheduleAiDecision = useCallback(
		(legalMoves: ResolvedMove[], generation: number) => {
			if (aiTimerRef.current !== null) return;
			const delay = skipAnimationsRef.current
				? 0
				: Math.max(0, aiDelayRef.current);
			aiTimerRef.current = setTimeout(() => {
				aiTimerRef.current = null;
				if (generationRef.current !== generation) return;
				const current = activeRef.current;
				if (
					current.state.phase !== 'awaiting-choice' ||
					current.state.currentPlayer === current.config.humanColor
				)
					return;
				const seat = current.seats.find(
					candidate => candidate.color === current.state.currentPlayer
				);
				if (!seat) return;
				const choice = chooseAiMove(
					current.state,
					legalMoves,
					seat.personality,
					current.aiRng
				);
				applyMove(choice.move, 'ai', choice.rng);
			}, delay);
		},
		[applyMove]
	);

	const executeRoll = useCallback(
		(actor: AeroplaneActionActor) => {
			const current = activeRef.current;
			if (current.state.phase !== 'awaiting-roll') return;
			if (actor === 'human' && !isHumanTurn(current)) return;
			if (actor === 'ai' && isHumanTurn(current)) return;
			const result = rollTurn(current.state, current.diceRng);
			const nextDiceRng = result.rng ?? current.diceRng;
			const rollAction = actionRecord(
				actor,
				current.state.currentPlayer,
				result.roll,
				result.state,
				{ events: result.effectEvents }
			);
			const rolled: ActiveAeroplaneMatch = {
				...current,
				state: result.state,
				diceRng: nextDiceRng,
				actions: [...current.actions, rollAction],
			};
			commit(rolled);
			setRollPresentation({
				id: (rollIdRef.current += 1),
				face: result.roll,
				color: current.state.currentPlayer,
				animate: !skipAnimationsRef.current,
			});
			// The roll-only entry doubles as the status notice: the live region
			// must announce a no-move roll even when the feed is suppressed.
			const rollOnlyEntry: AeroplaneRollOnlyFeedEntry | null =
				result.legalMoves.length === 0
					? buildAeroplaneFeedEntry(
							{ action: rollAction, move: null, state: result.state },
							(presentationIdRef.current += 1),
							current.seats
						)
					: null;
			setNoMoveNotice(rollOnlyEntry);
			if (rollOnlyEntry !== null && !skipAnimationsRef.current) {
				setEventFeed(previous => [...previous, rollOnlyEntry]);
			}
			if (result.legalMoves.length === 0) return;
			if (actor === 'human') {
				if (result.legalMoves.length === 1) {
					applyMove(result.legalMoves[0]!, 'human');
				}
				return;
			}
			scheduleAiDecision(result.legalMoves, generationRef.current);
		},
		[applyMove, commit, scheduleAiDecision]
	);

	const scheduleAiRoll = useCallback(
		(generation: number) => {
			if (aiTimerRef.current !== null) return;
			aiTimerRef.current = setTimeout(
				() => {
					aiTimerRef.current = null;
					if (generationRef.current !== generation) return;
					executeRoll('ai');
				},
				// Unlike scheduleAiDecision (where skipAnimations forces 0 because
				// decisions can be scheduled while animations are skipped), the
				// awaiting-roll effect already short-circuits to the immediate path
				// before this runs, so the plain delay suffices.
				Math.max(0, aiDelayRef.current)
			);
		},
		[executeRoll]
	);

	const roll = useCallback(() => executeRoll('human'), [executeRoll]);

	const selectMove = useCallback(
		(move: ResolvedMove) => {
			const current = activeRef.current;
			if (!isHumanTurn(current)) return;
			applyMove(move, 'human');
		},
		[applyMove]
	);

	const select = useCallback(
		(planeId: string) => {
			const current = activeRef.current;
			if (
				!isHumanTurn(current) ||
				current.state.phase !== 'awaiting-choice' ||
				current.state.pendingRoll === null
			)
				return;
			const move = getLegalMoves(current.state, current.state.pendingRoll).find(
				candidate => candidate.planeId === planeId
			);
			if (move) applyMove(move, 'human');
		},
		[applyMove]
	);

	const startFresh = useCallback(
		(input?: Partial<AeroplaneConfig> | number, requestedSeed?: number) => {
			invalidateTimers();
			const patch = asPartialConfig(input, setupRef.current);
			const config = mergeSetup(setupRef.current, patch);
			const seed =
				typeof input === 'number'
					? input
					: (requestedSeed ?? nextSeed(optionsRef.current.seed));
			const next = activeFromFresh(
				config,
				normalizeRngState(seed).value,
				{},
				nowRef.current()
			);
			setSetupState(config);
			setupRef.current = config;
			setEventFeed([]);
			setHumanMoments([]);
			skipAnimationsRef.current = false;
			commit(next);
		},
		[commit, invalidateTimers]
	);

	const reset = useCallback(
		(input?: Partial<AeroplaneConfig> | number, requestedSeed?: number) => {
			startFresh(input, requestedSeed);
		},
		[startFresh]
	);

	const newMatch = useCallback(
		(input?: Partial<AeroplaneConfig> | number, requestedSeed?: number) => {
			startFresh(input, requestedSeed);
		},
		[startFresh]
	);

	const resume = useCallback((): boolean => {
		const restored = restoreActiveMatch(
			storageRef.current,
			diagnosticsRef.current
		);
		// A failed restore must leave the live match untouched — including any
		// pending AI timer, which generation-bumping here would strand.
		if (restored.kind !== 'ok') return false;
		invalidateTimers();
		const next = activeFromPersisted(restored.match);
		const editableSetup = { ...next.config };
		setSetupState(editableSetup);
		setupRef.current = editableSetup;
		presentationIdRef.current = 0;
		setEventFeed(
			reconstructFeed(
				restored.match,
				next.seats,
				() => (presentationIdRef.current += 1),
				devRef.current
			)
		);
		setHumanMoments([]);
		commit(next);
		return true;
	}, [commit, invalidateTimers]);

	const setSetup = useCallback((patch: Partial<AeroplaneConfig>) => {
		setSetupState(previous => {
			const next = mergeSetup(previous, patch);
			setupRef.current = next;
			return next;
		});
	}, []);

	const skipAnimations = useCallback(() => {
		clearPresentation();
		setRollPresentation(previous =>
			previous === null ? null : { ...previous, animate: false }
		);
	}, [clearPresentation]);

	// Publish the derived feed once after mount. initial.feed is computed
	// during first-render initialization only, presentation ids already start
	// beyond it, and no timer or user commit can run before this mount effect
	// — so restored entries land first and a live append can neither be lost
	// nor duplicated.
	useEffect(() => {
		if (initial.feed.length > 0) {
			setEventFeed(initial.feed);
		}
	}, [initial.feed]);

	// Persist a newly-created match and drive AI turns, including red-first
	// turns when a human chooses yellow/blue/green. The generation guard keeps
	// a timer from committing after reset or unmount. Rolling is authoritative
	// immediately; AI rolls and decisions share one paced timer slot so the
	// previous die face stays visible.
	useEffect(() => {
		save(activeRef.current);
	}, [save]);

	useEffect(() => {
		const current = activeMatch;
		if (isHumanTurn(current) || aiTimerRef.current !== null) return;
		const generation = generationRef.current;
		if (current.state.phase === 'awaiting-roll') {
			if (skipAnimationsRef.current) {
				executeRoll('ai');
				return;
			}
			scheduleAiRoll(generation);
			return;
		}
		if (
			current.state.phase !== 'awaiting-choice' ||
			current.state.pendingRoll === null
		)
			return;
		const legalMoves = getLegalMoves(current.state, current.state.pendingRoll);
		if (legalMoves.length > 0) scheduleAiDecision(legalMoves, generation);
		return undefined;
	}, [activeMatch, executeRoll, scheduleAiDecision, scheduleAiRoll]);

	useEffect(() => {
		return () => {
			generationRef.current += 1;
			if (aiTimerRef.current !== null) clearTimeout(aiTimerRef.current);
			for (const timer of presentationTimersRef.current) clearTimeout(timer);
			presentationTimersRef.current.clear();
		};
	}, []);

	const humanTurn = isHumanTurn(activeMatch);

	const legalMoves = useMemo(() => {
		if (
			!humanTurn ||
			activeMatch.state.phase !== 'awaiting-choice' ||
			activeMatch.state.pendingRoll === null
		)
			return [];
		return getLegalMoves(activeMatch.state, activeMatch.state.pendingRoll);
	}, [activeMatch, humanTurn]);

	useTerminalHistorySave({
		enabled: activeMatch !== null,
		isTerminal: activeMatch.state.phase === 'finished',
		isAuthenticated,
		userId: user?.id,
		buildPayload: () =>
			activeMatch.state.phase === 'finished'
				? buildAeroplaneHistoryPayload(activeMatch, nowRef.current)
				: null,
		debugKey: 'AEROPLANE',
		onBeforeFirstAttempt: () => {
			// The terminal snapshot is a restorable non-idempotent submission. Clear
			// it before transport so an ambiguous outcome cannot be resubmitted after
			// reload, while the identity guard protects a synchronously persisted
			// replacement match.
			if (
				activeRef.current !== activeMatch ||
				activeMatch.state.phase !== 'finished'
			)
				return;
			clearActiveMatch(storageRef.current);
		},
		onSaved: () => {
			setHistorySavedRevision(value => value + 1);
		},
		onSuccess: () => {
			// A response can resolve after a replacement match has already been
			// persisted but before the shared hook's generation effect runs. Only
			// clear the snapshot owned by this terminal match.
			if (
				activeRef.current !== activeMatch ||
				activeMatch.state.phase !== 'finished'
			)
				return;
			clearActiveMatch(storageRef.current);
		},
	});

	return {
		setup,
		setSetup,
		updateConfig: setSetup,
		activeMatch,
		match: activeMatch,
		config: activeMatch.config,
		activeConfig: activeMatch.config,
		state: activeMatch.state,
		seats: activeMatch.seats,
		rootSeed: activeMatch.rootSeed,
		diceRng: activeMatch.diceRng,
		aiRng: activeMatch.aiRng,
		actions: activeMatch.actions,
		legalMoves,
		presentationQueue,
		eventFeed,
		rollPresentation,
		noMoveNotice,
		humanMoments,
		isAnimating: presentationQueue.length > 0,
		isHumanTurn: humanTurn,
		historySavedRevision,
		roll,
		select,
		selectMove,
		reset,
		newMatch,
		resume,
		skipAnimations,
	};
}

export { ACTIVE_MATCH_STORAGE_KEY };
