import React, { useEffect } from 'react';
import ChessBoard from '../ChessBoard';
import type { PuzzleData } from '../../lib/puzzle/types';
import { usePuzzle, MAX_FAILED_ATTEMPTS } from '../../hooks/usePuzzle';
import { cn } from '../../lib/utils';
import { cva } from 'class-variance-authority';

interface PuzzleSolverProps {
	puzzle: PuzzleData;
	onBack: () => void;
	onNextPuzzle?: () => void;
}

const statusBanner = cva(
	'w-full text-center py-2 px-4 rounded-xl text-sm font-medium transition-colors duration-300',
	{
		variants: {
			phase: {
				idle: 'bg-white/5 text-purple-100',
				playing: 'bg-white/5 text-purple-100',
				opponent: 'bg-white/5 text-purple-100',
				solved: 'bg-emerald-500/20 text-emerald-200',
				failed: 'bg-red-500/20 text-red-200',
			},
		},
	}
);

const difficultyBadge = cva(
	'text-xs px-2 py-1 rounded-full border font-semibold uppercase tracking-wider',
	{
		variants: {
			difficulty: {
				beginner: 'bg-emerald-500/20 text-emerald-200 border-emerald-400/30',
				intermediate: 'bg-yellow-500/20 text-yellow-200 border-yellow-400/30',
				advanced: 'bg-red-500/20 text-red-200 border-red-400/30',
			},
		},
		defaultVariants: {
			difficulty: 'beginner',
		},
	}
);

const failedAttemptDot = cva(
	'w-3 h-3 rounded-full transition-colors duration-300',
	{
		variants: {
			filled: {
				true: 'bg-red-400',
				false: 'bg-white/20',
			},
		},
	}
);

export default function PuzzleSolver({
	puzzle,
	onBack,
	onNextPuzzle,
}: PuzzleSolverProps) {
	const {
		state,
		startPuzzle,
		tryAgain,
		requestHint,
		handleSquareClick,
		hintHighlights,
		solutionHighlights,
	} = usePuzzle();

	// Start / restart when puzzle changes
	useEffect(() => {
		startPuzzle(puzzle);
	}, [puzzle.id, startPuzzle]);

	const {
		phase,
		board,
		selectedSquare,
		possibleMoves,
		failedAttempts,
		showSolution,
		showHint,
	} = state;

	const isInteractive = phase === 'playing';

	const statusMessage = (): string => {
		switch (phase) {
			case 'playing':
				if (failedAttempts === 0)
					return `Find the best move for ${puzzle.playerColor}.`;
				return `Incorrect. ${MAX_FAILED_ATTEMPTS - failedAttempts} attempt${MAX_FAILED_ATTEMPTS - failedAttempts !== 1 ? 's' : ''} remaining.`;
			case 'opponent':
				return 'Opponent is responding…';
			case 'solved':
				return '✓ Correct! Puzzle solved.';
			case 'failed':
				return 'No more attempts — here is the solution.';
			default:
				return '';
		}
	};

	const highlightSquares = showSolution ? solutionHighlights : hintHighlights;

	return (
		<div className='flex flex-col items-center gap-5 w-full max-w-2xl mx-auto'>
			{/* Header */}
			<div className='w-full'>
				<button
					onClick={onBack}
					className='text-purple-200/60 hover:text-white text-sm flex items-center gap-1 mb-4 transition-colors duration-200'
				>
					<svg
						className='w-4 h-4'
						fill='none'
						stroke='currentColor'
						viewBox='0 0 24 24'
					>
						<path
							strokeLinecap='round'
							strokeLinejoin='round'
							strokeWidth={2}
							d='M15 19l-7-7 7-7'
						/>
					</svg>
					Back to puzzles
				</button>
				<div className='flex items-center gap-3 mb-1'>
					<h2 className='text-2xl font-bold text-white'>{puzzle.title}</h2>
					<span
						className={cn(difficultyBadge({ difficulty: puzzle.difficulty }))}
					>
						{puzzle.difficulty}
					</span>
				</div>
				<p className='text-purple-100/70 text-sm'>{puzzle.description}</p>
			</div>

			{/* Status Banner */}
			<div className={cn(statusBanner({ phase }))}>{statusMessage()}</div>

			{/* Board */}
			<ChessBoard
				board={board}
				selectedSquare={isInteractive ? selectedSquare : null}
				possibleMoves={isInteractive ? possibleMoves : []}
				onSquareClick={isInteractive ? handleSquareClick : () => {}}
				highlightSquares={highlightSquares}
			/>

			{/* Failed attempts indicator */}
			{phase === 'playing' && (
				<div className='flex gap-2'>
					{Array.from({ length: MAX_FAILED_ATTEMPTS }, (_, i) => i).map(i => (
						<div
							key={i}
							className={cn(failedAttemptDot({ filled: i < failedAttempts }))}
						/>
					))}
				</div>
			)}

			{/* Controls */}
			<div className='flex gap-3 flex-wrap justify-center'>
				{isInteractive && !showSolution && (
					<button
						onClick={requestHint}
						disabled={showHint}
						className='px-4 py-2 rounded-xl glass-effect text-purple-100 text-sm hover:bg-white/10 transition-all duration-200 disabled:opacity-40 border border-white/10'
					>
						Hint
					</button>
				)}

				{(phase === 'failed' || phase === 'solved') && (
					<button
						onClick={tryAgain}
						className='px-6 py-2 rounded-xl bg-gradient-to-r from-indigo-500 to-purple-500 hover:from-indigo-400 hover:to-purple-400 text-white font-semibold text-sm transition-all duration-200'
					>
						Try Again
					</button>
				)}

				{phase === 'solved' && (
					<button
						onClick={onNextPuzzle ?? onBack}
						className='px-6 py-2 rounded-xl bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-400 hover:to-pink-400 text-white font-semibold text-sm transition-all duration-200'
					>
						{onNextPuzzle ? 'Next Puzzle' : 'Back'}
					</button>
				)}
			</div>
		</div>
	);
}
