import { describe, test, expect } from 'bun:test';
import { Database } from 'bun:sqlite';
import { drizzle } from 'drizzle-orm/bun-sqlite';
import { users } from '../db/schema';
import { eq } from 'drizzle-orm';
import { upsertGoogleUser, deriveUsername } from './users';

function makeDb() {
	const sqlite = new Database(':memory:');
	sqlite.exec(`
		CREATE TABLE users (
			id text PRIMARY KEY NOT NULL,
			google_sub text NOT NULL UNIQUE,
			email text NOT NULL UNIQUE,
			username text NOT NULL UNIQUE,
			name text,
			picture text,
			created_at integer NOT NULL,
			updated_at integer NOT NULL
		);
	`);
	return drizzle(sqlite, { schema: { users } });
}

describe('deriveUsername', () => {
	test('slugifies email prefix', async () => {
		const db = makeDb();
		const username = await deriveUsername(db, 'Alice.Bob@example.com');
		expect(username).toMatch(/^alice[._-]?bob$/);
	});

	test('falls back to suffix on collision', async () => {
		const db = makeDb();
		const now = new Date();
		db.insert(users)
			.values({
				id: 'u1',
				googleSub: 'g1',
				email: 'taken@example.com',
				username: 'alice',
				createdAt: now,
				updatedAt: now,
			})
			.run();
		const username = await deriveUsername(db, 'alice@example.com');
		expect(username).not.toBe('alice');
		expect(username.startsWith('alice')).toBe(true);
	});
});

describe('upsertGoogleUser', () => {
	test('inserts a new user', async () => {
		const db = makeDb();
		const user = await upsertGoogleUser(db, {
			sub: 'g1',
			email: 'a@example.com',
			emailVerified: true,
			name: 'Alice',
			picture: 'https://example.com/a.png',
		});
		expect(user.googleSub).toBe('g1');
		expect(user.email).toBe('a@example.com');
		expect(user.username).toBe('a');
	});

	test('updates existing user when google_sub matches', async () => {
		const db = makeDb();
		await upsertGoogleUser(db, {
			sub: 'g1',
			email: 'a@example.com',
			emailVerified: true,
			name: 'Alice',
		});
		const updated = await upsertGoogleUser(db, {
			sub: 'g1',
			email: 'a-new@example.com',
			emailVerified: true,
			name: 'Alice New',
			picture: 'https://example.com/new.png',
		});
		expect(updated.email).toBe('a-new@example.com');
		expect(updated.name).toBe('Alice New');
		expect(updated.picture).toBe('https://example.com/new.png');
		const rows = db.select().from(users).where(eq(users.googleSub, 'g1')).all();
		expect(rows.length).toBe(1);
	});
});
