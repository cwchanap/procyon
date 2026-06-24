import React, { useEffect } from 'react';
import ChessBoard from '../ChessBoard';
import type { PuzzleData } from '../../lib/puzzle/types';
import { usePuzzle, MAX_FAILED_ATTEMPTS } from '../../hooks/usePuzzle';
import { cn } from '../../lib/utils';
import { cva } from 'class-variance-authority';
import { Button } from '../ui/Button';

interface PuzzleSolverProps {
	puzzle: PuzzleData;
	onBack: () => void;
	onNextPuzzle?: () => void;
}

const statusBanner = cva(
	'w-full text-center py-2 px-4 rounded-lg text-sm font-medium transition-colors duration-300',
	{
		variants: {
			phase: {
				idle: 'bg-ink-600 text-ivory-dim',
				playing: 'bg-ink-600 text-ivory-dim',
				opponent: 'bg-ink-600 text-ivory-dim',
				solved: 'bg-jungle/20 text-jungle',
				failed: 'bg-[#C8402F]/20 text-[#C8402F]',
			},
		},
	}
);

const difficultyBadge = cva(
	'text-xs px-2 py-1 rounded-full border font-semibold uppercase tracking-wider',
	{
		variants: {
			difficulty: {
				beginner: 'bg-jungle/20 text-jungle border-jungle/30',
				intermediate: 'bg-brass/20 text-brass border-brass/30',
				advanced: 'bg-[#C8402F]/20 text-[#C8402F] border-[#C8402F]/30',
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
				true: 'bg-[#C8402F]',
				false: 'bg-ink-600 border border-line',
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
					className='text-ivory-dim hover:text-ivory text-sm flex items-center gap-1 mb-4 transition-colors duration-200'
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
					<h2 className='text-2xl font-bold text-ivory font-display'>
						{puzzle.title}
					</h2>
					<span
						className={cn(difficultyBadge({ difficulty: puzzle.difficulty }))}
					>
						{puzzle.difficulty}
					</span>
				</div>
				<p className='text-ivory-dim text-sm'>{puzzle.description}</p>
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
					<Button
						variant='outline'
						size='sm'
						onClick={requestHint}
						disabled={showHint}
					>
						Hint
					</Button>
				)}

				{(phase === 'failed' || phase === 'solved') && (
					<Button variant='secondary' size='sm' onClick={tryAgain}>
						Try Again
					</Button>
				)}

				{phase === 'solved' && (
					<Button variant='default' size='sm' onClick={onNextPuzzle ?? onBack}>
						{onNextPuzzle ? 'Next Puzzle' : 'Back'}
					</Button>
				)}
			</div>
		</div>
	);
}
