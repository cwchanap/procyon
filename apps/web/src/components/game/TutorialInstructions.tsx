import React from 'react';

interface TutorialInstructionsProps {
	title: string;
	explanation: string;
	tips?: string[];
	tipsTitle?: string;
}

const TutorialInstructions: React.FC<TutorialInstructionsProps> = ({
	title,
	explanation,
	tips,
	tipsTitle = 'Tips',
}) => {
	return (
		<>
			<div className='bg-ink-700 border border-line p-6 rounded-lg'>
				<h2 className='text-2xl font-bold text-ivory mb-3'>{title}</h2>
				<div className='bg-ink-800 p-4 rounded-lg border border-brass/30'>
					<p className='text-ivory-dim leading-relaxed'>{explanation}</p>
				</div>
			</div>

			<div className='bg-ink-700 border border-line p-6 rounded-lg'>
				<h3 className='text-xl font-semibold text-ivory mb-3 flex items-center gap-2'>
					<span>🎯</span>
					How to Use This Demo
				</h3>
				<div className='space-y-3 text-ivory-dim'>
					<p className='flex items-center gap-3'>
						<span className='text-jungle'>•</span>
						Click on any piece to see its possible moves
					</p>
					<p className='flex items-center gap-3'>
						<span className='text-shogi'>•</span>
						Highlighted squares show legal moves
					</p>
					<p className='flex items-center gap-3'>
						<span className='text-brass'>•</span>
						Colored outlines indicate capture moves
					</p>
					<p className='flex items-center gap-3'>
						<span className='text-brass'>•</span>
						Accent rings show tutorial highlights
					</p>
				</div>
			</div>

			{tips && tips.length > 0 && (
				<div className='bg-ink-700 border border-line p-6 rounded-lg'>
					<h3 className='text-xl font-semibold text-ivory mb-3 flex items-center gap-2'>
						<span>💡</span>
						{tipsTitle}
					</h3>
					<div className='space-y-2 text-ivory-dim text-sm'>
						{tips.map((tip, index) => (
							<p key={index}>{tip}</p>
						))}
					</div>
				</div>
			)}
		</>
	);
};

export default TutorialInstructions;
