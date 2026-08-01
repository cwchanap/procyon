import { test, expect, describe, mock } from 'bun:test';
import { renderHook } from '@testing-library/react';
import { setupReactDom } from '../test/reactSetup';
import { useGameIdentityReset } from './useGameIdentityReset';

setupReactDom();

type IdentityProps = {
	isAuthenticated: boolean;
	userId: string | null | undefined;
	enabled?: boolean;
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

	describe('enabled policy', () => {
		test('default enabled preserves logout reset behavior', () => {
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

		test('default enabled preserves account-switch reset behavior', () => {
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

		test('disabled policy skips invalidate and onReset on logout', () => {
			const onReset = mock(() => {});
			const invalidate = mock(() => {});
			const initial: IdentityProps = {
				isAuthenticated: true,
				userId: 'a',
				enabled: false,
			};
			const { rerender } = renderHook(
				(props: IdentityProps) =>
					useGameIdentityReset({ ...props, onReset, invalidate }),
				{ initialProps: initial }
			);
			rerender({
				isAuthenticated: false,
				userId: undefined,
				enabled: false,
			});
			expect(invalidate).not.toHaveBeenCalled();
			expect(onReset).not.toHaveBeenCalled();
		});

		test('disabled policy skips invalidate and onReset on account switch', () => {
			const onReset = mock(() => {});
			const invalidate = mock(() => {});
			const initial: IdentityProps = {
				isAuthenticated: true,
				userId: 'a',
				enabled: false,
			};
			const { rerender } = renderHook(
				(props: IdentityProps) =>
					useGameIdentityReset({ ...props, onReset, invalidate }),
				{ initialProps: initial }
			);
			rerender({ isAuthenticated: true, userId: 'b', enabled: false });
			expect(invalidate).not.toHaveBeenCalled();
			expect(onReset).not.toHaveBeenCalled();
		});

		test('disabled policy still updates previous refs so re-enabling does not replay', () => {
			const onReset = mock(() => {});
			const invalidate = mock(() => {});
			const initial: IdentityProps = {
				isAuthenticated: true,
				userId: 'a',
				enabled: false,
			};
			const { rerender } = renderHook(
				(props: IdentityProps) =>
					useGameIdentityReset({ ...props, onReset, invalidate }),
				{ initialProps: initial }
			);
			rerender({
				isAuthenticated: true,
				userId: 'b',
				enabled: false,
			});
			expect(onReset).not.toHaveBeenCalled();
			rerender({ isAuthenticated: true, userId: 'b', enabled: true });
			expect(onReset).not.toHaveBeenCalled();
			expect(invalidate).not.toHaveBeenCalled();
		});

		test('re-enabling after a userId change while disabled triggers reset on the next change', () => {
			const onReset = mock(() => {});
			const invalidate = mock(() => {});
			const initial: IdentityProps = {
				isAuthenticated: true,
				userId: 'a',
				enabled: false,
			};
			const { rerender } = renderHook(
				(props: IdentityProps) =>
					useGameIdentityReset({ ...props, onReset, invalidate }),
				{ initialProps: initial }
			);
			// userId changes while disabled — refs update but no reset fires.
			rerender({
				isAuthenticated: true,
				userId: 'b',
				enabled: false,
			});
			expect(onReset).not.toHaveBeenCalled();
			// Re-enable with a new userId — the transition from 'b' to 'c'
			// is a real identity change, so reset must fire.
			rerender({ isAuthenticated: true, userId: 'c', enabled: true });
			expect(onReset).toHaveBeenCalledTimes(1);
			expect(invalidate).toHaveBeenCalledTimes(1);
		});
	});
});
