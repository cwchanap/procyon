import { test, expect, describe } from 'bun:test';
import { renderHook, act } from '@testing-library/react';
import { setupReactDom } from '../test/reactSetup';
import { useAiMoveGenerationToken } from './useAiMoveGenerationToken';

setupReactDom();

describe('useAiMoveGenerationToken', () => {
	test('starts at generation 0', () => {
		const { result } = renderHook(() => useAiMoveGenerationToken());
		expect(result.current.genRef.current).toBe(0);
	});

	test('invalidate bumps generation', () => {
		const { result } = renderHook(() => useAiMoveGenerationToken());
		act(() => {
			result.current.invalidate();
		});
		expect(result.current.genRef.current).toBe(1);
		act(() => {
			result.current.invalidate();
		});
		expect(result.current.genRef.current).toBe(2);
	});

	test('isStale is false when requestId is undefined', () => {
		const { result } = renderHook(() => useAiMoveGenerationToken());
		act(() => {
			result.current.invalidate();
		});
		expect(result.current.isStale(undefined)).toBe(false);
	});

	test('isStale is false when requestId matches current gen', () => {
		const { result } = renderHook(() => useAiMoveGenerationToken());
		act(() => {
			result.current.invalidate();
		});
		const gen = result.current.genRef.current;
		expect(result.current.isStale(gen)).toBe(false);
	});

	test('isStale is true when requestId is set and mismatched', () => {
		const { result } = renderHook(() => useAiMoveGenerationToken());
		const old = result.current.genRef.current;
		act(() => {
			result.current.invalidate();
		});
		expect(result.current.isStale(old)).toBe(true);
	});
});
