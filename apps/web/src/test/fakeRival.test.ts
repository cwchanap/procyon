import { afterEach, describe, expect, test } from 'bun:test';
import { setupReactDom } from './reactSetup';
import { installRivalTestEnv } from './fakeRival';

setupReactDom();

const authGlobals = window as unknown as Record<string, unknown>;
const initialAuthUserKey = '__PROCYON_INITIAL_AUTH_USER__';

afterEach(() => {
	delete authGlobals[initialAuthUserKey];
});

describe('installRivalTestEnv', () => {
	test('removes the seeded auth global when it was previously absent', () => {
		delete authGlobals[initialAuthUserKey];
		const env = installRivalTestEnv();

		expect(authGlobals[initialAuthUserKey]).toBeTruthy();
		env.restore();

		expect(initialAuthUserKey in authGlobals).toBe(false);
	});

	test('restores a pre-existing auth global value', () => {
		const originalUser = { username: 'existing-user' };
		authGlobals[initialAuthUserKey] = originalUser;
		const env = installRivalTestEnv({
			user: { username: 'temporary-user' },
		});

		expect(authGlobals[initialAuthUserKey]).not.toBe(originalUser);
		env.restore();

		expect(authGlobals[initialAuthUserKey]).toBe(originalUser);
	});
});
