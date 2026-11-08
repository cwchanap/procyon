import React, { useEffect, useState } from 'react';
import Panel from '../ui/Panel';
import { colorLabel } from '../../lib/aeroplane/labels';
import { tileIconUrl } from '../../lib/aeroplane/assets';
import { AEROPLANE_VISUAL_MAX_MS } from '../../lib/aeroplane/presentation';
import { TURN_ORDER } from '../../lib/aeroplane/topology';
import type { AeroplaneState, ResolvedMove } from '../../lib/aeroplane/types';
import type {
	AeroplaneRollOnlyFeedEntry,
	AeroplaneRollPresentation,
} from '../../hooks/useAeroplaneMatch';
import { rollOutcomeCopy } from './AeroplaneEventFeed';

export interface AeroplaneStatusProps {
	state: AeroplaneState;
	legalMoves?: readonly ResolvedMove[];
	isHumanTurn?: boolean;
	isAnimating?: boolean;
	/** Latest roll signal; its face outranks `state.pendingRoll` when present. */
	rollPresentation?: AeroplaneRollPresentation | null;
	/** Latest committed roll with no legal move, announced in the live region. */
	noMoveNotice?: AeroplaneRollOnlyFeedEntry | null;
	/** Shared reduced-motion flag; disables the decorative die tumble. */
	reducedMotion?: boolean;
}

/**
 * Turn-status line: the match result once finished, the acting player's
 * pacing copy on AI turns, or the human's roll/choice prompt.
 */
function statusCopy(
	state: AeroplaneState,
	legalMoves: readonly ResolvedMove[],
	isHumanTurn: boolean
): string {
	if (state.phase === 'finished') {
		return state.winner
			? `${colorLabel[state.winner]} wins the match.`
			: 'Match ended.';
	}
	if (!isHumanTurn) {
		return state.phase === 'awaiting-choice'
			? `${colorLabel[state.currentPlayer]} is choosing a move…`
			: `${colorLabel[state.currentPlayer]} is rolling…`;
	}
	if (state.phase === 'awaiting-choice') {
		// The engine never commits awaiting-choice without legal moves, but a
		// restored or fixture state can: never ask for a plane that does not exist.
		if (legalMoves.length === 0) return 'No legal planes can move.';
		return legalMoves.length === 1
			? 'One legal plane — choose it.'
			: `${legalMoves.length} legal planes — choose one.`;
	}
	return `${colorLabel[state.currentPlayer]} to roll.`;
}

