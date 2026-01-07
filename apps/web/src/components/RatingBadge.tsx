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

const TIER_COLORS: Record<string, string> = {
	gold: 'from-yellow-500 to-amber-600 border-yellow-400/50 text-yellow-100',
	purple: 'from-purple-600 to-violet-700 border-purple-400/50 text-purple-100',
	blue: 'from-blue-600 to-indigo-700 border-blue-400/50 text-blue-100',
	green: 'from-green-600 to-emerald-700 border-green-400/50 text-green-100',
	gray: 'from-gray-600 to-slate-700 border-gray-400/50 text-gray-100',
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
	const colorClasses = TIER_COLORS[tier.color] || TIER_COLORS.gray;

	return (
		<div
			className={`inline-flex items-center rounded-full bg-gradient-to-r ${colorClasses} border font-semibold shadow-lg ${SIZE_CLASSES[size]}`}
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
