import { describe, test, expect } from 'bun:test';
import {
	mapSupabaseUser,
	resolveApiBaseUrl,
	parseLoginBodyText,
	parseRegisterBodyText,
} from './auth-helpers';

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

	test('strips trailing slash from localhost URL', () => {
		expect(resolveApiBaseUrl('http://localhost:3501/')).toBe(
			'http://localhost:3501'
		);
	});
});

describe('mapSupabaseUser', () => {
	test('returns null when user is null', () => {
		expect(mapSupabaseUser(null)).toBeNull();
	});

	test('maps basic user fields correctly', () => {
		const user = {
			id: 'user-123',
			email: 'test@example.com',
			created_at: '2026-01-01T00:00:00Z',
		};
		const result = mapSupabaseUser(user);
		expect(result).not.toBeNull();
		expect(result!.id).toBe('user-123');
		expect(result!.email).toBe('test@example.com');
		expect(result!.createdAt).toBe('2026-01-01T00:00:00Z');
	});

	test('uses username from user_metadata when available', () => {
		const user = {
			id: 'user-123',
			email: 'test@example.com',
			created_at: '2026-01-01T00:00:00Z',
			user_metadata: { username: 'coolplayer' },
		};
		expect(mapSupabaseUser(user)!.username).toBe('coolplayer');
	});

	test('falls back to email prefix when no username in metadata', () => {
		const user = {
			id: 'user-123',
			email: 'john.doe@example.com',
			created_at: '2026-01-01T00:00:00Z',
			user_metadata: {},
		};
		expect(mapSupabaseUser(user)!.username).toBe('john.doe');
	});

	test('falls back to Player when no username and no email', () => {
		const user = {
			id: 'user-123',
			email: undefined,
			created_at: '2026-01-01T00:00:00Z',
		};
		expect(mapSupabaseUser(user)!.username).toBe('Player');
	});

	test('falls back to email prefix when username in metadata is empty string', () => {
		const user = {
			id: 'user-123',
			email: 'alice@example.com',
			created_at: '2026-01-01T00:00:00Z',
			user_metadata: { username: '' },
		};
		expect(mapSupabaseUser(user)!.username).toBe('alice');
	});

	test('falls back to email prefix when username in metadata is whitespace only', () => {
		const user = {
			id: 'user-123',
			email: 'bob@example.com',
			created_at: '2026-01-01T00:00:00Z',
			user_metadata: { username: '   ' },
		};
		expect(mapSupabaseUser(user)!.username).toBe('bob');
	});

	test('falls back to Player when username and email are both missing', () => {
		const user = {
			id: 'user-123',
			email: undefined,
			created_at: '2026-01-01T00:00:00Z',
			user_metadata: { username: '' },
		};
		expect(mapSupabaseUser(user)!.username).toBe('Player');
	});

	test('email field is empty string when user has no email', () => {
		const user = {
			id: 'user-123',
			email: undefined,
			created_at: '2026-01-01T00:00:00Z',
		};
		expect(mapSupabaseUser(user)!.email).toBe('');
	});

	test('ignores non-string username (number) in metadata', () => {
		const user = {
			id: 'user-123',
			email: 'test@example.com',
			created_at: '2026-01-01T00:00:00Z',
			user_metadata: { username: 42 as unknown as string },
		};
		expect(mapSupabaseUser(user)!.username).toBe('test');
	});

	test('ignores null username in metadata', () => {
		const user = {
			id: 'user-123',
			email: 'test@example.com',
			created_at: '2026-01-01T00:00:00Z',
			user_metadata: { username: null as unknown as string },
		};
		expect(mapSupabaseUser(user)!.username).toBe('test');
	});

	test('ignores array username in metadata', () => {
		const user = {
			id: 'user-123',
			email: 'test@example.com',
			created_at: '2026-01-01T00:00:00Z',
			user_metadata: { username: ['x'] as unknown as string },
		};
		expect(mapSupabaseUser(user)!.username).toBe('test');
	});
});

