import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../lib/auth';
import {
	getUnlockedSkins,
	SKIN_CATALOG,
	scoreMatch,
	type SkinId,
} from '../lib/aeroplane/rewards';
import { fetchPlayHistory } from '../lib/play-history';

const SKIN_STORAGE_KEY_PREFIX = 'procyon_aeroplane_skin';

export type AeroplaneProgressStatus =
	| 'waiting-auth'
	| 'loading'
	| 'loaded'
	| 'failed';

export interface UseAeroplaneProgressOptions {
	/** Bumped by useAeroplaneMatch after every successful terminal POST. */
	historySavedRevision?: number;
}

export interface UseAeroplaneProgressResult {
	status: AeroplaneProgressStatus;
	/** Lifetime stars summed over server-returned qualifying matches. */
	lifetimeStars: number;
	unlockedSkins: SkinId[];
	selectedSkin: SkinId;
	setSelectedSkin(skin: SkinId): void;
	/** Refetch after a failed GET; the only manual reload there is. */
	retry(): void;
}

function skinStorageKey(userId: string): string {
	return `${SKIN_STORAGE_KEY_PREFIX}_${userId}`;
}

function isSkinId(value: unknown): value is SkinId {
	return SKIN_CATALOG.some(entry => entry.id === value);
}

function readStoredSkin(userId: string | undefined): SkinId {
	if (!userId) return 'classic';
	try {
		const raw = localStorage.getItem(skinStorageKey(userId));
		return raw !== null && isSkinId(raw) ? raw : 'classic';
	} catch {
		// localStorage unavailable (e.g. blocked in private browsing)
		return 'classic';
	}
}

/** Returns false when the write failed so the selection is not adopted. */
function writeStoredSkin(skin: SkinId, userId: string): boolean {
	try {
		localStorage.setItem(skinStorageKey(userId), skin);
		return true;
	} catch {
		return false;
	}
}

/**
 * Server-sourced Aeroplane progression: lifetime stars from play history and
 * the user's selected skin. Fetches only once auth is verified — an
 * independent `useAuth()` call can expose an optimistic shared-user snapshot
 * before the session is confirmed — and never exposes progress across user
 * identities. Totals come exclusively from server rows; a local terminal
 * result only triggers a reload via `historySavedRevision`.
 */
export function useAeroplaneProgress(
	options: UseAeroplaneProgressOptions = {}
): UseAeroplaneProgressResult {
	const { historySavedRevision = 0 } = options;
	const { loading, revalidated, isAuthenticated, user } = useAuth();
	const userId = user?.id;
	const authVerified =
		!loading && revalidated && isAuthenticated && typeof userId === 'string';

	const [status, setStatus] = useState<AeroplaneProgressStatus>('waiting-auth');
	const [lifetimeStars, setLifetimeStars] = useState(0);
	const [storedSkin, setStoredSkin] = useState<SkinId>('classic');
	const [retryTick, setRetryTick] = useState(0);

	// Identity changes reset immediately; nothing crosses users in memory.
	useEffect(() => {
		setStatus('waiting-auth');
		setLifetimeStars(0);
		setStoredSkin(readStoredSkin(userId));
	}, [userId]);

	useEffect(() => {
		if (!authVerified) return;
		let superseded = false;
		const controller = new AbortController();
		setStatus('loading');
		fetchPlayHistory(controller.signal)
			.then(rows => {
				if (superseded) return;
				let stars = 0;
				for (const row of rows) stars += scoreMatch(row)?.total ?? 0;
				setLifetimeStars(stars);
				setStatus('loaded');
			})
			.catch(() => {
				if (superseded) return;
				setStatus('failed');
			});
		return () => {
			superseded = true;
			controller.abort();
		};
	}, [authVerified, userId, historySavedRevision, retryTick]);

	const unlockedSkins = useMemo(
		() => getUnlockedSkins(lifetimeStars),
		[lifetimeStars]
	);

	// Classic whenever unverified, loading/failed, or the selection is locked.
	const selectedSkin: SkinId =
		authVerified && status === 'loaded' && unlockedSkins.includes(storedSkin)
			? storedSkin
			: 'classic';

	const setSelectedSkin = useCallback(
		(skin: SkinId) => {
			if (!authVerified || !userId) return;
			if (!writeStoredSkin(skin, userId)) {
				// Storage exceptions fall back to classic.
				setStoredSkin('classic');
				return;
			}
			setStoredSkin(skin);
		},
		[authVerified, userId]
	);

	const retry = useCallback(() => setRetryTick(tick => tick + 1), []);

	return {
		status,
		lifetimeStars,
		unlockedSkins,
		selectedSkin,
		setSelectedSkin,
		retry,
	};
}
