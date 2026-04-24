import { describe, test, expect } from 'bun:test';

// ─── resolveApiBaseUrl logic ───────────────────────────────────────────────────
// Mirrors the resolveApiBaseUrl() function in auth.ts

function resolveApiBaseUrl(publicApiUrl: string | undefined): string {
	const base = publicApiUrl || '/api';
	return base.replace(/\/$/, '') || '/api';
}

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
		// '/' -> strip trailing slash -> '' -> fallback to '/api'
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

// ─── mapSupabaseUser logic ────────────────────────────────────────────────────
// Mirrors the mapSupabaseUser() function in auth.ts

interface MockSupabaseUser {
	id: string;
	email?: string;
	created_at: string;
	user_metadata?: Record<string, unknown>;
}

function mapSupabaseUser(user: MockSupabaseUser | null): {
	id: string;
	email: string;
	username: string;
	createdAt: string;
} | null {
	if (!user) return null;

	const metadata = user.user_metadata as
		| ({ username?: string } & Record<string, unknown>)
		| null;
	const rawUsername =
		metadata && typeof metadata.username === 'string'
			? metadata.username
			: undefined;
	const username =
		rawUsername && rawUsername.trim().length > 0
			? rawUsername
			: user.email?.split('@')[0] || 'Player';

	return {
		id: user.id,
		email: user.email ?? '',
		username,
		createdAt: user.created_at,
	};
}

describe('mapSupabaseUser', () => {
	test('returns null when user is null', () => {
		expect(mapSupabaseUser(null)).toBeNull();
	});

	test('maps basic user fields correctly', () => {
		const user: MockSupabaseUser = {
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
		const user: MockSupabaseUser = {
			id: 'user-123',
			email: 'test@example.com',
			created_at: '2026-01-01T00:00:00Z',
			user_metadata: { username: 'coolplayer' },
		};
		const result = mapSupabaseUser(user);
		expect(result!.username).toBe('coolplayer');
	});

	test('falls back to email prefix when no username in metadata', () => {
		const user: MockSupabaseUser = {
			id: 'user-123',
			email: 'john.doe@example.com',
			created_at: '2026-01-01T00:00:00Z',
			user_metadata: {},
		};
		const result = mapSupabaseUser(user);
		expect(result!.username).toBe('john.doe');
	});

	test('falls back to Player when no username and no email', () => {
		const user: MockSupabaseUser = {
			id: 'user-123',
			email: undefined,
			created_at: '2026-01-01T00:00:00Z',
		};
		const result = mapSupabaseUser(user);
		expect(result!.username).toBe('Player');
	});

	test('falls back to email prefix when username in metadata is empty string', () => {
		const user: MockSupabaseUser = {
			id: 'user-123',
			email: 'alice@example.com',
			created_at: '2026-01-01T00:00:00Z',
			user_metadata: { username: '' },
		};
		const result = mapSupabaseUser(user);
		expect(result!.username).toBe('alice');
	});

	test('falls back to email prefix when username in metadata is whitespace only', () => {
		const user: MockSupabaseUser = {
			id: 'user-123',
			email: 'bob@example.com',
			created_at: '2026-01-01T00:00:00Z',
			user_metadata: { username: '   ' },
		};
		const result = mapSupabaseUser(user);
		expect(result!.username).toBe('bob');
	});

	test('falls back to Player when username and email are both missing', () => {
		const user: MockSupabaseUser = {
			id: 'user-123',
			email: undefined,
			created_at: '2026-01-01T00:00:00Z',
			user_metadata: { username: '' },
		};
		const result = mapSupabaseUser(user);
		expect(result!.username).toBe('Player');
	});

	test('email field is empty string when user has no email', () => {
		const user: MockSupabaseUser = {
			id: 'user-123',
			email: undefined,
			created_at: '2026-01-01T00:00:00Z',
		};
		const result = mapSupabaseUser(user);
		expect(result!.email).toBe('');
	});

	test('ignores non-string username in metadata', () => {
		const user: MockSupabaseUser = {
			id: 'user-123',
			email: 'test@example.com',
			created_at: '2026-01-01T00:00:00Z',
			user_metadata: { username: 42 as unknown as string },
		};
		const result = mapSupabaseUser(user);
		// Should fall back to email prefix
		expect(result!.username).toBe('test');
	});
});

// ─── apiLogin error handling patterns ─────────────────────────────────────────
// Tests the error response parsing logic used in apiLogin()

type LoginResult =
	| { success: true }
	| { success: false; error: string; retryAfterMs?: number };

function parseLoginErrorResponse(
	status: number,
	bodyText: string
): LoginResult {
	if (status === 429) {
		let data: { error?: string; retryAfterMs?: number } = {};
		try {
			data = JSON.parse(bodyText) as typeof data;
		} catch {
			// ignore parse errors
		}
		return {
			success: false,
			error:
				data.error ||
				bodyText ||
				'Too many attempts. Please wait before retrying.',
			retryAfterMs: data.retryAfterMs,
		};
	}

	if (status < 200 || status >= 300) {
		let data: { error?: string; message?: string } = {};
		try {
			data = JSON.parse(bodyText) as typeof data;
		} catch {
			// ignore parse errors
		}
		return {
			success: false,
			error: data.error || data.message || bodyText || 'Login failed',
		};
	}

	return { success: true };
}

describe('parseLoginErrorResponse', () => {
	test('returns success for 200 status', () => {
		const result = parseLoginErrorResponse(200, '{}');
		expect(result.success).toBe(true);
	});

	test('returns rate limit error for 429 status', () => {
		const result = parseLoginErrorResponse(
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
		const result = parseLoginErrorResponse(429, 'Rate limited');
		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.error).toBe('Rate limited');
		}
	});

	test('returns default rate limit message when body is empty for 429', () => {
		const result = parseLoginErrorResponse(429, '');
		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.error).toBe(
				'Too many attempts. Please wait before retrying.'
			);
		}
	});

	test('returns error from JSON body for non-200 status', () => {
		const result = parseLoginErrorResponse(
			401,
			JSON.stringify({ error: 'Invalid credentials' })
		);
		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.error).toBe('Invalid credentials');
		}
	});

	test('returns message from JSON body when error field missing', () => {
		const result = parseLoginErrorResponse(
			400,
			JSON.stringify({ message: 'Bad request' })
		);
		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.error).toBe('Bad request');
		}
	});

	test('returns raw body when JSON parsing fails for non-200', () => {
		const result = parseLoginErrorResponse(500, 'Internal Server Error');
		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.error).toBe('Internal Server Error');
		}
	});

	test('returns Login failed fallback when body is empty for non-200', () => {
		const result = parseLoginErrorResponse(500, '');
		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.error).toBe('Login failed');
		}
	});

	test('retryAfterMs is undefined when not provided in 429 response', () => {
		const result = parseLoginErrorResponse(
			429,
			JSON.stringify({ error: 'Rate limited' })
		);
		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.retryAfterMs).toBeUndefined();
		}
	});
});

