import {
	describe,
	test,
	expect,
	beforeAll,
	beforeEach,
	afterAll,
	mock,
} from 'bun:test';

const CLIENT_ID = 'test-google-client-id.apps.googleusercontent.com';

let nextPayload: Record<string, unknown> | null = null;

// Capture the real `jose` module synchronously before installing the mock so
// the passthrough below can delegate to genuine implementations when no stub
// payload is configured (avoids breaking jwt.test.ts which shares the process).
const realJose: typeof import('jose') = await import('jose');
const realJwtVerify = realJose.jwtVerify;
const realCreateRemoteJWKSet = realJose.createRemoteJWKSet;

// Replace `jose` with a passthrough that swaps in a controllable `jwtVerify`
// and a no-op `createRemoteJWKSet`. All other exports (e.g. SignJWT used by
// jwt.ts) come from the real module so co-resident test files keep working.
mock.module('jose', () => ({
	...realJose,
	createRemoteJWKSet: (...args: Parameters<typeof realCreateRemoteJWKSet>) =>
		nextPayload
			? () => Promise.resolve({} as never)
			: realCreateRemoteJWKSet(...args),
	jwtVerify: ((...args: Parameters<typeof realJwtVerify>) => {
		if (nextPayload) {
			return Promise.resolve({
				payload: nextPayload,
				protectedHeader: { alg: 'RS256' },
			});
		}
		return realJwtVerify(...args);
	}) as typeof realJwtVerify,
}));

const { verifyGoogleIdToken } = await import('./google');

beforeAll(() => {
	process.env.GOOGLE_CLIENT_ID = CLIENT_ID;
});

beforeEach(() => {
	nextPayload = null;
});

afterAll(() => {
	// Ensure no stale stub payload leaks into other test files that share the
	// process and rely on the real `jwtVerify` passthrough.
	nextPayload = null;
});

describe('verifyGoogleIdToken', () => {
	test('returns normalized claims for a valid token', async () => {
		nextPayload = {
			iss: 'https://accounts.google.com',
			aud: CLIENT_ID,
			sub: 'google-user-123',
			email: 'user@example.com',
			email_verified: true,
			name: 'Test User',
			picture: 'https://example.com/avatar.png',
			exp: Math.floor(Date.now() / 1000) + 3600,
		};

		const claims = await verifyGoogleIdToken('fake-token');

		expect(claims.sub).toBe('google-user-123');
		expect(claims.email).toBe('user@example.com');
		expect(claims.emailVerified).toBe(true);
		expect(claims.name).toBe('Test User');
		expect(claims.picture).toBe('https://example.com/avatar.png');
	});

	test('rejects a token whose email is not verified', async () => {
		nextPayload = {
			iss: 'https://accounts.google.com',
			aud: CLIENT_ID,
			sub: 'google-user-456',
			email: 'unverified@example.com',
			email_verified: false,
			exp: Math.floor(Date.now() / 1000) + 3600,
		};

		await expect(verifyGoogleIdToken('fake-token')).rejects.toThrow(/email/i);
	});

	test('rejects a token whose audience does not match the configured client id', async () => {
		nextPayload = {
			iss: 'https://accounts.google.com',
			aud: 'someone-else.apps.googleusercontent.com',
			sub: 'google-user-789',
			email: 'user@example.com',
			email_verified: true,
			exp: Math.floor(Date.now() / 1000) + 3600,
		};

		await expect(verifyGoogleIdToken('fake-token')).rejects.toThrow(
			/audience/i
		);
	});

	test('rejects a token whose issuer is not a Google issuer', async () => {
		nextPayload = {
			iss: 'https://evil.example.com',
			aud: CLIENT_ID,
			sub: 'google-user-000',
			email: 'user@example.com',
			email_verified: true,
			exp: Math.floor(Date.now() / 1000) + 3600,
		};

		await expect(verifyGoogleIdToken('fake-token')).rejects.toThrow(/issuer/i);
	});
});
