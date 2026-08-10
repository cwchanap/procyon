import React from 'react';
import { TRACK_ANCHORS } from '../../lib/aeroplane/layout';

const AeroplaneBoardPreview: React.FC = () => {
	return (
		<svg
			width='160'
			height='160'
			viewBox='0 0 100 100'
			role='img'
			aria-label='Aeroplane Chess board preview with 52 track nodes'
		>
			<rect x='1' y='1' width='98' height='98' rx='8' fill='#17263A' />
			<circle
				cx='50'
				cy='50'
				r='27'
				fill='none'
				stroke='#4F8FD8'
				strokeOpacity='0.3'
				strokeWidth='5'
			/>
			{TRACK_ANCHORS.map((anchor, index) => (
				<circle
					key={index}
					cx={anchor.x}
					cy={anchor.y}
					r='1.9'
					fill={index % 13 === 0 ? '#C8A24B' : '#3A5B80'}
				/>
			))}
			<path
				d='M 50 47 L 50 38 L 50 28 L 50 50 M 47 50 L 38 50 L 28 50 L 50 50 M 50 53 L 50 62 L 50 72 L 50 50 M 53 50 L 62 50 L 72 50 L 50 50'
				fill='none'
				stroke='#4F8FD8'
				strokeOpacity='0.65'
				strokeWidth='1.3'
			/>
			<path d='M 50 41 l 4 6 h-8z' fill='#D7B34A' opacity='0.9' />
		</svg>
	);
};

export default AeroplaneBoardPreview;
