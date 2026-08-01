import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { AIConfig } from '../lib/ai/types';
import {
	createDefaultRivalPreferences,
	persistHumanSide,
	persistRivalKind,
	readRivalPreferences,
	RIVAL_PREFERENCES_STORAGE_KEY,
	type RivalPreferenceStorage,
	type RivalPreferencesV1,
} from '../lib/chess/rival/preferences';
import {
	runEnginePreflight,
	type EngineCapabilityEnvironment,
} from '../lib/chess/rival/engine-preflight';
import {
	resolveSetup,
	type ResolvedSetupKind,
} from '../lib/chess/rival/resolve-setup';
import type {
	ChessSide,
	EnginePreflight,
	GameSetup,
	LlmUsability,
	RivalKind,
} from '../lib/chess/rival/types';

type FallbackNotice = NonNullable<ResolvedSetupKind['notice']>;
type StartBlockedReasonCode = NonNullable<
	ResolvedSetupKind['startBlockedReason']
>;

export interface ChessRivalAuthSnapshot {
	isAuthenticated: boolean;
	loading: boolean;
	revalidated?: boolean;
}

export interface ChessRivalAIConfigSnapshot {
	config: Pick<AIConfig, 'provider' | 'model' | 'apiKey' | 'enabled'>;
	hydrated: boolean;
	hydrateError: boolean;
	configPending?: boolean;
}

export interface UseChessRivalSetupOptions {
	auth: ChessRivalAuthSnapshot;
	aiConfig: ChessRivalAIConfigSnapshot;
	isGameActive?: boolean;
	isStarting?: boolean;
	storage?: RivalPreferenceStorage;
	enginePreflight?: EnginePreflight;
	engineEnvironment?: EngineCapabilityEnvironment;
	onSetupChange?: (setup: GameSetup) => void;
}

export interface UseChessRivalSetupResult {
	resolved: boolean;
	setup: GameSetup;
	enginePreflight: EnginePreflight;
	llmUsability: LlmUsability;
	fallbackNotice: FallbackNotice | null;
	startBlockedReason: string | null;
	selectRival(kind: RivalKind): void;
	selectHumanSide(side: ChessSide): void;
	clearFallbackNotice(): void;
}

const defaultSetup: GameSetup = {
	rivalKind: 'engine',
	humanSide: 'white',
};

const startBlockedMessages: Record<StartBlockedReasonCode, string> = {
	'llm-loading': 'AI opponent configuration is still loading.',
	'llm-unusable':
		'Sign in and configure an AI provider before starting a language-model opponent.',
	'engine-unsupported':
		'This device cannot run the local chess engine. Choose a language-model opponent instead.',
};

function getClientStorage(
	storage?: RivalPreferenceStorage
): RivalPreferenceStorage | null {
	if (storage) {
		return storage;
	}
	if (typeof window === 'undefined') {
		return null;
	}
	return window.localStorage;
}

function readPreferencesOnce(storage: RivalPreferenceStorage | null): {
	preferences: RivalPreferencesV1;
	rememberedKind: RivalKind | null;
} {
	if (storage === null) {
		return {
			preferences: createDefaultRivalPreferences(),
			rememberedKind: null,
		};
	}

	const raw = storage.getItem(RIVAL_PREFERENCES_STORAGE_KEY);
	const cachedStorage: RivalPreferenceStorage = {
		getItem: key => {
			if (key === RIVAL_PREFERENCES_STORAGE_KEY) {
				return raw;
			}
			return storage.getItem(key);
		},
		setItem: (key, value) => {
			storage.setItem(key, value);
		},
	};

	const preferences = readRivalPreferences(cachedStorage);
	return {
		preferences,
		rememberedKind: raw === null ? null : preferences.lastRivalKind,
	};
}

