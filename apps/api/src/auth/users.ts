import { eq } from 'drizzle-orm';
import { users, type User } from '../db/schema';

const USERNAME_PATTERN = /[^a-z0-9_-]+/g;
const MAX_USERNAME_LEN = 30;
const MAX_DERIVE_ATTEMPTS = 5;

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
	const row = db
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
	const existing = db
		.select()
		.from(users)
		.where(eq(users.googleSub, input.sub))
		.get() as User | undefined;

	const now = new Date();

	if (existing) {
		const updated = db
			.update(users)
			.set({
				email: input.email,
				name: input.name ?? null,
				picture: input.picture ?? null,
				updatedAt: now,
			})
			.where(eq(users.googleSub, input.sub))
			.returning()
			.all() as User[];
		const row = updated[0];
		if (!row) {
			throw new Error('Failed to update user');
		}
		return row;
	}

	const username = await deriveUsername(db, input.email);

	const inserted = db
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
		.all() as User[];

	const row = inserted[0];
	if (!row) {
		throw new Error('Failed to insert user');
	}
	return row;
}
