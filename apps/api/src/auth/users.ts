import { eq } from 'drizzle-orm';
import { users, type User } from '../db/schema';

const USERNAME_PATTERN = /[^a-z0-9_-]+/g;
const MAX_USERNAME_LEN = 30;
const MAX_DERIVE_ATTEMPTS = 5;
const MAX_INSERT_RETRIES = 3;

function slugify(input: string): string {
	const lower = input.toLowerCase().trim();
	const replaced = lower.replace(USERNAME_PATTERN, '_').replace(/_+/g, '_');
	const trimmed = replaced.replace(/^[_-]+|[_-]+$/g, '');
	return trimmed.slice(0, MAX_USERNAME_LEN);
}

function randomSuffix(): string {
	return Math.random().toString(36).slice(2, 5);
}

async function usernameExists(
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	db: any,
	candidate: string
): Promise<boolean> {
	const row = await db
		.select()
		.from(users)
		.where(eq(users.username, candidate))
		.get();
	return !!row;
}

export async function deriveUsername(
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	db: any,
	email: string
): Promise<string> {
	const prefix = email.split('@')[0] || 'user';
	const base = slugify(prefix) || 'user';

	if (!(await usernameExists(db, base))) {
		return base;
	}

	for (let i = 0; i < MAX_DERIVE_ATTEMPTS; i++) {
		const candidate = `${base}_${randomSuffix()}`.slice(0, MAX_USERNAME_LEN);
		if (!(await usernameExists(db, candidate))) {
			return candidate;
		}
	}

	const fallback = `user_${crypto.randomUUID().slice(0, 8)}`;
	if (await usernameExists(db, fallback)) {
		throw new Error('Could not provision username');
	}
	return fallback;
}

export interface GoogleUserInput {
	sub: string;
	email: string;
	emailVerified: boolean;
	name?: string;
	picture?: string;
}

export async function upsertGoogleUser(
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	db: any,
	input: GoogleUserInput
): Promise<User> {
	const existing = (await db
		.select()
		.from(users)
		.where(eq(users.googleSub, input.sub))
		.get()) as User | undefined;

	const now = new Date();

	if (existing) {
		const updated = (await db
			.update(users)
			.set({
				email: input.email,
				name: input.name ?? null,
				picture: input.picture ?? null,
				updatedAt: now,
			})
			.where(eq(users.googleSub, input.sub))
			.returning()
			.all()) as User[];
		const row = updated[0];
		if (!row) {
			throw new Error('Failed to update user');
		}
		return row;
	}

	let username = await deriveUsername(db, input.email);

	let inserted: User[] = [];
	for (let attempt = 0; attempt < MAX_INSERT_RETRIES; attempt++) {
		try {
			inserted = (await db
				.insert(users)
				.values({
					id: crypto.randomUUID(),
					googleSub: input.sub,
					email: input.email,
					username,
					name: input.name ?? null,
					picture: input.picture ?? null,
					createdAt: now,
					updatedAt: now,
				})
				.returning()
				.all()) as User[];
			break;
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			const isUnique = /unique/i.test(msg);

			if (isUnique) {
				// Concurrent insert may have already created this user via
				// google_sub or email unique constraint — return it.
				const raced = (await db
					.select()
					.from(users)
					.where(eq(users.googleSub, input.sub))
					.get()) as User | undefined;
				if (raced) return raced;

				const racedByEmail = (await db
					.select()
					.from(users)
					.where(eq(users.email, input.email))
					.get()) as User | undefined;
				if (racedByEmail) {
					// If the email belongs to a different Google identity, this
					// is a collision (e.g. Workspace reassignment or imported
					// data). Reject rather than silently merging identities.
					if (racedByEmail.googleSub !== input.sub) {
						throw new Error(
							'Email already associated with a different account'
						);
					}
					return racedByEmail;
				}

				// Otherwise it's a username collision — derive a fresh one.
				if (attempt < MAX_INSERT_RETRIES - 1) {
					username = await deriveUsername(db, input.email);
					continue;
				}
			}
			throw err;
		}
	}

	const row = inserted[0];
	if (!row) {
		throw new Error('Failed to insert user');
	}
	return row;
}
