import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { sql } from 'drizzle-orm';
import { aiConfigurations } from './schema';
import { initializeLocalDB, resetLocalDB, getLocalDB } from './local';

describe('getLocalDB', () => {
	afterEach(() => {
		resetLocalDB();
	});

	test('throws when DB is not initialized', () => {
		resetLocalDB();
		expect(() => getLocalDB()).toThrow('Local database not initialized');
	});

	test('returns DB after initialization', () => {
		initializeLocalDB({ dbPath: ':memory:' });
		const db = getLocalDB();
		expect(db).toBeDefined();
	});
});

describe('initializeLocalDB', () => {
	beforeEach(() => {
		resetLocalDB();
	});

	afterEach(() => {
		resetLocalDB();
	});

	test('returns existing DB on second call without reset (early return)', () => {
		const first = initializeLocalDB({ dbPath: ':memory:' });
		const second = initializeLocalDB({ dbPath: ':memory:' }); // should hit early return
		expect(first).toBe(second); // same reference
	});

	test('supports an explicit in-memory database for isolated tests', async () => {
		const firstDb = initializeLocalDB({ dbPath: ':memory:' });

		await firstDb.insert(aiConfigurations).values({
			userId: 'user-uuid-1',
			provider: 'gemini',
			modelName: 'gemini-pro',
			apiKey: 'test-key-1234',
			isActive: false,
		});

		const firstRows = await firstDb
			.select({ count: sql<number>`count(*)` })
			.from(aiConfigurations);
		expect(firstRows[0]?.count).toBe(1);

		resetLocalDB();

		const secondDb = initializeLocalDB({ dbPath: ':memory:' });
		const secondRows = await secondDb
			.select({ count: sql<number>`count(*)` })
			.from(aiConfigurations);
		expect(secondRows[0]?.count).toBe(0);
	});
});
