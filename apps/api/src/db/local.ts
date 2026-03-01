import { join } from 'node:path';
import { isTest } from '../env';
import * as schema from './schema';

// Note: keep all Bun-only imports inside the function so the Worker bundle
// (which runs on Cloudflare and cannot resolve `bun:sqlite`) will not try to
// include them during wrangler deploy.
let localDB:
	| ReturnType<typeof import('drizzle-orm/bun-sqlite').drizzle<typeof schema>>
	| undefined;

export function initializeLocalDB() {
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

	const dbPath = join(import.meta.dir, '..', '..', 'dev.db');
	const sqlite = new Database(dbPath);
	localDB = drizzle(sqlite, { schema });

	if (isTest) {
		// Ensure test runs work on fresh environments (e.g. CI) where dev.db has
		// not been pre-migrated yet.
		const migratorModule = 'drizzle-orm/bun-sqlite/migrator';
		// eslint-disable-next-line @typescript-eslint/no-require-imports
		const { migrate } = require(
			migratorModule
		) as typeof import('drizzle-orm/bun-sqlite/migrator');
		const migrationsFolder = join(import.meta.dir, '..', '..', 'drizzle');
		migrate(localDB, { migrationsFolder });
	}

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
