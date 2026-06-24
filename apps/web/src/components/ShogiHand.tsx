import React from 'react';
import type { ShogiPiece } from '../lib/shogi';
import { PIECE_UNICODE } from '../lib/shogi';

interface ShogiHandProps {
	pieces: ShogiPiece[];
	color: 'sente' | 'gote';
	selectedPiece: ShogiPiece | null;
	onPieceClick: (piece: ShogiPiece) => void;
}

const ShogiHand: React.FC<ShogiHandProps> = ({
	pieces,
	color,
	selectedPiece,
	onPieceClick,
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
		<div
			className={`flex flex-col items-center p-2 bg-ink-700 border ${
				color === 'sente' ? 'border-shogi/40' : 'border-[#C8402F]/40'
			} rounded-lg shadow-sm min-h-[100px] w-48`}
		>
			<div
				className={`text-sm font-bold mb-2 ${
					color === 'sente' ? 'text-shogi' : 'text-[#C8402F]'
				}`}
			>
				{color === 'sente' ? '先手の持ち駒' : '後手の持ち駒'}
			</div>

			<div className='flex flex-wrap gap-1 justify-center'>
				{Object.entries(groupedPieces).map(([type, { piece, count }]) => (
					<button
						type='button'
						key={type}
						aria-label={`Hand piece ${type}`}
						className={`
                            flex flex-col items-center justify-center p-1 rounded cursor-pointer
                            transition-colors duration-150
                            ${
															isSelected(piece)
																? 'bg-shogi/20 ring-2 ring-shogi'
																: 'bg-ink-600 hover:bg-ink-700'
														}
                            min-w-[32px] min-h-[32px]
                        `}
						onClick={() => onPieceClick(piece)}
					>
						<div
							className={`text-base font-bold ${
								color === 'sente' ? 'text-ivory' : 'text-[#C8402F]'
							}`}
						>
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
