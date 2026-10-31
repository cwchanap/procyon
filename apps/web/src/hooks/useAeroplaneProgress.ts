import { useCallback, useEffect, useMemo, useState } from 'react';
import type { AuthSnapshot } from '../lib/auth';
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

interface ProgressSnapshot {
	/** Identity the GET ran under; renders under any other mask it. */
	userId: string | undefined;
	status: AeroplaneProgressStatus;
	stars: number;
}

const EMPTY_PROGRESS: ProgressSnapshot = {
	userId: undefined,
	status: 'waiting-auth',
	stars: 0,
};

interface SkinSelection {
	userId: string | undefined;
	skin: SkinId;
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

function clearStoredSkin(userId: string): void {
	try {
		localStorage.removeItem(skinStorageKey(userId));
	} catch {
		// localStorage unavailable (e.g. blocked in private browsing)
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
	auth: AuthSnapshot,
	options: UseAeroplaneProgressOptions = {}
): UseAeroplaneProgressResult {
	const { historySavedRevision = 0 } = options;
	const { loading, revalidated, isAuthenticated, user } = auth;
	const userId = user?.id;
	const authVerified =
		!loading && revalidated && isAuthenticated && typeof userId === 'string';

	// Snapshot and selection are stamped with the identity that produced
	// them and masked below whenever the current user differs, so nothing
	// crosses accounts — including on the render that changes identity,
	// before any effect could run.
	const [progress, setProgress] = useState<ProgressSnapshot>(EMPTY_PROGRESS);
	const [skinSelection, setSkinSelection] = useState<SkinSelection>({
		userId: undefined,
		skin: 'classic',
	});
	const [retryTick, setRetryTick] = useState(0);

	useEffect(() => {
		if (!authVerified || !userId) return;
		let superseded = false;
		const controller = new AbortController();
		setProgress(previous =>
			previous.userId === userId && previous.status === 'loaded'
				? previous
				: { userId, status: 'loading', stars: 0 }
		);
		// Every completed match bumps historySavedRevision and re-downloads the
		// user's whole history across all variants — the spec accepts this; a
		// server/client gameId filter is the follow-up if volume ever matters.
		fetchPlayHistory(controller.signal)
			.then(rows => {
				if (superseded) return;
				let stars = 0;
				for (const row of rows) stars += scoreMatch(row)?.total ?? 0;
				setProgress({ userId, status: 'loaded', stars });
			})
			.catch(() => {
				if (superseded) return;
				setProgress({ userId, status: 'failed', stars: 0 });
			});
		return () => {
			superseded = true;
			controller.abort();
		};
	}, [authVerified, userId, historySavedRevision, retryTick]);

	// Losing verification drops the snapshot entirely rather than only
	// masking it: a kept 'loaded' record would resurrect pre-loss stars the
	// instant auth re-verifies instead of waiting on a fresh GET.
	useEffect(() => {
		if (authVerified) return;
		setProgress(previous =>
			previous.status === 'waiting-auth' ? previous : EMPTY_PROGRESS
		);
	}, [authVerified]);

	// Claimed progress only surfaces under verified auth for the identity
	// that fetched it. Verified-but-unfetched maps to 'loading' since a GET
	// is queued above; unverified or unknown auth reads as 'waiting-auth'.
	const progressForUser = authVerified && progress.userId === userId;
	const status: AeroplaneProgressStatus = progressForUser
		? progress.status
		: authVerified
			? 'loading'
			: 'waiting-auth';
	const lifetimeStars = progressForUser ? progress.stars : 0;

	// An explicit pick only shadows the stored value while it belongs to
	// the current user; otherwise the new identity's own record applies.
	const storedForUser = useMemo(() => readStoredSkin(userId), [userId]);
	const storedSkin =
		skinSelection.userId === userId ? skinSelection.skin : storedForUser;

	// Only a loaded GET reveals unlocks; failed/loading keeps every option
	// but classic locked.
	const unlockedSkins = useMemo<SkinId[]>(
		() => (status === 'loaded' ? getUnlockedSkins(lifetimeStars) : ['classic']),
		[status, lifetimeStars]
	);

	// A stale stored skin that is still locked is dropped from storage — not
	// merely masked — so reaching the star threshold later cannot resurrect a
	// selection the user never made. The render mask below stays as a second
	// line of defence until this effect has run.
	useEffect(() => {
		if (!authVerified || !userId || status !== 'loaded') return;
		if (!unlockedSkins.includes(storedSkin)) {
			clearStoredSkin(userId);
			// Stamped with this user so the normalized selection shadows the
			// stale localStorage read cached in storedForUser's memo.
			setSkinSelection({ userId, skin: 'classic' });
		}
	}, [authVerified, userId, status, unlockedSkins, storedSkin]);

	// Classic whenever unverified, loading/failed, or the selection is locked.
	const selectedSkin: SkinId =
		authVerified && status === 'loaded' && unlockedSkins.includes(storedSkin)
			? storedSkin
			: 'classic';

	const setSelectedSkin = useCallback(
		(skin: SkinId) => {
			if (!authVerified || !userId) return;
			// Locked skins are not selectable; until the GET loads every skin
			// but classic reads as locked.
			if (!unlockedSkins.includes(skin)) return;
			if (!writeStoredSkin(skin, userId)) {
				// Storage exceptions fall back to classic.
				setSkinSelection({ userId, skin: 'classic' });
				return;
			}
			setSkinSelection({ userId, skin });
		},
		[authVerified, userId, unlockedSkins]
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
