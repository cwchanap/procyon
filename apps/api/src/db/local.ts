import * as schema from './schema';

// Note: keep all Bun-only imports inside the function so the Worker bundle
// (which runs on Cloudflare and cannot resolve `bun:sqlite`) will not try to
// include them during wrangler deploy.
let localDB:
	| ReturnType<typeof import('drizzle-orm/bun-sqlite').drizzle<typeof schema>>
	| undefined;

export function initializeLocalDB() {
	const bunSqliteModule = 'bun:sqlite';
	// eslint-disable-next-line @typescript-eslint/no-require-imports
	const { Database } = require(bunSqliteModule) as typeof import('bun:sqlite');
	const drizzleModule = 'drizzle-orm/bun-sqlite';
	// eslint-disable-next-line @typescript-eslint/no-require-imports
	const { drizzle } = require(
		drizzleModule
	) as typeof import('drizzle-orm/bun-sqlite');

	const sqlite = new Database('./dev.db');
	localDB = drizzle(sqlite, { schema });
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
