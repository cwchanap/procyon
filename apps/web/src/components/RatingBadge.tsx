import { cva } from 'class-variance-authority';

interface RankTier {
	tier: string;
	color: string;
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

const TIER_COLORS: Record<string, TierColorClasses> = {
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

const ratingBadgeVariants = cva(
	'inline-flex items-center rounded-full border font-semibold shadow-lg',
	{
		variants: {
			tier: Object.fromEntries(
				Object.entries(TIER_COLORS).map(([key, c]) => [
					key,
					`${c.bg} ${c.border} ${c.text}`,
				])
			),
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
	return (
		<div
			className={ratingBadgeVariants({
				tier: (TIER_COLORS[tier.color]
					? tier.color
					: 'gray') as keyof typeof TIER_COLORS,
				size,
			})}
		>
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
