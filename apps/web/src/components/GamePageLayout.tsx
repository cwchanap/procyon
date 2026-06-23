import React from 'react';

interface GamePageLayoutProps {
	variant: 'chess' | 'shogi' | 'xiangqi';
	title?: string;
	showBackButton?: boolean;
	children: React.ReactNode;
}

const accentBar: Record<GamePageLayoutProps['variant'], string> = {
	chess: 'bg-chess',
	shogi: 'bg-shogi',
	xiangqi: 'bg-xiangqi',
};

export default function GamePageLayout({
	variant,
	title: _title,
	showBackButton = true,
	children,
}: GamePageLayoutProps) {
	return (
		<div className='min-h-screen'>
			<div className={`h-0.5 w-full ${accentBar[variant]}`} />
			<div className='mx-auto max-w-6xl px-4 py-8'>
				{showBackButton && (
					<a
						href='/'
						className='mb-8 inline-flex items-center gap-2 rounded-md border border-line px-4 py-2 text-sm text-ivory-dim transition-colors hover:border-line-brass hover:text-ivory'
					>
						<svg
							width='18'
							height='18'
							viewBox='0 0 24 24'
							fill='none'
							stroke='currentColor'
							strokeWidth='2'
							strokeLinecap='round'
							strokeLinejoin='round'
						>
							<path d='M19 12H5M12 19l-7-7 7-7' />
						</svg>
						Back to Game Selection
					</a>
				)}
				{children}
			</div>
		</div>
	);
}
