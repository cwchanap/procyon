import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../lib/auth';
import { env } from '../lib/env';
import { PageHeader } from './PageHeader';
import { Panel } from './ui/Panel';
import { Button } from './ui/Button';

type ServerPlayHistory = {
	id: number;
	chessId: 'chess' | 'shogi' | 'xiangqi' | 'jungle';
	date: string;
	status: 'win' | 'loss' | 'draw';
	opponentUserId: string | null;
	opponentLlmId: 'gpt-4o' | 'gemini-2.5-flash' | null;
	// Rating fields (populated after rating system was added)
	// Can be null when rating history doesn't exist (e.g., older games)
	ratingChange: number | null | undefined;
	newRating: number | null | undefined;
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
		className: 'bg-jungle/20 text-jungle border border-jungle/30',
	},
	loss: {
		label: 'Loss',
		className: 'bg-[#C8402F]/20 text-[#C8402F] border border-[#C8402F]/30',
	},
	draw: {
		label: 'Draw',
		className: 'bg-ink-600 text-ivory-dim border border-line',
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
	const { isAuthenticated, user, loading: isAuthLoading } = useAuth();
	const [history, setHistory] = useState<ServerPlayHistory[]>([]);
	const [isLoading, setIsLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [isHydrated, setIsHydrated] = useState(false);

	useEffect(() => {
		setIsHydrated(true);
	}, []);

	useEffect(() => {
		if (isAuthLoading) {
			return;
		}

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

				const response = await fetch(`${env.PUBLIC_API_URL}/play-history`, {
					credentials: 'include',
					headers: {
						'Content-Type': 'application/json',
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
	}, [isAuthenticated, isAuthLoading]);

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

	if (isAuthLoading) {
		return (
			<div
				data-testid='play-history-loading'
				data-hydrated={isHydrated ? 'true' : 'false'}
				className='min-h-[70vh] flex items-center justify-center text-ivory-dim'
			>
				Loading your play history...
			</div>
		);
	}

	if (!isAuthenticated) {
		return (
			<div
				data-testid='play-history-guest'
				data-hydrated={isHydrated ? 'true' : 'false'}
				className='min-h-[70vh] flex items-center justify-center'
			>
				<Panel className='px-10 py-14 text-center space-y-4 max-w-md w-full'>
					<h1 className='text-3xl font-semibold text-ivory'>
						Sign in to view your play history
					</h1>
					<p className='text-ivory-dim'>
						Your recent games and results will appear here once you are logged
						in.
					</p>
					<Button
						type='button'
						onClick={() => (window.location.href = '/login')}
					>
						Go to Login
					</Button>
				</Panel>
			</div>
		);
	}

	return (
		<div className='min-h-[70vh]'>
			<div className='mx-auto max-w-4xl px-6 py-12 space-y-8'>
				<PageHeader eyebrow='Archive' title='Play History' />

				<p className='text-ivory-dim max-w-2xl -mt-4'>
					Review your recent matches across every variant, monitor your results,
					and spot trends in your progress.
				</p>

				<section className='grid gap-4 sm:grid-cols-2 lg:grid-cols-4'>
					<SummaryCard label='Total Games' value={summary.total} />
					<SummaryCard
						label='Wins'
						value={summary.wins}
						accentClass='text-jungle'
					/>
					<SummaryCard
						label='Losses'
						value={summary.losses}
						accentClass='text-[#C8402F]'
					/>
					<SummaryCard
						label='Win Rate'
						value={`${summary.winRate}%`}
						accentClass='text-brass'
					/>
				</section>

				<Panel className='p-6 sm:p-8'>
					<div className='flex items-center justify-between mb-6'>
						<h2 className='text-2xl font-semibold text-ivory'>Recent games</h2>
						<span className='text-sm text-ivory-dim'>
							{user?.username ? `Signed in as ${user.username}` : ''}
						</span>
					</div>

					<div className='overflow-x-auto'>
						<table className='min-w-full divide-y divide-line'>
							<thead>
								<tr className='text-left text-sm uppercase tracking-wider text-ivory-dim'>
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
							<tbody className='divide-y divide-line'>
								{isLoading ? (
									<tr>
										<td
											colSpan={5}
											className='py-16 text-center text-ivory-dim'
										>
											Loading your games...
										</td>
									</tr>
								) : error ? (
									<tr>
										<td colSpan={5} className='py-12 text-center'>
											<div className='space-y-4'>
												<p
													data-testid='api-error'
													className='text-[#C8402F] font-medium'
												>
													{error}
												</p>
												<Button
													type='button'
													variant='outline'
													size='sm'
													onClick={() => window.location.reload()}
												>
													Retry
												</Button>
											</div>
										</td>
									</tr>
								) : history.length === 0 ? (
									<tr>
										<td colSpan={5} className='py-16 text-center'>
											<div className='space-y-3 text-ivory-dim'>
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
												className='text-sm text-ivory transition-colors hover:bg-ink-600'
											>
												<td className='py-4 pr-4 whitespace-nowrap font-mono'>
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
													{entry.ratingChange != null ? (
														<div className='flex flex-col'>
															<span
																className={`font-mono font-semibold ${
																	entry.ratingChange > 0
																		? 'text-jungle'
																		: entry.ratingChange < 0
																			? 'text-[#C8402F]'
																			: 'text-ivory-dim'
																}
																`}
															>
																{entry.ratingChange > 0 ? '+' : ''}
																{entry.ratingChange}
															</span>
															{entry.newRating != null && (
																<span className='text-xs font-mono text-ivory-dim'>
																	{entry.newRating}
																</span>
															)}
														</div>
													) : (
														<span className='text-ivory-dim text-xs font-mono'>
															—
														</span>
													)}
												</td>
											</tr>
										);
									})
								)}
							</tbody>
						</table>
					</div>
				</Panel>
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
	accentClass = 'text-ivory',
}: SummaryCardProps) {
	return (
		<Panel className='p-6'>
			<p className='text-xs uppercase tracking-[0.3em] text-ivory-dim mb-2'>
				{label}
			</p>
			<p className={`text-3xl font-bold font-mono ${accentClass}`}>{value}</p>
		</Panel>
	);
}
