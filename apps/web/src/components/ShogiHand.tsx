import React from 'react';
import { cva } from 'class-variance-authority';
import type { ShogiPiece } from '../lib/shogi';
import { PIECE_UNICODE } from '../lib/shogi';

interface ShogiHandProps {
	pieces: ShogiPiece[];
	color: 'sente' | 'gote';
	selectedPiece: ShogiPiece | null;
	onPieceClick: (piece: ShogiPiece) => void;
	/**
	 * When true, hand piece buttons are rendered with the native `disabled`
	 * attribute so they are removed from the tab order and cannot be activated.
	 * This replaces the previous pattern of swapping in a no-op click handler,
	 * which left the controls focusable and visually interactive.
	 */
	disabled?: boolean;
}

const handContainerVariants = cva(
	'flex flex-col items-center p-2 bg-ink-700 border rounded-lg shadow-sm min-h-[100px] w-48',
	{
		variants: {
			color: {
				sente: 'border-shogi/40',
				gote: 'border-xiangqi/40',
			},
		},
	}
);

const handTitleVariants = cva('text-sm font-bold mb-2', {
	variants: {
		color: {
			sente: 'text-shogi',
			gote: 'text-xiangqi',
		},
	},
});

const pieceButtonVariants = cva(
	'flex flex-col items-center justify-center p-1 rounded transition-colors duration-150 min-w-[32px] min-h-[32px] disabled:cursor-not-allowed disabled:opacity-50',
	{
		variants: {
			selected: {
				true: 'bg-shogi/20 ring-2 ring-shogi',
				false: 'bg-ink-600 hover:bg-ink-700 cursor-pointer',
			},
		},
		defaultVariants: {
			selected: false,
		},
	}
);

const pieceTextVariants = cva('text-base font-bold', {
	variants: {
		color: {
			sente: 'text-ivory',
			gote: 'text-xiangqi',
		},
	},
});

const ShogiHand: React.FC<ShogiHandProps> = ({
	pieces,
	color,
	selectedPiece,
	onPieceClick,
	disabled = false,
}) => {
	const groupedPieces = pieces.reduce(
		(acc, piece) => {
			const key = piece.type;
			if (!acc[key]) {
				acc[key] = { piece, count: 0 };
			}
			acc[key].count++;
			return acc;
		},
		{} as Record<string, { piece: ShogiPiece; count: number }>
	);

	const isSelected = (piece: ShogiPiece): boolean => {
		return (
			selectedPiece?.type === piece.type && selectedPiece?.color === piece.color
		);
	};

	const getPieceDisplay = (piece: ShogiPiece): string => {
		return PIECE_UNICODE[piece.type][piece.color];
	};

	return (
		<div className={handContainerVariants({ color })}>
			<div className={handTitleVariants({ color })}>
				{color === 'sente' ? '先手の持ち駒' : '後手の持ち駒'}
			</div>

			<div className='flex flex-wrap gap-1 justify-center'>
				{Object.entries(groupedPieces).map(([type, { piece, count }]) => (
					<button
						type='button'
						key={type}
						aria-label={`Hand piece ${type}`}
						disabled={disabled}
						className={pieceButtonVariants({ selected: isSelected(piece) })}
						onClick={() => onPieceClick(piece)}
					>
						<div className={pieceTextVariants({ color })}>
							{getPieceDisplay(piece)}
						</div>
						{count > 1 && (
							<div className='text-xs font-bold font-mono text-ivory-dim'>
								{count}
							</div>
						)}
					</button>
				))}
			</div>

			{pieces.length === 0 && (
				<div className='text-xs text-ivory-dim italic flex-1 flex items-center'>
					持ち駒なし
				</div>
			)}
		</div>
	);
};

export default ShogiHand;
