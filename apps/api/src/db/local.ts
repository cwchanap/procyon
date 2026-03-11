import * as schema from './schema';

import { join } from 'node:path';

// Keep Bun-only imports inside initializeLocalDB so Cloudflare Worker bundles
// don't try to resolve bun:sqlite at build time.
let localDB:
	| ReturnType<typeof import('drizzle-orm/bun-sqlite').drizzle<typeof schema>>
	| undefined;
let sqliteConnection:
	| InstanceType<typeof import('bun:sqlite').Database>
	| undefined;

interface InitializeLocalDBOptions {
	dbPath?: string;
}

export function initializeLocalDB(options: InitializeLocalDBOptions = {}) {
	if (localDB) {
		return localDB;
	}
	const bunSqliteModule = 'bun:sqlite';
	// eslint-disable-next-line @typescript-eslint/no-require-imports
	const { Database } = require(bunSqliteModule) as typeof import('bun:sqlite');
	const drizzleModule = 'drizzle-orm/bun-sqlite';
	// eslint-disable-next-line @typescript-eslint/no-require-imports
	const { drizzle } = require(
		drizzleModule
	) as typeof import('drizzle-orm/bun-sqlite');
	const migratorModule = 'drizzle-orm/bun-sqlite/migrator';
	// eslint-disable-next-line @typescript-eslint/no-require-imports
	const { migrate } = require(
		migratorModule
	) as typeof import('drizzle-orm/bun-sqlite/migrator');

	const isTest = process.env.NODE_ENV === 'test';
	const dbPath =
		options.dbPath ??
		(isTest ? ':memory:' : join(import.meta.dir, '..', '..', 'dev.db'));
	sqliteConnection = new Database(dbPath);
	localDB = drizzle(sqliteConnection, { schema });

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

export function resetLocalDB() {
	if (sqliteConnection) {
		sqliteConnection.close();
		sqliteConnection = undefined;
	}
	localDB = undefined;
}