function resolveLlmUsability(
	auth: ChessRivalAuthSnapshot,
	aiConfig: ChessRivalAIConfigSnapshot
): LlmUsability {
	if (auth.loading) {
		return { status: 'loading' };
	}
	if (!auth.isAuthenticated) {
		return { status: 'signed-out' };
	}
	if (auth.revalidated === false) {
		return { status: 'loading' };
	}
	if (aiConfig.hydrateError) {
		return { status: 'unconfigured' };
	}
	if (aiConfig.configPending || !aiConfig.hydrated) {
		return { status: 'loading' };
	}

	const { config } = aiConfig;
	if (!config.enabled || !config.apiKey.trim() || !config.model.trim()) {
		return { status: 'unconfigured' };
	}

	return {
		status: 'available',
		provider: config.provider,
		model: config.model,
	};
}

function startBlockedReasonFor(
	rivalKind: RivalKind,
	enginePreflight: EnginePreflight,
	llmUsability: LlmUsability
): string | null {
	const resolved = resolveSetup({
		rememberedKind: null,
		enginePreflight,
		llmUsability,
		setupTouched: false,
		explicitKind: rivalKind,
	});
	if (!resolved.startBlockedReason) {
		return null;
	}
	if (resolved.startBlockedReason === 'engine-unsupported') {
		return enginePreflight.status === 'unsupported'
			? enginePreflight.message
			: startBlockedMessages['engine-unsupported'];
	}
	return startBlockedMessages[resolved.startBlockedReason];
}

function setupForResolution(
	preferences: RivalPreferencesV1,
	resolution: ResolvedSetupKind
): GameSetup {
	return {
		rivalKind: resolution.kind,
		humanSide: preferences.humanSideByRival[resolution.kind],
	};
}

function setupsEqual(left: GameSetup, right: GameSetup): boolean {
	return (
		left.rivalKind === right.rivalKind && left.humanSide === right.humanSide
	);
}

function visibleFallbackNotice(
	notice: FallbackNotice | undefined,
	clearedNotice: FallbackNotice | null
): FallbackNotice | null {
	if (!notice || notice === clearedNotice) {
		return null;
	}
	return notice;
}

