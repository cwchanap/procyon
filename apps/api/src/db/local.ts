import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
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
