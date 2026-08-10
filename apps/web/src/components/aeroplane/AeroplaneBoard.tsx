import React, { useMemo, useRef, useState } from 'react';
import {
	FLIGHT_GUIDES,
	HANGAR_SLOTS,
	HOME_PATHS,
	LAUNCH_PADS,
	STACK_OFFSETS,
	START_OFFSETS,
	TRACK_ANCHORS,
	type LayoutAnchor,
} from '../../lib/aeroplane/layout';
import { Button } from '../ui/Button';
import type {
	AeroplaneColor,
	AeroplaneEvent,
	AeroplanePosition,
	AeroplaneState,
	PlaneState,
	ResolvedMove,
} from '../../lib/aeroplane/types';

export interface AeroplaneBoardProps {
	state: AeroplaneState;
	legalMoves: readonly ResolvedMove[];
	presentationQueue?: readonly {
		id: number;
		move: ResolvedMove;
	}[];
	onRoll: () => void;
	onSelectMove?: (move: ResolvedMove) => void;
	onSelect?: (planeId: string) => void;
}

const COLORS: readonly AeroplaneColor[] = ['red', 'yellow', 'blue', 'green'];

const PLANE_FILL: Record<AeroplaneColor, string> = {
	red: '#D65B63',
	yellow: '#D7B34A',
	blue: '#4F8FD8',
	green: '#4EAE7C',
};

const PLANE_STROKE: Record<AeroplaneColor, string> = {
	red: '#FFD4D2',
	yellow: '#FFF0A2',
	blue: '#D7EAFF',
	green: '#D0FFE2',
};

const colorLabel: Record<AeroplaneColor, string> = {
	red: 'Red',
	yellow: 'Yellow',
	blue: 'Blue',
	green: 'Green',
};

function planeIndex(planeId: string): number {
	const value = Number(planeId.split('-').at(-1));
	return Number.isInteger(value) && value >= 0 ? value : 0;
}

function planeNumber(planeId: string): number {
	return planeIndex(planeId) + 1;
}

function positionAnchor(
	position: AeroplanePosition,
	planeId?: string
): LayoutAnchor {
	switch (position.kind) {
		case 'hangar':
			return (
				HANGAR_SLOTS[position.color][planeIndex(planeId ?? '')] ??
				HANGAR_SLOTS[position.color][0]!
			);
		case 'launch':
			return LAUNCH_PADS[position.color];
		case 'track':
			return TRACK_ANCHORS[position.globalIndex]!;
		case 'home':
			return (
				HOME_PATHS[position.color][position.homeIndex] ??
				HOME_PATHS[position.color][0]!
			);
		case 'finished':
			return HOME_PATHS[position.color][5]!;
	}
}

function planeAnchor(plane: PlaneState): LayoutAnchor {
	if (plane.progress === null) {
		return (
			HANGAR_SLOTS[plane.color][planeIndex(plane.id)] ??
			HANGAR_SLOTS[plane.color][0]!
		);
	}
	if (plane.progress === 0) return LAUNCH_PADS[plane.color];
	if (plane.progress <= 50) {
		const globalIndex =
			(START_OFFSETS[plane.color] + plane.progress - 1) % TRACK_ANCHORS.length;
		return TRACK_ANCHORS[globalIndex]!;
	}
	return HOME_PATHS[plane.color][Math.min(5, plane.progress - 51)]!;
}

function endpointLabel(position: AeroplanePosition): string {
	switch (position.kind) {
		case 'hangar':
			return 'hangar';
		case 'launch':
			return 'launch pad';
		case 'track':
			return `position ${position.progress}`;
		case 'home':
			return `home position ${position.homeIndex + 1}`;
		case 'finished':
			return 'finish';
	}
}

function positionDescription(plane: PlaneState): string {
	if (plane.progress === null) return 'in the hangar';
	if (plane.progress === 0) return 'on the launch pad';
	if (plane.progress <= 50) return `track position ${plane.progress}`;
	if (plane.progress < 56) return `home position ${plane.progress - 50}`;
	return 'finished';
}

