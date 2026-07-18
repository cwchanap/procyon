import { test, expect, describe, mock, beforeEach, afterEach } from 'bun:test';
import { renderHook, act } from '@testing-library/react';
import { setupReactDom } from '../test/reactSetup';
import { useGameDebugOutcomes } from './useGameDebugOutcomes';

setupReactDom();

type ChessColor = 'black' | 'white';

function chessHumanPlayer(ai: ChessColor): ChessColor {
	return ai === 'black' ? 'white' : 'black';
}

type MutableEnv = { DEV: boolean };
const env = import.meta.env as unknown as MutableEnv;
const originalDev = env.DEV;

describe('useGameDebugOutcomes', () => {
	const winStatus = 'checkmate';
	const drawStatus = 'stalemate';

	beforeEach(() => {
		// Ensure DEV so global trigger + Shift+D effects register
		env.DEV = true;
	});

	afterEach(() => {
		env.DEV = originalDev;
	});

	test('triggerDebugWin calls setOutcome with winStatus and aiPlayer', () => {
		const setOutcome = mock(
			(_p: { status: string; currentPlayer?: ChessColor }) => {}
		);
		const { result } = renderHook(() =>
			useGameDebugOutcomes<ChessColor>({
				aiPlayer: 'black',
				getHumanPlayer: chessHumanPlayer,
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
			(_p: { status: string; currentPlayer?: ChessColor }) => {}
		);
		const { result } = renderHook(() =>
			useGameDebugOutcomes<ChessColor>({
				aiPlayer: 'black',
				getHumanPlayer: chessHumanPlayer,
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
			(_p: { status: string; currentPlayer?: ChessColor }) => {}
		);
		const { result } = renderHook(() =>
			useGameDebugOutcomes<ChessColor>({
				aiPlayer: 'black',
				getHumanPlayer: chessHumanPlayer,
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
		const firstCall = setOutcome.mock.calls[0];
		expect(firstCall).toBeDefined();
		const arg = firstCall![0];
		expect(arg.status).toBe('stalemate');
		expect('currentPlayer' in arg).toBe(false);
	});

	test('registers __PROCYON_DEBUG_<KEY>_TRIGGER_WIN__ and runs prepare then win', () => {
		const setOutcome = mock(() => {});
		const onPrepareTriggerWin = mock(() => {});
		renderHook(() =>
			useGameDebugOutcomes<ChessColor>({
				aiPlayer: 'black',
				getHumanPlayer: chessHumanPlayer,
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
			useGameDebugOutcomes<ChessColor>({
				aiPlayer: 'black',
				getHumanPlayer: chessHumanPlayer,
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

	test('each trigger calls invalidate before setOutcome so in-flight AI moves bail', () => {
		const setOutcome = mock(
			(_p: { status: string; currentPlayer?: ChessColor }) => {}
		);
		const invalidate = mock(() => {});
		const { result } = renderHook(() =>
			useGameDebugOutcomes<ChessColor>({
				aiPlayer: 'black',
				getHumanPlayer: chessHumanPlayer,
				setOutcome,
				debugVariantKey: 'CHESS',
				winStatus,
				drawStatus,
				invalidate,
			})
		);
		act(() => {
			result.current.triggerDebugWin();
		});
		expect(invalidate).toHaveBeenCalledTimes(1);
		expect(setOutcome).toHaveBeenCalledTimes(1);
		// invalidate must run before setOutcome so the gen token bumps first
		expect(invalidate.mock.invocationCallOrder[0]!).toBeLessThan(
			setOutcome.mock.invocationCallOrder[0]!
		);

		invalidate.mockReset();
		setOutcome.mockReset();
		act(() => {
			result.current.triggerDebugLoss();
		});
		expect(invalidate).toHaveBeenCalledTimes(1);
		expect(setOutcome).toHaveBeenCalledTimes(1);
		expect(invalidate.mock.invocationCallOrder[0]!).toBeLessThan(
			setOutcome.mock.invocationCallOrder[0]!
		);

		invalidate.mockReset();
		setOutcome.mockReset();
		act(() => {
			result.current.triggerDebugDraw();
		});
		expect(invalidate).toHaveBeenCalledTimes(1);
		expect(setOutcome).toHaveBeenCalledTimes(1);
		expect(invalidate.mock.invocationCallOrder[0]!).toBeLessThan(
			setOutcome.mock.invocationCallOrder[0]!
		);
	});

	test('triggers work without invalidate (non-AI harnesses)', () => {
		const setOutcome = mock(
			(_p: { status: string; currentPlayer?: ChessColor }) => {}
		);
		const { result } = renderHook(() =>
			useGameDebugOutcomes<ChessColor>({
				aiPlayer: 'black',
				getHumanPlayer: chessHumanPlayer,
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
});
