import { useCallback, useEffect, useRef, useState } from 'react';

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

	// Callers pass inline `setOutcome` / `onPrepareTriggerWin` closures that
	// change identity every render. Stash them in refs so the trigger
	// callbacks (and the DEV global registration effect) stay stable and the
	// effect re-runs only when `debugVariantKey` actually changes.
	const setOutcomeRef = useRef(setOutcome);
	setOutcomeRef.current = setOutcome;
	const onPrepareRef = useRef(onPrepareTriggerWin);
	onPrepareRef.current = onPrepareTriggerWin;

	const triggerDebugWin = useCallback(() => {
		setOutcomeRef.current({ status: winStatus, currentPlayer: aiPlayer });
	}, [winStatus, aiPlayer]);

	const triggerDebugLoss = useCallback(() => {
		setOutcomeRef.current({
			status: winStatus,
			currentPlayer: getHumanPlayer(aiPlayer),
		});
	}, [winStatus, getHumanPlayer, aiPlayer]);

	const triggerDebugDraw = useCallback(() => {
		// Status only — do not include currentPlayer key
		setOutcomeRef.current({ status: drawStatus });
	}, [drawStatus]);

	// Latest "trigger win" sequence (prepare + show + win) via ref so the
	// global registration effect below can depend only on `debugVariantKey`.
	const triggerWinSequenceRef = useRef<() => void>(() => {});
	triggerWinSequenceRef.current = () => {
		onPrepareRef.current?.();
		setShowDebugWinButton(true);
		triggerDebugWin();
	};

	// DEV global win trigger
	useEffect(() => {
		if (!import.meta.env.DEV || typeof window === 'undefined') return;
		const key = `__PROCYON_DEBUG_${debugVariantKey}_TRIGGER_WIN__` as const;
		const global = window as unknown as Record<
			string,
			(() => void) | undefined
		>;
		global[key] = () => triggerWinSequenceRef.current();
		return () => {
			delete global[key];
		};
	}, [debugVariantKey]);

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