// ─── apiRegister error handling patterns ─────────────────────────────────────

type RegisterResult = { success: boolean; error?: string };

function parseRegisterErrorResponse(
	status: number,
	bodyText: string
): RegisterResult {
	if (status < 200 || status >= 300) {
		let data: { error?: string; message?: string } = {};
		try {
			data = JSON.parse(bodyText) as typeof data;
		} catch {
			// ignore parse errors
		}
		return {
			success: false,
			error: data.error || data.message || bodyText || 'Registration failed',
		};
	}
	return { success: true };
}

describe('parseRegisterErrorResponse', () => {
	test('returns success for 200 status', () => {
		expect(parseRegisterErrorResponse(200, '{}')).toEqual({ success: true });
	});

	test('returns error from JSON body on failure', () => {
		const result = parseRegisterErrorResponse(
			409,
			JSON.stringify({ error: 'Username already taken' })
		);
		expect(result.success).toBe(false);
		expect(result.error).toBe('Username already taken');
	});

	test('returns message from JSON body when error field missing', () => {
		const result = parseRegisterErrorResponse(
			400,
			JSON.stringify({ message: 'Invalid email format' })
		);
		expect(result.success).toBe(false);
		expect(result.error).toBe('Invalid email format');
	});

	test('returns raw body when JSON parsing fails', () => {
		const result = parseRegisterErrorResponse(500, 'Server exploded');
		expect(result.success).toBe(false);
		expect(result.error).toBe('Server exploded');
	});

	test('returns Registration failed fallback when body is empty', () => {
		const result = parseRegisterErrorResponse(422, '');
		expect(result.success).toBe(false);
		expect(result.error).toBe('Registration failed');
	});
});
