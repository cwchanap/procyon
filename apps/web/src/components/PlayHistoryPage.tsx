import { useEffect, useMemo, useState } from 'react';
import { useAuth, getAuthHeaders } from '../lib/auth';
import { env } from '../lib/env';

type ServerPlayHistory = {
	id: number;
	chessId: 'chess' | 'shogi' | 'xiangqi' | 'jungle';
	date: string;
	status: 'win' | 'loss' | 'draw';
	opponentUserId: string | null;
	opponentLlmId: 'gpt-4o' | 'gemini-2.5-flash' | null;
	// Rating fields (populated after rating system was added)
	ratingChange?: number;
	newRating?: number;
};

const VARIANT_LABELS: Record<ServerPlayHistory['chessId'], string> = {
	chess: 'Classical Chess',
	shogi: 'Shogi',
	xiangqi: 'Xiangqi',
	jungle: 'Jungle',
};

const RESULT_STYLES: Record<
	ServerPlayHistory['status'],
	{ label: string; className: string }
> = {
	win: {
		label: 'Win',
		className: 'bg-green-500/20 text-green-200 border border-green-400/30',
	},
	loss: {
		label: 'Loss',
		className: 'bg-red-500/20 text-red-200 border border-red-400/30',
	},
	draw: {
		label: 'Draw',
		className: 'bg-yellow-500/20 text-yellow-200 border border-yellow-400/30',
	},
};

const LLM_LABELS: Record<
	NonNullable<ServerPlayHistory['opponentLlmId']>,
	string
> = {
	'gpt-4o': 'GPT-4o',
	'gemini-2.5-flash': 'Gemini 2.5 Flash',
};

function formatOpponent(entry: ServerPlayHistory): string {
	if (entry.opponentUserId) {
		// Check if it's a UUID (contains hyphens) or numeric ID
		const isUuid = entry.opponentUserId.includes('-');
		if (isUuid) {
			// For UUIDs, show a more user-friendly format (first 8 chars)
			return `Human opponent (${entry.opponentUserId.slice(0, 8)}...)`;
		} else {
			// Legacy numeric ID format
			return `Human opponent #${entry.opponentUserId}`;
		}
	}

	if (entry.opponentLlmId) {
		return `AI · ${LLM_LABELS[entry.opponentLlmId] ?? 'Unknown Model'}`;
	}

	return 'Unknown opponent';
}

function formatDate(date: string): string {
	const parsed = new Date(date);
	if (Number.isNaN(parsed.getTime())) {
		return date;
	}

	return new Intl.DateTimeFormat('en-US', {
		dateStyle: 'medium',
		timeStyle: 'short',
	}).format(parsed);
}

