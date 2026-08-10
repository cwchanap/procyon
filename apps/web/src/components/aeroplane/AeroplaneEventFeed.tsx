import React, { useEffect, useId, useState } from 'react';
import { Button } from '../ui/Button';
import type {
	AeroplaneActionActor,
	AeroplaneActionRecord,
	AeroplaneColor,
	AeroplaneEvent,
	AeroplanePosition,
	ResolvedMove,
} from '../../lib/aeroplane/types';

export interface AeroplanePresentationLike {
	id: number;
	move: ResolvedMove;
	events: AeroplaneEvent[];
	action: {
		actor: AeroplaneActionActor;
		color: AeroplaneColor;
		roll: number;
	} & Partial<AeroplaneActionRecord>;
}

export interface AeroplaneEventFeedProps {
	events?: readonly AeroplanePresentationLike[];
	eventFeed?: readonly AeroplanePresentationLike[];
	onSkipAnimations?: () => void;
}

const colorLabel: Record<AeroplaneColor, string> = {
	red: 'Red',
	yellow: 'Yellow',
	blue: 'Blue',
	green: 'Green',
};

function endpointCopy(position: AeroplanePosition): string {
	switch (position.kind) {
		case 'hangar':
			return 'hangar';
		case 'launch':
			return 'launch pad';
		case 'track':
			return `track ${position.progress}`;
		case 'home':
			return `home ${position.homeIndex + 1}`;
		case 'finished':
			return 'finish';
	}
}

function eventCopy(presentation: AeroplanePresentationLike): string {
	const move = presentation.move;
	const planeNumber = Number(move.planeId.split('-').at(-1) ?? 0) + 1;
	const actor = presentation.action.actor === 'ai' ? 'AI' : 'You';
	const route = move.events
		.map(event => {
			switch (event.type) {
				case 'jump':
					return 'jump';
				case 'flight':
					return 'long flight';
				default:
					return null;
			}
		})
		.filter(value => value !== null);
	const routeLabel = route.length > 0 ? ` via ${route.join(' and ')}` : '';
	return `${actor}: ${colorLabel[move.color]} plane ${planeNumber}${routeLabel} to ${endpointCopy(move.finalEndpoint)}.`;
}

export const AeroplaneEventFeed: React.FC<AeroplaneEventFeedProps> = ({
	events = [],
	eventFeed,
	onSkipAnimations,
}) => {
	const [open, setOpen] = useState(false);
	// Start expanded so SSR markup is accessible and hydration-stable. Mobile
	// collapses after the media query effect runs; desktop remains expanded.
	const [isDesktop, setIsDesktop] = useState(true);
	const contentId = useId();
	const feed = eventFeed ?? events;

	useEffect(() => {
		if (typeof window === 'undefined' || !window.matchMedia) return;
		const media = window.matchMedia('(min-width: 640px)');
		const update = () => setIsDesktop(media.matches);
		update();
		media.addEventListener?.('change', update);
		media.addListener?.(update);
		return () => {
			media.removeEventListener?.('change', update);
			media.removeListener?.(update);
		};
	}, []);

	const expanded = isDesktop || open;

	return (
		<section
			aria-labelledby={`${contentId}-title`}
			className='rounded-lg border border-line bg-ink-700'
		>
			<div className='flex items-center justify-between gap-3 border-b border-line px-3 py-3 sm:px-4'>
				<h2
					id={`${contentId}-title`}
					className='font-display text-lg font-semibold text-ivory'
				>
					Event feed
					<span className='ml-1 text-sm font-sans font-normal text-ivory-dim'>
						({feed.length})
					</span>
				</h2>
				<div className='flex items-center gap-2'>
					{!isDesktop && (
						<button
							type='button'
							className='min-h-11 rounded-md border border-line px-3 text-sm text-ivory-dim transition-colors hover:bg-ink-600 hover:text-ivory motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brass focus-visible:ring-offset-2 focus-visible:ring-offset-ink-900'
							aria-expanded={open}
							aria-controls={contentId}
							aria-label='Event feed'
							onClick={() => setOpen(previous => !previous)}
						>
							{open ? 'Hide feed' : 'Show feed'}
						</button>
					)}
					{onSkipAnimations && (
						<Button
							type='button'
							variant='ghost'
							size='sm'
							onClick={onSkipAnimations}
							className='min-h-11 touch-manipulation'
						>
							Skip animations
						</Button>
					)}
				</div>
			</div>
			<div
				id={contentId}
				data-testid='aeroplane-event-feed-content'
				aria-hidden={!expanded}
				className={`${expanded ? 'block' : 'hidden'} divide-y divide-line sm:block`}
			>
				{feed.length === 0 ? (
					<p className='px-3 py-4 text-sm text-ivory-dim sm:px-4'>
						Your flight log will appear here.
					</p>
				) : (
					feed
						.slice()
						.reverse()
						.map(presentation => (
							<div
								key={presentation.id}
								className='px-3 py-3 text-sm text-ivory-dim sm:px-4'
							>
								{eventCopy(presentation)}
							</div>
						))
				)}
			</div>
		</section>
	);
};

export default AeroplaneEventFeed;
