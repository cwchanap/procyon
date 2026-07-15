import React from 'react';

export type BoardColumnProps = {
	board: React.ReactNode;
	controls?: React.ReactNode;
	debugTools?: React.ReactNode;
	belowBoard?: React.ReactNode;
	aboveControls?: React.ReactNode;
};

/**
 * Vertical stack for the play shell's board column: board, optional controls
 * and debug tools. Slot order matches ChessGame's board column.
 */
export default function BoardColumn({
	board,
	aboveControls,
	controls,
	debugTools,
	belowBoard,
}: BoardColumnProps) {
	return (
		<div className='flex flex-col items-center gap-6'>
			{board}
			{aboveControls}
			{controls}
			{debugTools}
			{belowBoard}
		</div>
	);
}
