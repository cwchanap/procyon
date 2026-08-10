import React from 'react';
import Panel from '../ui/Panel';
import type {
	AeroplaneColor,
	AeroplaneState,
	ResolvedMove,
} from '../../lib/aeroplane/types';

export interface AeroplaneStatusProps {
	state: AeroplaneState;
	legalMoves?: readonly ResolvedMove[];
	isAnimating?: boolean;
}

const colorLabel: Record<AeroplaneColor, string> = {
	red: 'Red',
	yellow: 'Yellow',
	blue: 'Blue',
	green: 'Green',
};

function statusCopy(
	state: AeroplaneState,
	legalMoves: readonly ResolvedMove[]
): string {
	if (state.phase === 'finished') {
		return state.winner
			? `${colorLabel[state.winner]} wins the match.`
			: 'Match ended.';
	}
	if (state.phase === 'awaiting-choice') {
		if (legalMoves.length === 0)
			return 'No legal moves — turn passes automatically.';
		return legalMoves.length === 1
			? 'One legal plane will move.'
			: `${legalMoves.length} legal planes — choose one.`;
	}
	return `${colorLabel[state.currentPlayer]} to roll.`;
}

export const AeroplaneStatus: React.FC<AeroplaneStatusProps> = ({
	state,
	legalMoves = [],
	isAnimating = false,
}) => {
	const die = state.pendingRoll === null ? '—' : String(state.pendingRoll);
	const message = statusCopy(state, legalMoves);

	return (
		<Panel
			accent='aeroplane'
			className='overflow-hidden'
			aria-label='Aeroplane match status'
		>
			<div
				role='status'
				aria-live='polite'
				aria-atomic='true'
				className='flex flex-wrap items-center gap-x-5 gap-y-2 p-3 sm:p-4'
			>
				<div className='min-w-0 flex-1'>
					<p className='text-xs font-mono uppercase tracking-[0.18em] text-ivory-dim'>
						Current turn
					</p>
					<p className='truncate font-display text-xl font-semibold text-ivory'>
						{colorLabel[state.currentPlayer]}
					</p>
				</div>
				<div className='shrink-0'>
					<p className='text-xs font-mono uppercase tracking-[0.18em] text-ivory-dim'>
						Die
					</p>
					<p className='text-center font-mono text-xl font-semibold text-aeroplane'>
						{die}
					</p>
				</div>
				<div className='hidden min-w-0 basis-full border-t border-line pt-2 text-sm text-ivory-dim sm:block'>
					{message}
					{isAnimating && (
						<span className='ml-2 text-aeroplane'>Route in flight…</span>
					)}
				</div>
				<div className='min-w-0 basis-full border-t border-line pt-2 text-sm text-ivory-dim sm:hidden'>
					<span>{message}</span>
					{isAnimating && (
						<span className='ml-2 text-aeroplane'>In flight</span>
					)}
				</div>
			</div>
		</Panel>
	);
};

export default AeroplaneStatus;
