import React, {
	useCallback,
	useEffect,
	useLayoutEffect,
	useMemo,
	useRef,
	useState,
} from 'react';
import {
	FLIGHT_GUIDES,
	HANGAR_SLOTS,
	HOME_PATHS,
	LAUNCH_PADS,
	TRACK_ANCHORS,
	planeIndex,
	type LayoutAnchor,
} from '../../lib/aeroplane/layout';
import {
	buildMoveTimeline,
	routePath,
	stackedPlanePlacements,
	type AeroplaneMotionSegment,
	type AeroplaneMoveTimeline,
} from '../../lib/aeroplane/presentation';
import { colorLabel } from '../../lib/aeroplane/labels';
import { selectEffectCue, type AeroplaneCue } from '../../lib/aeroplane/sound';
import {
	BOARD_BACKGROUND_URL,
	spriteUrl,
	tileIconUrl,
} from '../../lib/aeroplane/assets';
import { TYCOON_TILES, type TycoonTileKind } from '../../lib/aeroplane/tycoon';
import type { SkinId } from '../../lib/aeroplane/rewards';
import { Button } from '../ui/Button';
import type {
	AeroplaneColor,
	AeroplaneEvent,
	AeroplanePosition,
	AeroplaneState,
	PlaneState,
	ResolvedMove,
	SkyTycoonState,
	TycoonEffectEvent,
} from '../../lib/aeroplane/types';

/** Cues emitted by the board's playback clock; `roll` belongs to the die. */
export type AeroplaneBoardCue = Exclude<AeroplaneCue, 'roll'>;

/** One queued move presentation, its serialized action events optional. */
export interface AeroplaneBoardPresentation {
	id: number;
	move: ResolvedMove;
	/** Positional plus coordinate-free Tycoon effect events. */
	action?: { events: readonly (AeroplaneEvent | TycoonEffectEvent)[] };
}

