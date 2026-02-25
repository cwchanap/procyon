import React from 'react';
import type {
	PuzzleListItem,
	LocalPuzzleProgress,
} from '../../lib/puzzle/types';
import {
	DIFFICULTY_BADGE_STYLES,
	DIFFICULTY_BADGE_FALLBACK,
} from '../../lib/puzzle/utils';

interface PuzzleGridProps {
	puzzles: PuzzleListItem[];
	localProgress: LocalPuzzleProgress;
	serverProgress: Record<number, { solved: boolean }>;
	onSelectPuzzle: (id: number) => void;
}

export default function PuzzleGrid({
	puzzles,
	localProgress,
	serverProgress,
	onSelectPuzzle,
}: PuzzleGridProps) {
	const isSolved = (id: number): boolean =>
		serverProgress[id]?.solved || localProgress[id]?.solved || false;

	return (
		<div className='w-full max-w-5xl mx-auto'>
			<header className='mb-8 space-y-2'>
				<p className='text-purple-200/70 uppercase tracking-[0.3em] text-xs'>
					Tactics
				</p>
				<h1 className='text-4xl font-black text-white tracking-tight'>
					Chess Puzzles
				</h1>
				<p className='text-purple-100/60'>
					Sharpen your tactical vision with hand-picked puzzles.
				</p>
			</header>

			{puzzles.length === 0 ? (
				<div className='glass-effect rounded-2xl p-8 text-center text-purple-200/60'>
					No puzzles available yet.
				</div>
			) : (
				<div className='grid gap-4 sm:grid-cols-2 lg:grid-cols-3'>
					{puzzles.map(puzzle => {
						const solved = isSolved(puzzle.id);
						const badgeClass =
							DIFFICULTY_BADGE_STYLES[puzzle.difficulty] ??
							DIFFICULTY_BADGE_FALLBACK;

						return (
							<button
								key={puzzle.id}
								onClick={() => onSelectPuzzle(puzzle.id)}
								className='glass-effect rounded-2xl p-5 text-left hover:bg-white/10 transition-all duration-200 border border-white/10 hover:border-white/20 group'
							>
								<div className='flex items-start justify-between gap-2 mb-3'>
									<span
										className={`text-xs px-2 py-1 rounded-full border font-semibold uppercase tracking-wider ${badgeClass}`}
									>
										{puzzle.difficulty}
									</span>
									{solved && (
										<span className='text-xs text-emerald-300 font-semibold flex items-center gap-1'>
											<svg
												className='w-3 h-3'
												fill='currentColor'
												viewBox='0 0 20 20'
											>
												<path
													fillRule='evenodd'
													d='M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z'
													clipRule='evenodd'
												/>
											</svg>
											Solved
										</span>
									)}
								</div>
								<h3 className='text-white font-semibold text-base mb-1 group-hover:text-purple-200 transition-colors duration-200'>
									{puzzle.title}
								</h3>
								<p className='text-purple-100/60 text-sm leading-snug line-clamp-2'>
									{puzzle.description}
								</p>
								<div className='mt-4 text-xs text-purple-300/50'>
									Play as {puzzle.playerColor}
								</div>
							</button>
						);
					})}
				</div>
			)}
		</div>
	);
}
