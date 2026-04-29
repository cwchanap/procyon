import { describe, expect, test, beforeEach, afterEach } from 'bun:test';
import { sql } from 'drizzle-orm';
import { initializeDB, getDB } from '../db';
import { puzzles } from '../db/schema';
import puzzleRoutes from './puzzles';

const BASE_URL = 'http://localhost';
const AUTH_HEADER = { Authorization: 'Bearer test-token' };
const SUPABASE_URL = 'http://localhost:54321';
const SUPABASE_ANON_KEY = 'test-anon-key';
const CF_ENV = { SUPABASE_URL, SUPABASE_ANON_KEY };

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
	return () => {
		globalThis.fetch = original;
	};
}

describe('puzzle routes - corrupt data error paths', () => {
	let restoreFetch: () => void;

	beforeEach(() => {
		process.env.SUPABASE_URL = SUPABASE_URL;
		process.env.SUPABASE_ANON_KEY = SUPABASE_ANON_KEY;
		initializeDB(undefined, { localDbPath: ':memory:', resetLocal: true });
		restoreFetch = mockSupabaseFetch();
	});

	afterEach(async () => {
		restoreFetch();
		const db = getDB();
		await db.delete(puzzles).where(sql`1=1`);
	});

	test('GET /:id returns 500 when puzzle has corrupt initialBoard JSON', async () => {
		// Insert a puzzle with invalid JSON in initialBoard to trigger the parse error path
		const db = getDB();
		await db.insert(puzzles).values({
			slug: 'corrupt-puzzle',
			title: 'Corrupt Puzzle',
			description: 'Has invalid JSON',
			difficulty: 'beginner',
			playerColor: 'white',
			initialBoard: 'not-valid-json{{',
			solution: JSON.stringify([{ from: 'e2', to: 'e4' }]),
			hint: JSON.stringify({
				pieceSquare: { row: 6, col: 4 },
				targetSquare: { row: 4, col: 4 },
			}),
		});

		const [inserted] = await db.select({ id: puzzles.id }).from(puzzles);
		const res = await puzzleRoutes.request(
			`${BASE_URL}/${inserted!.id}`,
			{},
			CF_ENV
		);
		expect(res.status).toBe(500);
		const body = (await res.json()) as { error: string };
		expect(body.error).toContain('Failed to fetch puzzle');
	});

	test('GET / returns puzzle list successfully (public endpoint)', async () => {
		const db = getDB();
		await db.insert(puzzles).values({
			slug: 'list-puzzle',
			title: 'List Puzzle',
			description: 'For listing',
			difficulty: 'intermediate',
			playerColor: 'black',
			initialBoard: JSON.stringify([]),
			solution: JSON.stringify([]),
			hint: JSON.stringify({}),
		});

		const res = await puzzleRoutes.request(`${BASE_URL}/`, {}, CF_ENV);
		expect(res.status).toBe(200);
		const body = (await res.json()) as { puzzles: unknown[] };
		expect(body.puzzles.length).toBeGreaterThan(0);
	});

	test('GET /progress returns empty array when user has no progress', async () => {
		const res = await puzzleRoutes.request(
			`${BASE_URL}/progress`,
			{ headers: AUTH_HEADER },
			CF_ENV
		);
		expect(res.status).toBe(200);
		const body = (await res.json()) as { progress: unknown[] };
		expect(Array.isArray(body.progress)).toBe(true);
	});
});
