import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { resetLocalDB } from './local';

// We can't import db/index directly at module load time because drizzle-orm/d1
// isn't available in the Node/Bun test environment (it's a Cloudflare-only
// package). Instead we use dynamic imports so the module resolves at runtime and
// the local SQLite path is taken because NODE_ENV=test.

describe('db/index - initializeDB and getDB', () => {
	beforeEach(() => {
		resetLocalDB();
	});

	afterEach(() => {
		resetLocalDB();
	});

	test('getDB throws before any initialization', async () => {
		const { getDB, initializeDB } = await import('./index');

		// On first load the module-level db is undefined — getDB must throw.
		expect(() => getDB()).toThrow(/not initialized/i);

		// Initialize so subsequent tests have a valid db singleton.
		initializeDB(undefined, { localDbPath: ':memory:', resetLocal: true });
	});

	test('initializeDB returns a db instance in test environment', async () => {
		const { initializeDB } = await import('./index');
		const db = initializeDB(undefined, {
			localDbPath: ':memory:',
			resetLocal: true,
		});
		expect(db).toBeDefined();
	});

	test('subsequent calls without reset return the same instance', async () => {
		const { initializeDB } = await import('./index');
		const db1 = initializeDB(undefined, {
			localDbPath: ':memory:',
			resetLocal: true,
		});
		const db2 = initializeDB();
		expect(db1).toBe(db2);
	});

	test('resetLocal option discards the previous instance', async () => {
		const { initializeDB } = await import('./index');
		const db1 = initializeDB(undefined, {
			localDbPath: ':memory:',
			resetLocal: true,
		});
		resetLocalDB();
		const db2 = initializeDB(undefined, {
			localDbPath: ':memory:',
			resetLocal: true,
		});
		expect(db2).toBeDefined();
		expect(db1).not.toBe(db2);
	});

	test('getDB returns the same instance as initializeDB', async () => {
		const { initializeDB, getDB } = await import('./index');
		const initialized = initializeDB(undefined, {
			localDbPath: ':memory:',
			resetLocal: true,
		});
		const retrieved = getDB();
		expect(retrieved).toBe(initialized);
	});
});
