import { describe, test, expect } from 'bun:test';
import {
	createSupabaseClients,
	getSupabaseClientsFromContext,
} from './supabase';

const TEST_URL = 'https://example.supabase.co';
const TEST_ANON_KEY = 'test-anon-key-abc123';
const TEST_SERVICE_ROLE_KEY = 'test-service-role-key-xyz789';

describe('createSupabaseClients', () => {
	test('throws when URL is empty', () => {
		expect(() => createSupabaseClients('', TEST_ANON_KEY)).toThrow(
			'Supabase configuration missing'
		);
	});

	test('throws when anon key is empty', () => {
		expect(() => createSupabaseClients(TEST_URL, '')).toThrow(
			'Supabase configuration missing'
		);
	});

	test('throws when both URL and anon key are empty', () => {
		expect(() => createSupabaseClients('', '')).toThrow(
			'Supabase configuration missing'
		);
	});

	test('throws when URL is whitespace only', () => {
		expect(() => createSupabaseClients('   ', TEST_ANON_KEY)).toThrow(
			'Supabase configuration missing'
		);
	});

	test('throws when anon key is whitespace only', () => {
		expect(() => createSupabaseClients(TEST_URL, '   ')).toThrow(
			'Supabase configuration missing'
		);
	});

	test('returns null supabaseAdmin when no service role key is provided', () => {
		const clients = createSupabaseClients(TEST_URL, TEST_ANON_KEY);
		expect(clients.supabaseAdmin).toBeNull();
	});

	test('returns non-null supabaseAnon when valid credentials provided', () => {
		const clients = createSupabaseClients(TEST_URL, TEST_ANON_KEY);
		expect(clients.supabaseAnon).not.toBeNull();
	});

	test('returns non-null supabaseAdmin when service role key is provided', () => {
		const clients = createSupabaseClients(
			TEST_URL,
			TEST_ANON_KEY,
			TEST_SERVICE_ROLE_KEY
		);
		expect(clients.supabaseAdmin).not.toBeNull();
	});

	test('returns both admin and anon clients when all credentials provided', () => {
		const clients = createSupabaseClients(
			TEST_URL,
			TEST_ANON_KEY,
			TEST_SERVICE_ROLE_KEY
		);
		expect(clients.supabaseAdmin).not.toBeNull();
		expect(clients.supabaseAnon).not.toBeNull();
	});

	test('returns null admin when service role key is empty string', () => {
		const clients = createSupabaseClients(TEST_URL, TEST_ANON_KEY, '');
		expect(clients.supabaseAdmin).toBeNull();
	});

	test('returns null admin when service role key is whitespace only', () => {
		const clients = createSupabaseClients(TEST_URL, TEST_ANON_KEY, '   ');
		expect(clients.supabaseAdmin).toBeNull();
	});

	test('strips surrounding double quotes from URL', () => {
		const quotedUrl = `"${TEST_URL}"`;
		const clients = createSupabaseClients(quotedUrl, TEST_ANON_KEY);
		expect(clients.supabaseAnon).not.toBeNull();
	});

	test('strips surrounding single quotes from anon key', () => {
		const quotedKey = `'${TEST_ANON_KEY}'`;
		const clients = createSupabaseClients(TEST_URL, quotedKey);
		expect(clients.supabaseAnon).not.toBeNull();
	});

	test('strips surrounding single quotes from service role key', () => {
		const quotedServiceKey = `'${TEST_SERVICE_ROLE_KEY}'`;
		const clients = createSupabaseClients(
			TEST_URL,
			TEST_ANON_KEY,
			quotedServiceKey
		);
		expect(clients.supabaseAdmin).not.toBeNull();
	});

	test('trims leading and trailing whitespace from URL', () => {
		const clients = createSupabaseClients(`  ${TEST_URL}  `, TEST_ANON_KEY);
		expect(clients.supabaseAnon).not.toBeNull();
	});

	test('trims leading and trailing whitespace from anon key', () => {
		const clients = createSupabaseClients(TEST_URL, `  ${TEST_ANON_KEY}  `);
		expect(clients.supabaseAnon).not.toBeNull();
	});

	test('throws when URL is whitespace wrapped in double quotes (normalization then empty check)', () => {
		expect(() => createSupabaseClients('"   "', TEST_ANON_KEY)).toThrow(
			'Supabase configuration missing'
		);
	});

	test('throws when anon key is whitespace wrapped in single quotes', () => {
		expect(() => createSupabaseClients(TEST_URL, "'   '")).toThrow(
			'Supabase configuration missing'
		);
	});

	test('returned clients object has correct shape', () => {
		const clients = createSupabaseClients(TEST_URL, TEST_ANON_KEY);
		expect(clients).toHaveProperty('supabaseAdmin');
		expect(clients).toHaveProperty('supabaseAnon');
	});
});

