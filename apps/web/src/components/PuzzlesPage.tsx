import React, { useState, useEffect, useCallback } from 'react';
import { useAuth, getAuthHeaders } from '../lib/auth';
import { env } from '../lib/env';
import PuzzleGrid from './puzzle/PuzzleGrid';
import PuzzleSolver from './puzzle/PuzzleSolver';
import type {
	PuzzleData,
	PuzzleListItem,
	LocalPuzzleProgress,
	ServerPuzzleProgress,
} from '../lib/puzzle/types';
import { readLocalPuzzleProgress } from '../hooks/usePuzzle';

export default function PuzzlesPage() {
	const { isAuthenticated, user } = useAuth();

	const [puzzleList, setPuzzleList] = useState<PuzzleListItem[]>([]);
	const [activePuzzle, setActivePuzzle] = useState<PuzzleData | null>(null);
	const [isLoadingList, setIsLoadingList] = useState(true);
	const [isLoadingPuzzle, setIsLoadingPuzzle] = useState(false);
	const [localProgress, setLocalProgress] = useState<LocalPuzzleProgress>({});
	const [serverProgress, setServerProgress] = useState<
		Record<number, { solved: boolean }>
	>({});
	const [listError, setListError] = useState<string | null>(null);
	const [puzzleError, setPuzzleError] = useState<string | null>(null);

	// Load puzzle list
	useEffect(() => {
		const controller = new AbortController();
		setIsLoadingList(true);

		fetch(`${env.PUBLIC_API_URL}/puzzles`, { signal: controller.signal })
			.then(r => {
				if (!r.ok) throw new Error(`HTTP ${r.status}`);
				return r.json() as Promise<{ puzzles: PuzzleListItem[] }>;
			})
			.then(data => {
				setPuzzleList(data.puzzles ?? []);
			})
			.catch((err: unknown) => {
				if (err instanceof Error && err.name !== 'AbortError') {
					setListError('Failed to load puzzles. Please try again.');
				}
			})
			.finally(() => setIsLoadingList(false));

		setLocalProgress(readLocalPuzzleProgress(user?.id));

		return () => controller.abort();
	}, [user?.id]);

	// Helper to fetch server progress (shared between refreshServerProgress and useEffect)
	const fetchServerProgress = useCallback(
		async (signal?: AbortSignal): Promise<void> => {
			if (!isAuthenticated) return;

			const headers = await getAuthHeaders();
			const r = await fetch(`${env.PUBLIC_API_URL}/puzzles/progress`, {
				headers,
				signal,
			});
			if (!r.ok) {
				throw new Error(`HTTP ${r.status}`);
			}
			const data = (await r.json()) as { progress: ServerPuzzleProgress[] };
			const map: Record<number, { solved: boolean }> = {};
			for (const p of data.progress) {
				map[p.puzzleId] = { solved: p.solved };
			}
			setServerProgress(map);
		},
		[isAuthenticated]
	);

	// Refreshes server progress from API
	const refreshServerProgress = useCallback(async () => {
		return fetchServerProgress();
	}, [fetchServerProgress]);

	// Load server progress when authenticated
	useEffect(() => {
		if (!isAuthenticated) {
			setServerProgress({});
			return;
		}

		const controller = new AbortController();

		fetchServerProgress(controller.signal).catch((err: unknown) => {
			if (err instanceof Error && err.name === 'AbortError') return;
			console.error(
				'[PuzzlesPage] Failed to load server puzzle progress:',
				err
			);
		});

		return () => controller.abort();
	}, [isAuthenticated, fetchServerProgress]);

	const handleSelectPuzzle = useCallback(async (id: number) => {
		setIsLoadingPuzzle(true);
		setPuzzleError(null);
		try {
			const r = await fetch(`${env.PUBLIC_API_URL}/puzzles/${id}`);
			if (!r.ok) throw new Error(`HTTP ${r.status}`);
			const data = (await r.json()) as { puzzle: PuzzleData };
			setActivePuzzle(data.puzzle);
		} catch (err: unknown) {
			console.error('[PuzzlesPage] Failed to load puzzle', {
				id,
				error: err instanceof Error ? err.message : String(err),
			});
			setPuzzleError('Failed to load puzzle. Please try again.');
		} finally {
			setIsLoadingPuzzle(false);
		}
	}, []);

	const handleBack = useCallback(() => {
		setActivePuzzle(null);
		// Refresh local progress to reflect any updates from solving
		setLocalProgress(readLocalPuzzleProgress(user?.id));
		// Refresh server progress for authenticated users (handles localStorage failures)
		if (isAuthenticated) {
			refreshServerProgress().catch((err: unknown) => {
				console.error('[PuzzlesPage] Failed to refresh server progress:', err);
			});
		}
	}, [isAuthenticated, refreshServerProgress]);

	const handleNextPuzzle = useCallback(() => {
		if (!activePuzzle) return;
		const idx = puzzleList.findIndex(p => p.id === activePuzzle.id);
		const nextPuzzle = puzzleList[idx + 1];
		if (idx >= 0 && nextPuzzle) {
			void handleSelectPuzzle(nextPuzzle.id);
		} else {
			setActivePuzzle(null);
		}
		setLocalProgress(readLocalPuzzleProgress(user?.id));
		// Refresh server progress for authenticated users (handles localStorage failures)
		if (isAuthenticated) {
			refreshServerProgress().catch((err: unknown) => {
				console.error('[PuzzlesPage] Failed to refresh server progress:', err);
			});
		}
	}, [
		activePuzzle,
		puzzleList,
		handleSelectPuzzle,
		isAuthenticated,
		refreshServerProgress,
	]);

	if (isLoadingList) {
		return (
			<div className='min-h-[60vh] flex items-center justify-center text-purple-100/60 animate-pulse text-lg'>
				Loading puzzles…
			</div>
		);
	}

	if (listError) {
		return (
			<div className='min-h-[60vh] flex items-center justify-center'>
				<div className='glass-effect rounded-2xl p-8 text-center space-y-4'>
					<p className='text-red-200'>{listError}</p>
					<button
						onClick={() => window.location.reload()}
						className='px-4 py-2 rounded-full bg-white/10 text-white text-sm hover:bg-white/20 transition-colors'
					>
						Retry
					</button>
				</div>
			</div>
		);
	}

	if (activePuzzle) {
		return (
			<div className='container mx-auto px-4 py-8'>
				<PuzzleSolver
					puzzle={activePuzzle}
					onBack={handleBack}
					onNextPuzzle={handleNextPuzzle}
				/>
				{!isAuthenticated && (
					<p className='text-center text-purple-300/60 text-sm mt-6'>
						<a
							href='/login'
							className='text-cyan-300 hover:text-cyan-100 underline'
						>
							Sign in
						</a>{' '}
						to save your progress.
					</p>
				)}
			</div>
		);
	}

	return (
		<div className='container mx-auto px-4 py-8'>
			{isLoadingPuzzle && (
				<div className='fixed inset-0 bg-black/40 flex items-center justify-center z-50'>
					<div className='glass-effect rounded-2xl p-6 text-white text-sm animate-pulse'>
						Loading puzzle…
					</div>
				</div>
			)}
			{puzzleError && (
				<div className='mb-4 px-4 py-3 rounded-xl bg-red-500/10 border border-red-400/20 text-red-200 text-sm text-center'>
					{puzzleError}
				</div>
			)}
			<PuzzleGrid
				puzzles={puzzleList}
				localProgress={localProgress}
				serverProgress={serverProgress}
				onSelectPuzzle={handleSelectPuzzle}
			/>
		</div>
	);
}
