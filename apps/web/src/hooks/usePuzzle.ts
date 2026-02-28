import { useState, useCallback, useRef, useEffect } from 'react';
import { useAuth, getAuthHeaders } from '../lib/auth';
import { env } from '../lib/env';
import { makeMove, algebraicToPosition } from '../lib/chess/game';
import { positionToAlgebraic, getPieceAt } from '../lib/chess/board';
import { getPossibleMoves } from '../lib/chess/moves';
import type {
	PuzzleData,
	PuzzleState,
	LocalPuzzleProgress,
} from '../lib/puzzle/types';
import type {
	Position,
	ChessPiece,
	PieceColor,
	GameState,
} from '../lib/chess/types';

const LOCAL_STORAGE_KEY = 'procyon_puzzle_progress';
export const MAX_FAILED_ATTEMPTS = 3;
const OPPONENT_MOVE_DELAY_MS = 600;

export function readLocalPuzzleProgress(): LocalPuzzleProgress {
	let raw: string | null = null;
	try {
		raw = localStorage.getItem(LOCAL_STORAGE_KEY);
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

function writeLocalProgress(progress: LocalPuzzleProgress): void {
	try {
		localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(progress));
	} catch {
		// Silently ignore storage errors
	}
}

function makePuzzleGameState(
	board: (ChessPiece | null)[][],
	currentPlayer: PieceColor
): GameState {
	return {
		board,
		currentPlayer,
		status: 'playing' as const,
		moveHistory: [],
		selectedSquare: null,
		possibleMoves: [],
		mode: 'human-vs-human' as const,
	};
}

function wrongMoveState(prev: PuzzleState): PuzzleState {
	const newFailed = prev.failedAttempts + 1;
	return {
		...prev,
		failedAttempts: newFailed,
		showSolution: newFailed >= MAX_FAILED_ATTEMPTS,
		phase: newFailed >= MAX_FAILED_ATTEMPTS ? 'failed' : 'playing',
		selectedSquare: null,
		possibleMoves: [],
	};
}

export function usePuzzle() {
	const { isAuthenticated } = useAuth();
	const savedRef = useRef<Set<string>>(new Set());

	const [state, setState] = useState<PuzzleState>({
		phase: 'idle',
		puzzle: null,
		board: Array(8)
			.fill(null)
			.map(() => Array(8).fill(null)),
		solutionStep: 0,
		failedAttempts: 0,
		showHint: false,
		showSolution: false,
		selectedSquare: null,
		possibleMoves: [],
	});

	const saveProgress = useCallback(
		async (
			puzzleId: number,
			solved: boolean,
			failedAttempts: number,
			solvedAt?: string
		) => {
			// Always write to localStorage first
			const local = readLocalPuzzleProgress();
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
			writeLocalProgress(local);
			// If authenticated and haven't posted this specific progress state, POST to API
			const progressKey = `${puzzleId}:${failedAttempts}:${solved}`;
			if (isAuthenticated && !savedRef.current.has(progressKey)) {
				savedRef.current.add(progressKey);
				try {
					const headers = await getAuthHeaders();
					const response = await fetch(
						`${env.PUBLIC_API_URL}/puzzles/${puzzleId}/progress`,
						{
							method: 'POST',
							headers: { 'Content-Type': 'application/json', ...headers },
							body: JSON.stringify({ solved, failedAttempts, solvedAt }),
						}
					);
					if (!response.ok) {
						savedRef.current.delete(progressKey);
					}
				} catch {
					savedRef.current.delete(progressKey);
				}
			}
		},
		[isAuthenticated]
	);

	const startPuzzle = useCallback((puzzle: PuzzleData) => {
		// Deep copy board so mutations don't affect the original
		const board = puzzle.initialBoard.map(row => [...row]);
		setState({
			phase: 'playing',
			puzzle,
			board,
			solutionStep: 0,
			failedAttempts: 0,
			showHint: false,
			showSolution: false,
			selectedSquare: null,
			possibleMoves: [],
		});
	}, []);

	const tryAgain = useCallback(() => {
		setState(prev => {
			if (!prev.puzzle) return prev;
			return {
				...prev,
				phase: 'playing',
				board: prev.puzzle.initialBoard.map(row => [...row]),
				solutionStep: 0,
				failedAttempts: 0,
				showHint: false,
				showSolution: false,
				selectedSquare: null,
				possibleMoves: [],
			};
		});
	}, []);

	const requestHint = useCallback(() => {
		setState(prev => ({ ...prev, showHint: true }));
	}, []);

	// Apply the opponent's scripted move from the solution array
	const applyOpponentMove = useCallback(
		(puzzle: PuzzleData, board: typeof state.board, step: number) => {
			const opponentMove = puzzle.solution[step];
			if (!opponentMove) return;

			const fromPos = algebraicToPosition(opponentMove.from);
			const toPos = algebraicToPosition(opponentMove.to);
			if (!fromPos || !toPos) return;

			const piece = getPieceAt(board, fromPos);
			if (!piece) return;

			const next = makeMove(
				makePuzzleGameState(board, piece.color),
				fromPos,
				toPos
			);
			if (!next) return;

			setState(prev => {
				const nextStep = prev.solutionStep + 1;
				const solved = nextStep >= puzzle.solution.length;
				return {
					...prev,
					phase: solved ? 'solved' : 'playing',
					board: next.board,
					solutionStep: nextStep,
					selectedSquare: null,
					possibleMoves: [],
				};
			});
		},
		[]
	);

	const handleSquareClick = useCallback((position: Position) => {
		setState(prev => {
			if (prev.phase !== 'playing' || !prev.puzzle) return prev;

			const { board, puzzle, selectedSquare, solutionStep } = prev;
			const playerColor = puzzle.playerColor;
			const clickedPiece = board[position.row]?.[position.col] ?? null;

			// No selection yet — try to select a player piece
			if (!selectedSquare) {
				if (!clickedPiece || clickedPiece.color !== playerColor) return prev;
				const possibleMoves = getPossibleMoves(board, clickedPiece, position);
				return { ...prev, selectedSquare: position, possibleMoves };
			}

			// Clicking same square — deselect
			if (
				selectedSquare.row === position.row &&
				selectedSquare.col === position.col
			) {
				return { ...prev, selectedSquare: null, possibleMoves: [] };
			}

			// Clicking another player piece — re-select
			if (clickedPiece && clickedPiece.color === playerColor) {
				const possibleMoves = getPossibleMoves(board, clickedPiece, position);
				return { ...prev, selectedSquare: position, possibleMoves };
			}

			// Attempting a move from selectedSquare → position
			const fromAlg = positionToAlgebraic(selectedSquare);
			const toAlg = positionToAlgebraic(position);

			const expectedMove = puzzle.solution[solutionStep];
			const isCorrect =
				expectedMove != null &&
				expectedMove.from === fromAlg &&
				expectedMove.to === toAlg;

			if (isCorrect) {
				const nextGameState = makeMove(
					makePuzzleGameState(board, playerColor),
					selectedSquare,
					position
				);
				if (!nextGameState) {
					return wrongMoveState(prev);
				}

				const nextStep = solutionStep + 1;
				const isLastMove = nextStep >= puzzle.solution.length;

				if (isLastMove) {
					return {
						...prev,
						phase: 'solved',
						board: nextGameState.board,
						solutionStep: nextStep,
						selectedSquare: null,
						possibleMoves: [],
					};
				}

				// Check if next step is an opponent move (odd index = opponent)
				const nextIsOpponent = nextStep % 2 === 1;
				if (nextIsOpponent) {
					return {
						...prev,
						phase: 'opponent',
						board: nextGameState.board,
						solutionStep: nextStep,
						selectedSquare: null,
						possibleMoves: [],
					};
				}

				return {
					...prev,
					board: nextGameState.board,
					solutionStep: nextStep,
					selectedSquare: null,
					possibleMoves: [],
				};
			} else {
				return wrongMoveState(prev);
			}
		});
	}, []);

	// Auto-play opponent move after a delay
	useEffect(() => {
		if (state.phase !== 'opponent' || !state.puzzle) return;

		const puzzle = state.puzzle;
		const board = state.board;
		const step = state.solutionStep;

		const timer = setTimeout(() => {
			applyOpponentMove(puzzle, board, step);
		}, OPPONENT_MOVE_DELAY_MS);

		return () => clearTimeout(timer);
	}, [
		state.phase,
		state.puzzle,
		state.board,
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