export interface AeroplaneBoardProps {
	state: AeroplaneState;
	legalMoves: readonly ResolvedMove[];
	isHumanTurn?: boolean;
	presentationQueue?: readonly AeroplaneBoardPresentation[];
	/** Skip tweening: committed positions render immediately. */
	reducedMotion?: boolean;
	/** Fired as the playback clock crosses each timeline segment boundary. */
	onCue?: (cue: AeroplaneBoardCue) => void;
	/** Render-only selected skin; applied only to human-colour planes. */
	skinId?: SkinId;
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

/** Tile icon footprint in board units, centred on the track anchor. */
const TILE_ICON_SIZE = 3.4;

function planeNumber(planeId: string): number {
	return planeIndex(planeId) + 1;
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

function isCoarsePointer(event: React.SyntheticEvent): boolean {
	const native = event.nativeEvent as unknown as { pointerType?: string };
	const pointerType = native.pointerType;
	return pointerType === 'touch' || pointerType === 'pen';
}

/**
 * Served plane sprite plus its separate text number, shared by the
 * committed layer, motion overlays and the setup picker previews. The
 * sprite carries the whole skin identity, so `data-skin` always names the
 * art actually drawn (defaulting to classic).
 */
export function PlaneGlyph({
	x,
	y,
	color,
	number,
	skinId,
}: {
	x: number;
	y: number;
	color: AeroplaneColor;
	number: number;
	skinId?: SkinId;
}) {
	const renderedSkin = skinId ?? 'classic';
	const href = spriteUrl(renderedSkin, color);
	// A sprite that fails to load (slow network, strict CSP, stale path)
	// falls back to the team-colour disc so the plane never vanishes; the
	// failed URL is remembered so a skin/colour change retries its own art.
	const [failedHref, setFailedHref] = useState<string | null>(null);
	return (
		<g data-skin={renderedSkin}>
			{failedHref === href ? (
				<circle
					cx={x}
					cy={y}
					r='3'
					fill={PLANE_FILL[color]}
					stroke={PLANE_STROKE[color]}
					strokeWidth='0.65'
				/>
			) : (
				<image
					href={href}
					x={x - 3}
					y={y - 3}
					width={6}
					height={6}
					onError={() => setFailedHref(href)}
				/>
			)}
			<text
				x={x}
				y={y + 5.1}
				fill='#FFF5D3'
				fontSize='2.15'
				fontWeight='600'
				textAnchor='middle'
			>
				{number}
			</text>
		</g>
	);
}

/**
 * The painted board art (track, hangars, pads, lanes, guides). It never
 * changes between frames, so playback's per-frame renders skip it.
 */
const BoardSurface = React.memo(function BoardSurface() {
	return (
		<>
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
			<image href={BOARD_BACKGROUND_URL} x='1' y='1' width='98' height='98' />
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
		</>
	);
});

const TILE_NAME: Record<TycoonTileKind, string> = {
	airport: 'Airport',
	chance: 'Chance',
	boost: 'Boost',
	tailwind: 'Tailwind',
	shield: 'Shield',
	wormhole: 'Wormhole',
	storm: 'Storm',
	customs: 'Customs',
	tax: 'Tax',
	crash: 'Crash',
};

/** Tile global indices sorted once; the shared map is fixed at build time. */
const SORTED_TYCOON_TILES = [...TYCOON_TILES.entries()].sort(
	(left, right) => left[0] - right[0]
);

/** Text stand-in per tile kind, drawn when the icon image fails to load. */
const TILE_GLYPH: Record<TycoonTileKind, string> = {
	airport: '✈',
	chance: '?',
	boost: '»',
	tailwind: '↻',
	shield: '◆',
	wormhole: '◎',
	storm: '≈',
	customs: '$',
	tax: '%',
	crash: '✖',
};

/**
 * One tile's served icon, falling back to the text glyph on a load error
 * so the tile never renders blank (same failure modes as the sprites).
 */
function TileIcon({
	kind,
	anchor,
}: {
	kind: TycoonTileKind;
	anchor: LayoutAnchor;
}) {
	const href = tileIconUrl(kind);
	const [failedHref, setFailedHref] = useState<string | null>(null);
	if (failedHref === href) {
		return (
			<text
				x={anchor.x}
				y={anchor.y + 0.6}
				fill='#FFF5D3'
				fillOpacity='0.85'
				fontSize='1.7'
				textAnchor='middle'
			>
				{TILE_GLYPH[kind]}
			</text>
		);
	}
	return (
		<image
			href={href}
			x={anchor.x - TILE_ICON_SIZE / 2}
			y={anchor.y - TILE_ICON_SIZE / 2}
			width={TILE_ICON_SIZE}
			height={TILE_ICON_SIZE}
			onError={() => setFailedHref(href)}
		/>
	);
}

/** Shared-map tiles in board order, labelled with any airport owner. */
function tycoonTiles(airports: SkyTycoonState['airports']) {
	return SORTED_TYCOON_TILES.map(([index, kind]) => {
		const owner = kind === 'airport' ? airports[index] : undefined;
		const ownership =
			kind !== 'airport'
				? ''
				: owner
					? `, owned by ${colorLabel[owner]}`
					: ', unowned';
		return {
			index,
			kind,
			owner,
			label: `Square ${index + 1}: ${TILE_NAME[kind]}${ownership}`,
		};
	});
}

/**
 * Sky Tycoon tile markers from the shared `tycoon.ts` map, drawn on the
 * track anchors with a subtle owner tint. Memoized on the airport map,
 * which only changes identity on a purchase.
 */
const TycoonTileMarkers = React.memo(function TycoonTileMarkers({
	airports,
}: {
	airports: SkyTycoonState['airports'];
}) {
	return (
		<>
			{tycoonTiles(airports).map(({ index, kind, owner, label }) => {
				const anchor = TRACK_ANCHORS[index]!;
				return (
					<g
						key={`tile-${index}`}
						data-label={label}
						data-testid={`aeroplane-tycoon-tile-${index}`}
						data-owner={owner}
					>
						{owner && (
							<circle
								cx={anchor.x}
								cy={anchor.y}
								r='2.3'
								fill={PLANE_FILL[owner]}
								fillOpacity='0.35'
								stroke={PLANE_FILL[owner]}
								strokeOpacity='0.8'
								strokeWidth='0.35'
							/>
						)}
						<TileIcon kind={kind} anchor={anchor} />
					</g>
				);
			})}
		</>
	);
});

/**
 * Committed plane glyphs at their stacked anchors. `hiddenIds` are masked
 * while the motion overlay carries them: airborne movers, mid-return
 * ghosts, and victims parked at the capture anchor. Memoized so playback's
 * per-frame renders only rebuild it when the masking actually changes.
 */
const CommittedPlanes = React.memo(function CommittedPlanes({
	planes,
	hiddenIds,
	previewedPlaneId,
	skinId,
	humanColor,
}: {
	planes: readonly PlaneState[];
	hiddenIds: ReadonlySet<string>;
	previewedPlaneId: string | null;
	skinId?: SkinId;
	humanColor: AeroplaneColor;
}) {
	return (
		<>
			{stackedPlanePlacements(planes).map(({ plane, anchor, offset }) => {
				if (hiddenIds.has(plane.id)) return null;
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
						<PlaneGlyph
							x={x}
							y={y}
							color={plane.color}
							number={planeNumber(plane.id)}
							skinId={plane.color === humanColor ? skinId : undefined}
						/>
					</g>
				);
			})}
		</>
	);
});

const NO_HIDDEN_PLANES: ReadonlySet<string> = new Set();

function lerpAnchors(
	from: LayoutAnchor,
	to: LayoutAnchor,
	progress: number
): LayoutAnchor {
	return {
		x: from.x + (to.x - from.x) * progress,
		y: from.y + (to.y - from.y) * progress,
	};
}

function segmentPosition(
	segment: AeroplaneMotionSegment,
	progress: number
): LayoutAnchor {
	if (segment.control) {
		const inverse = 1 - progress;
		return {
			x:
				inverse * inverse * segment.from.x +
				2 * inverse * progress * segment.control.x +
				progress * progress * segment.to.x,
			y:
				inverse * inverse * segment.from.y +
				2 * inverse * progress * segment.control.y +
				progress * progress * segment.to.y,
		};
	}
	// Jumps rise above the direct chord; hops stay on the board plane.
	const lift =
		segment.kind === 'jump' ? -2.5 * Math.sin(Math.PI * progress) : 0;
	const base = lerpAnchors(segment.from, segment.to, progress);
	return { x: base.x, y: base.y + lift };
}

interface MotionFrame {
	mover: LayoutAnchor;
	ghost: { planeId: string; x: number; y: number } | null;
	/** Captured victims still waiting at the capture anchor for their return. */
	parked: { planeId: string; x: number; y: number }[];
}

interface PlaybackState {
	id: number;
	timeline: AeroplaneMoveTimeline;
	frame: MotionFrame;
}

/**
 * Overlay geometry at `elapsed` ms plus the active segment index (motion
 * segments first, then capture returns), or null once the timeline completed.
 */
function parkedVictims(
	timeline: AeroplaneMoveTimeline,
	startIndex: number
): MotionFrame['parked'] {
	return timeline.captures.slice(startIndex).map(capture => ({
		planeId: capture.planeId,
		x: capture.from.x,
		y: capture.from.y,
	}));
}

function frameAt(
	timeline: AeroplaneMoveTimeline,
	elapsed: number
): { frame: MotionFrame; activeSegment: number | null } {
	const landing = timeline.segments.at(-1)!.to;
	let remaining = elapsed;
	for (let index = 0; index < timeline.segments.length; index += 1) {
		const segment = timeline.segments[index]!;
		if (remaining < segment.durationMs) {
			return {
				frame: {
					mover: segmentPosition(segment, remaining / segment.durationMs),
					ghost: null,
					parked: parkedVictims(timeline, 0),
				},
				activeSegment: index,
			};
		}
		remaining -= segment.durationMs;
	}
	for (let index = 0; index < timeline.captures.length; index += 1) {
		const capture = timeline.captures[index]!;
		if (remaining < capture.durationMs) {
			const position = lerpAnchors(
				capture.from,
				capture.to,
				remaining / capture.durationMs
			);
			return {
				frame: {
					mover: landing,
					ghost: { planeId: capture.planeId, x: position.x, y: position.y },
					parked: parkedVictims(timeline, index + 1),
				},
				activeSegment: timeline.segments.length + index,
			};
		}
		remaining -= capture.durationMs;
	}
	return {
		frame: { mover: landing, ghost: null, parked: [] },
		activeSegment: null,
	};
}

/**
 * The move's consequence cue under win > finish > effect priority, or null
 * when it has none. Both terminal paths select through this one ranking so
 * the animated and zero-duration playback can never drift apart.
 */
function terminalEffectCue(
	move: ResolvedMove,
	events: readonly (AeroplaneEvent | TycoonEffectEvent)[] | undefined,
	humanColor: AeroplaneColor,
	won: boolean
): AeroplaneBoardCue | null {
	if (won) return 'win';
	if (move.finalEndpoint.kind === 'finished') return 'finish';
	return selectEffectCue(events ?? [], humanColor);
}

/**
 * One terminal cue under zero-duration playback, win taking priority, then
 * the finish cell, then the move's effect cue (trap or human money). A
 * plain move falls back to a single capture or hop; the animated terminal
 * instead stops at the effect — its hop/capture boundary cues already
 * played, so an effectless move adds nothing.
 */
function terminalCue(
	move: ResolvedMove,
	events: readonly (AeroplaneEvent | TycoonEffectEvent)[] | undefined,
	humanColor: AeroplaneColor,
	won: boolean
): AeroplaneBoardCue {
	return (
		terminalEffectCue(move, events, humanColor, won) ??
		(move.capturedPlaneIds.length > 0 ? 'capture' : 'hop')
	);
}

// Playback begins synchronously so the committed destination never paints a
// frame before the overlay starts; SSR keeps useEffect.
const useIsomorphicLayoutEffect =
	typeof window === 'undefined' ? useEffect : useLayoutEffect;

export const AeroplaneBoard: React.FC<AeroplaneBoardProps> = ({
	state,
	legalMoves,
	isHumanTurn = true,
	presentationQueue = [],
	reducedMotion = false,
	onCue,
	skinId,
	onRoll,
	onSelectMove,
	onSelect,
}) => {
	const [hoveredPlaneId, setHoveredPlaneId] = useState<string | null>(null);
	const [focusedPlaneId, setFocusedPlaneId] = useState<string | null>(null);
	const [coarsePreviewId, setCoarsePreviewId] = useState<string | null>(null);
	const [playback, setPlayback] = useState<PlaybackState | null>(null);
	const suppressClickRef = useRef(false);
	const playbackRef = useRef<PlaybackState | null>(null);
	const frameRef = useRef<number | null>(null);
	const startedAtRef = useRef<number | null>(null);
	const cuedSegmentsRef = useRef(0);
	const lastProcessedIdRef = useRef(0);
	const onCueRef = useRef(onCue);
	// The active playback's consequence cue (win/finish/effect), kept apart
	// from the rAF loop so a cancellation arriving after the last boundary
	// cue can still land it rather than dropping it mid-flight.
	const pendingTerminalRef = useRef<{
		id: number;
		cue: AeroplaneBoardCue | null;
	} | null>(null);
	useEffect(() => {
		onCueRef.current = onCue;
	}, [onCue]);

	const cancelPlayback = useCallback(() => {
		if (
			frameRef.current !== null &&
			typeof cancelAnimationFrame === 'function'
		) {
			cancelAnimationFrame(frameRef.current);
		}
		frameRef.current = null;
		startedAtRef.current = null;
		cuedSegmentsRef.current = 0;
		pendingTerminalRef.current = null;
		playbackRef.current = null;
		setPlayback(null);
	}, []);

	// Cancellation on unmount regardless of queue state.
	useEffect(() => () => cancelPlayback(), [cancelPlayback]);

	useIsomorphicLayoutEffect(() => {
		// The queue's 650 ms expiry races the playback clock's final frame on
		// slow displays, and a quick follow-up move can cancel mid-gap: when
		// every boundary cue already fired, land the move's consequence cue
		// before tearing the playback down. Cancels earlier than that (Skip,
		// reset, a genuinely interrupted move) stay silent as before.
		const emitDueTerminal = () => {
			const active = playbackRef.current;
			const pending = pendingTerminalRef.current;
			pendingTerminalRef.current = null;
			if (!active || !pending || pending.id !== active.id) return;
			const count =
				active.timeline.segments.length + active.timeline.captures.length;
			if (pending.cue !== null && cuedSegmentsRef.current >= count) {
				onCueRef.current?.(pending.cue);
			}
		};

		const newest = presentationQueue.at(-1);
		const fresh =
			newest !== undefined && newest.id !== lastProcessedIdRef.current;
		const canAnimate =
			!reducedMotion && typeof requestAnimationFrame === 'function';

		if (fresh) {
			lastProcessedIdRef.current = newest.id;
			if (!canAnimate) {
				emitDueTerminal();
				cancelPlayback();
				// Zero-duration fallback: the committed state is already on screen;
				// emit only the appropriate terminal cue, exactly once.
				onCueRef.current?.(
					terminalCue(
						newest.move,
						newest.action?.events,
						state.config.humanColor,
						state.phase === 'finished'
					)
				);
				return;
			}
			emitDueTerminal();
			cancelPlayback();
			const timeline = buildMoveTimeline(newest.move, state);
			const totalMs = timeline.totalMs;
			const segmentCount = timeline.segments.length + timeline.captures.length;
			const won = state.phase === 'finished';
			pendingTerminalRef.current = {
				id: newest.id,
				cue: terminalEffectCue(
					newest.move,
					newest.action?.events,
					state.config.humanColor,
					won
				),
			};
			// Cue each timeline boundary as the frame loop crosses it; hops for
			// motion segments, capture for each captured-plane return. A slow
			// frame can cross several boundaries at once: emit only the latest
			// cue rather than stacking them into one instant.
			const emitDueCues = (through: number) => {
				const due = Math.min(through, segmentCount - 1);
				if (due < cuedSegmentsRef.current) return;
				onCueRef.current?.(
					due < timeline.segments.length
						? timeline.segments[due]!.kind === 'flight'
							? 'flight'
							: 'hop'
						: 'capture'
				);
				cuedSegmentsRef.current = due + 1;
			};
			const tick = (now: number) => {
				const active = playbackRef.current;
				if (!active || active.id !== newest.id) return;
				if (startedAtRef.current === null) startedAtRef.current = now;
				const elapsed = now - startedAtRef.current;
				if (elapsed >= totalMs) {
					emitDueCues(segmentCount - 1);
					emitDueTerminal();
					cancelPlayback();
					return;
				}
				const { frame, activeSegment } = frameAt(timeline, elapsed);
				if (activeSegment !== null) emitDueCues(activeSegment);
				playbackRef.current = { ...active, frame };
				setPlayback(playbackRef.current);
				frameRef.current = requestAnimationFrame(tick);
			};
			playbackRef.current = {
				id: newest.id,
				timeline,
				frame: {
					mover: timeline.segments[0]!.from,
					ghost: null,
					parked: parkedVictims(timeline, 0),
				},
			};
			setPlayback(playbackRef.current);
			frameRef.current = requestAnimationFrame(tick);
			return;
		}

		// Queue removal (expiry, Skip, reset, resume) or a reduced-motion
		// switch cancels the clock and reveals the committed glyphs.
		const activeId = playbackRef.current?.id;
		if (
			activeId !== undefined &&
			(reducedMotion || !presentationQueue.some(item => item.id === activeId))
		) {
			emitDueTerminal();
			cancelPlayback();
		}
	}, [presentationQueue, state, reducedMotion, cancelPlayback]);

	const moveByPlane = useMemo(
		() => new Map(legalMoves.map(move => [move.planeId, move])),
		[legalMoves]
	);
	// The screen-reader tile list changes only with airport ownership, so
	// animation frames never rebuild it.
	const airportOwners = state.tycoon?.airports;
	const srTycoonTiles = useMemo(
		() => (airportOwners ? tycoonTiles(airportOwners) : null),
		[airportOwners]
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

	// Masked ids stay referentially stable across a playback's frames so the
	// committed layer memoizes; the set only changes when a ghost/parked
	// boundary is crossed.
	const ghostPlaneId = playback?.frame.ghost?.planeId ?? null;
	const parkedKey = playback
		? playback.frame.parked.map(parked => parked.planeId).join(',')
		: '';
	const moverPlaneId = playback?.timeline.planeId ?? null;
	const hiddenIds = useMemo(() => {
		if (moverPlaneId === null) return NO_HIDDEN_PLANES;
		const ids = new Set<string>([moverPlaneId]);
		if (ghostPlaneId) ids.add(ghostPlaneId);
		for (const id of parkedKey.split(',')) {
			if (id) ids.add(id);
		}
		return ids;
	}, [moverPlaneId, ghostPlaneId, parkedKey]);

	const ghostPlane = playback?.frame.ghost
		? state.planes.find(plane => plane.id === playback.frame.ghost!.planeId)
		: undefined;

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
					<BoardSurface />
					{state.tycoon && (
						<TycoonTileMarkers airports={state.tycoon.airports} />
					)}
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
					<CommittedPlanes
						planes={state.planes}
						hiddenIds={hiddenIds}
						previewedPlaneId={previewedPlaneId}
						skinId={skinId}
						humanColor={state.config.humanColor}
					/>
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
					{playback && (
						<g
							pointerEvents='none'
							aria-hidden='true'
							data-testid='aeroplane-motion-layer'
						>
							<g data-testid='aeroplane-motion-overlay'>
								<PlaneGlyph
									x={playback.frame.mover.x}
									y={playback.frame.mover.y}
									color={playback.timeline.color}
									number={planeNumber(playback.timeline.planeId)}
									skinId={
										playback.timeline.color === state.config.humanColor
											? skinId
											: undefined
									}
								/>
							</g>
							{ghostPlane && playback.frame.ghost && (
								<g data-testid='aeroplane-capture-ghost'>
									<PlaneGlyph
										x={playback.frame.ghost.x}
										y={playback.frame.ghost.y}
										color={ghostPlane.color}
										number={planeNumber(ghostPlane.id)}
										skinId={
											ghostPlane.color === state.config.humanColor
												? skinId
												: undefined
										}
									/>
								</g>
							)}
							{playback.frame.parked.map(parked => {
								const victim = state.planes.find(
									plane => plane.id === parked.planeId
								);
								if (!victim) return null;
								return (
									<g
										key={parked.planeId}
										data-testid='aeroplane-capture-parked'
									>
										<PlaneGlyph
											x={parked.x}
											y={parked.y}
											color={victim.color}
											number={planeNumber(victim.id)}
											skinId={
												victim.color === state.config.humanColor
													? skinId
													: undefined
											}
										/>
									</g>
								);
							})}
						</g>
					)}
				</svg>
			</div>
			{srTycoonTiles && (
				<ul aria-label='Sky Tycoon tiles' className='sr-only'>
					{srTycoonTiles.map(tile => (
						<li key={tile.index}>{tile.label}</li>
					))}
				</ul>
			)}
			{isHumanTurn && legalMoves.length > 0 && (
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
					{state.phase === 'finished'
						? `${colorLabel[state.winner ?? state.currentPlayer]} wins the match.`
						: !isHumanTurn
							? state.phase === 'awaiting-choice'
								? `${colorLabel[state.currentPlayer]} is choosing a move…`
								: `${colorLabel[state.currentPlayer]} is rolling…`
							: state.phase === 'awaiting-choice' && legalMoves.length === 0
								? 'No legal moves — this turn passes automatically.'
								: state.phase === 'awaiting-choice'
									? 'Choose a highlighted plane, or use Enter / Space.'
									: 'Roll the die to start your turn.'}
				</p>
				<Button
					type='button'
					variant='default'
					onClick={onRoll}
					disabled={!isHumanTurn || state.phase !== 'awaiting-roll'}
					className='min-h-11 min-w-32 touch-manipulation'
				>
					Roll die
				</Button>
			</div>
		</div>
	);
};

export default AeroplaneBoard;
