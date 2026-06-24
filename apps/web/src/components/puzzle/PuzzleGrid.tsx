import React from 'react';
import type {
	PuzzleListItem,
	LocalPuzzleProgress,
} from '../../lib/puzzle/types';
import {
	DIFFICULTY_BADGE_STYLES,
	DIFFICULTY_BADGE_FALLBACK,
} from '../../lib/puzzle/utils';
import { Panel } from '../ui/Panel';
import { PageHeader } from '../PageHeader';

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
		!!(serverProgress[id]?.solved || localProgress[id]?.solved);

	return (
		<div className='w-full'>
			<PageHeader eyebrow='Training' title='Chess Puzzles' />

			{puzzles.length === 0 ? (
				<Panel className='p-8 text-center text-ivory-dim'>
					No puzzles available yet.
				</Panel>
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
								className='bg-ink-700 border border-line rounded-lg p-5 text-left hover:-translate-y-0.5 transition-all duration-200 hover:border-line-brass group'
							>
								<div className='flex items-start justify-between gap-2 mb-3'>
									<span
										className={`text-xs px-2 py-1 rounded-full border font-semibold uppercase tracking-wider ${badgeClass}`}
									>
										{puzzle.difficulty}
									</span>
									{solved && (
										<span className='text-xs text-jungle font-semibold flex items-center gap-1'>
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
								<h3 className='text-ivory font-semibold text-base mb-1 group-hover:text-brass transition-colors duration-200'>
									{puzzle.title}
								</h3>
								<p className='text-ivory-dim text-sm leading-snug line-clamp-2'>
									{puzzle.description}
								</p>
								<div className='mt-4 text-xs text-ivory-dim font-mono'>
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