export const AeroplaneStatus: React.FC<AeroplaneStatusProps> = ({
	state,
	legalMoves = [],
	isHumanTurn = true,
	isAnimating = false,
	rollPresentation = null,
	noMoveNotice = null,
	reducedMotion = false,
}) => {
	const face = rollPresentation?.face ?? state.pendingRoll;
	const roller = rollPresentation?.color ?? state.currentPlayer;
	const die = face === null ? '—' : String(face);
	// The no-move outcome rides the same live region so collapsed-feed and
	// screen-reader users hear why a turn ended without a move.
	const message =
		statusCopy(state, legalMoves, isHumanTurn) +
		(noMoveNotice === null ? '' : ` ${rollOutcomeCopy(noMoveNotice)}`);

	// Decorative tumble keyed to the roll id. It never alters the displayed
	// outcome: the tumble is drawn outside the live region (over the die
	// column), and the authoritative face lives in one fixed die element that
	// only ever mutates its text once per roll. Canceled — settling on the
	// real face — by Skip (animate=false), null, reduced motion, missing rAF,
	// or unmount, and bounded like board motion.
	const [tumbleFace, setTumbleFace] = useState<number | null>(null);
	const rollId = rollPresentation?.id ?? null;
	const tumbleEnabled = rollPresentation?.animate === true && !reducedMotion;

	// Start the tumble during render so the settled face never flashes for
	// one frame before the first tick; without rAF nothing tumbles at all.
	const [seenRollId, setSeenRollId] = useState<number | null>(rollId);
	if (rollId !== seenRollId) {
		setSeenRollId(rollId);
		setTumbleFace(
			tumbleEnabled && typeof requestAnimationFrame === 'function'
				? ((rollId ?? 0) % 6) + 1
				: null
		);
	}

	useEffect(() => {
		if (
			!tumbleEnabled ||
			rollId === null ||
			typeof requestAnimationFrame !== 'function'
		) {
			setTumbleFace(null);
			return;
		}
		let frame: number | null = null;
		let startedAt: number | null = null;
		let step = 0;
		const tick = (now: number) => {
			if (startedAt === null) startedAt = now;
			if (now - startedAt >= AEROPLANE_VISUAL_MAX_MS) {
				setTumbleFace(null);
				return;
			}
			step += 1;
			setTumbleFace(((step + rollId) % 6) + 1);
			frame = requestAnimationFrame(tick);
		};
		frame = requestAnimationFrame(tick);
		return () => {
			if (frame !== null && typeof cancelAnimationFrame === 'function') {
				cancelAnimationFrame(frame);
			}
		};
	}, [tumbleEnabled, rollId]);

	return (
		<Panel
			accent='aeroplane'
			className='overflow-hidden'
			aria-label='Aeroplane match status'
		>
			<div className='flex flex-wrap items-center gap-x-5 gap-y-2 p-3 sm:p-4'>
				<div
					role='status'
					aria-live='polite'
					aria-atomic='true'
					className='contents'
				>
					<div className='order-1 min-w-0 flex-1'>
						<p className='text-xs font-mono uppercase tracking-[0.18em] text-ivory-dim'>
							Current turn
						</p>
						<p className='truncate font-display text-xl font-semibold text-ivory'>
							{colorLabel[state.currentPlayer]}
						</p>
					</div>
					<p className='sr-only'>{`Die ${die}${face === null ? '' : `, rolled by ${colorLabel[roller]}`}`}</p>
					<div className='order-3 hidden min-w-0 basis-full border-t border-line pt-2 text-sm text-ivory-dim sm:block'>
						{message}
						{isAnimating && (
							<span className='ml-2 text-aeroplane'>Route in flight…</span>
						)}
					</div>
					<div className='order-3 min-w-0 basis-full border-t border-line pt-2 text-sm text-ivory-dim sm:hidden'>
						<span>{message}</span>
						{isAnimating && (
							<span className='ml-2 text-aeroplane'>In flight</span>
						)}
					</div>
				</div>
				<div className='order-2 shrink-0' data-testid='aeroplane-status-die'>
					<p className='text-xs font-mono uppercase tracking-[0.18em] text-ivory-dim'>
						Die
					</p>
					<div className='relative'>
						<p
							data-testid='aeroplane-die-face'
							className={`text-center font-mono text-xl font-semibold ${
								tumbleFace === null ? 'text-aeroplane' : 'sr-only'
							}`}
						>
							{die}
						</p>
						{tumbleFace !== null && (
							<p
								aria-hidden='true'
								data-testid='aeroplane-die-tumble'
								className='text-center font-mono text-xl font-semibold text-ivory-dim'
							>
								{tumbleFace}
							</p>
						)}
					</div>
					{face !== null && (
						<p
							data-testid='aeroplane-die-roller'
							className='text-center text-xs font-mono uppercase tracking-[0.18em] text-ivory-dim'
						>
							Rolled by {colorLabel[roller]}
						</p>
					)}
				</div>
				{state.tycoon && (
					<ul
						aria-label='Sky Tycoon balances'
						className='order-4 grid basis-full grid-cols-2 gap-2 border-t border-line pt-2 text-sm sm:grid-cols-4'
					>
						{TURN_ORDER.map(color => {
							const tycoon = state.tycoon!;
							const shields = state.planes.filter(
								plane =>
									plane.color === color && tycoon.shields.includes(plane.id)
							).length;
							return (
								<li
									key={color}
									data-testid={`aeroplane-coins-${color}`}
									className='min-w-0 text-ivory-dim'
								>
									<span className='font-semibold text-ivory'>
										{colorLabel[color]}
									</span>{' '}
									<img
										src={tileIconUrl('coin')}
										alt=''
										aria-hidden='true'
										className='mr-1 inline-block h-4 w-4 align-[-0.2em]'
									/>
									<span className='font-mono text-aeroplane'>
										{tycoon.coins[color]}
									</span>{' '}
									coins
									{shields > 0 && (
										<span className='block text-xs'>
											{shields === 1
												? '1 shielded plane'
												: `${shields} shielded planes`}
										</span>
									)}
									{(tycoon.skipNextRoll[color] ||
										tycoon.skipPending[color]) && (
										<span className='block text-xs'>Skips next roll</span>
									)}
								</li>
							);
						})}
					</ul>
				)}
			</div>
		</Panel>
	);
};

export default AeroplaneStatus;
