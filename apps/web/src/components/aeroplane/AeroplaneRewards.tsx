import React, { useEffect, useMemo, useState } from 'react';
import Panel from '../ui/Panel';
import { Button } from '../ui/Button';
import {
	SKIN_CATALOG,
	type HumanMoment,
	type StarBreakdown,
} from '../../lib/aeroplane/rewards';
import type { AeroplaneColor } from '../../lib/aeroplane/types';
import type { AeroplaneProgressStatus } from '../../hooks/useAeroplaneProgress';

/** Count-up duration for the earned-star total. */
export const AEROPLANE_REWARDS_COUNT_MS = 700;

const colorLabel: Record<AeroplaneColor, string> = {
	red: 'Red',
	yellow: 'Yellow',
	blue: 'Blue',
	green: 'Green',
};

export interface AeroplaneRewardsProgressSummary {
	status: AeroplaneProgressStatus;
	lifetimeStars: number;
}

export interface AeroplaneRewardsProps {
	/** Stable finished-match identity; a change restarts the count-up. */
	matchKey: string;
	winner: AeroplaneColor | null;
	/** Human capture/finish counts for the summary rows. */
	capturesMade: number;
	planesFinished: number;
	breakdown: StarBreakdown;
	/** Ephemeral notable moments; the panel surfaces the best one. */
	moments: readonly HumanMoment[];
	/** Shared reduced-motion flag; skips the count-up entirely. */
	reducedMotion: boolean;
	progress: AeroplaneRewardsProgressSummary;
	onRetryProgress: () => void;
}

/**
 * Best entry: any capture outranks any coin gain; captures rank by their
 * structured count, coin gains by their amount, latest wins ties.
 */
export function pickBestMoment(
	moments: readonly HumanMoment[]
): HumanMoment | null {
	let best: HumanMoment | null = null;
	let bestRank: { captures: number; coinGain: number; index: number } | null =
		null;
	for (let index = 0; index < moments.length; index += 1) {
		const moment = moments[index]!;
		const rank = {
			captures: moment.kind === 'capture' ? (moment.captures ?? 0) : 0,
			coinGain: moment.coinGain ?? 0,
			index,
		};
		if (
			bestRank === null ||
			rank.captures > bestRank.captures ||
			(rank.captures === bestRank.captures &&
				rank.coinGain > bestRank.coinGain) ||
			(rank.captures === bestRank.captures &&
				rank.coinGain === bestRank.coinGain &&
				rank.index > bestRank.index)
		) {
			best = moment;
			bestRank = rank;
		}
	}
	return best;
}

function skinDisplayName(id: string): string {
	return id.charAt(0).toUpperCase() + id.slice(1);
}

/**
 * Terminal match rewards panel: winner, count-up star total with breakdown,
 * human capture/finish stats, the best notable moment (or aggregate
 * highlights), and — when the progress hook is loaded — lifetime stars with
 * the next skin unlock. Guests see the per-match reward only; a failed
 * progress GET offers the hook's retry.
 */
