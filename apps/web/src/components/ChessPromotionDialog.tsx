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
	// Refs for every focusable button in tab order: choices first, then cancel.
	// Only the first and last act as wrap boundaries; middle buttons use the
	// browser's native Tab navigation so every choice is keyboard-reachable.
	const buttonRefs = useRef<(HTMLButtonElement | null)[]>([]);
	const previouslyFocusedElementRef = useRef<HTMLElement | null>(null);

	const setButtonRef = (index: number) => (el: HTMLButtonElement | null) => {
		buttonRefs.current[index] = el;
	};

	useEffect(() => {
		const activeElement = document.activeElement;
		previouslyFocusedElementRef.current =
			activeElement instanceof HTMLElement ? activeElement : null;
		buttonRefs.current[0]?.focus();

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
			const buttons = buttonRefs.current.filter(
				(b): b is HTMLButtonElement => b !== null
			);
			if (buttons.length === 0) return;
			event.preventDefault();
			const currentIndex = buttons.findIndex(
				btn => btn === document.activeElement
			);
			// If focus is outside the dialog buttons, land on the first (Tab)
			// or last (Shift+Tab) button.
			if (currentIndex === -1) {
				const fallback = buttons[event.shiftKey ? buttons.length - 1 : 0];
				if (fallback) fallback.focus();
				return;
			}
			const direction = event.shiftKey ? -1 : 1;
			const nextIndex =
				(currentIndex + direction + buttons.length) % buttons.length;
			buttons[nextIndex]?.focus();
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
							ref={setButtonRef(index)}
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
					ref={setButtonRef(choices.length)}
					onClick={onCancel}
					className='mt-4 w-full rounded-lg border border-line bg-ink-600 px-4 py-2 text-ivory hover:bg-ink-700'
				>
					Cancel
				</button>
			</div>
		</div>
	);
}
