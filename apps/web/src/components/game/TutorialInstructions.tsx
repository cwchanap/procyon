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
            <div className='glass-effect p-6 rounded-2xl border border-white border-opacity-20'>
                <h2 className='text-2xl font-bold text-white mb-3'>{title}</h2>
                <div className='bg-black bg-opacity-30 p-4 rounded-xl border border-purple-500 border-opacity-30'>
                    <p className='text-purple-200 leading-relaxed'>
                        {explanation}
                    </p>
                </div>
            </div>

            <div className='glass-effect p-6 rounded-2xl border border-white border-opacity-20'>
                <h3 className='text-xl font-semibold text-white mb-3 flex items-center gap-2'>
                    <span>🎯</span>
                    How to Use This Demo
                </h3>
                <div className='space-y-3 text-purple-200'>
                    <p className='flex items-center gap-3'>
                        <span className='text-green-400'>•</span>
                        Click on any piece to see its possible moves
                    </p>
                    <p className='flex items-center gap-3'>
                        <span className='text-blue-400'>•</span>
                        Green highlights show legal moves
                    </p>
                    <p className='flex items-center gap-3'>
                        <span className='text-purple-400'>•</span>
                        Colored outlines indicate capture moves
                    </p>
                    <p className='flex items-center gap-3'>
                        <span className='text-yellow-400'>•</span>
                        Yellow rings show tutorial highlights
                    </p>
                </div>
            </div>

            {tips && tips.length > 0 && (
                <div className='glass-effect p-6 rounded-2xl border border-white border-opacity-20'>
                    <h3 className='text-xl font-semibold text-white mb-3 flex items-center gap-2'>
                        <span>💡</span>
                        {tipsTitle}
                    </h3>
                    <div className='space-y-2 text-purple-200 text-sm'>
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
