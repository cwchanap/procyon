import { join } from 'node:path';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import * as schema from './schema';

let localDB: ReturnType<typeof drizzle<typeof schema>> | undefined;

export function initializeLocalDB() {
	if (localDB) {
		return localDB;
	}

	const isTest = process.env.NODE_ENV === 'test';
	const dbPath = isTest
		? ':memory:'
		: join(import.meta.dir, '..', '..', 'dev.db');
	const sqlite = new Database(dbPath);
	localDB = drizzle(sqlite, { schema });

	// Keep schema up to date for local SQLite usage in both development and tests.
	const migrationsFolder = join(import.meta.dir, '..', '..', 'drizzle');
	migrate(localDB, { migrationsFolder });

	return localDB;
}

export function getLocalDB() {
	if (!localDB) {
		throw new Error(
			'Local database not initialized. Call initializeLocalDB first.'
		);
	}
	return localDB;
}
