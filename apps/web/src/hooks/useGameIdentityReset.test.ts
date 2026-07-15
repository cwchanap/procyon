import { test, expect, describe, mock } from 'bun:test';
import { renderHook } from '@testing-library/react';
import { setupReactDom } from '../test/reactSetup';
import { useGameIdentityReset } from './useGameIdentityReset';

setupReactDom();

type IdentityProps = {
	isAuthenticated: boolean;
	userId: string | null | undefined;
};

describe('useGameIdentityReset', () => {
	test('does not fire on mount', () => {
		const onReset = mock(() => {});
		renderHook(() =>
			useGameIdentityReset({
				isAuthenticated: true,
				userId: 'a',
				onReset,
			})
		);
		expect(onReset).not.toHaveBeenCalled();
	});

	test('does not fire on first login from anonymous', () => {
		const onReset = mock(() => {});
		const initial: IdentityProps = {
			isAuthenticated: false,
			userId: undefined,
		};
		const { rerender } = renderHook(
			(props: IdentityProps) => useGameIdentityReset({ ...props, onReset }),
			{ initialProps: initial }
		);
		rerender({ isAuthenticated: true, userId: 'a' });
		expect(onReset).not.toHaveBeenCalled();
	});

	test('fires on logout (true → false)', () => {
		const onReset = mock(() => {});
		const invalidate = mock(() => {});
		const initial: IdentityProps = {
			isAuthenticated: true,
			userId: 'a',
		};
		const { rerender } = renderHook(
			(props: IdentityProps) =>
				useGameIdentityReset({ ...props, onReset, invalidate }),
			{ initialProps: initial }
		);
		rerender({ isAuthenticated: false, userId: undefined });
		expect(invalidate).toHaveBeenCalledTimes(1);
		expect(onReset).toHaveBeenCalledTimes(1);
	});

	test('fires on identity change while authenticated', () => {
		const onReset = mock(() => {});
		const invalidate = mock(() => {});
		const initial: IdentityProps = {
			isAuthenticated: true,
			userId: 'a',
		};
		const { rerender } = renderHook(
			(props: IdentityProps) =>
				useGameIdentityReset({ ...props, onReset, invalidate }),
			{ initialProps: initial }
		);
		rerender({ isAuthenticated: true, userId: 'b' });
		expect(invalidate).toHaveBeenCalledTimes(1);
		expect(onReset).toHaveBeenCalledTimes(1);
	});

	test('does not fire when userId goes null→value while already authenticated without prior id', () => {
		// previous userId null + authenticated: treat as first known id, not switch
		const onReset = mock(() => {});
		const initial: IdentityProps = {
			isAuthenticated: true,
			userId: null,
		};
		const { rerender } = renderHook(
			(props: IdentityProps) => useGameIdentityReset({ ...props, onReset }),
			{ initialProps: initial }
		);
		rerender({ isAuthenticated: true, userId: 'a' });
		expect(onReset).not.toHaveBeenCalled();
	});
});
