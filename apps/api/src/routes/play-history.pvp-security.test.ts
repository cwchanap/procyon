import { describe, expect, test, beforeAll } from 'bun:test';
import { signAppJwt } from '../auth/jwt';
import playHistoryRoutes from './play-history';

const TEST_USER_ID = '00000000-0000-4000-8000-000000000001';
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
