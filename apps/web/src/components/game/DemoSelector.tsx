import React from 'react';

interface Demo {
	id: string;
	title: string;
}

interface DemoSelectorProps {
	demos: Demo[];
	currentDemo: string;
	onDemoChange: (demoId: string) => void;
}

const DemoSelector: React.FC<DemoSelectorProps> = ({
	demos,
	currentDemo,
	onDemoChange,
}) => {
	return (
		<div className='flex flex-wrap gap-3 justify-center max-w-4xl'>
			{demos.map(demoItem => (
				<button
					key={demoItem.id}
					onClick={() => onDemoChange(demoItem.id)}
					className={`bg-ink-700 border border-line px-4 py-2 rounded-lg text-sm font-medium transition-colors duration-150 ${
						currentDemo === demoItem.id
							? 'bg-brass text-ink-900 border-brass shadow-lg'
							: 'text-ivory-dim hover:bg-ink-600'
					}`}
				>
					{demoItem.title}
				</button>
			))}
		</div>
	);
};

export default DemoSelector;
