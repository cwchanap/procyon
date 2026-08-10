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
								gameId: 'chess',
								date: new Date().toISOString(),
								status: 'win',
								opponentUserId: null,
								opponentLlmId: null,
								opponentEngineId: 'stockfish',
								ratingChange: null,
								newRating: null,
								details: null,
							},
							{
								id: 2,
								userId: 'user-a',
								gameId: 'chess',
								date: new Date().toISOString(),
								status: 'win',
								opponentUserId: null,
								opponentLlmId: 'gemini-2.5-flash',
								opponentEngineId: null,
								ratingChange: null, // legacy pre-rating row
								newRating: null,
								details: null,
							},
							{
								id: 3,
								userId: 'user-a',
								gameId: 'aeroplane',
								date: new Date().toISOString(),
								status: 'loss',
								opponentUserId: null,
								opponentLlmId: null,
								opponentEngineId: 'aeroplane-trio-v1',
								ratingChange: null,
								newRating: null,
								details: {
									rulePreset: 'quick-chill',
									victoryTarget: 2,
									diceMode: 'relaxed',
									launchRule: 'five-or-six',
									finishRule: 'bounce',
									stacking: false,
									blockades: false,
									chatter: false,
									humanColor: 'red',
									durationSeconds: 240,
									planesFinished: 1,
									capturesMade: 3,
									capturesSuffered: 1,
									aiPlayers: [
										{ color: 'yellow', personality: 'cautious' },
										{ color: 'blue', personality: 'aggressive' },
										{ color: 'green', personality: 'unpredictable' },
									],
								},
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
		const { getAllByText, getByText } = render(<PlayHistoryPage />);

		await waitFor(() =>
			expect(getAllByText('On-device rival').length).toBeGreaterThan(0)
		);
		expect(getAllByText('Unrated').length).toBeGreaterThan(0);
		// Legacy pre-rating LLM row (no engine id, null ratingChange) keeps the em dash.
		expect(getByText('—')).toBeDefined();
	});

	test('Aeroplane trio rows show the unrated label without rendering details', async () => {
		const {
			getAllByText,
			getByText,
			queryByText: queryRenderedText,
		} = render(<PlayHistoryPage />);

		await waitFor(() =>
			expect(getByText('Local Aeroplane trio')).toBeDefined()
		);
		expect(getByText('Aeroplane Chess')).toBeDefined();
		expect(getAllByText('Unrated').length).toBeGreaterThan(1);
		expect(queryRenderedText('quick-chill')).toBeNull();
	});
});
