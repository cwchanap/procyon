import React, { useEffect, useState } from 'react';
import Panel from '../ui/Panel';
import { AEROPLANE_VISUAL_MAX_MS } from '../../lib/aeroplane/presentation';
import type {
	AeroplaneColor,
	AeroplaneState,
	ResolvedMove,
} from '../../lib/aeroplane/types';
import type { AeroplaneRollPresentation } from '../../hooks/useAeroplaneMatch';

export interface AeroplaneStatusProps {
	state: AeroplaneState;
	legalMoves?: readonly ResolvedMove[];
	isHumanTurn?: boolean;
	isAnimating?: boolean;
	/** Latest roll signal; its face outranks `state.pendingRoll` when present. */
	rollPresentation?: AeroplaneRollPresentation | null;
	/** Shared reduced-motion flag; disables the decorative die tumble. */
	reducedMotion?: boolean;
}

const colorLabel: Record<AeroplaneColor, string> = {
	red: 'Red',
	yellow: 'Yellow',
	blue: 'Blue',
	green: 'Green',
};

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
	isHumanTurn = true,
	isAnimating = false,
	rollPresentation = null,
	reducedMotion = false,
}) => {
	const face = rollPresentation?.face ?? state.pendingRoll;
	const roller = rollPresentation?.color ?? state.currentPlayer;
	const die = face === null ? '—' : String(face);
	const message = statusCopy(state, legalMoves, isHumanTurn);

	// Decorative tumble keyed to the roll id. It never alters the displayed
	// outcome: the authoritative face stays in the live region (sr-only while
	// frames run) and frames themselves are aria-hidden. Canceled — settling
	// on the real face — by Skip (animate=false), null, reduced motion,
	// missing rAF, or unmount, and bounded like board motion.
	const [tumbleFace, setTumbleFace] = useState<number | null>(null);
	const rollId = rollPresentation?.id ?? null;
	const tumbleEnabled = rollPresentation?.animate === true && !reducedMotion;

	useEffect(() => {
		if (!tumbleEnabled || typeof requestAnimationFrame !== 'function') return;
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
			setTumbleFace(((step + (rollId ?? 0)) % 6) + 1);
			frame = requestAnimationFrame(tick);
		};
		frame = requestAnimationFrame(tick);
		return () => {
			if (frame !== null && typeof cancelAnimationFrame === 'function') {
				cancelAnimationFrame(frame);
			}
			setTumbleFace(null);
		};
	}, [tumbleEnabled, rollId]);

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
				<div className='shrink-0' data-testid='aeroplane-status-die'>
					<p className='text-xs font-mono uppercase tracking-[0.18em] text-ivory-dim'>
						Die
					</p>
					{tumbleFace === null ? (
						<p
							data-testid='aeroplane-die-face'
							className='text-center font-mono text-xl font-semibold text-aeroplane'
						>
							{die}
						</p>
					) : (
						<>
							<p data-testid='aeroplane-die-face' className='sr-only'>
								{die}
							</p>
							<p
								aria-hidden='true'
								data-testid='aeroplane-die-tumble'
								className='text-center font-mono text-xl font-semibold text-ivory-dim'
							>
								{tumbleFace}
							</p>
						</>
					)}
					<p
						data-testid='aeroplane-die-roller'
						className='text-center text-xs font-mono uppercase tracking-[0.18em] text-ivory-dim'
					>
						Rolled by {colorLabel[roller]}
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
