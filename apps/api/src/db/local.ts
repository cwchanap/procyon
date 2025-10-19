import { Database } from 'bun:sqlite';
import { drizzle } from 'drizzle-orm/bun-sqlite';
import * as schema from './schema';

let localDB: ReturnType<typeof drizzle<typeof schema>>;

export function initializeLocalDB() {
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
