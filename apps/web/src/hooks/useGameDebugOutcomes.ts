import { useCallback, useEffect, useState } from 'react';

export function useGameDebugOutcomes<TPlayer extends string>(options: {
	aiPlayer: TPlayer;
	getHumanPlayer: (ai: TPlayer) => TPlayer;
	setOutcome: (patch: { status: string; currentPlayer?: TPlayer }) => void;
	debugVariantKey: string;
	winStatus: string;
	drawStatus: string;
	onPrepareTriggerWin?: () => void;
}): {
	triggerDebugWin: () => void;
	triggerDebugLoss: () => void;
	triggerDebugDraw: () => void;
	showDebugWinButton: boolean;
	setShowDebugWinButton: (v: boolean) => void;
} {
	const {
		aiPlayer,
		getHumanPlayer,
		setOutcome,
		debugVariantKey,
		winStatus,
		drawStatus,
		onPrepareTriggerWin,
	} = options;

	const [showDebugWinButton, setShowDebugWinButton] = useState(false);

	const triggerDebugWin = useCallback(() => {
		setOutcome({ status: winStatus, currentPlayer: aiPlayer });
	}, [setOutcome, winStatus, aiPlayer]);

	const triggerDebugLoss = useCallback(() => {
		setOutcome({
			status: winStatus,
			currentPlayer: getHumanPlayer(aiPlayer),
		});
	}, [setOutcome, winStatus, getHumanPlayer, aiPlayer]);

	const triggerDebugDraw = useCallback(() => {
		// Status only — do not include currentPlayer key
		setOutcome({ status: drawStatus });
	}, [setOutcome, drawStatus]);

	// DEV global win trigger
	useEffect(() => {
		if (!import.meta.env.DEV || typeof window === 'undefined') return;
		const key = `__PROCYON_DEBUG_${debugVariantKey}_TRIGGER_WIN__` as const;
		const global = window as unknown as Record<
			string,
			(() => void) | undefined
		>;
		global[key] = () => {
			onPrepareTriggerWin?.();
			setShowDebugWinButton(true);
			triggerDebugWin();
		};
		return () => {
			delete global[key];
		};
	}, [debugVariantKey, onPrepareTriggerWin, triggerDebugWin]);

	// Shift+D
	useEffect(() => {
		if (!import.meta.env.DEV || typeof window === 'undefined') return;
		const handleKeyDown = (e: KeyboardEvent) => {
			if (e.shiftKey && e.key.toLowerCase() === 'd') {
				setShowDebugWinButton(prev => !prev);
			}
		};
		window.addEventListener('keydown', handleKeyDown);
		return () => window.removeEventListener('keydown', handleKeyDown);
	}, []);

	return {
		triggerDebugWin,
		triggerDebugLoss,
		triggerDebugDraw,
		showDebugWinButton,
		setShowDebugWinButton,
	};
}
