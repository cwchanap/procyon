import { describe, expect, test } from 'bun:test';
import playHistoryRoutes from './play-history';

describe('POST /api/play-history PvP submission guard', () => {
	test('rejects opponentUserId submissions with 403', async () => {
		const originalFetch = globalThis.fetch;
		process.env.SUPABASE_URL =
			process.env.SUPABASE_URL ?? 'http://localhost:54321';
		process.env.SUPABASE_ANON_KEY =
			process.env.SUPABASE_ANON_KEY ?? 'test-anon-key';

		globalThis.fetch = (async (
			input: RequestInfo | URL,
			init?: RequestInit
		) => {
			const url = typeof input === 'string' ? input : input.toString();
			const pathname = new URL(url).pathname;

			if (pathname.endsWith('/auth/v1/user')) {
				const authHeader =
					(init?.headers as Record<string, string> | undefined)
						?.Authorization ??
					(init?.headers as Record<string, string> | undefined)?.authorization;

				if (authHeader === 'Bearer test-token') {
					return new Response(
						JSON.stringify({
							id: '00000000-0000-4000-8000-000000000001',
							email: 'test@example.com',
						}),
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

		const res = await playHistoryRoutes.request('http://localhost/', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Authorization: 'Bearer test-token',
			},
			body: JSON.stringify({
				chessId: 'chess',
				status: 'win',
				date: new Date().toISOString(),
				opponentUserId: '00000000-0000-4000-8000-000000000000',
			}),
		});

		globalThis.fetch = originalFetch;

		expect(res.status).toBe(403);
		const body = (await res.json()) as { error?: unknown };
		expect(typeof body.error).toBe('string');
	});
});
