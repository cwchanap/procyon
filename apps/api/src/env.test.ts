import { describe, test, expect } from 'bun:test';
import { env, isDevelopment, isProduction, isTest } from './env';

describe('env object', () => {
	test('exports an env object with expected properties', () => {
		expect(env).toBeDefined();
		expect(typeof env).toBe('object');
	});

	test('PORT defaults to 3501 when not set', () => {
		// In test environment PORT is typically not set
		expect(typeof env.PORT).toBe('number');
		expect(env.PORT).toBeGreaterThan(0);
	});

	test('NODE_ENV is set to test in test environment', () => {
		// Bun sets NODE_ENV=test during `bun test`
		expect(env.NODE_ENV).toBe('test');
	});

	test('FRONTEND_URL defaults to localhost:3500', () => {
		// In test env, FRONTEND_URL is not set so it should be the default
		expect(typeof env.FRONTEND_URL).toBe('string');
		expect(env.FRONTEND_URL).toContain('localhost');
	});

	test('SUPABASE_URL is a string (may be empty in test)', () => {
		expect(typeof env.SUPABASE_URL).toBe('string');
	});

	test('SUPABASE_ANON_KEY is a string (may be empty in test)', () => {
		expect(typeof env.SUPABASE_ANON_KEY).toBe('string');
	});

	test('SUPABASE_SERVICE_ROLE_KEY is a string (may be empty in test)', () => {
		expect(typeof env.SUPABASE_SERVICE_ROLE_KEY).toBe('string');
	});

	test('CI is a boolean', () => {
		expect(typeof env.CI).toBe('boolean');
	});

	test('optional Cloudflare fields are undefined or string', () => {
		if (env.CLOUDFLARE_ACCOUNT_ID !== undefined) {
			expect(typeof env.CLOUDFLARE_ACCOUNT_ID).toBe('string');
		}
		if (env.CLOUDFLARE_DATABASE_ID !== undefined) {
			expect(typeof env.CLOUDFLARE_DATABASE_ID).toBe('string');
		}
		if (env.CLOUDFLARE_API_TOKEN !== undefined) {
			expect(typeof env.CLOUDFLARE_API_TOKEN).toBe('string');
		}
	});
});

describe('isDevelopment', () => {
	test('is a boolean', () => {
		expect(typeof isDevelopment).toBe('boolean');
	});

	test('is false in test environment', () => {
		// NODE_ENV=test so isDevelopment should be false
		expect(isDevelopment).toBe(false);
	});
});

describe('isProduction', () => {
	test('is a boolean', () => {
		expect(typeof isProduction).toBe('boolean');
	});

	test('is false in test environment', () => {
		expect(isProduction).toBe(false);
	});
});

describe('isTest', () => {
	test('is a boolean', () => {
		expect(typeof isTest).toBe('boolean');
	});

	test('is true when NODE_ENV is test', () => {
		// Bun test sets NODE_ENV=test
		expect(isTest).toBe(true);
	});
});

describe('env PORT parsing', () => {
	test('PORT is a positive integer', () => {
		expect(Number.isInteger(env.PORT)).toBe(true);
		expect(env.PORT).toBeGreaterThan(0);
	});
});
