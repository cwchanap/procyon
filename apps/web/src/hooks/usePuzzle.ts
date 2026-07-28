import { useState, useCallback, useRef, useEffect } from 'react';
import { useAuth } from '../lib/auth';
import { env } from '../lib/env';
import { selectSquare } from '../lib/chess/game';
import { attemptMove, createGameStateFromBoard } from '../lib/chess/rules';
import {
	positionToAlgebraic,
	tryAlgebraicToPosition as algebraicToPosition,
} from '../lib/chess/board';
import type {
	PuzzleData,
	PuzzleMove,
	PuzzleState,
	LocalPuzzleProgress,
} from '../lib/puzzle/types';
import type { GameState, Position } from '../lib/chess/types';

const LOCAL_STORAGE_KEY_PREFIX = 'procyon_puzzle_progress';
export const MAX_FAILED_ATTEMPTS = 3;
const OPPONENT_MOVE_DELAY_MS = 600;

function getStorageKey(userId: string | null): string {
	return userId
		? `${LOCAL_STORAGE_KEY_PREFIX}_${userId}`
		: `${LOCAL_STORAGE_KEY_PREFIX}_guest`;
}

export function readLocalPuzzleProgress(
	userId?: string | null
): LocalPuzzleProgress {
	const key = getStorageKey(userId ?? null);
	let raw: string | null = null;
	try {
		raw = localStorage.getItem(key);
	} catch (err) {
		// localStorage unavailable (e.g. blocked in private browsing)
		console.warn('[usePuzzle] localStorage unavailable:', err);
		return {};
	}
	if (!raw) return {};
	try {
		return JSON.parse(raw) as LocalPuzzleProgress;
	} catch (err) {
		// Stored data is corrupt JSON — log and return empty so next write starts fresh
		console.error(
			'[usePuzzle] Corrupt puzzle progress in localStorage, discarding:',
			err
		);
		return {};
	}
}

function writeLocalProgress(
	progress: LocalPuzzleProgress,
	userId: string | null
): void {
	const key = getStorageKey(userId);
	try {
		localStorage.setItem(key, JSON.stringify(progress));
	} catch (err) {
		// Most likely QuotaExceededError — log so developers can see it in devtools.
		// Progress is saved server-side for authenticated users as a fallback.
		console.error(
			'[usePuzzle] Failed to write puzzle progress to localStorage:',
			err
		);
	}
}

export function applyPuzzleMove(
	gameState: GameState,
	move: PuzzleMove
): GameState | null {
	const result = attemptMove(gameState, {
		from: move.from,
		to: move.to,
		...(move.promotion !== undefined ? { promotion: move.promotion } : {}),
	});
	return result.kind === 'applied' ? result.state : null;
}

function clearGameSelection(gameState: GameState): GameState {
	return {
		...gameState,
		selectedSquare: null,
		possibleMoves: [],
		pendingPromotion: null,
	};
}

function wrongMoveState(prev: PuzzleState): PuzzleState {
	const failedAttempts = prev.failedAttempts + 1;
	return {
		...prev,
		failedAttempts,
		showSolution: failedAttempts >= MAX_FAILED_ATTEMPTS,
		phase: failedAttempts >= MAX_FAILED_ATTEMPTS ? 'failed' : 'playing',
	};
}

function tryCreatePuzzleState(puzzle: PuzzleData): GameState | null {
	try {
		return createGameStateFromBoard(puzzle.initialBoard, puzzle.playerColor);
	} catch {
		return null;
	}
}

