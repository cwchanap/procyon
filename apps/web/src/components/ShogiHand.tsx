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
			className={`flex flex-col items-center p-2 bg-gradient-to-br ${
				color === 'sente'
					? 'from-blue-50 to-blue-100 border-blue-300'
					: 'from-red-50 to-red-100 border-red-300'
			} border rounded-lg shadow-sm min-h-[100px] w-48`}
		>
			<div
				className={`text-sm font-bold mb-2 ${
					color === 'sente' ? 'text-blue-800' : 'text-red-800'
				}`}
			>
				{color === 'sente' ? '先手の持ち駒' : '後手の持ち駒'}
			</div>

			<div className='flex flex-wrap gap-1 justify-center'>
				{Object.entries(groupedPieces).map(([type, { piece, count }]) => (
					<div
						key={type}
						className={`
                            flex flex-col items-center justify-center p-1 rounded cursor-pointer
                            transition-all duration-200 hover:scale-110 hover:shadow-md
                            ${
															isSelected(piece)
																? 'bg-yellow-200 ring-2 ring-yellow-400 scale-105'
																: 'bg-white hover:bg-gray-50'
														}
                            min-w-[32px] min-h-[32px]
                        `}
						onClick={() => onPieceClick(piece)}
					>
						<div
							className={`text-base font-bold ${
								color === 'sente' ? 'text-black' : 'text-red-700'
							}`}
						>
							{getPieceDisplay(piece)}
						</div>
						{count > 1 && (
							<div className='text-xs font-bold text-gray-600'>{count}</div>
						)}
					</div>
				))}
			</div>

			{pieces.length === 0 && (
				<div className='text-xs text-gray-500 italic flex-1 flex items-center'>
					持ち駒なし
				</div>
			)}
		</div>
	);
};

export default ShogiHand;
