import { describe, test, expect } from 'bun:test';
import { resolveApiBaseUrl, parseGoogleLoginBody } from './auth-helpers';

describe('resolveApiBaseUrl', () => {
	test('returns /api when no URL is configured', () => {
		expect(resolveApiBaseUrl(undefined)).toBe('/api');
	});

	test('returns /api when URL is empty string', () => {
		expect(resolveApiBaseUrl('')).toBe('/api');
	});

	test('strips trailing slash from configured URL', () => {
		expect(resolveApiBaseUrl('https://api.example.com/')).toBe(
			'https://api.example.com'
		);
	});

	test('preserves URL without trailing slash', () => {
		expect(resolveApiBaseUrl('https://api.example.com')).toBe(
			'https://api.example.com'
		);
	});

	test('returns /api when URL is just a slash', () => {
		expect(resolveApiBaseUrl('/')).toBe('/api');
	});

	test('preserves full API path', () => {
		expect(resolveApiBaseUrl('http://localhost:3501/api')).toBe(
			'http://localhost:3501/api'
		);
	});
});

describe('parseGoogleLoginBody', () => {
	test('returns success when 200 with access_token and user', () => {
		const body = JSON.stringify({
			access_token: 'tok',
			user: {
				id: 'u1',
				email: 'a@example.com',
				username: 'alice',
			},
		});
		const result = parseGoogleLoginBody(200, body);
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.accessToken).toBe('tok');
			expect(result.user.username).toBe('alice');
		}
	});

	test('returns failure for non-2xx status with JSON error', () => {
		const result = parseGoogleLoginBody(
			401,
			JSON.stringify({ error: 'Invalid Google token' })
		);
		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.error).toBe('Invalid Google token');
		}
	});

	test('returns raw body when non-2xx body is not JSON', () => {
		const result = parseGoogleLoginBody(500, 'Boom');
		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.error).toBe('Boom');
		}
	});

	test('returns default error when non-2xx body is empty', () => {
		const result = parseGoogleLoginBody(403, '');
		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.error).toBe('Sign-in failed');
		}
	});

	test('returns failure when 200 body is missing access_token', () => {
		const result = parseGoogleLoginBody(
			200,
			JSON.stringify({ user: { id: 'u1', email: 'a@x', username: 'a' } })
		);
		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.error).toBe('Unexpected response from server.');
		}
	});

	test('returns failure when 200 body is unparseable JSON', () => {
		const result = parseGoogleLoginBody(200, '<<not-json>>');
		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.error).toBe('Unexpected response from server.');
		}
	});
});
