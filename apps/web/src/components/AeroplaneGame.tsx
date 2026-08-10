import React from 'react';
import PageHeader from './PageHeader';
import AeroplaneBoard from './aeroplane/AeroplaneBoard';
import AeroplaneEventFeed from './aeroplane/AeroplaneEventFeed';
import AeroplaneSetup from './aeroplane/AeroplaneSetup';
import AeroplaneStatus from './aeroplane/AeroplaneStatus';
import {
	useAeroplaneMatch,
	type UseAeroplaneMatchOptions,
} from '../hooks/useAeroplaneMatch';

export interface AeroplaneGameProps {
	/** Test-only controller injection; production uses the default hook. */
	controllerOptions?: UseAeroplaneMatchOptions;
}

const AeroplaneGame: React.FC<AeroplaneGameProps> = ({ controllerOptions }) => {
	const match = useAeroplaneMatch(controllerOptions);

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
					<AeroplaneBoard
						state={match.state}
						legalMoves={match.legalMoves}
						isHumanTurn={match.isHumanTurn}
						presentationQueue={match.presentationQueue}
						onRoll={match.roll}
						onSelectMove={match.selectMove}
					/>
					<AeroplaneStatus
						state={match.state}
						legalMoves={match.legalMoves}
						isHumanTurn={match.isHumanTurn}
						isAnimating={match.isAnimating}
					/>
				</section>

				<aside className='min-w-0 space-y-4'>
					<AeroplaneSetup
						setup={match.setup}
						onChange={match.setSetup}
						onStart={match.newMatch}
					/>
					<AeroplaneEventFeed
						events={match.eventFeed}
						onSkipAnimations={match.skipAnimations}
					/>
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
