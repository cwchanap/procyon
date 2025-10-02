import { drizzle } from 'drizzle-orm/d1';
import type { D1Database } from '@cloudflare/workers-types';
import * as schema from './schema';

// For development - you'll need to bind the D1 database in production
let db: ReturnType<typeof drizzle<typeof schema>>;

export function initializeDB(d1?: D1Database) {
    if (
        !d1 &&
        typeof process !== 'undefined' &&
        process.env?.NODE_ENV === 'development'
    ) {
        // Use local SQLite for development (Node.js only)
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { initializeLocalDB } = require('./local');

        db = initializeLocalDB();
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
