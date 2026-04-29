import { test, expect, describe, afterEach, mock } from 'bun:test';

const mockGetSession = mock(() => Promise.resolve({ data: { session: null } }));

mock.module('./supabase', () => ({
	supabaseClient: {
		auth: {
			getSession: mockGetSession,
		},
	},
}));

const { getAuthHeaders } = await import('./auth');

describe('getAuthHeaders', () => {
	afterEach(() => {
		mockGetSession.mockImplementation(() =>
			Promise.resolve({ data: { session: null } })
		);
	});

	test('returns empty object when no session exists', async () => {
		const headers = await getAuthHeaders();
		expect(headers).toEqual({});
	});

	test('returns Authorization header when session is available', async () => {
		mockGetSession.mockImplementation(() =>
			Promise.resolve({
				data: { session: { access_token: 'test-token-123' } },
			})
		);

		const headers = await getAuthHeaders();
		expect(headers).toEqual({ Authorization: 'Bearer test-token-123' });
	});

	test('returns empty object when session has no access_token', async () => {
		mockGetSession.mockImplementation(() =>
			Promise.resolve({ data: { session: { access_token: null } } })
		);

		const headers = await getAuthHeaders();
		expect(headers).toEqual({});
	});

	test('returns empty object when getSession throws', async () => {
		mockGetSession.mockImplementation(() =>
			Promise.reject(new Error('Network error'))
		);

		const headers = await getAuthHeaders();
		expect(headers).toEqual({});
	});

	test('returns empty object when session is undefined', async () => {
		mockGetSession.mockImplementation(() =>
			Promise.resolve({ data: { session: undefined } })
		);

		const headers = await getAuthHeaders();
		expect(headers).toEqual({});
	});
});
