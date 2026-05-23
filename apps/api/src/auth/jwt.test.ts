import { describe, test, expect, beforeAll } from 'bun:test';
import { signAppJwt, verifyAppJwt } from './jwt';

beforeAll(() => {
	process.env.JWT_SECRET = 'test-jwt-secret-must-be-at-least-32-chars-long';
});

describe('jwt helpers', () => {
	test('signs and verifies a token round-trip', async () => {
		const token = await signAppJwt({
			sub: 'user-1',
			email: 'a@example.com',
			username: 'alice',
		});
		const payload = await verifyAppJwt(token);
		expect(payload.sub).toBe('user-1');
		expect(payload.email).toBe('a@example.com');
		expect(payload.username).toBe('alice');
	});

	test('rejects a malformed token', async () => {
		await expect(verifyAppJwt('not-a-jwt')).rejects.toThrow();
	});

	test('rejects a token signed with the wrong secret', async () => {
		const token = await signAppJwt({
			sub: 'user-2',
			email: 'b@example.com',
			username: 'bob',
		});
		const originalSecret = process.env.JWT_SECRET;
		process.env.JWT_SECRET = 'different-secret-32-chars-aaaaaaaa';
		await expect(verifyAppJwt(token)).rejects.toThrow();
		process.env.JWT_SECRET = originalSecret;
	});
});
