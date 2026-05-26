import { describe, expect, test, beforeAll, afterAll } from 'bun:test';
import playHistoryRoutes from './play-history';
import { signAppJwt } from '../auth/jwt';

const TEST_USER_ID = '00000000-0000-4000-8000-000000000001';

let authHeader: Record<string, string> = {};
let originalJwtSecret: string | undefined;

beforeAll(async () => {
	originalJwtSecret = process.env.JWT_SECRET;
	process.env.JWT_SECRET = 'test-jwt-secret-must-be-at-least-32-chars-long';
	const token = await signAppJwt({
		sub: TEST_USER_ID,
		email: 'test@example.com',
		username: 'testuser',
	});
	authHeader = { Authorization: `Bearer ${token}` };
});

afterAll(() => {
	if (originalJwtSecret !== undefined) {
		process.env.JWT_SECRET = originalJwtSecret;
	} else {
		delete process.env.JWT_SECRET;
	}
});

describe('POST /api/play-history PvP submission guard', () => {
	test('rejects opponentUserId submissions with 403', async () => {
		const res = await playHistoryRoutes.request('http://localhost/', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				...authHeader,
			},
			body: JSON.stringify({
				chessId: 'chess',
				status: 'win',
				date: new Date().toISOString(),
				opponentUserId: '00000000-0000-4000-8000-000000000000',
			}),
		});

		expect(res.status).toBe(403);
		const body = (await res.json()) as { error?: unknown };
		expect(typeof body.error).toBe('string');
	});
});
