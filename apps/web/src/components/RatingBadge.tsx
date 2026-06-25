import { cva } from 'class-variance-authority';

// Server-provided tier color, constrained to the set the UI actually styles.
// Unknown server values are normalized to 'gray' once at the API boundary
// (see RatingsSection), so this component can trust its input without a
// runtime fallback or cast.
export type TierColor = 'gold' | 'purple' | 'blue' | 'green' | 'gray';

export interface RankTier {
	tier: string;
	color: TierColor;
	minRating: number;
}

interface RatingBadgeProps {
	rating: number;
	tier: RankTier;
	size?: 'sm' | 'md' | 'lg';
	showLabel?: boolean;
}

interface TierColorClasses {
	bg: string;
	border: string;
	text: string;
}

const DEFAULT_TIER_COLORS: TierColorClasses = {
	bg: 'bg-ink-600',
	border: 'border-line',
	text: 'text-ivory-dim',
};

const TIER_COLORS: Record<TierColor, TierColorClasses> = {
	gold: {
		bg: 'bg-brass',
		border: 'border-brass/50',
		text: 'text-ink-900',
	},
	purple: {
		bg: 'bg-ink-600',
		border: 'border-line',
		text: 'text-ivory',
	},
	blue: {
		bg: 'bg-shogi',
		border: 'border-shogi/50',
		text: 'text-ivory',
	},
	green: {
		bg: 'bg-jungle/30',
		border: 'border-jungle/50',
		text: 'text-ivory',
	},
	gray: DEFAULT_TIER_COLORS,
};

const SIZE_CLASSES = {
	sm: 'px-2 py-0.5 text-xs gap-1',
	md: 'px-3 py-1 text-sm gap-1.5',
	lg: 'px-4 py-1.5 text-base gap-2',
} as const;

// Statically-declared tier variants (kept in sync with TIER_COLORS via the
// helper above) so CVA retains literal-key inference instead of the previous
// Object.fromEntries approach that defeated it.
const tierVariant = (color: TierColor) =>
	`${TIER_COLORS[color].bg} ${TIER_COLORS[color].border} ${TIER_COLORS[color].text}`;

const ratingBadgeVariants = cva(
	'inline-flex items-center rounded-full border font-semibold shadow-lg',
	{
		variants: {
			tier: {
				gold: tierVariant('gold'),
				purple: tierVariant('purple'),
				blue: tierVariant('blue'),
				green: tierVariant('green'),
				gray: tierVariant('gray'),
			},
			size: SIZE_CLASSES,
		},
		defaultVariants: {
			tier: 'gray',
			size: 'md',
		},
	}
);

export function RatingBadge({
	rating,
	tier,
	size = 'md',
	showLabel = true,
}: RatingBadgeProps) {
	// tier.color is already constrained to TierColor and normalized at the
	// API boundary, so it can be passed directly — no runtime ternary or
	// `as keyof typeof` cast needed.
	return (
		<div className={ratingBadgeVariants({ tier: tier.color, size })}>
			<span className='font-mono'>{rating}</span>
			{showLabel && (
				<span className='uppercase tracking-wide text-[0.7em] opacity-90'>
					{tier.tier}
				</span>
			)}
		</div>
	);
}

export default RatingBadge;
