import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { sql } from 'drizzle-orm';
import { aiConfigurations } from './schema';
import { initializeLocalDB, resetLocalDB } from './local';

describe('initializeLocalDB', () => {
	beforeEach(() => {
		resetLocalDB();
	});

	afterEach(() => {
		resetLocalDB();
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
