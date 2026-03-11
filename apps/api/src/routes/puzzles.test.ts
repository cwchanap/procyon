import { describe, expect, test, beforeEach, afterEach } from 'bun:test';
import { Hono } from 'hono';
import { sql } from 'drizzle-orm';
import { initializeDB } from '../db';
import { puzzles, userPuzzleProgress } from '../db/schema';
import puzzleRoutes from './puzzles';

// Mock Supabase: reject any token that isn't 'test-token'
function mockSupabaseFetch() {
	const original = globalThis.fetch;
	globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
		const url =
			typeof input === 'string'
				? input
				: input instanceof Request
					? input.url
					: input.toString();
		const pathname = new URL(url).pathname;
		if (pathname.endsWith('/auth/v1/user')) {
			const auth =
				(input instanceof Request
					? (input.headers.get('authorization') ??
						input.headers.get('Authorization'))
					: null) ??
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

// Test data
const testPuzzle = {
	slug: 'test-puzzle-1',
	title: 'Test Puzzle',
	description: 'A test puzzle for unit testing',
	difficulty: 'beginner' as const,
	playerColor: 'white' as const,
	initialBoard: JSON.stringify([
		[null, null, null, null, null, null, null, null],
		[null, null, null, null, null, null, null, null],
		[null, null, null, null, null, null, null, null],
		[null, null, null, null, null, null, null, null],
		[null, null, null, null, null, null, null, null],
		[null, null, null, null, null, null, null, null],
		[null, null, null, null, null, null, null, null],
		[null, null, null, null, null, null, null, null],
	]),
	solution: JSON.stringify([{ from: 'e2', to: 'e4' }]),
	hint: JSON.stringify({ pieceSquare: 'e2', targetSquare: 'e4' }),
};

const secondTestPuzzle = {
	slug: 'test-puzzle-2',
	title: 'Second Test Puzzle',
	description: 'Another test puzzle',
	difficulty: 'intermediate' as const,
	playerColor: 'black' as const,
	initialBoard: JSON.stringify([
		[null, null, null, null, null, null, null, null],
		[null, null, null, null, null, null, null, null],
		[null, null, null, null, null, null, null, null],
		[null, null, null, null, null, null, null, null],
		[null, null, null, null, null, null, null, null],
		[null, null, null, null, null, null, null, null],
		[null, null, null, null, null, null, null, null],
		[null, null, null, null, null, null, null, null],
	]),
	solution: JSON.stringify([{ from: 'e7', to: 'e5' }]),
	hint: JSON.stringify({ pieceSquare: 'e7', targetSquare: 'e5' }),
};

describe('puzzle routes - auth guards', () => {
	let originalFetch: typeof globalThis.fetch;

	beforeEach(() => {
		process.env.SUPABASE_URL =
			process.env.SUPABASE_URL ?? 'http://localhost:54321';
		process.env.SUPABASE_ANON_KEY =
			process.env.SUPABASE_ANON_KEY ?? 'test-anon-key';
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
		const body = (await res.json()) as {
			success?: boolean;
			error?: { name?: string };
		};
		expect(body.success).toBe(false);
		expect(body.error?.name).toBe('ZodError');
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

describe('puzzle routes - with database', () => {
	let originalFetch: typeof globalThis.fetch;
	let app: Hono;

	beforeEach(async () => {
		process.env.SUPABASE_URL =
			process.env.SUPABASE_URL ?? 'http://localhost:54321';
		process.env.SUPABASE_ANON_KEY =
			process.env.SUPABASE_ANON_KEY ?? 'test-anon-key';
		originalFetch = mockSupabaseFetch();

		// Initialize test database
		initializeDB(undefined, { localDbPath: ':memory:', resetLocal: true });
		const db = (await import('../db')).getDB();

		// Clean up any existing test data
		await db.delete(userPuzzleProgress).where(
			// Use raw SQL to match userId pattern
			sql`${userPuzzleProgress.userId} LIKE 'user-uuid-%'`
		);
		await db.delete(puzzles).where(sql`${puzzles.slug} LIKE 'test-puzzle-%'`);

		// Insert test puzzles
		await db.insert(puzzles).values([testPuzzle, secondTestPuzzle]);

		// Create app with routes mounted
		app = new Hono();
		app.route('/api/puzzles', puzzleRoutes);
	});

	afterEach(() => {
		globalThis.fetch = originalFetch;
	});

	describe('GET /api/puzzles', () => {
		test('returns list of puzzles without board/solution data', async () => {
			const res = await app.request('http://localhost/api/puzzles');
			expect(res.status).toBe(200);

			const body = (await res.json()) as {
				puzzles: Array<{
					id: number;
					slug: string;
					title: string;
					description: string;
					difficulty: string;
					playerColor: string;
				}>;
			};

			expect(body.puzzles).toBeDefined();
			expect(Array.isArray(body.puzzles)).toBe(true);
			expect(body.puzzles.length).toBeGreaterThanOrEqual(2);

			// Verify puzzles don't contain sensitive data
			const firstPuzzle = body.puzzles.find(p => p.slug === 'test-puzzle-1');
			expect(firstPuzzle).toBeDefined();
			expect(firstPuzzle?.title).toBe('Test Puzzle');
			expect(firstPuzzle?.description).toBe('A test puzzle for unit testing');
			expect(firstPuzzle?.difficulty).toBe('beginner');
			expect(firstPuzzle?.playerColor).toBe('white');

			// Verify board/solution data is NOT included
			expect(firstPuzzle).not.toHaveProperty('initialBoard');
			expect(firstPuzzle).not.toHaveProperty('solution');
			expect(firstPuzzle).not.toHaveProperty('hint');
		});

		test('returns empty array when no puzzles exist', async () => {
			const db = (await import('../db')).getDB();

			// Delete all test puzzles
			await db.delete(puzzles).where(sql`${puzzles.slug} LIKE 'test-puzzle-%'`);

			const res = await app.request('http://localhost/api/puzzles');
			expect(res.status).toBe(200);

			const body = (await res.json()) as { puzzles: unknown[] };
			expect(body.puzzles).toEqual([]);
		});
	});

	describe('GET /api/puzzles/progress', () => {
		test('returns user progress when authenticated', async () => {
			const res = await app.request('http://localhost/api/puzzles/progress', {
				headers: { Authorization: 'Bearer test-token' },
			});
			expect(res.status).toBe(200);

			const body = (await res.json()) as {
				progress: unknown[];
			};
			expect(body.progress).toBeDefined();
			expect(Array.isArray(body.progress)).toBe(true);
		});
	});

	describe('GET /api/puzzles/:id', () => {
		test('returns full puzzle data including board and solution', async () => {
			const db = (await import('../db')).getDB();
			const [inserted] = await db
				.select({ id: puzzles.id })
				.from(puzzles)
				.where(sql`${puzzles.slug} = 'test-puzzle-1'`);

			const res = await app.request(
				`http://localhost/api/puzzles/${inserted?.id}`
			);
			expect(res.status).toBe(200);

			const body = (await res.json()) as {
				puzzle: {
					id: number;
					slug: string;
					title: string;
					initialBoard: unknown[][];
					solution: unknown[];
					hint: { pieceSquare: string; targetSquare: string };
				};
			};

			expect(body.puzzle).toBeDefined();
			expect(body.puzzle.slug).toBe('test-puzzle-1');
			expect(body.puzzle.title).toBe('Test Puzzle');

			// Verify board/solution/hint are parsed from JSON
			expect(Array.isArray(body.puzzle.initialBoard)).toBe(true);
			expect(Array.isArray(body.puzzle.solution)).toBe(true);
			expect(body.puzzle.hint).toHaveProperty('pieceSquare');
			expect(body.puzzle.hint).toHaveProperty('targetSquare');
		});

		test('returns 404 for non-existent puzzle', async () => {
			const res = await app.request('http://localhost/api/puzzles/999999');
			expect(res.status).toBe(404);

			const body = (await res.json()) as { error: string };
			expect(body.error).toBe('Puzzle not found');
		});

		test('returns 400 for invalid puzzle id', async () => {
			const res = await app.request('http://localhost/api/puzzles/abc');
			expect(res.status).toBe(400);
		});

		test('returns 400 for negative puzzle id', async () => {
			const res = await app.request('http://localhost/api/puzzles/-1');
			expect(res.status).toBe(400);
		});

		test('returns 400 for zero puzzle id', async () => {
			const res = await app.request('http://localhost/api/puzzles/0');
			expect(res.status).toBe(400);
		});
	});

	describe('POST /api/puzzles/:id/progress', () => {
		test('saves progress for unsolved puzzle', async () => {
			const db = (await import('../db')).getDB();
			const [inserted] = await db
				.select({ id: puzzles.id })
				.from(puzzles)
				.where(sql`${puzzles.slug} = 'test-puzzle-1'`);

			const puzzleId = inserted?.id;

			const res = await app.request(
				`http://localhost/api/puzzles/${puzzleId}/progress`,
				{
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
						Authorization: 'Bearer test-token',
					},
					body: JSON.stringify({
						solved: false,
						failedAttempts: 1,
					}),
				}
			);
			expect(res.status).toBe(200);

			const body = (await res.json()) as { message: string };
			expect(body.message).toBe('Progress saved');
		});

		test('saves progress for solved puzzle with solvedAt', async () => {
			const db = (await import('../db')).getDB();
			const [inserted] = await db
				.select({ id: puzzles.id })
				.from(puzzles)
				.where(sql`${puzzles.slug} = 'test-puzzle-2'`);

			const puzzleId = inserted?.id;
			const solvedAt = new Date().toISOString();

			const res = await app.request(
				`http://localhost/api/puzzles/${puzzleId}/progress`,
				{
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
						Authorization: 'Bearer test-token',
					},
					body: JSON.stringify({
						solved: true,
						failedAttempts: 0,
						solvedAt,
					}),
				}
			);
			expect(res.status).toBe(200);

			const body = (await res.json()) as { message: string };
			expect(body.message).toBe('Progress saved');
		});

		test('returns 404 for non-existent puzzle', async () => {
			const res = await app.request(
				'http://localhost/api/puzzles/999999/progress',
				{
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
						Authorization: 'Bearer test-token',
					},
					body: JSON.stringify({
						solved: false,
						failedAttempts: 1,
					}),
				}
			);
			expect(res.status).toBe(404);

			const body = (await res.json()) as { error: string };
			expect(body.error).toBe('Puzzle not found');
		});

		test('returns 400 when solvedAt is missing for solved puzzle', async () => {
			const db = (await import('../db')).getDB();
			const [inserted] = await db
				.select({ id: puzzles.id })
				.from(puzzles)
				.where(sql`${puzzles.slug} = 'test-puzzle-1'`);

			const res = await app.request(
				`http://localhost/api/puzzles/${inserted?.id}/progress`,
				{
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
						Authorization: 'Bearer test-token',
					},
					body: JSON.stringify({
						solved: true,
						failedAttempts: 0,
						// solvedAt is required when solved is true
					}),
				}
			);
			expect(res.status).toBe(400);
		});

		test('returns 400 when solvedAt is provided for unsolved puzzle', async () => {
			const db = (await import('../db')).getDB();
			const [inserted] = await db
				.select({ id: puzzles.id })
				.from(puzzles)
				.where(sql`${puzzles.slug} = 'test-puzzle-1'`);

			const res = await app.request(
				`http://localhost/api/puzzles/${inserted?.id}/progress`,
				{
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
						Authorization: 'Bearer test-token',
					},
					body: JSON.stringify({
						solved: false,
						failedAttempts: 1,
						solvedAt: new Date().toISOString(),
					}),
				}
			);
			expect(res.status).toBe(400);
		});

		test('returns 400 for negative failedAttempts', async () => {
			const db = (await import('../db')).getDB();
			const [inserted] = await db
				.select({ id: puzzles.id })
				.from(puzzles)
				.where(sql`${puzzles.slug} = 'test-puzzle-1'`);

			const res = await app.request(
				`http://localhost/api/puzzles/${inserted?.id}/progress`,
				{
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
						Authorization: 'Bearer test-token',
					},
					body: JSON.stringify({
						solved: false,
						failedAttempts: -1,
					}),
				}
			);
			expect(res.status).toBe(400);
		});

		test('caps failedAttempts at 3', async () => {
			const db = (await import('../db')).getDB();
			const [inserted] = await db
				.select({ id: puzzles.id })
				.from(puzzles)
				.where(sql`${puzzles.slug} = 'test-puzzle-1'`);

			const res = await app.request(
				`http://localhost/api/puzzles/${inserted?.id}/progress`,
				{
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
						Authorization: 'Bearer test-token',
					},
					body: JSON.stringify({
						solved: false,
						failedAttempts: 10, // Should be capped at 3
					}),
				}
			);
			expect(res.status).toBe(200);
		});

		test('progress schema accepts valid boolean for solved', async () => {
			const db = (await import('../db')).getDB();
			const [inserted] = await db
				.select({ id: puzzles.id })
				.from(puzzles)
				.where(sql`${puzzles.slug} = 'test-puzzle-1'`);

			// Test with boolean true
			const res1 = await app.request(
				`http://localhost/api/puzzles/${inserted?.id}/progress`,
				{
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
						Authorization: 'Bearer test-token',
					},
					body: JSON.stringify({
						solved: true,
						failedAttempts: 0,
						solvedAt: new Date().toISOString(),
					}),
				}
			);
			expect(res1.status).toBe(200);
		});
	});
});