export function usePuzzle() {
	const { isAuthenticated, user } = useAuth();
	const savedRef = useRef<Set<string>>(new Set());

	// Reset dedupe cache when auth or user changes to avoid blocking requests for new session
	useEffect(() => {
		savedRef.current.clear();
	}, [isAuthenticated, user?.id]);

	const [state, setState] = useState<PuzzleState>({
		phase: 'idle',
		puzzle: null,
		gameState: null,
		solutionStep: 0,
		failedAttempts: 0,
		showHint: false,
		showSolution: false,
	});

	const saveProgress = useCallback(
		async (
			puzzleId: number,
			solved: boolean,
			failedAttempts: number,
			solvedAt?: string
		) => {
			// Always write to localStorage first (scoped to user)
			const userId = user?.id ?? null;
			const local = readLocalPuzzleProgress(userId);
			const existing = local[puzzleId];
			// Preserve solved: true — only upgrade, never downgrade
			const mergedSolved = existing?.solved === true ? true : solved;
			const mergedSolvedAt = existing?.solvedAt ?? solvedAt;
			const mergedFailedAttempts = Math.max(
				existing?.failedAttempts || 0,
				failedAttempts
			);
			local[puzzleId] = {
				solved: mergedSolved,
				failedAttempts: mergedFailedAttempts,
				solvedAt: mergedSolvedAt,
			};
			writeLocalProgress(local, userId);
			// If authenticated and haven't posted this specific progress state, POST to API
			// Use canonical merged values for consistency with localStorage state
			const progressKey = `${puzzleId}:${mergedFailedAttempts}:${mergedSolved}`;
			if (isAuthenticated && !savedRef.current.has(progressKey)) {
				savedRef.current.add(progressKey);
				try {
					const response = await fetch(
						`${env.PUBLIC_API_URL}/puzzles/${puzzleId}/progress`,
						{
							method: 'POST',
							headers: { 'Content-Type': 'application/json' },
							credentials: 'include',
							body: JSON.stringify({
								solved: mergedSolved,
								failedAttempts: mergedFailedAttempts,
								solvedAt: mergedSolvedAt,
							}),
						}
					);
					if (!response.ok) {
						savedRef.current.delete(progressKey);
						console.error('[usePuzzle] Progress POST returned non-OK status', {
							puzzleId,
							solved,
							failedAttempts,
							status: response.status,
						});
					}
				} catch (err) {
					savedRef.current.delete(progressKey);
					console.error('[usePuzzle] Failed to POST puzzle progress to API', {
						puzzleId,
						solved,
						failedAttempts,
						error: err instanceof Error ? err.message : String(err),
					});
				}
			}
		},
		[isAuthenticated, user?.id]
	);

	const startPuzzle = useCallback((puzzle: PuzzleData) => {
		const gameState = tryCreatePuzzleState(puzzle);
		setState({
			phase: gameState ? 'playing' : 'failed',
			puzzle,
			gameState,
			solutionStep: 0,
			failedAttempts: 0,
			showHint: false,
			showSolution: !gameState,
		});
	}, []);

	const tryAgain = useCallback(() => {
		setState(prev => {
			if (!prev.puzzle) return prev;
			const gameState = tryCreatePuzzleState(prev.puzzle);
			return {
				...prev,
				phase: gameState ? 'playing' : 'failed',
				gameState,
				solutionStep: 0,
				failedAttempts: 0,
				showHint: false,
				showSolution: !gameState,
			};
		});
	}, []);

	const requestHint = useCallback(() => {
		setState(prev => ({ ...prev, showHint: true }));
	}, []);

	const applyOpponentMove = useCallback(
		(puzzle: PuzzleData, gameState: GameState, step: number) => {
			const scripted = puzzle.solution[step];
			const next = scripted ? applyPuzzleMove(gameState, scripted) : null;
			if (!next) {
				setState(prev => ({
					...prev,
					phase: 'failed',
					showSolution: true,
					gameState: clearGameSelection(gameState),
				}));
				return;
			}

			const nextStep = step + 1;
			setState(prev => ({
				...prev,
				phase: nextStep >= puzzle.solution.length ? 'solved' : 'playing',
				gameState: next,
				solutionStep: nextStep,
			}));
		},
		[]
	);

	const handleSquareClick = useCallback((position: Position) => {
		setState(prev => {
			const gameState = prev.gameState;
			const puzzle = prev.puzzle;
			if (prev.phase !== 'playing' || !puzzle || !gameState) return prev;

			const selected = gameState.selectedSquare;
			const clicked = gameState.board[position.row]?.[position.col] ?? null;
			if (!selected || (clicked && clicked.color === gameState.currentPlayer)) {
				return { ...prev, gameState: selectSquare(gameState, position) };
			}

			const isLegalDestination = gameState.possibleMoves.some(
				move => move.row === position.row && move.col === position.col
			);
			if (!isLegalDestination) {
				return { ...prev, gameState: clearGameSelection(gameState) };
			}

			const expected = puzzle.solution[prev.solutionStep];
			const from = positionToAlgebraic(selected);
			const to = positionToAlgebraic(position);
			if (!expected || expected.from !== from || expected.to !== to) {
				return wrongMoveState({
					...prev,
					gameState: clearGameSelection(gameState),
				});
			}

			const nextGameState = applyPuzzleMove(gameState, expected);
			if (!nextGameState) {
				return {
					...prev,
					phase: 'failed',
					showSolution: true,
					gameState: clearGameSelection(gameState),
				};
			}

			const nextStep = prev.solutionStep + 1;
			const solved = nextStep >= puzzle.solution.length;
			return {
				...prev,
				phase: solved ? 'solved' : nextStep % 2 === 1 ? 'opponent' : 'playing',
				gameState: nextGameState,
				solutionStep: nextStep,
			};
		});
	}, []);

	// Auto-play opponent move after a delay
	useEffect(() => {
		if (state.phase !== 'opponent' || !state.puzzle || !state.gameState) {
			return;
		}

		const puzzle = state.puzzle;
		const gameState = state.gameState;
		const solutionStep = state.solutionStep;

		const timer = setTimeout(() => {
			applyOpponentMove(puzzle, gameState, solutionStep);
		}, OPPONENT_MOVE_DELAY_MS);

		return () => clearTimeout(timer);
	}, [
		state.phase,
		state.puzzle,
		state.gameState,
		state.solutionStep,
		applyOpponentMove,
	]);

	// Save progress when puzzle is solved
	useEffect(() => {
		if (state.phase !== 'solved' || !state.puzzle) return;
		const id = state.puzzle.id;
		void saveProgress(id, true, state.failedAttempts, new Date().toISOString());
	}, [state.phase, state.puzzle, state.failedAttempts, saveProgress]);

	// Also save failed attempts
	useEffect(() => {
		if (state.failedAttempts === 0 || !state.puzzle) return;
		if (state.phase === 'solved') return; // already saved
		const id = state.puzzle.id;
		void saveProgress(id, false, state.failedAttempts);
	}, [state.failedAttempts, state.puzzle, state.phase, saveProgress]);

	// Compute hint highlight squares
	const hintHighlights: Position[] =
		state.showHint && state.puzzle
			? [state.puzzle.hint.pieceSquare, state.puzzle.hint.targetSquare]
			: [];

	// When showing solution, highlight all solution move squares
	const solutionHighlights: Position[] =
		state.showSolution && state.puzzle
			? state.puzzle.solution.flatMap(move => {
					const from = algebraicToPosition(move.from);
					const to = algebraicToPosition(move.to);
					return [from, to].filter((p): p is Position => p !== null);
				})
			: [];

	return {
		state,
		startPuzzle,
		tryAgain,
		requestHint,
		handleSquareClick,
		hintHighlights,
		solutionHighlights,
		readLocalPuzzleProgress,
	};
}
