import { describe, expect, test, beforeEach, afterEach } from 'bun:test';
import puzzleRoutes from './puzzles';
import { initializeDB } from '../db';

// Mock Supabase: reject any token that isn't 'test-token'
function mockSupabaseFetch() {
	const original = globalThis.fetch;
	globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
		const url = typeof input === 'string' ? input : input.toString();
		const pathname = new URL(url).pathname;
		if (pathname.endsWith('/auth/v1/user')) {
			const auth =
				(init?.headers as Record<string, string> | undefined)?.Authorization ??
				(init?.headers as Record<string, string> | undefined)?.authorization;
			if (auth === 'Bearer test-token') {
				return new Response(
					JSON.stringify({ id: 'user-uuid-1', email: 'test@example.com' }),
					{ status: 200, headers: { 'Content-Type': 'application/json' } }
				);
			}
			return new Response(JSON.stringify({ message: 'Unauthorized' }), {
				status: 401,
				headers: { 'Content-Type': 'application/json' },
			});
		}
		return new Response('Not Found', { status: 404 });
	}) as typeof fetch;
	return original;
}

describe('puzzle routes - auth guards', () => {
	let originalFetch: typeof globalThis.fetch;

	beforeEach(() => {
		process.env.SUPABASE_URL =
			process.env.SUPABASE_URL ?? 'http://localhost:54321';
		process.env.SUPABASE_ANON_KEY =
			process.env.SUPABASE_ANON_KEY ?? 'test-anon-key';
		initializeDB();
		originalFetch = mockSupabaseFetch();
	});

	afterEach(() => {
		globalThis.fetch = originalFetch;
	});

	test('GET /progress returns 401 without auth token', async () => {
		const res = await puzzleRoutes.request('http://localhost/progress');
		expect(res.status).toBe(401);
	});

	test('GET /progress returns 401 with invalid token', async () => {
		const res = await puzzleRoutes.request('http://localhost/progress', {
			headers: { Authorization: 'Bearer invalid-token' },
		});
		expect(res.status).toBe(401);
	});

	test('POST /:id/progress returns 401 without auth token', async () => {
		const res = await puzzleRoutes.request('http://localhost/1/progress', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ solved: false, failedAttempts: 1 }),
		});
		expect(res.status).toBe(401);
	});

	test('POST /:id/progress returns 401 with invalid token', async () => {
		const res = await puzzleRoutes.request('http://localhost/1/progress', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Authorization: 'Bearer invalid-token',
			},
			body: JSON.stringify({ solved: false, failedAttempts: 1 }),
		});
		expect(res.status).toBe(401);
	});

	test('POST non-numeric id returns 400 for authenticated user', async () => {
		const res = await puzzleRoutes.request(
			'http://localhost/not-a-number/progress',
			{
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					Authorization: 'Bearer test-token',
				},
				body: JSON.stringify({ solved: false, failedAttempts: 1 }),
			}
		);
		// authMiddleware passes (valid token), then id validation runs
		expect(res.status).toBe(400);
		const body = (await res.json()) as { error?: string };
		expect(body.error).toBe('Invalid puzzle id');
	});
});

const MAX_FAILED_ATTEMPTS = 3;

interface FakePuzzleState {
	phase: string;
	failedAttempts: number;
	showSolution: boolean;
}

function wrongMoveState(prev: FakePuzzleState): FakePuzzleState {
	const newFailed = prev.failedAttempts + 1;
	return {
		...prev,
		failedAttempts: newFailed,
		showSolution: newFailed >= MAX_FAILED_ATTEMPTS,
		phase: newFailed >= MAX_FAILED_ATTEMPTS ? 'failed' : 'playing',
	};
}

describe('wrongMoveState - attempt counter boundary', () => {
	const base: FakePuzzleState = {
		phase: 'playing',
		failedAttempts: 0,
		showSolution: false,
	};

	test('1st wrong move: phase stays playing, showSolution false', () => {
		const next = wrongMoveState(base);
		expect(next.phase).toBe('playing');
		expect(next.failedAttempts).toBe(1);
		expect(next.showSolution).toBe(false);
	});

	test('2nd wrong move: phase stays playing, showSolution false', () => {
		const next = wrongMoveState(wrongMoveState(base));
		expect(next.phase).toBe('playing');
		expect(next.failedAttempts).toBe(2);
		expect(next.showSolution).toBe(false);
	});

	test('3rd wrong move: phase becomes failed, showSolution true', () => {
		const next = wrongMoveState(wrongMoveState(wrongMoveState(base)));
		expect(next.phase).toBe('failed');
		expect(next.failedAttempts).toBe(3);
		expect(next.showSolution).toBe(true);
	});
});