const AeroplaneRewards: React.FC<AeroplaneRewardsProps> = ({
	matchKey,
	winner,
	capturesMade,
	planesFinished,
	breakdown,
	moments,
	reducedMotion,
	progress,
	onRetryProgress,
}) => {
	const bestMoment = useMemo(() => pickBestMoment(moments), [moments]);
	const total = breakdown.total;
	const animate = !reducedMotion && typeof requestAnimationFrame === 'function';
	const [displayed, setDisplayed] = useState(() => (animate ? 0 : total));
	const [settled, setSettled] = useState(() => !animate);

	// Count-up keyed to the match identity. Reduced motion or missing rAF
	// renders the exact final number immediately; otherwise the number counts
	// up over AEROPLANE_REWARDS_COUNT_MS and the animation cancels on identity
	// change or unmount.
	useEffect(() => {
		if (!animate) {
			setDisplayed(total);
			setSettled(true);
			return;
		}
		setDisplayed(0);
		setSettled(false);
		let frame: number | null = null;
		let startedAt: number | null = null;
		const tick = (now: number) => {
			if (startedAt === null) startedAt = now;
			const fraction = Math.min(
				1,
				(now - startedAt) / AEROPLANE_REWARDS_COUNT_MS
			);
			setDisplayed(Math.round(total * fraction));
			if (fraction < 1) {
				frame = requestAnimationFrame(tick);
			} else {
				setSettled(true);
			}
		};
		frame = requestAnimationFrame(tick);
		return () => {
			if (frame !== null && typeof cancelAnimationFrame === 'function') {
				cancelAnimationFrame(frame);
			}
		};
	}, [animate, matchKey, total]);

	const nextUnlock = SKIN_CATALOG.find(
		entry => entry.stars > progress.lifetimeStars
	);

	return (
		<Panel
			accent='aeroplane'
			raised
			className='overflow-hidden'
			aria-label='Match rewards'
			data-testid='aeroplane-rewards'
		>
			<div className='space-y-3 p-4'>
				<div className='flex items-baseline justify-between gap-2'>
					<p className='text-xs font-mono uppercase tracking-[0.18em] text-ivory-dim'>
						Match rewards
					</p>
					<p className='font-display text-lg font-semibold text-ivory'>
						{winner ? `${colorLabel[winner]} wins the match!` : 'Match ended.'}
					</p>
				</div>

				{bestMoment ? (
					<p
						data-testid='aeroplane-rewards-moment'
						className='text-sm font-semibold text-brass'
					>
						{bestMoment.label}
					</p>
				) : (
					<p
						data-testid='aeroplane-rewards-moment'
						className='text-sm text-ivory-dim'
					>
						{capturesMade} {capturesMade === 1 ? 'capture' : 'captures'} ·{' '}
						{planesFinished} {planesFinished === 1 ? 'plane' : 'planes'}{' '}
						finished
					</p>
				)}

				<div className='flex items-baseline gap-2'>
					<span
						data-testid='aeroplane-rewards-total'
						className='font-display text-4xl font-bold text-aeroplane'
					>
						{displayed}
					</span>
					<span className='text-sm text-ivory-dim'>
						stars earned this match
					</span>
				</div>
				<ul
					aria-label='Star breakdown'
					className='space-y-1 text-sm text-ivory-dim'
				>
					<li className='flex justify-between'>
						<span>Win</span>
						<span className='font-mono'>+{breakdown.win}</span>
					</li>
					<li className='flex justify-between'>
						<span>Captures ({capturesMade})</span>
						<span className='font-mono'>+{breakdown.captures}</span>
					</li>
					<li className='flex justify-between'>
						<span>Planes finished ({planesFinished})</span>
						<span className='font-mono'>+{breakdown.finished}</span>
					</li>
					{breakdown.coins > 0 && (
						<li className='flex justify-between'>
							<span>Sky Tycoon surplus</span>
							<span className='font-mono'>+{breakdown.coins}</span>
						</li>
					)}
				</ul>
				{/* Only the final total is announced, exactly once per match. */}
				<p className='sr-only' role='status'>
					{settled ? `You earned ${total} stars this match.` : undefined}
				</p>

				{progress.status === 'loaded' && (
					<div
						data-testid='aeroplane-rewards-progress'
						className='space-y-1 border-t border-line pt-2 text-sm text-ivory-dim'
					>
						<p>
							Lifetime stars:{' '}
							<span className='font-mono text-ivory'>
								{progress.lifetimeStars}
							</span>
						</p>
						<p>
							{nextUnlock
								? `Next unlock: ${skinDisplayName(nextUnlock.id)} at ${
										nextUnlock.stars
									} stars (${nextUnlock.stars - progress.lifetimeStars} to go).`
								: 'Every skin is unlocked.'}
						</p>
					</div>
				)}
				{progress.status === 'failed' && (
					<div className='space-y-2 border-t border-line pt-2 text-sm text-ivory-dim'>
						<p>Progress unavailable.</p>
						<Button variant='outline' size='sm' onClick={onRetryProgress}>
							Retry
						</Button>
					</div>
				)}
			</div>
		</Panel>
	);
};

export default AeroplaneRewards;