export default function PlayHistoryPage() {
	const { isAuthenticated, user } = useAuth();
	const [history, setHistory] = useState<ServerPlayHistory[]>([]);
	const [isLoading, setIsLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		if (!isAuthenticated) {
			setIsLoading(false);
			setHistory([]);
			return;
		}

		const controller = new AbortController();

		const loadHistory = async () => {
			try {
				setIsLoading(true);
				setError(null);

				const authHeaders = await getAuthHeaders();

				const response = await fetch(`${env.PUBLIC_API_URL}/play-history`, {
					method: 'GET',
					headers: {
						'Content-Type': 'application/json',
						...authHeaders,
					},
					signal: controller.signal,
				});

				if (!response.ok) {
					const data = await response.json().catch(() => null);
					throw new Error(
						data?.error || 'Unable to load your play history. Please try again.'
					);
				}

				const data = (await response.json()) as {
					playHistory: ServerPlayHistory[];
				};

				setHistory(Array.isArray(data.playHistory) ? data.playHistory : []);
			} catch (fetchError) {
				if (
					fetchError instanceof DOMException &&
					fetchError.name === 'AbortError'
				) {
					return;
				}
				setError(
					fetchError instanceof Error
						? fetchError.message
						: 'An unknown error occurred.'
				);
			} finally {
				setIsLoading(false);
			}
		};

		void loadHistory();

		return () => {
			controller.abort();
		};
	}, [isAuthenticated]);

	const summary = useMemo(() => {
		if (!history.length) {
			return {
				total: 0,
				wins: 0,
				losses: 0,
				draws: 0,
				winRate: 0,
			};
		}

		const wins = history.filter(item => item.status === 'win').length;
		const losses = history.filter(item => item.status === 'loss').length;
		const draws = history.filter(item => item.status === 'draw').length;
		const winRate = Math.round((wins / history.length) * 100);

		return {
			total: history.length,
			wins,
			losses,
			draws,
			winRate,
		};
	}, [history]);

	if (!isAuthenticated) {
		return (
			<div className='min-h-[70vh] flex items-center justify-center'>
				<div className='glass-effect rounded-3xl px-10 py-14 text-center space-y-4 max-w-md w-full'>
					<h1 className='text-3xl font-semibold text-white'>
						Sign in to view your play history
					</h1>
					<p className='text-purple-100/80'>
						Your recent games and results will appear here once you are logged
						in.
					</p>
					<button
						type='button'
						onClick={() => (window.location.href = '/login')}
						className='px-6 py-3 rounded-full bg-gradient-to-r from-purple-600 to-pink-600 text-white font-medium hover:from-purple-500 hover:to-pink-500 transition-all duration-200 shadow-lg shadow-purple-500/30 hover:shadow-purple-500/50'
					>
						Go to Login
					</button>
				</div>
			</div>
		);
	}

	return (
		<div className='min-h-[70vh]'>
			<div className='container mx-auto px-4 py-12 space-y-8 max-w-6xl'>
				<header className='space-y-4'>
					<p className='text-purple-200/80 uppercase tracking-[0.3em] text-xs'>
						Activity
					</p>
					<h1 className='text-4xl sm:text-5xl font-black text-white tracking-tight'>
						Play History
					</h1>
					<p className='text-purple-100/80 max-w-2xl'>
						Review your recent matches across every variant, monitor your
						results, and spot trends in your progress.
					</p>
				</header>

				<section className='grid gap-4 sm:grid-cols-2 lg:grid-cols-4'>
					<SummaryCard label='Total Games' value={summary.total} />
					<SummaryCard
						label='Wins'
						value={summary.wins}
						accentClass='from-emerald-500/20 to-green-500/10 text-emerald-200 border-emerald-300/50'
					/>
					<SummaryCard
						label='Losses'
						value={summary.losses}
						accentClass='from-rose-500/20 to-red-500/10 text-rose-200 border-rose-300/50'
					/>
					<SummaryCard
						label='Win Rate'
						value={`${summary.winRate}%`}
						accentClass='from-sky-500/20 to-purple-500/10 text-sky-200 border-sky-300/50'
					/>
				</section>

				<section className='glass-effect rounded-3xl p-6 sm:p-8 shadow-2xl border border-white/10'>
					<div className='flex items-center justify-between mb-6'>
						<h2 className='text-2xl font-semibold text-white'>Recent games</h2>
						<span className='text-sm text-purple-100/70'>
							{user?.username ? `Signed in as ${user.username}` : ''}
						</span>
					</div>

					<div className='overflow-x-auto'>
						<table className='min-w-full divide-y divide-white/10'>
							<thead>
								<tr className='text-left text-sm uppercase tracking-wider text-purple-200/70'>
									<th scope='col' className='py-3 pr-4'>
										Date
									</th>
									<th scope='col' className='py-3 pr-4'>
										Variant
									</th>
									<th scope='col' className='py-3 pr-4'>
										Opponent
									</th>
									<th scope='col' className='py-3 pr-4'>
										Result
									</th>
									<th scope='col' className='py-3'>
										Rating
									</th>
								</tr>
							</thead>
							<tbody className='divide-y divide-white/5'>
								{isLoading ? (
									<tr>
										<td
											colSpan={5}
											className='py-16 text-center text-purple-100/70 animate-pulse'
										>
											Loading your games...
										</td>
									</tr>
								) : error ? (
									<tr>
										<td colSpan={5} className='py-12 text-center'>
											<div className='space-y-4'>
												<p className='text-red-200 font-medium'>{error}</p>
												<button
													type='button'
													onClick={() => window.location.reload()}
													className='px-4 py-2 rounded-full bg-white/10 hover:bg-white/20 transition-colors border border-white/20 text-sm text-white'
												>
													Retry
												</button>
											</div>
										</td>
									</tr>
								) : history.length === 0 ? (
									<tr>
										<td colSpan={5} className='py-16 text-center'>
											<div className='space-y-3 text-purple-100/70'>
												<p className='text-lg font-medium'>
													You have not recorded any games yet.
												</p>
												<p>
													Play against an AI or a friend to start your history.
												</p>
											</div>
										</td>
									</tr>
								) : (
									history.map(entry => {
										const resultStyle = RESULT_STYLES[entry.status];

										return (
											<tr
												key={entry.id}
												className='text-sm text-purple-50/90 hover:bg-white/5 transition-colors'
											>
												<td className='py-4 pr-4 whitespace-nowrap'>
													{formatDate(entry.date)}
												</td>
												<td className='py-4 pr-4 whitespace-nowrap'>
													{VARIANT_LABELS[entry.chessId]}
												</td>
												<td className='py-4 pr-4'>
													<span>{formatOpponent(entry)}</span>
												</td>
												<td className='py-4 pr-4'>
													<span
														className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide ${resultStyle.className}`}
													>
														{resultStyle.label}
													</span>
												</td>
												<td className='py-4'>
													{entry.ratingChange !== undefined &&
													entry.ratingChange !== null ? (
														<div className='flex flex-col'>
															<span
																className={`font-mono font-semibold ${
																	entry.ratingChange > 0
																		? 'text-green-400'
																		: entry.ratingChange < 0
																			? 'text-red-400'
																			: 'text-gray-400'
																}
																}`}
															>
																{entry.ratingChange > 0 ? '+' : ''}
																{entry.ratingChange}
															</span>
															{entry.newRating != null && (
																<span className='text-xs text-purple-200/60'>
																	{entry.newRating}
																</span>
															)}
														</div>
													) : (
														<span className='text-gray-500 text-xs'>—</span>
													)}
												</td>
											</tr>
										);
									})
								)}
							</tbody>
						</table>
					</div>
				</section>
			</div>
		</div>
	);
}

interface SummaryCardProps {
	label: string;
	value: number | string;
	accentClass?: string;
}

function SummaryCard({
	label,
	value,
	accentClass = 'from-purple-500/20 to-pink-500/10 text-purple-100 border-purple-300/40',
}: SummaryCardProps) {
	return (
		<div className='relative overflow-hidden rounded-3xl border border-white/10 glass-effect p-6'>
			<div
				className={`absolute inset-0 bg-gradient-to-br ${accentClass} opacity-80`}
				aria-hidden='true'
			/>
			<div className='relative space-y-2'>
				<p className='text-xs uppercase tracking-[0.3em] text-white/70'>
					{label}
				</p>
				<p className='text-3xl font-bold text-white'>{value}</p>
			</div>
		</div>
	);
}
