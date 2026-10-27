import React, { useEffect, useId, useState } from 'react';
import { Button } from '../ui/Button';
import type {
	AeroplaneActionActor,
	AeroplaneActionRecord,
	AeroplaneColor,
	AeroplaneEvent,
	AeroplaneEventType,
	AeroplanePosition,
	ResolvedMove,
	TycoonChanceCard,
	TycoonCoinReason,
	TycoonEffectEvent,
} from '../../lib/aeroplane/types';
import { toPosition } from '../../lib/aeroplane/topology';

export interface AeroplanePresentationLike {
	id: number;
	/** Null for a roll-only Customs skip entry; no move is fabricated. */
	move: ResolvedMove | null;
	events: AeroplaneEvent[];
	chatter?: string;
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

const coinReasonLabel: Record<TycoonCoinReason, string> = {
	departure: 'departure bonus',
	'airport-buy': 'airport purchase',
	chance: 'Chance',
	customs: 'Customs',
	tax: 'Tax',
};

const cardLabel: Record<TycoonChanceCard, string> = {
	'gain-4': 'gain 4 coins',
	'gain-2': 'gain 2 coins',
	'lose-2': 'lose 2 coins',
	'steal-3': 'steal 3 coins',
	boost: 'Boost',
	tailwind: 'Tailwind',
	shield: 'Shield',
	storm: 'Storm',
	customs: 'Customs',
	crash: 'Crash',
};

function coins(amount: number): string {
	return amount === 1 ? '1 coin' : `${amount} coins`;
}

function planeName(planeId: string): string {
	const color = planeId.split('-')[0] as AeroplaneColor;
	const number = Number(planeId.split('-').at(-1) ?? 0) + 1;
	return `${colorLabel[color]} plane ${number}`;
}

const POSITIONAL_EVENT_TYPES: ReadonlySet<string> = new Set<AeroplaneEventType>(
	['move', 'jump', 'flight', 'warp']
);

function isTycoonEffect(
	event: AeroplaneEvent | TycoonEffectEvent
): event is TycoonEffectEvent {
	return !POSITIONAL_EVENT_TYPES.has(event.type);
}

/** Readable copy for one committed, coordinate-free Sky Tycoon effect. */
function effectCopy(event: TycoonEffectEvent): string {
	switch (event.type) {
		case 'coins':
			return event.amount >= 0
				? `${colorLabel[event.color]} gains ${coins(event.amount)} (${coinReasonLabel[event.reason]}).`
				: `${colorLabel[event.color]} pays ${coins(-event.amount)} (${coinReasonLabel[event.reason]}).`;
		case 'transfer':
			return event.reason === 'steal'
				? `${colorLabel[event.to]} steals ${coins(event.amount)} from ${colorLabel[event.from]}.`
				: `${colorLabel[event.from]} pays ${colorLabel[event.to]} ${coins(event.amount)} in airport toll.`;
		case 'airport':
			return `${colorLabel[event.owner]} now owns the airport on square ${event.tile + 1}.`;
		case 'card':
			return `${colorLabel[event.color]} draws Chance: ${cardLabel[event.card]}.`;
		case 'shield':
			return `${planeName(event.planeId)} is shielded until it next moves.`;
		case 'skip':
			return `${colorLabel[event.color]} cannot pay Customs and skips the next roll.`;
		case 'tailwind':
			return `${colorLabel[event.color]} catches a Tailwind: one more roll.`;
		case 'relocation': {
			const plane = planeName(event.planeId);
			const color = event.planeId.split('-')[0] as AeroplaneColor;
			const to = endpointCopy(toPosition(color, event.toProgress));
			switch (event.effect) {
				case 'boost':
					return `Boost carries ${plane} to ${to}.`;
				case 'wormhole':
					return `Wormhole warps ${plane} to ${to}.`;
				case 'storm':
					return `Storm pushes ${plane} back to ${to}.`;
				case 'crash':
					return `Crash sends ${plane} to the ${to}.`;
			}
		}
	}
}

/** Capture and economy details shown under the main move line. */
function detailCopy(presentation: AeroplanePresentationLike): string[] {
	const move = presentation.move;
	// A roll-only skip entry's single skip event is its main line.
	if (move === null) return [];
	const captures = move.capturedPlaneIds.map(
		planeId => `Captured ${planeName(planeId)}.`
	);
	const effects = (presentation.action.events ?? [])
		.filter(isTycoonEffect)
		.map(effectCopy);
	return [...captures, ...effects];
}

function eventCopy(presentation: AeroplanePresentationLike): string {
	const move = presentation.move;
	const actor = presentation.action.actor === 'ai' ? 'AI' : 'You';
	if (move === null)
		return `${actor}: ${colorLabel[presentation.action.color]} rolled ${presentation.action.roll} and skips this turn at Customs.`;
	const planeNumber = Number(move.planeId.split('-').at(-1) ?? 0) + 1;
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
		// Register through one API and mirror the same choice on cleanup so the
		// listener is never registered or removed twice.
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
						.map(presentation => {
							const details = detailCopy(presentation);
							return (
								<div
									key={presentation.id}
									className='px-3 py-3 text-sm text-ivory-dim sm:px-4'
								>
									{presentation.move === null ? (
										<p
											data-testid='aeroplane-feed-skip'
											className='border-l-2 border-brass pl-2 text-ivory'
										>
											{eventCopy(presentation)}
										</p>
									) : (
										<p>{eventCopy(presentation)}</p>
									)}
									{details.length > 0 && (
										<ul className='mt-1 space-y-0.5 text-xs text-ivory'>
											{details.map((detail, index) => (
												<li key={index}>{detail}</li>
											))}
										</ul>
									)}
									{presentation.chatter && (
										<p className='mt-1 text-xs italic text-aeroplane'>
											{presentation.chatter}
										</p>
									)}
								</div>
							);
						})
				)}
			</div>
		</section>
	);
};

export default AeroplaneEventFeed;
