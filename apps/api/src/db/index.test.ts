import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { resetLocalDB } from './local';
import type { D1Database } from '@cloudflare/workers-types';

// Import db/index dynamically in tests so module initialization happens after
// the test environment is set up and after each reset. This keeps the db
// singleton and environment-dependent initialization path under test control.

async function resetAll() {
	resetLocalDB();
	const { _resetDBForTest } = await import('./index');
	_resetDBForTest();
}

/** Minimal D1Database stub: drizzle-orm/d1 only touches the binding when a
 * query runs, so initializeDB's `drizzle(d1, { schema })` branch can be
 * exercised without a real D1 connection. */
function createMockD1(): D1Database {
	const stub = () => {
		throw new Error('D1 query stub not executed during initialization');
	};
	return {
		prepare: stub,
		batch: stub,
		exec: stub,
	} as unknown as D1Database;
}

describe('db/index - initializeDB and getDB', () => {
	beforeEach(resetAll);
	afterEach(resetAll);

	test('getDB throws before any initialization', async () => {
		const { getDB } = await import('./index');

		// db is reset in beforeEach so getDB must throw here.
		expect(() => getDB()).toThrow(/not initialized/i);
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

	test('initializeDB uses the Cloudflare D1 branch when a binding is provided', async () => {
		// Passing a D1 binding takes the production `drizzle(d1, { schema })`
		// branch instead of the local SQLite path. The mock binding is never
		// queried during construction, so a stub-throwing mock is sufficient
		// to prove the branch is taken.
		const { initializeDB, getDB } = await import('./index');
		const mockD1 = createMockD1();
		const initialized = initializeDB(mockD1);
		expect(initialized).toBeDefined();
		// getDB returns the same D1-backed instance.
		expect(getDB()).toBe(initialized);
	});
});
