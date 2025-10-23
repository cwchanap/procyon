import React from 'react';

interface BackgroundShape {
	className: string;
	style?: React.CSSProperties;
}

interface GamePageLayoutProps {
	variant: 'chess' | 'shogi' | 'xiangqi';
	showBackButton?: boolean;
	children: React.ReactNode;
}

const backgroundShapes: Record<
	GamePageLayoutProps['variant'],
	BackgroundShape[]
> = {
	chess: [
		{
			className:
				'absolute top-10 left-10 w-32 h-32 bg-gradient-to-r from-purple-500 to-pink-500 rounded-full opacity-10 animate-pulse',
		},
		{
			className:
				'absolute bottom-10 right-10 w-48 h-48 bg-gradient-to-r from-blue-500 to-cyan-500 rounded-full opacity-10 animate-ping',
			style: { animationDelay: '2s' },
		},
		{
			className:
				'absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full opacity-5 animate-spin',
			style: { animationDuration: '20s' },
		},
	],
	shogi: [
		{
			className:
				'absolute top-1/4 left-1/4 w-2 h-2 bg-orange-300 rounded-full opacity-30 animate-pulse',
		},
		{
			className:
				'absolute top-3/4 right-1/3 w-1 h-1 bg-red-300 rounded-full opacity-40 animate-ping',
			style: { animationDelay: '1s' },
		},
		{
			className:
				'absolute top-1/2 left-3/4 w-3 h-3 bg-yellow-300 rounded-full opacity-20 animate-bounce',
			style: { animationDelay: '2s' },
		},
		{
			className:
				'absolute top-1/6 right-1/4 w-2 h-2 bg-orange-400 rounded-full opacity-30 animate-pulse',
			style: { animationDelay: '3s' },
		},
	],
	xiangqi: [
		{
			className:
				'absolute top-10 left-10 w-32 h-32 bg-gradient-to-r from-red-500 to-yellow-500 rounded-full opacity-10 animate-pulse',
		},
		{
			className:
				'absolute bottom-10 right-10 w-48 h-48 bg-gradient-to-r from-amber-500 to-red-500 rounded-full opacity-10 animate-ping',
			style: { animationDelay: '2s' },
		},
		{
			className:
				'absolute top-1/3 right-1/4 w-24 h-24 bg-gradient-to-r from-yellow-500 to-amber-500 rounded-full opacity-10 animate-bounce',
			style: { animationDelay: '1s' },
		},
		{
			className:
				'absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-gradient-to-r from-red-500 to-amber-500 rounded-full opacity-5 animate-spin',
			style: { animationDuration: '25s' },
		},
	],
};

export default function GamePageLayout({
	variant,
	showBackButton = true,
	children,
}: GamePageLayoutProps) {
	return (
		<div className='min-h-screen relative'>
			<div className='absolute inset-0 overflow-hidden pointer-events-none'>
				{backgroundShapes[variant].map(({ className, style }, index) => (
					<div className={className} style={style} key={index} />
				))}
			</div>

			<div className='container mx-auto px-4 py-8 relative z-10'>
				{showBackButton && (
					<a
						href='/'
						className='glass-effect inline-flex items-center gap-3 px-6 py-3 rounded-xl text-white font-medium transition-all duration-300 hover:bg-white hover:bg-opacity-20 hover:scale-105 hover:shadow-lg'
					>
						<svg
							width='20'
							height='20'
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
