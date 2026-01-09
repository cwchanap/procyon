import { useState, useEffect } from 'react';
import { getAuthHeaders } from '../lib/auth';
import { env } from '../lib/env';
import { RatingBadge } from './RatingBadge';

interface RankTier {
	tier: string;
	color: string;
	minRating: number;
}

interface PlayerRating {
	id: number;
	userId: string;
	variantId: 'chess' | 'xiangqi' | 'shogi' | 'jungle';
	rating: number;
	gamesPlayed: number;
	wins: number;
	losses: number;
	draws: number;
	peakRating: number;
	tier: RankTier;
}

const VARIANT_LABELS: Record<string, string> = {
	chess: 'Classical Chess',
	xiangqi: 'Xiangqi',
	shogi: 'Shogi',
	jungle: 'Jungle',
};

const VARIANT_ICONS: Record<string, string> = {
	chess: '♟️',
	xiangqi: '象',
	shogi: '将',
	jungle: '🐘',
};

export function RatingsSection() {
	const [ratings, setRatings] = useState<PlayerRating[]>([]);
	const [isLoading, setIsLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		const fetchRatings = async () => {
			try {
				setIsLoading(true);
				const authHeaders = await getAuthHeaders();
				const response = await fetch(`${env.PUBLIC_API_URL}/ratings`, {
					headers: {
						'Content-Type': 'application/json',
						...authHeaders,
					},
				});

				if (response.ok) {
					const data = await response.json();
					setRatings(data.ratings || []);
				} else {
					setError('Failed to load ratings');
				}
			} catch {
				setError('Failed to load ratings');
			} finally {
				setIsLoading(false);
			}
		};

		void fetchRatings();
	}, []);

	if (isLoading) {
		return (
			<div className='p-6 text-center text-purple-100/70 animate-pulse'>
				Loading ratings...
			</div>
		);
	}

	if (error) {
		return <div className='p-6 text-center text-red-200'>{error}</div>;
	}

	if (ratings.length === 0) {
		return (
			<div className='p-6 text-center text-purple-100/70'>
				<p className='text-lg font-medium mb-2'>No ratings yet</p>
				<p className='text-sm'>Play your first game to earn a rating!</p>
			</div>
		);
	}

	return (
		<div className='space-y-4'>
			<h3 className='text-xl font-semibold text-white mb-4'>Your Ratings</h3>
			<div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
				{ratings.map(rating => (
					<div
						key={rating.variantId}
						className='bg-gradient-to-br from-gray-700/50 to-purple-700/30 rounded-xl p-4 border border-purple-400/20 hover:border-purple-400/40 transition-colors'
					>
						<div className='flex items-center justify-between mb-3'>
							<div className='flex items-center gap-2'>
								<span className='text-xl'>
									{VARIANT_ICONS[rating.variantId] || '🎮'}
								</span>
								<h4 className='text-lg font-medium text-white'>
									{VARIANT_LABELS[rating.variantId] || rating.variantId}
								</h4>
							</div>
							<RatingBadge
								rating={rating.rating}
								tier={rating.tier}
								size='md'
							/>
						</div>
						<div className='grid grid-cols-4 gap-2 text-sm text-purple-100/80'>
							<div>
								<span className='block text-xs text-purple-200/60 mb-0.5'>
									Games
								</span>
								<span className='font-semibold'>{rating.gamesPlayed}</span>
							</div>
							<div>
								<span className='block text-xs text-purple-200/60 mb-0.5'>
									W/L/D
								</span>
								<span className='font-semibold'>
									{rating.wins}/{rating.losses}/{rating.draws}
								</span>
							</div>
							<div>
								<span className='block text-xs text-purple-200/60 mb-0.5'>
									Win Rate
								</span>
								<span className='font-semibold'>
									{rating.gamesPlayed > 0
										? Math.round((rating.wins / rating.gamesPlayed) * 100)
										: 0}
									%
								</span>
							</div>
							<div>
								<span className='block text-xs text-purple-200/60 mb-0.5'>
									Peak
								</span>
								<span className='font-semibold'>{rating.peakRating}</span>
							</div>
						</div>
					</div>
				))}
			</div>
		</div>
	);
}

export default RatingsSection;
