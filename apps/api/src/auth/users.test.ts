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

	test('returns existing user on unique-constraint collision (same googleSub)', async () => {
		const db = makeDb();
		const now = new Date();

		// Pre-insert a user that will cause a UNIQUE violation on the second insert.
		db.insert(users)
			.values({
				id: 'existing-id',
				googleSub: 'g1',
				email: 'race@example.com',
				username: 'race',
				name: 'Racer',
				createdAt: now,
				updatedAt: now,
			})
			.run();

		// Wrap the db to simulate the race: the first SELECT finds nothing
		// (simulating that the concurrent insert hasn't committed yet), but
		// the real INSERT will fail with a unique error, triggering the
		// re-SELECT path which DOES see the row.
		let selectCount = 0;
		const originalSelect = db.select.bind(db);
		const proxiedDb = new Proxy(db, {
			get(target, prop) {
				if (prop === 'select') {
					return (...args: unknown[]) => {
						selectCount++;
						// First call is the initial lookup — return empty to
						// force the insert path.
						if (selectCount === 1) {
							const builder = originalSelect(...args);
							return {
								...builder,
								from: (...a: unknown[]) => {
									const fromBuilder = builder.from(...a);
									return {
										...fromBuilder,
										where: (...b: unknown[]) => {
											const whereBuilder = fromBuilder.where(...b);
											return {
												...whereBuilder,
												get: async () => undefined,
											};
										},
									};
								},
							};
						}
						// Subsequent selects (re-SELECT after race) hit the real DB.
						return originalSelect(...args);
					};
				}
				const value = (target as Record<string, unknown>)[prop as string];
				return typeof value === 'function' ? value.bind(target) : value;
			},
		});

		const user = await upsertGoogleUser(proxiedDb, {
			sub: 'g1',
			email: 'race@example.com',
			emailVerified: true,
			name: 'Racer',
		});

		// Should return the existing row instead of throwing.
		expect(user.id).toBe('existing-id');
		expect(user.googleSub).toBe('g1');
	});

	test('rejects email collision with different googleSub', async () => {
		const db = makeDb();
		const now = new Date();

		// Pre-insert user A with googleSub=g1, email=shared@example.com
		db.insert(users)
			.values({
				id: 'user-a-id',
				googleSub: 'g1',
				email: 'shared@example.com',
				username: 'shared',
				name: 'User A',
				createdAt: now,
				updatedAt: now,
			})
			.run();

		// User B tries to sign in with googleSub=g2 but same email.
		// The initial SELECT by googleSub='g2' finds nothing, so insert is
		// attempted. The insert fails on the email UNIQUE constraint.
		// The re-SELECT by googleSub finds nothing, the re-SELECT by email
		// finds User A — but googleSub doesn't match, so it must reject.
		let selectCount = 0;
		const originalSelect = db.select.bind(db);
		const proxiedDb = new Proxy(db, {
			get(target, prop) {
				if (prop === 'select') {
					return (...args: unknown[]) => {
						selectCount++;
						if (selectCount === 1) {
							const builder = originalSelect(...args);
							return {
								...builder,
								from: (...a: unknown[]) => {
									const fromBuilder = builder.from(...a);
									return {
										...fromBuilder,
										where: (...b: unknown[]) => {
											const whereBuilder = fromBuilder.where(...b);
											return {
												...whereBuilder,
												get: async () => undefined,
											};
										},
									};
								},
							};
						}
						return originalSelect(...args);
					};
				}
				const value = (target as Record<string, unknown>)[prop as string];
				return typeof value === 'function' ? value.bind(target) : value;
			},
		});

		await expect(
			upsertGoogleUser(proxiedDb, {
				sub: 'g2',
				email: 'shared@example.com',
				emailVerified: true,
				name: 'User B',
			})
		).rejects.toThrow('Email already associated with a different account');
	});
});
