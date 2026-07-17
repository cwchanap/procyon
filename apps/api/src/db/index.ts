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
	if (!d1 && typeof process !== 'undefined' && shouldUseLocalDB()) {
		// Use local SQLite for development (Node.js only)
		// eslint-disable-next-line @typescript-eslint/no-require-imports
		const { initializeLocalDB, resetLocalDB } = require('./local');

		if (options.resetLocal) {
			resetLocalDB();
		}

		db = initializeLocalDB({ dbPath: options.localDbPath });
	} else if (d1) {
		// Use Cloudflare D1 for production
		db = drizzle(d1, { schema });
	} else {
		throw new Error('No database configuration provided');
	}
	// db is assigned in both branches above (the third throws), but TS can't
	// narrow a module-level mutable across the if/else, so reassign to a
	// local that is provably non-undefined here.
	const initialized = db;
	if (!initialized) {
		throw new Error('Database initialization failed');
	}
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
