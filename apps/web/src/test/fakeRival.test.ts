import { afterEach, describe, expect, test } from 'bun:test';
import { setupReactDom } from './reactSetup';
import { installRivalTestEnv } from './fakeRival';

setupReactDom();

const initialAuthUserKey = '__PROCYON_INITIAL_AUTH_USER__';

function authGlobals(): Record<string, unknown> {
	return window as unknown as Record<string, unknown>;
}

afterEach(() => {
	delete authGlobals()[initialAuthUserKey];
});

describe('installRivalTestEnv', () => {
	test('removes the seeded auth global when it was previously absent', () => {
		const globals = authGlobals();
		delete globals[initialAuthUserKey];
		const env = installRivalTestEnv();

		expect(globals[initialAuthUserKey]).toBeTruthy();
		env.restore();

		expect(initialAuthUserKey in globals).toBe(false);
	});

	test('restores a pre-existing auth global value', () => {
		const globals = authGlobals();
		const originalUser = { username: 'existing-user' };
		globals[initialAuthUserKey] = originalUser;
		const env = installRivalTestEnv({
			user: { username: 'temporary-user' },
		});

		expect(globals[initialAuthUserKey]).not.toBe(originalUser);
		env.restore();

		expect(globals[initialAuthUserKey]).toBe(originalUser);
	});
});