function moveLabel(
	plane: PlaneState,
	legalMove: ResolvedMove | undefined
): string {
	const prefix = `${colorLabel[plane.color]} plane ${planeNumber(plane.id)}, ${positionDescription(plane)}.`;
	if (!legalMove) return prefix;
	const route = legalMove.events
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
	const routeText = route.length > 0 ? route.join(' and ') : 'move';
	const endpoint = endpointLabel(legalMove.finalEndpoint);
	return `${prefix} Legal move: ${routeText} to ${endpoint}.`;
}

function eventAnchor(event: AeroplaneEvent): [LayoutAnchor, LayoutAnchor] {
	return [
		positionAnchor(event.from, event.planeId),
		positionAnchor(event.to, event.planeId),
	];
}

function routePath(move: ResolvedMove): string {
	const points: LayoutAnchor[] = [];
	for (const event of move.events) {
		const [from, to] = eventAnchor(event);
		if (points.length === 0) points.push(from);
		points.push(to);
	}
	if (points.length === 0) {
		points.push(
			positionAnchor(move.start, move.planeId),
			positionAnchor(move.finalEndpoint, move.planeId)
		);
	}
	return points
		.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`)
		.join(' ');
}

function isCoarsePointer(event: React.SyntheticEvent): boolean {
	const native = event.nativeEvent as unknown as { pointerType?: string };
	const pointerType = native.pointerType;
	return pointerType === 'touch' || pointerType === 'pen';
}

export const AeroplaneBoard: React.FC<AeroplaneBoardProps> = ({
	state,
	legalMoves,
	presentationQueue = [],
	onRoll,
	onSelectMove,
	onSelect,
}) => {
	const [hoveredPlaneId, setHoveredPlaneId] = useState<string | null>(null);
	const [focusedPlaneId, setFocusedPlaneId] = useState<string | null>(null);
	const [coarsePreviewId, setCoarsePreviewId] = useState<string | null>(null);
	const suppressClickRef = useRef(false);
	const moveByPlane = useMemo(
		() => new Map(legalMoves.map(move => [move.planeId, move])),
		[legalMoves]
	);
	const previewedPlaneId = coarsePreviewId ?? focusedPlaneId ?? hoveredPlaneId;
	const previewMove = previewedPlaneId
		? moveByPlane.get(previewedPlaneId)
		: undefined;

	const applyMove = (move: ResolvedMove) => {
		if (onSelectMove) onSelectMove(move);
		else onSelect?.(move.planeId);
	};

	const activatePlane = (planeId: string, coarse = false) => {
		const legalMove = moveByPlane.get(planeId);
		if (!legalMove) return;
		if (coarse) {
			if (coarsePreviewId === planeId) {
				setCoarsePreviewId(null);
				applyMove(legalMove);
			} else {
				setCoarsePreviewId(planeId);
			}
			return;
		}
		setCoarsePreviewId(null);
		applyMove(legalMove);
	};

	const planesByAnchor = new Map<string, number>();
	const planeNodes = state.planes.map(plane => {
		const anchor = planeAnchor(plane);
		const key = `${anchor.x.toFixed(3)}:${anchor.y.toFixed(3)}`;
		const offsetIndex = planesByAnchor.get(key) ?? 0;
		planesByAnchor.set(key, offsetIndex + 1);
		const offset = STACK_OFFSETS[offsetIndex % STACK_OFFSETS.length]!;
		return { plane, anchor, offset };
	});

	return (
		<div
			role='region'
			aria-labelledby='aeroplane-board-title'
			data-testid='aeroplane-board'
			className='space-y-4'
		>
			<h2 id='aeroplane-board-title' className='sr-only'>
				Aeroplane Chess board
			</h2>
			<div className='rounded-xl border border-line bg-ink-800 p-2 shadow-panel sm:p-3'>
				<svg
					viewBox='0 0 100 100'
					className='block h-auto w-full select-none overflow-visible'
					aria-hidden='true'
					focusable='false'
				>
					<desc>
						52-node clockwise track with four private home lanes. Use the legal
						plane controls below the board to move.
					</desc>
					<rect
						x='1'
						y='1'
						width='98'
						height='98'
						rx='5'
						fill='#17263A'
						stroke='#4F8FD8'
						strokeOpacity='0.3'
						strokeWidth='0.7'
					/>
					<circle
						cx='50'
						cy='50'
						r='26'
						fill='none'
						stroke='#4F8FD8'
						strokeOpacity='0.2'
						strokeWidth='4'
					/>
					{TRACK_ANCHORS.map((anchor, index) => (
						<circle
							key={`track-${index}`}
							cx={anchor.x}
							cy={anchor.y}
							r='1.6'
							fill={index % 13 === 0 ? '#C8A24B' : '#2F4967'}
							stroke='#A6C4E8'
							strokeOpacity='0.25'
							strokeWidth='0.35'
						/>
					))}
					{COLORS.flatMap(color =>
						HANGAR_SLOTS[color].map((anchor, index) => (
							<circle
								key={`hangar-${color}-${index}`}
								data-testid='aeroplane-hangar-slot'
								cx={anchor.x}
								cy={anchor.y}
								r='3.8'
								fill='#17263A'
								fillOpacity='0.72'
								stroke={PLANE_FILL[color]}
								strokeOpacity='0.72'
								strokeWidth='0.65'
							/>
						))
					)}
					{COLORS.map(color => {
						const pad = LAUNCH_PADS[color];
						return (
							<g
								key={`pad-${color}`}
								aria-label={`${colorLabel[color]} launch pad`}
							>
								<circle
									cx={pad.x}
									cy={pad.y}
									r='4.5'
									fill={PLANE_FILL[color]}
									fillOpacity='0.2'
									stroke={PLANE_STROKE[color]}
									strokeOpacity='0.7'
									strokeWidth='0.65'
								/>
								<text
									x={pad.x}
									y={pad.y + 1}
									fill={PLANE_STROKE[color]}
									fontSize='2.4'
									textAnchor='middle'
								>
									{colorLabel[color].slice(0, 1)}
								</text>
							</g>
						);
					})}
					{HOME_PATHS.red.map((anchor, index) => (
						<circle
							key={`home-red-${index}`}
							cx={anchor.x}
							cy={anchor.y}
							r='1.45'
							fill={index === 5 ? '#C8A24B' : '#4F8FD8'}
							fillOpacity={index === 5 ? 0.85 : 0.38}
						/>
					))}
					{COLORS.slice(1).map(color =>
						HOME_PATHS[color].map((anchor, index) => (
							<circle
								key={`home-${color}-${index}`}
								cx={anchor.x}
								cy={anchor.y}
								r='1.45'
								fill={PLANE_FILL[color]}
								fillOpacity={index === 5 ? 0.85 : 0.38}
							/>
						))
					)}
					{FLIGHT_GUIDES.map(guide => (
						<path
							key={`guide-${guide.color}`}
							d={`M ${guide.from.x} ${guide.from.y} Q ${guide.control.x} ${guide.control.y} ${guide.to.x} ${guide.to.y}`}
							fill='none'
							stroke={PLANE_FILL[guide.color]}
							strokeDasharray='1.5 1.5'
							strokeOpacity='0.32'
							strokeWidth='0.7'
							className='motion-reduce:animate-none'
						/>
					))}
					{previewMove && (
						<path
							data-testid='aeroplane-route-preview'
							d={routePath(previewMove)}
							fill='none'
							stroke={PLANE_STROKE[previewMove.color]}
							strokeDasharray='2 1'
							strokeLinecap='round'
							strokeLinejoin='round'
							strokeWidth='1.15'
							className='motion-reduce:animate-none'
						/>
					)}
					{presentationQueue.map(item => (
						<path
							key={`presentation-${item.id}`}
							d={routePath(item.move)}
							fill='none'
							stroke={PLANE_STROKE[item.move.color]}
							strokeDasharray='3 1'
							strokeLinecap='round'
							strokeLinejoin='round'
							strokeWidth='1.3'
							className='motion-reduce:animate-none'
						/>
					))}
					{planeNodes.map(({ plane, anchor, offset }) => {
						const active = previewedPlaneId === plane.id;
						const x = anchor.x + offset.x;
						const y = anchor.y + offset.y;
						return (
							<g
								key={plane.id}
								aria-hidden='true'
								pointerEvents='none'
								data-testid={`aeroplane-plane-control-${plane.id}`}
							>
								{active && (
									<circle
										cx={x}
										cy={y}
										r='4.3'
										fill='none'
										stroke='#FFF5D3'
										strokeWidth='0.8'
										className='motion-reduce:animate-none'
									/>
								)}
								<circle
									cx={x}
									cy={y}
									r='3'
									fill={PLANE_FILL[plane.color]}
									stroke={PLANE_STROKE[plane.color]}
									strokeWidth='0.65'
								/>
								<path
									d={`M ${x - 1.2} ${y + 0.8} L ${x} ${y - 1.8} L ${x + 1.2} ${y + 0.8} L ${x} ${y + 0.2} Z`}
									fill='#17263A'
									fillOpacity='0.72'
								/>
								<text
									x={x}
									y={y + 5.1}
									fill='#FFF5D3'
									fontSize='2.15'
									fontWeight='600'
									textAnchor='middle'
								>
									{planeNumber(plane.id)}
								</text>
							</g>
						);
					})}
					<circle cx='50' cy='50' r='8' fill='#C8A24B' fillOpacity='0.14' />
					<text
						x='50'
						y='50.8'
						fill='#FFF5D3'
						fontSize='2.2'
						fontWeight='600'
						textAnchor='middle'
					>
						AEROPLANE
					</text>
				</svg>
			</div>
			{legalMoves.length > 0 && (
				<div
					role='list'
					aria-label='Legal plane moves'
					className='grid grid-cols-1 gap-2 sm:grid-cols-2'
				>
					{legalMoves.map(legalMove => {
						const plane = state.planes.find(
							candidate => candidate.id === legalMove.planeId
						);
						if (!plane) return null;
						const label = moveLabel(plane, legalMove);
						const active = previewedPlaneId === plane.id;
						return (
							<div key={legalMove.planeId} role='listitem'>
								<button
									type='button'
									aria-label={label}
									aria-current={active ? 'true' : undefined}
									onMouseEnter={() => setHoveredPlaneId(plane.id)}
									onMouseLeave={() => setHoveredPlaneId(null)}
									onFocus={() => setFocusedPlaneId(plane.id)}
									onBlur={() => setFocusedPlaneId(null)}
									onPointerUp={event => {
										if (!isCoarsePointer(event)) return;
										suppressClickRef.current = true;
										activatePlane(plane.id, true);
									}}
									onPointerCancel={() => {
										suppressClickRef.current = false;
									}}
									onClick={event => {
										if (suppressClickRef.current) {
											suppressClickRef.current = false;
											return;
										}
										activatePlane(plane.id, isCoarsePointer(event));
									}}
									onKeyDown={event => {
										if (
											event.key !== 'Enter' &&
											event.key !== ' ' &&
											event.key !== 'Space'
										)
											return;
										event.preventDefault();
										activatePlane(plane.id);
									}}
									className={`min-h-11 touch-manipulation rounded-md border px-3 py-2 text-left text-sm font-medium transition-colors motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brass focus-visible:ring-offset-2 focus-visible:ring-offset-ink-900 ${
										active
											? 'border-brass bg-brass text-ink-900'
											: 'border-line bg-ink-700 text-ivory hover:bg-ink-600'
									}`}
								>
									{colorLabel[plane.color]} plane {planeNumber(plane.id)}
									<span className='sr-only'>: {label}</span>
								</button>
							</div>
						);
					})}
				</div>
			)}
			<div className='flex flex-wrap items-center justify-between gap-3'>
				<p className='text-sm text-ivory-dim'>
					{state.phase === 'awaiting-choice' && legalMoves.length === 0
						? 'No legal moves — this turn passes automatically.'
						: state.phase === 'awaiting-choice'
							? 'Choose a highlighted plane, or use Enter / Space.'
							: 'Roll the die to start your turn.'}
				</p>
				<Button
					type='button'
					variant='default'
					onClick={onRoll}
					disabled={state.phase !== 'awaiting-roll'}
					className='min-h-11 min-w-32 touch-manipulation'
				>
					Roll die
				</Button>
			</div>
		</div>
	);
};

export default AeroplaneBoard;
