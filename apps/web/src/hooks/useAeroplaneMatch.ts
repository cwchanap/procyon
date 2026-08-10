import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../lib/auth';
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
	PersistedAeroplaneMatchV1,
	ResolvedMove,
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
	eventFeed: AeroplanePresentation[];
	isAnimating: boolean;
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
): PersistedAeroplaneMatchV1 | null {
	const base = createAeroplaneMatch(config, seed);
	const state = fixture.state ?? base.state;
	const seats = fixture.seats ?? base.seats;
	const diceRng = fixture.diceRng ?? base.diceRng;
	const aiRng = fixture.aiRng ?? base.aiRng;
	if (!validSeats(seats, config.humanColor) || !isRng(diceRng) || !isRng(aiRng))
		return null;
	return {
		version: 1,
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
	value: PersistedAeroplaneMatchV1
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
		events?: AeroplaneEvent[];
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
): PersistedAeroplaneMatchV1 {
	return {
		version: 1,
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
			humanColor: patch.humanColor ?? previous.humanColor,
			chatter: patch.chatter ?? previous.chatter,
			...patch,
		});
	}
	return normalizeConfig({
		...previous,
		...patch,
		rulePreset: patch.rulePreset ?? 'custom',
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

function buildAeroplaneHistoryPayload(
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
 * Own the local Aeroplane match lifecycle while keeping all movement/dice/AI
 * decisions in the reviewed pure modules.  The controller stores one active
 * authoritative envelope and only then schedules route presentation.
 */
export function useAeroplaneMatch(
	options: UseAeroplaneMatchOptions = {}
): UseAeroplaneMatchResult {
	const { isAuthenticated, user } = useAuth();
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
	} | null>(null);
	if (initialRef.current === null) {
		const dev = options.dev ?? import.meta.env.DEV;
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
		initialRef.current = {
			active,
			overrides,
			setup: { ...active.config },
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
	const [eventFeed, setEventFeed] = useState<AeroplanePresentation[]>([]);
	const activeRef = useRef(activeMatch);
	activeRef.current = activeMatch;
	const setupRef = useRef(setup);
	setupRef.current = setup;
	const generationRef = useRef(0);
	const aiTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const presentationTimersRef = useRef(
		new Set<ReturnType<typeof setTimeout>>()
	);
	const presentationIdRef = useRef(0);
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
		(move: ResolvedMove, action: AeroplaneActionRecord) => {
			if (skipAnimationsRef.current) return;
			const committed = activeRef.current;
			const personality =
				committed.seats.find(seat => seat.color === move.color)?.personality ??
				'cautious';
			let chatter: string | undefined;
			if (committed.config.chatter) {
				try {
					chatter =
						(committed.state.phase === 'finished'
							? getChatterLine(
									{
										kind:
											committed.state.winner === committed.config.humanColor
												? 'win'
												: 'loss',
										token: committed.state.winner ?? move.color,
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
			const item: AeroplanePresentation = {
				id: (presentationIdRef.current += 1),
				move,
				events: [...move.events],
				action,
				...(chatter === undefined ? {} : { chatter }),
			};
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
					events: transition.events,
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
			enqueuePresentation(move, action);
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
				result.state
			);
			const rolled: ActiveAeroplaneMatch = {
				...current,
				state: result.state,
				diceRng: nextDiceRng,
				actions: [...current.actions, rollAction],
			};
			commit(rolled);
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
		invalidateTimers();
		const restored = restoreActiveMatch(
			storageRef.current,
			diagnosticsRef.current
		);
		if (restored.kind !== 'ok') return false;
		const next = activeFromPersisted(restored.match);
		const editableSetup = { ...next.config };
		setSetupState(editableSetup);
		setupRef.current = editableSetup;
		setEventFeed([]);
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
	}, [clearPresentation]);

	// Persist a newly-created match and drive AI turns, including red-first
	// turns when a human chooses yellow/blue/green. The generation guard keeps
	// a timer from committing after reset or unmount. Rolling is authoritative
	// immediately; only the AI decision/presentation pause is delayed.
	useEffect(() => {
		save(activeRef.current);
	}, [save]);

	useEffect(() => {
		const current = activeMatch;
		if (isHumanTurn(current) || aiTimerRef.current !== null) return;
		const generation = generationRef.current;
		if (current.state.phase === 'awaiting-roll') {
			executeRoll('ai');
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
	}, [activeMatch, executeRoll, scheduleAiDecision]);

	useEffect(() => {
		return () => {
			generationRef.current += 1;
			if (aiTimerRef.current !== null) clearTimeout(aiTimerRef.current);
			for (const timer of presentationTimersRef.current) clearTimeout(timer);
			presentationTimersRef.current.clear();
		};
	}, []);

	const legalMoves = useMemo(() => {
		if (
			activeMatch.state.phase !== 'awaiting-choice' ||
			activeMatch.state.pendingRoll === null
		)
			return [];
		return getLegalMoves(activeMatch.state, activeMatch.state.pendingRoll);
	}, [activeMatch]);

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
		isAnimating: presentationQueue.length > 0,
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
