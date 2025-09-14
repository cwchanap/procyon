import { drizzle } from 'drizzle-orm/d1';
import { D1Database } from '@cloudflare/d1';
import * as schema from './schema';
import { initializeLocalDB, getLocalDB } from './local';

// For development - you'll need to bind the D1 database in production
let db: ReturnType<typeof drizzle<typeof schema>>;
let isLocalMode = false;

export function initializeDB(d1?: D1Database) {
    if (process.env.NODE_ENV === 'development' || !d1) {
        // Use local SQLite for development
        db = initializeLocalDB() as ReturnType<typeof drizzle<typeof schema>>;
        isLocalMode = true;
    } else {
        // Use Cloudflare D1 for production
        db = drizzle(d1, { schema });
        isLocalMode = false;
    }
    return db;
}

export function getDB() {
    if (!db) {
        throw new Error('Database not initialized. Call initializeDB first.');
    }

    if (isLocalMode) {
        return getLocalDB() as ReturnType<typeof drizzle<typeof schema>>;
    }

    return db;
}

export { schema };
