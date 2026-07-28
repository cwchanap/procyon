import React, { useEffect, useRef } from 'react';
import type { PieceColor, PromotionPiece } from '../lib/chess/types';

interface ChessPromotionDialogProps {
	color: PieceColor;
	choices: PromotionPiece[];
	onChoose: (promotion: PromotionPiece) => void;
	onCancel: () => void;
}

export default function ChessPromotionDialog({
	color,
	choices,
	onChoose,
	onCancel,
}: ChessPromotionDialogProps) {
	const firstChoiceRef = useRef<HTMLButtonElement>(null);
	const cancelRef = useRef<HTMLButtonElement>(null);
	const previouslyFocusedElementRef = useRef<HTMLElement | null>(null);

	useEffect(() => {
		const activeElement = document.activeElement;
		previouslyFocusedElementRef.current =
			activeElement instanceof HTMLElement ? activeElement : null;
		firstChoiceRef.current?.focus();

		return () => {
			const previouslyFocusedElement = previouslyFocusedElementRef.current;
			if (
				previouslyFocusedElement?.isConnected &&
				!previouslyFocusedElement.matches('[disabled], [inert], [inert] *')
			) {
				previouslyFocusedElement.focus();
			}
		};
	}, []);

	useEffect(() => {
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key === 'Escape') {
				onCancel();
				return;
			}
			if (event.key !== 'Tab') return;
			const first = firstChoiceRef.current;
			const cancel = cancelRef.current;
			if (!first || !cancel) return;
			event.preventDefault();
			if (document.activeElement === first) {
				cancel.focus();
			} else {
				first.focus();
			}
		};
		document.addEventListener('keydown', onKeyDown);
		return () => document.removeEventListener('keydown', onKeyDown);
	}, [onCancel]);

	const symbols: Record<PieceColor, Record<PromotionPiece, string>> = {
		white: { queen: '♕', rook: '♖', bishop: '♗', knight: '♘' },
		black: { queen: '♛', rook: '♜', bishop: '♝', knight: '♞' },
	};

	return (
		<div className='fixed inset-0 z-50 flex items-center justify-center bg-ink-900/50'>
			<div
				tabIndex={-1}
				role='dialog'
				aria-modal='true'
				aria-labelledby='chess-promotion-title'
				className='mx-4 rounded-lg border border-line bg-ink-700 p-6'
			>
				<h3 id='chess-promotion-title'>Choose promotion piece</h3>
				<div className='mt-4 flex gap-3'>
					{choices.map((choice, index) => (
						<button
							key={choice}
							type='button'
							ref={index === 0 ? firstChoiceRef : undefined}
							aria-label={`Promote to ${choice}`}
							onClick={() => onChoose(choice)}
							className='rounded-lg border border-line bg-ink-600 px-4 py-3 text-3xl text-ivory shadow-lg transition-colors hover:border-brass hover:bg-ink-700'
						>
							{symbols[color][choice]}
						</button>
					))}
				</div>
				<button
					type='button'
					ref={cancelRef}
					onClick={onCancel}
					className='mt-4 w-full rounded-lg border border-line bg-ink-600 px-4 py-2 text-ivory hover:bg-ink-700'
				>
					Cancel
				</button>
			</div>
		</div>
	);
}
