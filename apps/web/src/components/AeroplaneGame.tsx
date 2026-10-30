import React, {
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from 'react';
import PageHeader from './PageHeader';
import AeroplaneBoard, {
	type AeroplaneBoardCue,
} from './aeroplane/AeroplaneBoard';
import AeroplaneEventFeed from './aeroplane/AeroplaneEventFeed';
import AeroplaneRewards from './aeroplane/AeroplaneRewards';
import AeroplaneSetup from './aeroplane/AeroplaneSetup';
import AeroplaneStatus from './aeroplane/AeroplaneStatus';
import { scoreMatch, type HumanMoment } from '../lib/aeroplane/rewards';
import { useAeroplaneProgress } from '../hooks/useAeroplaneProgress';
import {
	playAeroplaneCue,
	primeAeroplaneAudio,
	readAeroplaneMuted,
	writeAeroplaneMuted,
} from '../lib/aeroplane/sound';
import {
	buildAeroplaneHistoryPayload,
	useAeroplaneMatch,
	type UseAeroplaneMatchOptions,
} from '../hooks/useAeroplaneMatch';

/** How long the transient moment banner stays up before auto-hiding. */
export const AEROPLANE_MOMENT_BANNER_MS = 2200;

export interface AeroplaneGameProps {
	/** Test-only controller injection; production uses the default hook. */
	controllerOptions?: UseAeroplaneMatchOptions;
}

const AeroplaneGame: React.FC<AeroplaneGameProps> = ({ controllerOptions }) => {
	const match = useAeroplaneMatch(controllerOptions);
	// Server-sourced lifetime progress feeds the terminal rewards panel only.
	const progress = useAeroplaneProgress({
		historySavedRevision: match.historySavedRevision,
	});

	// Transient banner for the latest notable human moment: each new moment
	// restarts a short cancelable timer, reset/resume clears the moment list
	// (emptying the banner), and unmount cancels the timer.
	const [momentBanner, setMomentBanner] = useState<HumanMoment | null>(null);
	const humanMoments = match.humanMoments;
	useEffect(() => {
		const latest = humanMoments[humanMoments.length - 1] ?? null;
		setMomentBanner(latest);
		if (!latest) return;
		const timer = setTimeout(
			() => setMomentBanner(null),
			AEROPLANE_MOMENT_BANNER_MS
		);
		return () => clearTimeout(timer);
	}, [humanMoments]);

	// Single shared reduced-motion subscription (EventFeed listener pattern);
	// the flag drives both the board playback and the status die tumble.
	const [reducedMotion, setReducedMotion] = useState(false);
	useEffect(() => {
		if (typeof window === 'undefined' || !window.matchMedia) return;
		const media = window.matchMedia('(prefers-reduced-motion: reduce)');
		const update = () => setReducedMotion(media.matches);
		update();
		if (typeof media.addEventListener === 'function') {
			media.addEventListener('change', update);
		} else if (typeof media.addListener === 'function') {
			media.addListener(update);
		}
		return () => {
			if (typeof media.removeEventListener === 'function') {
				media.removeEventListener('change', update);
			} else if (typeof media.removeListener === 'function') {
				media.removeListener(update);
			}
		};
	}, []);

	// Mute preference: unmuted for the SSR/hydration markup, read after mount.
	const [muted, setMuted] = useState(false);
	useEffect(() => {
		setMuted(readAeroplaneMuted());
	}, []);

	const toggleMuted = () => {
		const next = !muted;
		setMuted(next);
		writeAeroplaneMuted(next);
	};

	const handleCue = useCallback(
		(cue: AeroplaneBoardCue) => playAeroplaneCue(cue, muted),
		[muted]
	);

	// One roll cue per roll id — never per decorative tumble frame. Audio is
	// independent of reduced motion; only mute (or reset/resume nulling the
	// roll) silences it.
	const rollId = match.rollPresentation?.id ?? null;
	const cuedRollIdRef = useRef<number | null>(null);
	useEffect(() => {
		if (rollId === null) {
			cuedRollIdRef.current = null;
			return;
		}
		if (cuedRollIdRef.current === rollId) return;
		cuedRollIdRef.current = rollId;
		playAeroplaneCue('roll', muted);
	}, [rollId, muted]);

	// The preview uses the exact projection and scoring path as persisted
	// history; an unfinished match suppresses the panel entirely.
	const finishedMatch =
		match.activeMatch.state.phase === 'finished' ? match.activeMatch : null;
	const rewardsBreakdown = useMemo(
		() =>
			finishedMatch
				? scoreMatch(buildAeroplaneHistoryPayload(finishedMatch))
				: null,
		[finishedMatch]
	);

	return (
		<div className='space-y-8'>
			<PageHeader
				eyebrow='Aeroplane Chess'
				title='Aeroplane Chess'
				accent='aeroplane'
				className='mb-0'
			/>
			<p className='max-w-2xl text-base leading-relaxed text-ivory-dim'>
				Pilot four planes around the shared track, chain matching-colour jumps,
				and race three local opponents home.
			</p>

			<div className='grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,22rem)] lg:items-start'>
				<section
					aria-label='Aeroplane match board'
					className='min-w-0 space-y-4'
				>
					{rewardsBreakdown && finishedMatch && (
						<AeroplaneRewards
							matchKey={`${finishedMatch.startedAt}:${finishedMatch.rootSeed}`}
							winner={finishedMatch.state.winner}
							capturesMade={
								finishedMatch.state.stats.capturesMade[
									finishedMatch.config.humanColor
								]
							}
							planesFinished={
								finishedMatch.state.stats.finished[
									finishedMatch.config.humanColor
								]
							}
							breakdown={rewardsBreakdown}
							moments={humanMoments}
							reducedMotion={reducedMotion}
							progress={{
								status: progress.status,
								lifetimeStars: progress.lifetimeStars,
							}}
							onRetryProgress={progress.retry}
						/>
					)}
					{momentBanner && (
						<p
							role='status'
							data-testid='aeroplane-moment-banner'
							className='rounded-md border border-brass bg-ink-600 px-4 py-2 text-sm font-semibold text-brass'
						>
							{momentBanner.label}
						</p>
					)}
					<AeroplaneBoard
						state={match.state}
						legalMoves={match.legalMoves}
						isHumanTurn={match.isHumanTurn}
						presentationQueue={match.presentationQueue}
						reducedMotion={reducedMotion}
						onCue={handleCue}
						skinId={progress.selectedSkin}
						onRoll={() => {
							// A direct user gesture is the earliest safe audio unlock.
							primeAeroplaneAudio();
							match.roll();
						}}
						onSelectMove={match.selectMove}
					/>
					<AeroplaneStatus
						state={match.state}
						legalMoves={match.legalMoves}
						isHumanTurn={match.isHumanTurn}
						isAnimating={match.isAnimating}
						rollPresentation={match.rollPresentation}
						reducedMotion={reducedMotion}
					/>
				</section>

				<aside className='min-w-0 space-y-4'>
					<AeroplaneSetup
						setup={match.setup}
						onChange={match.setSetup}
						onStart={match.newMatch}
						progress={progress}
					/>
					<AeroplaneEventFeed
						events={match.eventFeed}
						onSkipAnimations={match.skipAnimations}
						tycoon={match.state.config.mode === 'sky-tycoon'}
					/>
					<button
						type='button'
						onClick={toggleMuted}
						aria-pressed={!muted}
						data-testid='aeroplane-mute-toggle'
						className='min-h-11 w-full rounded-md border border-line px-4 py-2 text-sm font-medium text-ivory-dim transition-colors hover:border-line-brass hover:bg-ink-600 hover:text-ivory motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brass focus-visible:ring-offset-2 focus-visible:ring-offset-ink-900'
					>
						{muted ? 'Sound muted' : 'Sound on'}
					</button>
					<button
						type='button'
						onClick={() => match.reset()}
						className='min-h-11 w-full rounded-md border border-line px-4 py-2 text-sm font-medium text-ivory-dim transition-colors hover:border-line-brass hover:bg-ink-600 hover:text-ivory motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brass focus-visible:ring-offset-2 focus-visible:ring-offset-ink-900'
					>
						Reset match
					</button>
				</aside>
			</div>

			<div className='sr-only' role='status' aria-live='polite'>
				{match.state.phase === 'finished'
					? `${match.state.winner ?? match.state.currentPlayer} wins.`
					: match.isAnimating
						? 'A route is being presented.'
						: undefined}
			</div>
		</div>
	);
};

export default AeroplaneGame;