describe('parseLoginBodyText', () => {
	test('returns success for 200 status', () => {
		expect(parseLoginBodyText(200, '{}')).toEqual({ success: true });
	});

	test('returns rate limit error for 429 status', () => {
		const result = parseLoginBodyText(
			429,
			JSON.stringify({ error: 'Too many requests', retryAfterMs: 60000 })
		);
		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.error).toBe('Too many requests');
			expect(result.retryAfterMs).toBe(60000);
		}
	});

	test('returns raw body text as error for 429 with non-JSON body', () => {
		const result = parseLoginBodyText(429, 'Rate limited');
		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.error).toBe('Rate limited');
		}
	});

	test('returns default rate limit message when body is empty for 429', () => {
		const result = parseLoginBodyText(429, '');
		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.error).toBe(
				'Too many attempts. Please wait before retrying.'
			);
		}
	});

	test('returns error from JSON body for non-200 status', () => {
		const result = parseLoginBodyText(
			401,
			JSON.stringify({ error: 'Invalid credentials' })
		);
		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.error).toBe('Invalid credentials');
		}
	});

	test('returns message from JSON body when error field missing', () => {
		const result = parseLoginBodyText(
			400,
			JSON.stringify({ message: 'Bad request' })
		);
		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.error).toBe('Bad request');
		}
	});

	test('returns raw body when JSON parsing fails for non-200', () => {
		const result = parseLoginBodyText(500, 'Internal Server Error');
		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.error).toBe('Internal Server Error');
		}
	});

	test('returns Login failed fallback when body is empty for non-200', () => {
		const result = parseLoginBodyText(500, '');
		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.error).toBe('Login failed');
		}
	});

	test('retryAfterMs is undefined when not provided in 429 response', () => {
		const result = parseLoginBodyText(
			429,
			JSON.stringify({ error: 'Rate limited' })
		);
		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.retryAfterMs).toBeUndefined();
		}
	});

	test('omits retryAfterMs when value is a non-numeric string', () => {
		const result = parseLoginBodyText(
			429,
			JSON.stringify({ error: 'Rate limited', retryAfterMs: 'soon' })
		);
		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.retryAfterMs).toBeUndefined();
		}
	});

	test('omits retryAfterMs when value is negative', () => {
		const result = parseLoginBodyText(
			429,
			JSON.stringify({ error: 'Rate limited', retryAfterMs: -1 })
		);
		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.retryAfterMs).toBeUndefined();
		}
	});

	test('omits retryAfterMs when value is null (e.g. Infinity serialized via JSON)', () => {
		const result = parseLoginBodyText(
			429,
			JSON.stringify({ error: 'Rate limited', retryAfterMs: null })
		);
		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.retryAfterMs).toBeUndefined();
		}
	});

	test('omits retryAfterMs when raw body has Infinity (invalid JSON)', () => {
		const result = parseLoginBodyText(429, '{"retryAfterMs": Infinity}');
		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.retryAfterMs).toBeUndefined();
		}
	});
});

describe('parseRegisterBodyText', () => {
	test('returns success for 200 status', () => {
		expect(parseRegisterBodyText(200, '{}')).toEqual({ success: true });
	});

	test('returns error from JSON body on failure', () => {
		const result = parseRegisterBodyText(
			409,
			JSON.stringify({ error: 'Username already taken' })
		);
		expect(result.success).toBe(false);
		expect(result.error).toBe('Username already taken');
	});

	test('returns message from JSON body when error field missing', () => {
		const result = parseRegisterBodyText(
			400,
			JSON.stringify({ message: 'Invalid email format' })
		);
		expect(result.success).toBe(false);
		expect(result.error).toBe('Invalid email format');
	});

	test('returns raw body when JSON parsing fails', () => {
		const result = parseRegisterBodyText(500, 'Server exploded');
		expect(result.success).toBe(false);
		expect(result.error).toBe('Server exploded');
	});

	test('returns Registration failed fallback when body is empty', () => {
		const result = parseRegisterBodyText(422, '');
		expect(result.success).toBe(false);
		expect(result.error).toBe('Registration failed');
	});
});