describe('getSupabaseClientsFromContext', () => {
	test('returns clients using context env vars when both URL and anon key provided', () => {
		const context = {
			env: {
				SUPABASE_URL: TEST_URL,
				SUPABASE_ANON_KEY: TEST_ANON_KEY,
			},
		};
		const clients = getSupabaseClientsFromContext(context);
		expect(clients.supabaseAnon).not.toBeNull();
	});

	test('returns null admin when context has no service role key', () => {
		const context = {
			env: {
				SUPABASE_URL: TEST_URL,
				SUPABASE_ANON_KEY: TEST_ANON_KEY,
			},
		};
		const clients = getSupabaseClientsFromContext(context);
		expect(clients.supabaseAdmin).toBeNull();
	});

	test('returns non-null admin when context includes service role key', () => {
		const context = {
			env: {
				SUPABASE_URL: TEST_URL,
				SUPABASE_ANON_KEY: TEST_ANON_KEY,
				SUPABASE_SERVICE_ROLE_KEY: TEST_SERVICE_ROLE_KEY,
			},
		};
		const clients = getSupabaseClientsFromContext(context);
		expect(clients.supabaseAdmin).not.toBeNull();
	});

	test('returns null admin when context service role key is empty string', () => {
		const context = {
			env: {
				SUPABASE_URL: TEST_URL,
				SUPABASE_ANON_KEY: TEST_ANON_KEY,
				SUPABASE_SERVICE_ROLE_KEY: '',
			},
		};
		const clients = getSupabaseClientsFromContext(context);
		expect(clients.supabaseAdmin).toBeNull();
	});

	test('returns null admin when context service role key is whitespace only', () => {
		const context = {
			env: {
				SUPABASE_URL: TEST_URL,
				SUPABASE_ANON_KEY: TEST_ANON_KEY,
				SUPABASE_SERVICE_ROLE_KEY: '   ',
			},
		};
		const clients = getSupabaseClientsFromContext(context);
		expect(clients.supabaseAdmin).toBeNull();
	});

	// Note: the two tests below exercise the `getDefaultClients()` singleton path.
	// They both use the same TEST_URL/TEST_ANON_KEY, so the module-level
	// `defaultClients` cache populated by the first test is reused by the second
	// and still produces a correct result.  Bun isolates test files in separate
	// processes, so the singleton does not leak across other test files.
	test('context with empty env object falls back to process env', () => {
		const originalUrl = process.env.SUPABASE_URL;
		const originalKey = process.env.SUPABASE_ANON_KEY;

		process.env.SUPABASE_URL = TEST_URL;
		process.env.SUPABASE_ANON_KEY = TEST_ANON_KEY;

		try {
			const clients = getSupabaseClientsFromContext({ env: {} });
			expect(clients.supabaseAnon).not.toBeNull();
		} finally {
			if (originalUrl === undefined) delete process.env.SUPABASE_URL;
			else process.env.SUPABASE_URL = originalUrl;

			if (originalKey === undefined) delete process.env.SUPABASE_ANON_KEY;
			else process.env.SUPABASE_ANON_KEY = originalKey;
		}
	});

	test('context without URL falls back to process env', () => {
		const originalUrl = process.env.SUPABASE_URL;
		const originalKey = process.env.SUPABASE_ANON_KEY;

		process.env.SUPABASE_URL = TEST_URL;
		process.env.SUPABASE_ANON_KEY = TEST_ANON_KEY;

		try {
			const context = {
				env: {
					SUPABASE_ANON_KEY: TEST_ANON_KEY,
				},
			};
			const clients = getSupabaseClientsFromContext(context);
			expect(clients.supabaseAnon).not.toBeNull();
		} finally {
			if (originalUrl === undefined) delete process.env.SUPABASE_URL;
			else process.env.SUPABASE_URL = originalUrl;

			if (originalKey === undefined) delete process.env.SUPABASE_ANON_KEY;
			else process.env.SUPABASE_ANON_KEY = originalKey;
		}
	});
});
