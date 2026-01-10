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
	bg: 'from-gray-600',
	border: 'border-gray-400/50',
	text: 'text-gray-100',
};

const TIER_COLORS: Record<string, TierColorClasses> = {
	gold: {
		bg: 'from-yellow-500',
		border: 'border-yellow-400/50',
		text: 'text-yellow-100',
	},
	purple: {
		bg: 'from-purple-600',
		border: 'border-purple-400/50',
		text: 'text-purple-100',
	},
	blue: {
		bg: 'from-blue-600',
		border: 'border-blue-400/50',
		text: 'text-blue-100',
	},
	green: {
		bg: 'from-green-600',
		border: 'border-green-400/50',
		text: 'text-green-100',
	},
	gray: DEFAULT_TIER_COLORS,
};

const SIZE_CLASSES = {
	sm: 'px-2 py-0.5 text-xs gap-1',
	md: 'px-3 py-1 text-sm gap-1.5',
	lg: 'px-4 py-1.5 text-base gap-2',
};

export function RatingBadge({
	rating,
	tier,
	size = 'md',
	showLabel = true,
}: RatingBadgeProps) {
	const colorClasses = TIER_COLORS[tier.color] ?? DEFAULT_TIER_COLORS;

	return (
		<div
			className={`inline-flex items-center rounded-full bg-gradient-to-r ${colorClasses.bg} to-amber-600 ${colorClasses.border} border ${colorClasses.text} font-semibold shadow-lg ${SIZE_CLASSES[size]}`}
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
