import React from 'react';
import { Button } from './ui/Button';
import ChessBoardPreview from './ChessBoardPreview';

interface ChessGameCardProps {
	title: string;
	description: string;
	onPlay: () => void;
}

const ChessGameCard: React.FC<ChessGameCardProps> = ({
	title,
	description,
	onPlay,
}) => {
	return (
		<div className='glass-effect rounded-xl overflow-hidden shadow-xl hover:shadow-2xl transition-all duration-500 hover:scale-105 hover:-translate-y-2 group h-full flex flex-col'>
			<div className='aspect-video bg-gradient-to-br from-purple-600/30 to-pink-600/30 flex items-center justify-center relative overflow-hidden flex-shrink-0'>
				<div className='absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000 ease-out'></div>
				<div className='transform group-hover:scale-110 transition-transform duration-500'>
					<ChessBoardPreview />
				</div>
			</div>
			<div className='p-6 flex flex-col flex-grow'>
				<h3 className='text-2xl font-bold bg-gradient-to-r from-cyan-300 to-purple-300 bg-clip-text text-transparent mb-3 group-hover:from-pink-300 group-hover:to-yellow-300 transition-all duration-500 min-h-[2rem]'>
					{title}
				</h3>
				<p className='text-purple-100 mb-6 leading-relaxed flex-grow min-h-[4.5rem]'>
					{description}
				</p>
				<Button
					onClick={onPlay}
					className='w-full bg-gradient-to-r from-purple-500 to-pink-500 hover:from-pink-500 hover:to-purple-500 text-white font-bold py-3 px-6 rounded-lg transition-all duration-300 transform hover:scale-105 hover:shadow-lg border-0 mt-auto'
				>
					<span className='flex items-center justify-center gap-2'>
						<span>✨</span>
						Play {title}
						<span>✨</span>
					</span>
				</Button>
			</div>
		</div>
	);
};

export default ChessGameCard;
