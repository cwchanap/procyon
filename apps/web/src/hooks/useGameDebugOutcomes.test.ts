import { test, expect, describe, mock, beforeEach } from 'bun:test';
import { renderHook, act } from '@testing-library/react';
import { setupReactDom } from '../test/reactSetup';
import { useGameDebugOutcomes } from './useGameDebugOutcomes';

setupReactDom();

describe('useGameDebugOutcomes', () => {
	const winStatus = 'checkmate';
	const drawStatus = 'stalemate';

	beforeEach(() => {
		// @ts-expect-error test env
		import.meta.env.DEV = true;
	});

	test('triggerDebugWin calls setOutcome with winStatus and aiPlayer', () => {
		const setOutcome = mock(
			(_p: { status: string; currentPlayer?: string }) => {}
		);
		const { result } = renderHook(() =>
			useGameDebugOutcomes({
				aiPlayer: 'black',
				getHumanPlayer: ai => (ai === 'black' ? 'white' : 'black'),
				setOutcome,
				debugVariantKey: 'CHESS',
				winStatus,
				drawStatus,
			})
		);
		act(() => {
			result.current.triggerDebugWin();
		});
		expect(setOutcome).toHaveBeenCalledWith({
			status: 'checkmate',
			currentPlayer: 'black',
		});
	});

	test('triggerDebugLoss uses human as currentPlayer', () => {
		const setOutcome = mock(
			(_p: { status: string; currentPlayer?: string }) => {}
		);
		const { result } = renderHook(() =>
			useGameDebugOutcomes({
				aiPlayer: 'black',
				getHumanPlayer: ai => (ai === 'black' ? 'white' : 'black'),
				setOutcome,
				debugVariantKey: 'CHESS',
				winStatus,
				drawStatus,
			})
		);
		act(() => {
			result.current.triggerDebugLoss();
		});
		expect(setOutcome).toHaveBeenCalledWith({
			status: 'checkmate',
			currentPlayer: 'white',
		});
	});

	test('triggerDebugDraw omits currentPlayer', () => {
		const setOutcome = mock(
			(_p: { status: string; currentPlayer?: string }) => {}
		);
		const { result } = renderHook(() =>
			useGameDebugOutcomes({
				aiPlayer: 'black',
				getHumanPlayer: ai => (ai === 'black' ? 'white' : 'black'),
				setOutcome,
				debugVariantKey: 'CHESS',
				winStatus,
				drawStatus,
			})
		);
		act(() => {
			result.current.triggerDebugDraw();
		});
		expect(setOutcome).toHaveBeenCalledTimes(1);
		const arg = setOutcome.mock.calls[0][0];
		expect(arg.status).toBe('stalemate');
		expect('currentPlayer' in arg).toBe(false);
	});

	test('registers __PROCYON_DEBUG_<KEY>_TRIGGER_WIN__ and runs prepare then win', () => {
		const setOutcome = mock(() => {});
		const onPrepareTriggerWin = mock(() => {});
		renderHook(() =>
			useGameDebugOutcomes({
				aiPlayer: 'black',
				getHumanPlayer: ai => (ai === 'black' ? 'white' : 'black'),
				setOutcome,
				debugVariantKey: 'CHESS',
				winStatus,
				drawStatus,
				onPrepareTriggerWin,
			})
		);
		const g = window as unknown as {
			__PROCYON_DEBUG_CHESS_TRIGGER_WIN__?: () => void;
		};
		expect(typeof g.__PROCYON_DEBUG_CHESS_TRIGGER_WIN__).toBe('function');
		act(() => {
			g.__PROCYON_DEBUG_CHESS_TRIGGER_WIN__!();
		});
		expect(onPrepareTriggerWin).toHaveBeenCalled();
		expect(setOutcome).toHaveBeenCalled();
	});

	test('Shift+D toggles showDebugWinButton in DEV', () => {
		const { result } = renderHook(() =>
			useGameDebugOutcomes({
				aiPlayer: 'black',
				getHumanPlayer: ai => (ai === 'black' ? 'white' : 'black'),
				setOutcome: () => {},
				debugVariantKey: 'CHESS',
				winStatus,
				drawStatus,
			})
		);
		expect(result.current.showDebugWinButton).toBe(false);
		act(() => {
			// happy-dom: KeyboardEvent lives on window, not globalThis
			const KE = (window as unknown as { KeyboardEvent: typeof KeyboardEvent })
				.KeyboardEvent;
			window.dispatchEvent(new KE('keydown', { key: 'd', shiftKey: true }));
		});
		expect(result.current.showDebugWinButton).toBe(true);
	});
});
