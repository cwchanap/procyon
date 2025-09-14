import { initializeLocalDB } from './db/local';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';

async function runMigrations() {
    console.log('Running migrations...');

    const db = initializeLocalDB();

    try {
        await migrate(db, { migrationsFolder: './drizzle' });
        console.log('✓ Migrations completed successfully');
    } catch (error) {
        console.error('❌ Migration failed:', error);
        process.exit(1);
    }
}

runMigrations();
