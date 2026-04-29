import { test, expect, describe, mock } from 'bun:test';

// Mock @supabase/supabase-js so createClient returns a fake client
mock.module('@supabase/supabase-js', () => ({
	createClient: mock((url: string, key: string) => ({
		_url: url,
		_key: key,
		auth: {
			getSession: mock(() => Promise.resolve({ data: { session: null } })),
		},
	})),
}));

// Mock ./env to provide controlled values
mock.module('./env', () => ({
	env: {
		PUBLIC_API_URL: 'http://localhost:3501/api',
		PUBLIC_SUPABASE_URL: 'https://test.supabase.co',
		PUBLIC_SUPABASE_ANON_KEY: 'test-anon-key',
	},
}));

const { getSupabaseClient, supabaseClient } = await import('./supabase');

describe('supabase - getSupabaseClient', () => {
	test('returns a client when env vars are configured', () => {
		const client = getSupabaseClient();
		expect(client).toBeDefined();
	});

	test('returns the same instance on subsequent calls (singleton)', () => {
		const client1 = getSupabaseClient();
		const client2 = getSupabaseClient();
		expect(client1).toBe(client2);
	});

	test('supabaseClient proxy forwards property access to the real client', () => {
		const auth = supabaseClient.auth;
		expect(auth).toBeDefined();
	});
});
