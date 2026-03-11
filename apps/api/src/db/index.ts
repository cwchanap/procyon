import { drizzle } from 'drizzle-orm/d1';
import type { D1Database } from '@cloudflare/workers-types';
import * as schema from './schema';
import { isDevelopment, isTest } from '../env';

// For development - you'll need to bind the D1 database in production
let db: ReturnType<typeof drizzle<typeof schema>>;

interface InitializeDBOptions {
	localDbPath?: string;
	resetLocal?: boolean;
}

function shouldUseLocalDB() {
	const nodeEnv = typeof process !== 'undefined' ? process.env.NODE_ENV : '';
	return (
		isDevelopment || isTest || nodeEnv === 'development' || nodeEnv === 'test'
	);
}

export function initializeDB(
	d1?: D1Database,
	options: InitializeDBOptions = {}
) {
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
	return db;
}

export function getDB() {
	if (!db) {
		throw new Error('Database not initialized. Call initializeDB first.');
	}
	return db;
}

export { schema };
