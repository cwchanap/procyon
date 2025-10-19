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
					className={`glass-effect px-4 py-2 rounded-xl text-sm font-medium transition-all duration-300 hover:scale-105 border border-white border-opacity-30 ${
						currentDemo === demoItem.id
							? 'bg-gradient-to-r from-purple-500 to-pink-500 text-white shadow-lg'
							: 'text-purple-100 hover:bg-white hover:bg-opacity-20'
					}`}
				>
					{demoItem.title}
				</button>
			))}
		</div>
	);
};

export default DemoSelector;