export function useChessRivalSetup({
	auth,
	aiConfig,
	isGameActive = false,
	isStarting = false,
	storage,
	enginePreflight: injectedEnginePreflight,
	engineEnvironment,
	onSetupChange,
}: UseChessRivalSetupOptions): UseChessRivalSetupResult {
	const storageRef = useRef<RivalPreferenceStorage | null>(null);
	const setupTouchedRef = useRef(false);
	const explicitKindRef = useRef<RivalKind | null>(null);
	const rememberedKindRef = useRef<RivalKind | null>(null);
	const clearedFallbackNoticeRef = useRef<FallbackNotice | null>(null);
	const [resolved, setResolved] = useState(false);
	const [preferences, setPreferences] = useState<RivalPreferencesV1>(() =>
		createDefaultRivalPreferences()
	);
	const [setup, setSetup] = useState<GameSetup>(defaultSetup);
	const [fallbackNotice, setFallbackNotice] = useState<FallbackNotice | null>(
		null
	);

	const enginePreflight = useMemo(
		() => injectedEnginePreflight ?? runEnginePreflight(engineEnvironment),
		[injectedEnginePreflight, engineEnvironment]
	);
	// Destructure to primitive deps so the memo doesn't recompute when
	// callers pass inline object literals that change reference every render.
	const { isAuthenticated, loading: authLoading, revalidated } = auth;
	const {
		hydrated: configHydrated,
		hydrateError,
		configPending,
		config: { enabled, apiKey, model, provider },
	} = aiConfig;
	const llmUsability = useMemo(
		() => resolveLlmUsability(auth, aiConfig),
		[
			isAuthenticated,
			authLoading,
			revalidated,
			configHydrated,
			hydrateError,
			configPending,
			enabled,
			apiKey,
			model,
			provider,
		]
	);

	useEffect(() => {
		let canceled = false;
		queueMicrotask(() => {
			if (canceled) {
				return;
			}
			const clientStorage = getClientStorage(storage);
			storageRef.current = clientStorage;
			const { preferences: storedPreferences, rememberedKind } =
				readPreferencesOnce(clientStorage);
			const automaticResolutionAllowed =
				!setupTouchedRef.current && !isGameActive && !isStarting;
			const fixedKind =
				explicitKindRef.current ?? rememberedKind ?? defaultSetup.rivalKind;
			const initialResolution = resolveSetup({
				rememberedKind: automaticResolutionAllowed ? rememberedKind : fixedKind,
				enginePreflight,
				llmUsability,
				setupTouched: !automaticResolutionAllowed,
				explicitKind: automaticResolutionAllowed ? null : fixedKind,
			});

			rememberedKindRef.current = rememberedKind;
			setPreferences(storedPreferences);
			setSetup(setupForResolution(storedPreferences, initialResolution));
			setFallbackNotice(
				visibleFallbackNotice(
					initialResolution.notice,
					clearedFallbackNoticeRef.current
				)
			);
			setResolved(true);
		});

		return () => {
			canceled = true;
		};
		// Preference hydration is intentionally client-mount-only. Later auth,
		// AI config, and preflight changes are handled by the follow-up effect.
	}, []);

	useEffect(() => {
		if (!resolved) {
			return;
		}
		if (!setupTouchedRef.current && (isGameActive || isStarting)) {
			return;
		}

		const resolution = resolveSetup({
			rememberedKind: rememberedKindRef.current,
			enginePreflight,
			llmUsability,
			setupTouched: setupTouchedRef.current,
			explicitKind: explicitKindRef.current,
		});
		const nextSetup = setupForResolution(preferences, resolution);

		setSetup(current =>
			setupsEqual(current, nextSetup) ? current : nextSetup
		);
		setFallbackNotice(
			visibleFallbackNotice(resolution.notice, clearedFallbackNoticeRef.current)
		);
	}, [
		enginePreflight,
		isGameActive,
		isStarting,
		llmUsability,
		preferences,
		resolved,
	]);

	const selectRival = useCallback(
		(kind: RivalKind) => {
			setupTouchedRef.current = true;
			explicitKindRef.current = kind;
			clearedFallbackNoticeRef.current = null;
			setFallbackNotice(null);

			const nextPreferences: RivalPreferencesV1 = {
				...preferences,
				lastRivalKind: kind,
			};
			const nextSetup: GameSetup = {
				rivalKind: kind,
				humanSide: nextPreferences.humanSideByRival[kind],
			};

			if (storageRef.current) {
				persistRivalKind(storageRef.current, kind);
			}
			rememberedKindRef.current = kind;
			setPreferences(nextPreferences);
			setSetup(nextSetup);
			onSetupChange?.(nextSetup);
		},
		[onSetupChange, preferences]
	);

	const selectHumanSide = useCallback(
		(side: ChessSide) => {
			setupTouchedRef.current = true;
			explicitKindRef.current = setup.rivalKind;
			clearedFallbackNoticeRef.current = null;
			setFallbackNotice(null);

			const nextPreferences: RivalPreferencesV1 = {
				...preferences,
				humanSideByRival: {
					...preferences.humanSideByRival,
					[setup.rivalKind]: side,
				},
			};
			const nextSetup: GameSetup = {
				...setup,
				humanSide: side,
			};

			if (storageRef.current) {
				persistHumanSide(storageRef.current, setup.rivalKind, side);
			}
			setPreferences(nextPreferences);
			setSetup(nextSetup);
			onSetupChange?.(nextSetup);
		},
		[onSetupChange, preferences, setup]
	);

	const clearFallbackNotice = useCallback(() => {
		clearedFallbackNoticeRef.current = fallbackNotice;
		setFallbackNotice(null);
	}, [fallbackNotice]);

	return {
		resolved,
		setup,
		enginePreflight,
		llmUsability,
		fallbackNotice,
		startBlockedReason: startBlockedReasonFor(
			setup.rivalKind,
			enginePreflight,
			llmUsability
		),
		selectRival,
		selectHumanSide,
		clearFallbackNotice,
	};
}
