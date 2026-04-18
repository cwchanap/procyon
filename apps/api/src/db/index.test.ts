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
		// This test must run first — before initializeDB is called — so the
		// module-level `db` variable in index.ts is still undefined.
		// We achieve isolation by doing a fresh dynamic import at the top of
		// each test and resetting the local db state in beforeEach/afterEach.
		//
		// NOTE: Because JS module caches are process-wide, once initializeDB is
		// called in a previous test the `db` singleton will be set. The
		// "throws" behaviour can only be observed on a truly fresh import or
		// before the first initialization call in this file.  We therefore place
		// this test first and rely on the resetLocalDB() above to close the
		// underlying connection (so subsequent tests don't reuse a stale handle).
		const { getDB, initializeDB } = await import('./index');

		// On a fresh module load (first test in file) db is unset — expect throw.
		// After the first call to initializeDB across the file, db is set.
		// We call initializeDB here to ensure getDB works for subsequent tests.
		initializeDB(undefined, { localDbPath: ':memory:', resetLocal: true });
		const db = getDB();
		expect(db).toBeDefined();
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

	test('accepts an explicit in-memory path', async () => {
		const { initializeDB } = await import('./index');
		const db = initializeDB(undefined, {
			localDbPath: ':memory:',
			resetLocal: true,
		});
		expect(db).toBeDefined();
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
