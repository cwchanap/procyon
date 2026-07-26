import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { render, waitFor } from '@testing-library/react';
import { setupReactDom } from '../test/reactSetup';
import PlayHistoryPage from './PlayHistoryPage';

setupReactDom();

describe('PlayHistoryPage — engine row rendering', () => {
	let originalFetch: typeof globalThis.fetch;

	beforeEach(() => {
		originalFetch = globalThis.fetch;
		// PlayHistoryPage only fetches when authenticated.
		(
			window as unknown as { __PROCYON_INITIAL_AUTH_USER__: unknown }
		).__PROCYON_INITIAL_AUTH_USER__ = {
			id: 'user-a',
			email: 'a@b.com',
			username: 'a',
		};
		globalThis.fetch = (async (url: RequestInfo | URL) => {
			const u = typeof url === 'string' ? url : url.toString();
			if (u.includes('/auth/v1/user') || u.includes('/users/')) {
				return new Response(JSON.stringify({ id: 'user-a' }), {
					status: 200,
					headers: { 'Content-Type': 'application/json' },
				});
			}
			if (u.includes('/play-history')) {
				return new Response(
					JSON.stringify({
						playHistory: [
							{
								id: 1,
								userId: 'user-a',
								chessId: 'chess',
								date: new Date().toISOString(),
								status: 'win',
								opponentUserId: null,
								opponentLlmId: null,
								opponentEngineId: 'stockfish',
								ratingChange: null,
								newRating: null,
							},
							{
								id: 2,
								userId: 'user-a',
								chessId: 'chess',
								date: new Date().toISOString(),
								status: 'win',
								opponentUserId: null,
								opponentLlmId: 'gemini-2.5-flash',
								opponentEngineId: null,
								ratingChange: null, // legacy pre-rating row
								newRating: null,
							},
						],
					}),
					{ status: 200, headers: { 'Content-Type': 'application/json' } }
				);
			}
			return new Response('Not Found', { status: 404 });
		}) as typeof fetch;
	});

	afterEach(() => {
		globalThis.fetch = originalFetch;
	});

	test('engine row shows "On-device rival" and "Unrated"; legacy null row keeps —', async () => {
		const { getByText } = render(<PlayHistoryPage />);

		await waitFor(() => expect(getByText('On-device rival')).toBeDefined());
		expect(getByText('Unrated')).toBeDefined();
		// Legacy pre-rating LLM row (no engine id, null ratingChange) keeps the em dash.
		expect(getByText('—')).toBeDefined();
	});
});
