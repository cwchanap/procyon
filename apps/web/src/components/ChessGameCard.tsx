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
        <div className='bg-card rounded-lg border border-border overflow-hidden shadow-sm hover:shadow-md transition-shadow'>
            <div className='aspect-video bg-muted flex items-center justify-center'>
                <ChessBoardPreview />
            </div>
            <div className='p-6'>
                <h3 className='text-xl font-semibold text-card-foreground mb-2'>
                    {title}
                </h3>
                <p className='text-muted-foreground mb-4'>{description}</p>
                <Button onClick={onPlay} className='w-full'>
                    Play {title}
                </Button>
            </div>
        </div>
    );
};

export default ChessGameCard;
