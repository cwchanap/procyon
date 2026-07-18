import { drizzle } from 'drizzle-orm/d1';
import type { D1Database } from '@cloudflare/workers-types';
import * as schema from './schema';
import { isDevelopment, isTest } from '../env';

// For development - you'll need to bind the D1 database in production
type DB = ReturnType<typeof drizzle<typeof schema>>;
let db: DB | undefined;

interface InitializeDBOptions {
	localDbPath?: string;
	resetLocal?: boolean;
}

function shouldUseLocalDB() {
	const nodeEnv =
		typeof process !== 'undefined' ? process.env.NODE_ENV : undefined;
	return isDevelopment || isTest || !nodeEnv;
}

export function initializeDB(
	d1?: D1Database,
	options: InitializeDBOptions = {}
): DB {
	// Assign to a local first so TS can narrow across the if/else (a
	// module-level mutable can't be narrowed the same way). The else branch
	// throws, so `initialized` is provably assigned below.
	let initialized: DB;
	if (d1) {
		// Use Cloudflare D1 for production
		initialized = drizzle(d1, { schema });
	} else if (typeof process !== 'undefined' && shouldUseLocalDB()) {
		// Use local SQLite for development (Node.js only)
		// eslint-disable-next-line @typescript-eslint/no-require-imports
		const { initializeLocalDB, resetLocalDB } = require('./local');

		if (options.resetLocal) {
			resetLocalDB();
		}

		initialized = initializeLocalDB({ dbPath: options.localDbPath });
	} else {
		throw new Error('No database configuration provided');
	}
	db = initialized;
	return initialized;
}

export function getDB(): DB {
	if (db === undefined) {
		throw new Error('Database not initialized. Call initializeDB first.');
	}
	return db;
}

export { schema };

// Only available in test environments — resets the module-level db singleton
// so tests can observe the uninitialized state.
export function _resetDBForTest() {
	if (!isTest) {
		throw new Error('_resetDBForTest is only available in test environments');
	}
	db = undefined;
}
