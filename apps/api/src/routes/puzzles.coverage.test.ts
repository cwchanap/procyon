import {
	describe,
	expect,
	test,
	beforeAll,
	beforeEach,
	afterEach,
} from 'bun:test';
import { sql } from 'drizzle-orm';
import { initializeDB, getDB } from '../db';
import { puzzles } from '../db/schema';
import { signAppJwt } from '../auth/jwt';
import puzzleRoutes from './puzzles';

const BASE_URL = 'http://localhost';
const TEST_USER_ID = 'user-uuid-1';

let authHeader: Record<string, string> = {};

beforeAll(async () => {
	process.env.JWT_SECRET = 'test-jwt-secret-must-be-at-least-32-chars-long';
	const token = await signAppJwt({
		sub: TEST_USER_ID,
		email: 'test@example.com',
		username: 'testuser',
	});
	authHeader = { Authorization: `Bearer ${token}` };
});

describe('puzzle routes - corrupt data error paths', () => {
	beforeEach(() => {
		initializeDB(undefined, { localDbPath: ':memory:', resetLocal: true });
	});

	afterEach(async () => {
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
		const res = await puzzleRoutes.request(`${BASE_URL}/${inserted!.id}`);
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

		const res = await puzzleRoutes.request(`${BASE_URL}/`);
		expect(res.status).toBe(200);
		const body = (await res.json()) as { puzzles: unknown[] };
		expect(body.puzzles.length).toBeGreaterThan(0);
	});

	test('GET /progress returns empty array when user has no progress', async () => {
		const res = await puzzleRoutes.request(`${BASE_URL}/progress`, {
			headers: authHeader,
		});
		expect(res.status).toBe(200);
		const body = (await res.json()) as { progress: unknown[] };
		expect(Array.isArray(body.progress)).toBe(true);
	});
});
