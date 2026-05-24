# Google-Only Auth Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Supabase Auth (email/password) with Google-only sign-in via Google Identity Services, with the API minting its own HS256 JWT verified by existing Bearer middleware.

**Architecture:** Frontend uses GIS to obtain a Google ID token; API verifies the ID token via Google's JWKS (`jose`), upserts a row in a new D1 `users` table keyed on `google_sub`, and returns an app JWT. The existing Bearer `authMiddleware` is rewritten to verify our HS256 JWT instead of calling Supabase. There are no production users, so the migration wipes user-keyed application data.

**Tech Stack:** Astro + React (web), Hono + Drizzle (api), SQLite/Cloudflare D1, `jose` for JWT/JWKS, Google Identity Services on the frontend, Bun for runtime + tests.

**Spec:** `docs/superpowers/specs/2026-05-22-google-only-auth-design.md`

---

## Conventions

- All shell commands are run from the file's app directory unless prefixed `cd ...`.
- Test framework: Bun's built-in runner (`bun test`). Imports from `'bun:test'`.
- After every task that modifies code, run the touched file's tests and commit.
- Commit message format: `feat:` for new code, `refactor:` for replacement, `chore:` for config/deps, `test:` for tests, `docs:` for docs.

## Test Environment Variables

Set these in `apps/api/.env` and `apps/api/.env.test` (or shell) so unit tests pass:

```env
JWT_SECRET=test-jwt-secret-must-be-at-least-32-chars-long
GOOGLE_CLIENT_ID=test-google-client-id.apps.googleusercontent.com
```

These exact strings are referenced from later tests.

---

## Task 1: Add `jose`, remove Supabase from API

**Files:**

- Modify: `apps/api/package.json`

- [ ] **Step 1: Install `jose` and uninstall Supabase**

Run (from `apps/api`):

```bash
bun add jose
bun remove @supabase/supabase-js @supabase/ssr
```

- [ ] **Step 2: Verify dependencies look correct**

Run: `grep -E "(jose|supabase)" package.json`

Expected: `jose` listed under dependencies; no Supabase entries.

- [ ] **Step 3: Commit**

```bash
git add package.json bun.lock
git commit -m "chore(api): add jose, remove supabase packages"
```

---

## Task 2: Update API env config

**Files:**

- Modify: `apps/api/src/env.ts`
- Modify: `apps/api/.env.example`

- [ ] **Step 1: Replace env config**

Replace the contents of `apps/api/src/env.ts` with:

```ts
/**
 * Centralized environment configuration for API server
 */

interface EnvConfig {
  // Server
  NODE_ENV: string;
  PORT: number;

  // Google OAuth
  GOOGLE_CLIENT_ID: string;
  JWT_SECRET: string;

  // Frontend
  FRONTEND_URL: string;

  // Cloudflare D1 (production)
  CLOUDFLARE_ACCOUNT_ID?: string;
  CLOUDFLARE_DATABASE_ID?: string;
  CLOUDFLARE_API_TOKEN?: string;

  // CI
  CI?: boolean;
}

function getProcessEnv(): Record<string, string | undefined> {
  const maybeProcess = globalThis as unknown as {
    process?: { env?: Record<string, string | undefined> };
  };
  return maybeProcess.process?.env ?? {};
}

const processEnv = getProcessEnv();

function isWorkersRuntime(): boolean {
  const g = globalThis as unknown as {
    WebSocketPair?: unknown;
    caches?: unknown;
  };
  return (
    typeof g.WebSocketPair !== 'undefined' || typeof g.caches !== 'undefined'
  );
}

function normalizeEnvValue(value: string | undefined): string {
  if (!value) return '';
  return value.trim().replace(/^["']+|["']+$/g, '');
}

function getEnv(key: string, defaultValue?: string): string {
  const raw = processEnv[key] ?? defaultValue;
  return normalizeEnvValue(raw);
}

function getEnvNumber(key: string, defaultValue: number): number {
  const value = normalizeEnvValue(processEnv[key]);
  if (!value) return defaultValue;
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : defaultValue;
}

function getEnvBoolean(key: string): boolean {
  return processEnv[key] === 'true' || processEnv[key] === '1';
}

export const env: EnvConfig = {
  NODE_ENV: getEnv('NODE_ENV'),
  PORT: getEnvNumber('PORT', 3501),

  GOOGLE_CLIENT_ID: getEnv('GOOGLE_CLIENT_ID'),
  JWT_SECRET: getEnv('JWT_SECRET'),

  FRONTEND_URL: getEnv('FRONTEND_URL', 'http://localhost:3500'),

  CLOUDFLARE_ACCOUNT_ID: processEnv.CLOUDFLARE_ACCOUNT_ID,
  CLOUDFLARE_DATABASE_ID: processEnv.CLOUDFLARE_DATABASE_ID,
  CLOUDFLARE_API_TOKEN: processEnv.CLOUDFLARE_API_TOKEN,

  CI: getEnvBoolean('CI'),
};

if (env.NODE_ENV === 'production' && !isWorkersRuntime()) {
  if (!env.GOOGLE_CLIENT_ID) {
    throw new Error('GOOGLE_CLIENT_ID is required in production.');
  }
  if (!env.JWT_SECRET) {
    throw new Error('JWT_SECRET is required in production.');
  }
}

export const isDevelopment =
  env.NODE_ENV === 'development' || env.NODE_ENV === 'e2e';
export const isProduction = env.NODE_ENV === 'production';
export const isTest = env.NODE_ENV === 'test' || env.NODE_ENV === 'e2e';
```

- [ ] **Step 2: Update `.env.example`**

Open `apps/api/.env.example`. Remove any `SUPABASE_*` lines. Add:

```env
GOOGLE_CLIENT_ID=your-google-client-id.apps.googleusercontent.com
JWT_SECRET=generate-a-32+-char-random-string
```

- [ ] **Step 3: Type-check**

Run: `bun run lint` (from `apps/api`).
Expected: errors only in files that still import Supabase (we delete/rewrite those later). The new `env.ts` should not be among them. If it is, fix.

- [ ] **Step 4: Commit**

```bash
git add src/env.ts .env.example
git commit -m "chore(api): swap supabase env for google client id and jwt secret"
```

---

## Task 3: Add `users` table to Drizzle schema

**Files:**

- Modify: `apps/api/src/db/schema.ts`

- [ ] **Step 1: Add the `users` table**

In `apps/api/src/db/schema.ts`, replace the comment block at the top (the `// Note: User authentication is now handled by Supabase…` paragraph) with the new `users` table definition. Insert this **before** `aiConfigurations`:

```ts
// Application-owned user identity (replaces Supabase Auth).
// `id` is the canonical user UUID referenced by all user-keyed tables.
export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  googleSub: text('google_sub').notNull().unique(),
  email: text('email').notNull().unique(),
  username: text('username').notNull().unique(),
  name: text('name'),
  picture: text('picture'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
});

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
```

- [ ] **Step 2: Type-check**

Run: `bun run lint`
Expected: no new errors from `schema.ts`.

- [ ] **Step 3: Commit**

```bash
git add src/db/schema.ts
git commit -m "feat(api): add users table to drizzle schema"
```

---

## Task 4: Generate and write the migration

**Files:**

- Create: `apps/api/drizzle/0009_google_only_auth.sql`
- Modify: `apps/api/drizzle/meta/_journal.json` (auto-updated by drizzle-kit)

- [ ] **Step 1: Auto-generate the schema-add portion**

Run (from `apps/api`): `bun run db:generate`
Expected: a new file `apps/api/drizzle/0009_<something>.sql` appears containing `CREATE TABLE users`.

- [ ] **Step 2: Rename if needed and add the user-data wipe**

If the file is not named `0009_google_only_auth.sql`, rename it. Then **prepend** the wipe statements so the migration becomes:

```sql
-- Migration: Google-only auth. Drop Supabase-keyed user data and create users table.

DELETE FROM `ai_configurations`;
--> statement-breakpoint
DELETE FROM `play_history`;
--> statement-breakpoint
DELETE FROM `player_ratings`;
--> statement-breakpoint
DELETE FROM `rating_history`;
--> statement-breakpoint
DELETE FROM `user_puzzle_progress`;
--> statement-breakpoint

CREATE TABLE `users` (
  `id` text PRIMARY KEY NOT NULL,
  `google_sub` text NOT NULL,
  `email` text NOT NULL,
  `username` text NOT NULL,
  `name` text,
  `picture` text,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL
);
--> statement-breakpoint

CREATE UNIQUE INDEX `users_google_sub_unique` ON `users` (`google_sub`);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_username_unique` ON `users` (`username`);
```

- [ ] **Step 3: Apply migration locally**

Run: `bun run db:migrate`
Expected: migration applies cleanly; `dev.db` now has a `users` table.

- [ ] **Step 4: Verify table exists**

Run: `sqlite3 dev.db ".schema users"`
Expected: prints the CREATE TABLE statement.

- [ ] **Step 5: Commit**

```bash
git add drizzle/
git commit -m "feat(api): migration creates users table and wipes user-keyed data"
```

---

## Task 5: JWT helper module

**Files:**

- Create: `apps/api/src/auth/jwt.ts`
- Test: `apps/api/src/auth/jwt.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `apps/api/src/auth/jwt.test.ts`:

```ts
import { describe, test, expect, beforeAll } from 'bun:test';
import { signAppJwt, verifyAppJwt } from './jwt';

beforeAll(() => {
  process.env.JWT_SECRET = 'test-jwt-secret-must-be-at-least-32-chars-long';
});

describe('jwt helpers', () => {
  test('signs and verifies a token round-trip', async () => {
    const token = await signAppJwt({
      sub: 'user-1',
      email: 'a@example.com',
      username: 'alice',
    });
    const payload = await verifyAppJwt(token);
    expect(payload.sub).toBe('user-1');
    expect(payload.email).toBe('a@example.com');
    expect(payload.username).toBe('alice');
  });

  test('rejects a malformed token', async () => {
    await expect(verifyAppJwt('not-a-jwt')).rejects.toThrow();
  });

  test('rejects a token signed with the wrong secret', async () => {
    const token = await signAppJwt({
      sub: 'user-2',
      email: 'b@example.com',
      username: 'bob',
    });
    const originalSecret = process.env.JWT_SECRET;
    process.env.JWT_SECRET = 'different-secret-32-chars-aaaaaaaa';
    await expect(verifyAppJwt(token)).rejects.toThrow();
    process.env.JWT_SECRET = originalSecret;
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/auth/jwt.test.ts`
Expected: FAIL — `signAppJwt` / `verifyAppJwt` not found.

- [ ] **Step 3: Implement the module**

Create `apps/api/src/auth/jwt.ts`:

```ts
import { SignJWT, jwtVerify } from 'jose';
import { env } from '../env';

export interface AppJwtPayload {
  sub: string;
  email: string;
  username: string;
}

function getSecretKey(secretOverride?: string): Uint8Array {
  const secret = secretOverride ?? env.JWT_SECRET ?? process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET is not configured');
  }
  return new TextEncoder().encode(secret);
}

export async function signAppJwt(
  payload: AppJwtPayload,
  options?: { expiresIn?: string; secret?: string }
): Promise<string> {
  const expiresIn = options?.expiresIn ?? '7d';
  return await new SignJWT({
    email: payload.email,
    username: payload.username,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(payload.sub)
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(getSecretKey(options?.secret));
}

export async function verifyAppJwt(
  token: string,
  options?: { secret?: string }
): Promise<AppJwtPayload> {
  const { payload } = await jwtVerify(token, getSecretKey(options?.secret), {
    algorithms: ['HS256'],
  });
  if (
    typeof payload.sub !== 'string' ||
    typeof payload.email !== 'string' ||
    typeof payload.username !== 'string'
  ) {
    throw new Error('Invalid app JWT payload');
  }
  return {
    sub: payload.sub,
    email: payload.email,
    username: payload.username,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test src/auth/jwt.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/auth/jwt.ts src/auth/jwt.test.ts
git commit -m "feat(api): add HS256 JWT helpers"
```

---

## Task 6: Google ID token verifier

**Files:**

- Create: `apps/api/src/auth/google.ts`
- Test: `apps/api/src/auth/google.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `apps/api/src/auth/google.test.ts`:

```ts
import {
  describe,
  test,
  expect,
  beforeAll,
  beforeEach,
  afterEach,
  mock,
} from 'bun:test';
import * as jose from 'jose';
import { verifyGoogleIdToken } from './google';

const CLIENT_ID = 'test-google-client-id.apps.googleusercontent.com';

beforeAll(() => {
  process.env.GOOGLE_CLIENT_ID = CLIENT_ID;
});

let restore: (() => void) | null = null;

afterEach(() => {
  restore?.();
  restore = null;
});

function stubJwtVerify(payload: jose.JWTPayload) {
  const original = jose.jwtVerify;
  // @ts-expect-error monkey-patch for test
  jose.jwtVerify = mock(async () => ({
    payload,
    protectedHeader: { alg: 'RS256' as const },
  }));
  restore = () => {
    // @ts-expect-error restoring
    jose.jwtVerify = original;
  };
}

describe('verifyGoogleIdToken', () => {
  test('returns claims for a valid token', async () => {
    stubJwtVerify({
      iss: 'https://accounts.google.com',
      aud: CLIENT_ID,
      sub: 'google-uid-1',
      email: 'a@example.com',
      email_verified: true,
      name: 'Alice',
      picture: 'https://example.com/a.png',
      exp: Math.floor(Date.now() / 1000) + 3600,
    });
    const claims = await verifyGoogleIdToken('fake-token');
    expect(claims.sub).toBe('google-uid-1');
    expect(claims.email).toBe('a@example.com');
    expect(claims.name).toBe('Alice');
    expect(claims.picture).toBe('https://example.com/a.png');
  });

  test('rejects unverified email', async () => {
    stubJwtVerify({
      iss: 'https://accounts.google.com',
      aud: CLIENT_ID,
      sub: 'google-uid-2',
      email: 'b@example.com',
      email_verified: false,
      exp: Math.floor(Date.now() / 1000) + 3600,
    });
    await expect(verifyGoogleIdToken('fake-token')).rejects.toThrow(/email/i);
  });

  test('rejects wrong audience', async () => {
    stubJwtVerify({
      iss: 'https://accounts.google.com',
      aud: 'someone-else.apps.googleusercontent.com',
      sub: 'google-uid-3',
      email: 'c@example.com',
      email_verified: true,
      exp: Math.floor(Date.now() / 1000) + 3600,
    });
    await expect(verifyGoogleIdToken('fake-token')).rejects.toThrow(
      /audience/i
    );
  });

  test('rejects wrong issuer', async () => {
    stubJwtVerify({
      iss: 'https://evil.example.com',
      aud: CLIENT_ID,
      sub: 'google-uid-4',
      email: 'd@example.com',
      email_verified: true,
      exp: Math.floor(Date.now() / 1000) + 3600,
    });
    await expect(verifyGoogleIdToken('fake-token')).rejects.toThrow(/issuer/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/auth/google.test.ts`
Expected: FAIL — `verifyGoogleIdToken` not found.

- [ ] **Step 3: Implement the module**

Create `apps/api/src/auth/google.ts`:

```ts
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { env } from '../env';

const GOOGLE_JWKS_URL = 'https://www.googleapis.com/oauth2/v3/certs';
const VALID_ISSUERS = new Set([
  'accounts.google.com',
  'https://accounts.google.com',
]);

let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;

function getJwks(): ReturnType<typeof createRemoteJWKSet> {
  if (!jwks) {
    jwks = createRemoteJWKSet(new URL(GOOGLE_JWKS_URL));
  }
  return jwks;
}

export interface GoogleClaims {
  sub: string;
  email: string;
  emailVerified: boolean;
  name?: string;
  picture?: string;
}

export async function verifyGoogleIdToken(
  idToken: string,
  options?: { clientId?: string }
): Promise<GoogleClaims> {
  const audience =
    options?.clientId ?? env.GOOGLE_CLIENT_ID ?? process.env.GOOGLE_CLIENT_ID;
  if (!audience) {
    throw new Error('GOOGLE_CLIENT_ID is not configured');
  }

  const { payload } = await jwtVerify(idToken, getJwks(), {
    algorithms: ['RS256'],
  });

  if (typeof payload.iss !== 'string' || !VALID_ISSUERS.has(payload.iss)) {
    throw new Error('Invalid token issuer');
  }
  if (payload.aud !== audience) {
    throw new Error('Invalid token audience');
  }
  if (typeof payload.sub !== 'string') {
    throw new Error('Invalid token subject');
  }
  if (typeof payload.email !== 'string') {
    throw new Error('Token missing email');
  }
  if (payload.email_verified !== true) {
    throw new Error('Email not verified with Google');
  }

  return {
    sub: payload.sub,
    email: payload.email,
    emailVerified: true,
    name: typeof payload.name === 'string' ? payload.name : undefined,
    picture: typeof payload.picture === 'string' ? payload.picture : undefined,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test src/auth/google.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/auth/google.ts src/auth/google.test.ts
git commit -m "feat(api): add google id token verifier with jwks"
```

---

## Task 7: User upsert and username derivation

**Files:**

- Create: `apps/api/src/auth/users.ts`
- Test: `apps/api/src/auth/users.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `apps/api/src/auth/users.test.ts`:

```ts
import { describe, test, expect, beforeEach } from 'bun:test';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/auth/users.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the module**

Create `apps/api/src/auth/users.ts`:

```ts
import { eq } from 'drizzle-orm';
import { users, type User } from '../db/schema';

type AnyDb = {
  select: (...args: unknown[]) => {
    from: (table: typeof users) => {
      where: (...args: unknown[]) => { get: () => User | undefined };
    };
  };
  insert: (table: typeof users) => {
    values: (v: typeof users.$inferInsert) => { returning: () => User[] };
  };
  update: (table: typeof users) => {
    set: (v: Partial<typeof users.$inferInsert>) => {
      where: (...args: unknown[]) => { returning: () => User[] };
    };
  };
};

const USERNAME_PATTERN = /[^a-z0-9_-]+/g;
const MAX_USERNAME_LEN = 30;
const MIN_USERNAME_LEN = 3;
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
  let base = slugify(prefix);
  if (base.length < MIN_USERNAME_LEN) {
    base = `user_${base}`.slice(0, MAX_USERNAME_LEN);
  }

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
    return updated[0];
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

  return inserted[0];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test src/auth/users.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/auth/users.ts src/auth/users.test.ts
git commit -m "feat(api): add user upsert and username derivation"
```

---

## Task 8: Rewrite `authMiddleware`

**Files:**

- Modify: `apps/api/src/auth/middleware.ts`
- Replace: `apps/api/src/auth/middleware.test.ts`

- [ ] **Step 1: Replace the middleware tests**

Replace `apps/api/src/auth/middleware.test.ts` contents:

```ts
import { describe, test, expect, beforeAll } from 'bun:test';
import { Hono } from 'hono';
import { authMiddleware, getUser } from './middleware';
import { signAppJwt } from './jwt';

beforeAll(() => {
  process.env.JWT_SECRET = 'test-jwt-secret-must-be-at-least-32-chars-long';
});

function makeApp() {
  const app = new Hono();
  app.use('*', authMiddleware);
  app.get('/me', c => {
    const u = getUser(c);
    return c.json(u);
  });
  return app;
}

describe('authMiddleware', () => {
  test('rejects missing header', async () => {
    const app = makeApp();
    const res = await app.request('/me');
    expect(res.status).toBe(401);
  });

  test('rejects malformed header', async () => {
    const app = makeApp();
    const res = await app.request('/me', {
      headers: { authorization: 'NotBearer foo' },
    });
    expect(res.status).toBe(401);
  });

  test('rejects garbage token', async () => {
    const app = makeApp();
    const res = await app.request('/me', {
      headers: { authorization: 'Bearer not-a-jwt' },
    });
    expect(res.status).toBe(401);
  });

  test('accepts a valid app JWT', async () => {
    const token = await signAppJwt({
      sub: 'user-uuid-1',
      email: 'valid@example.com',
      username: 'valid',
    });
    const app = makeApp();
    const res = await app.request('/me', {
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.userId).toBe('user-uuid-1');
    expect(body.email).toBe('valid@example.com');
  });

  test('rejects a token signed with the wrong secret', async () => {
    const token = await signAppJwt(
      { sub: 'u', email: 'x@example.com', username: 'x' },
      { secret: 'different-secret-32-chars-aaaaaaaa' }
    );
    const app = makeApp();
    const res = await app.request('/me', {
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(401);
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

Run: `bun test src/auth/middleware.test.ts`
Expected: FAIL — middleware still calls Supabase.

- [ ] **Step 3: Rewrite the middleware**

Replace the contents of `apps/api/src/auth/middleware.ts`:

```ts
import type { Context, Next } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { extractBearerToken } from './utils';
import { verifyAppJwt } from './jwt';

interface AuthUser {
  userId: string;
  email?: string;
  username?: string;
}

export async function authMiddleware(c: Context, next: Next) {
  try {
    const authHeader = c.req.header('authorization') || '';
    const token = extractBearerToken(authHeader);

    if (!token) {
      throw new HTTPException(401, {
        message: 'Unauthorized: Missing access token',
      });
    }

    let payload;
    try {
      payload = await verifyAppJwt(token);
    } catch {
      throw new HTTPException(401, {
        message: 'Unauthorized: Invalid or expired token',
      });
    }

    c.set('user', {
      userId: payload.sub,
      email: payload.email,
      username: payload.username,
    });
    await next();
  } catch (error) {
    if (error instanceof HTTPException) {
      throw error;
    }
    console.error('authMiddleware unexpected error:', error);
    throw new HTTPException(500, { message: 'Internal server error' });
  }
}

export function getUser(c: Context): AuthUser {
  return c.get('user') as AuthUser;
}
```

- [ ] **Step 4: Run tests**

Run: `bun test src/auth/middleware.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/auth/middleware.ts src/auth/middleware.test.ts
git commit -m "refactor(api): authMiddleware verifies HS256 app JWT"
```

---

## Task 9: Rewrite auth routes

**Files:**

- Replace: `apps/api/src/routes/auth.ts`
- Replace: `apps/api/src/routes/auth.test.ts`

- [ ] **Step 1: Replace the route tests**

Replace `apps/api/src/routes/auth.test.ts` contents:

```ts
import { describe, test, expect, beforeAll, mock } from 'bun:test';
import { Hono } from 'hono';
import * as googleModule from '../auth/google';
import * as usersModule from '../auth/users';
import authRoutes from './auth';
import { signAppJwt } from '../auth/jwt';

beforeAll(() => {
  process.env.JWT_SECRET = 'test-jwt-secret-must-be-at-least-32-chars-long';
  process.env.GOOGLE_CLIENT_ID =
    'test-google-client-id.apps.googleusercontent.com';
});

function mountAuth() {
  const app = new Hono();
  app.route('/auth', authRoutes);
  return app;
}

describe('POST /auth/google', () => {
  test('returns access_token for valid google id token', async () => {
    // @ts-expect-error mocking
    googleModule.verifyGoogleIdToken = mock(async () => ({
      sub: 'google-1',
      email: 'alice@example.com',
      emailVerified: true,
      name: 'Alice',
      picture: 'https://example.com/a.png',
    }));
    // @ts-expect-error mocking
    usersModule.upsertGoogleUser = mock(async () => ({
      id: 'user-uuid-1',
      googleSub: 'google-1',
      email: 'alice@example.com',
      username: 'alice',
      name: 'Alice',
      picture: 'https://example.com/a.png',
      createdAt: new Date(),
      updatedAt: new Date(),
    }));

    const app = mountAuth();
    const res = await app.request('/auth/google', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id_token: 'fake-google-token' }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(typeof body.access_token).toBe('string');
    expect(body.user.username).toBe('alice');
    expect(body.user.email).toBe('alice@example.com');
  });

  test('returns 401 on invalid google token', async () => {
    // @ts-expect-error mocking
    googleModule.verifyGoogleIdToken = mock(async () => {
      throw new Error('Invalid token audience');
    });
    const app = mountAuth();
    const res = await app.request('/auth/google', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id_token: 'bad' }),
    });
    expect(res.status).toBe(401);
  });

  test('returns 400 when id_token missing', async () => {
    const app = mountAuth();
    const res = await app.request('/auth/google', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
  });
});

describe('GET /auth/session', () => {
  test('returns user for valid token', async () => {
    const token = await signAppJwt({
      sub: 'user-uuid-1',
      email: 'alice@example.com',
      username: 'alice',
    });
    // /session reads from the JWT payload (no DB lookup needed)
    const app = mountAuth();
    const res = await app.request('/auth/session', {
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.user.id).toBe('user-uuid-1');
    expect(body.user.username).toBe('alice');
  });

  test('returns 401 for missing token', async () => {
    const app = mountAuth();
    const res = await app.request('/auth/session');
    expect(res.status).toBe(401);
  });
});

describe('POST /auth/logout', () => {
  test('returns 200 even without token (stateless)', async () => {
    const app = mountAuth();
    const res = await app.request('/auth/logout', { method: 'POST' });
    expect(res.status).toBe(200);
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

Run: `bun test src/routes/auth.test.ts`
Expected: FAIL — routes don't exist or shape is wrong.

- [ ] **Step 3: Rewrite the auth routes**

Replace `apps/api/src/routes/auth.ts` contents:

```ts
import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { HTTPException } from 'hono/http-exception';
import * as googleModule from '../auth/google';
import * as usersModule from '../auth/users';
import { signAppJwt } from '../auth/jwt';
import { authMiddleware, getUser } from '../auth/middleware';
import { logger } from '../logger';

const app = new Hono();

const googleSchema = z.object({
  id_token: z.string().min(10),
});

app.post('/google', zValidator('json', googleSchema), async c => {
  try {
    const { id_token } = c.req.valid('json');

    let claims;
    try {
      claims = await googleModule.verifyGoogleIdToken(id_token);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Invalid Google token';
      const isEmailUnverified =
        /email/i.test(message) && /verif/i.test(message);
      return c.json(
        {
          error: isEmailUnverified
            ? 'Email not verified with Google'
            : 'Invalid Google token',
        },
        401
      );
    }

    // db is provided via context binding in production; tests stub upsertGoogleUser
    // so the db value is unused there.
    const db = (c.get('db') as unknown) ?? null;

    const user = await usersModule.upsertGoogleUser(db, {
      sub: claims.sub,
      email: claims.email,
      emailVerified: claims.emailVerified,
      name: claims.name,
      picture: claims.picture,
    });

    const access_token = await signAppJwt({
      sub: user.id,
      email: user.email,
      username: user.username,
    });

    return c.json({
      access_token,
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        name: user.name,
        picture: user.picture,
      },
    });
  } catch (error) {
    if (error instanceof HTTPException) throw error;
    logger.error('auth/google error', { error });
    return c.json({ error: 'Internal server error' }, 500);
  }
});

app.post('/logout', async c => c.json({ message: 'Logged out' }));

app.get('/session', authMiddleware, async c => {
  const u = getUser(c);
  return c.json({
    user: {
      id: u.userId,
      email: u.email,
      username: u.username,
    },
  });
});

export default app;
```

- [ ] **Step 4: Run tests to verify pass**

Run: `bun test src/routes/auth.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/routes/auth.ts src/routes/auth.test.ts
git commit -m "refactor(api): replace auth routes with google sign-in"
```

---

## Task 10: Delete deprecated API auth files

**Files:**

- Delete: `apps/api/src/auth/supabase.ts`
- Delete: `apps/api/src/auth/supabase.test.ts`
- Delete: `apps/api/src/auth/rate-limit.ts`
- Delete: `apps/api/src/auth/rate-limit.test.ts`
- Delete: `apps/api/src/auth/rate-limit.cleanup.test.ts`
- Delete: `apps/api/src/auth/rate-limit-cleanup.test.ts`
- Delete: `apps/api/src/routes/auth.register-rate-limit.test.ts`
- Delete: `apps/api/src/routes/auth.coverage.test.ts`
- Modify: `apps/api/src/auth/utils.ts`
- Modify: `apps/api/src/auth/utils.test.ts`

- [ ] **Step 1: Delete the files**

Run (from `apps/api`):

```bash
rm src/auth/supabase.ts src/auth/supabase.test.ts \
   src/auth/rate-limit.ts src/auth/rate-limit.test.ts \
   src/auth/rate-limit.cleanup.test.ts src/auth/rate-limit-cleanup.test.ts \
   src/routes/auth.register-rate-limit.test.ts \
   src/routes/auth.coverage.test.ts
```

- [ ] **Step 2: Trim utils.ts**

Replace `apps/api/src/auth/utils.ts` contents:

```ts
export function extractBearerToken(header: string): string | null {
  const trimmed = header.trim();
  if (!trimmed) return null;

  const parts = trimmed.split(/\s+/);
  if (parts.length !== 2) return null;

  const scheme = parts[0];
  const value = parts[1];
  if (!scheme || !value) return null;
  if (scheme.toLowerCase() !== 'bearer') return null;
  return value;
}
```

- [ ] **Step 3: Trim utils.test.ts**

Open `apps/api/src/auth/utils.test.ts` and delete any `describe('isUsernameUniqueConstraintError'…)` block and its imports of `isUsernameUniqueConstraintError`. Keep the `extractBearerToken` tests intact.

- [ ] **Step 4: Run the full API test suite**

Run: `bun test`
Expected: all remaining tests pass. If anything imports deleted modules, fix imports.

- [ ] **Step 5: Commit**

```bash
git add -A src/auth src/routes
git commit -m "chore(api): drop supabase client, rate-limit, and dead auth tests"
```

---

## Task 11: Wire DB into auth route context

**Files:**

- Modify: `apps/api/src/index.ts`
- Modify: `apps/api/src/worker.ts`

The auth route reads `c.get('db')` for the upsert. Both entry points must set it.

- [ ] **Step 1: Inspect current `index.ts` setup**

Run: `grep -n "db\|c.set" src/index.ts`

If a DB instance is already created (e.g. via `getDb()` or similar) and middleware sets it on context, you can skip. Otherwise add middleware near the top:

```ts
import { getLocalDb } from './db/client'; // adjust import to actual path

app.use('*', async (c, next) => {
  c.set('db', getLocalDb());
  await next();
});
```

- [ ] **Step 2: Same for `worker.ts`**

Run: `grep -n "db\|c.set\|env.DB" src/worker.ts`

For Workers, the binding is `c.env.DB`. Add or confirm:

```ts
import { drizzle } from 'drizzle-orm/d1';

app.use('*', async (c, next) => {
  c.set('db', drizzle(c.env.DB));
  await next();
});
```

(Use whichever import the codebase already uses for D1.)

- [ ] **Step 3: Type-check**

Run: `bun run lint`
Expected: no errors.

- [ ] **Step 4: Smoke-test the local server**

Run: `bun run dev` in one terminal. In another:

```bash
curl -s http://localhost:3501/health
```

Expected: 200 / `{ status: 'ok' }` (or whatever the health route returns).

- [ ] **Step 5: Commit**

```bash
git add src/index.ts src/worker.ts
git commit -m "feat(api): inject db into hono context for auth routes"
```

---

## Task 12: Update web env config

**Files:**

- Modify: `apps/web/src/lib/env.ts`
- Modify: `apps/web/.env.example` (create if missing)

- [ ] **Step 1: Replace env config**

Replace `apps/web/src/lib/env.ts`:

```ts
/**
 * Centralized environment configuration for web app
 */

interface EnvConfig {
  PUBLIC_API_URL: string;
  PUBLIC_GOOGLE_CLIENT_ID: string;
}

const API_FALLBACK_BASE_URL = import.meta.env.DEV
  ? 'http://localhost:3501/api'
  : '/api';

const normalizeEnvValue = (value: unknown): string => {
  if (typeof value !== 'string') return '';
  return value.trim().replace(/^["']+|["']+$/g, '');
};

const PUBLIC_API_URL =
  normalizeEnvValue(import.meta.env.PUBLIC_API_URL) || API_FALLBACK_BASE_URL;
const PUBLIC_GOOGLE_CLIENT_ID = normalizeEnvValue(
  import.meta.env.PUBLIC_GOOGLE_CLIENT_ID
);

if (import.meta.env.PROD) {
  if (PUBLIC_API_URL.includes('localhost')) {
    // eslint-disable-next-line no-console
    console.warn('PUBLIC_API_URL points at localhost in production build.');
  }
  if (!PUBLIC_GOOGLE_CLIENT_ID) {
    // eslint-disable-next-line no-console
    console.error('PUBLIC_GOOGLE_CLIENT_ID is required in production.');
  }
}

export const env: EnvConfig = {
  PUBLIC_API_URL,
  PUBLIC_GOOGLE_CLIENT_ID,
};
```

- [ ] **Step 2: Update `.env.example`**

Edit `apps/web/.env.example` (create if missing):

```env
PUBLIC_API_URL=http://localhost:3501/api
PUBLIC_GOOGLE_CLIENT_ID=your-google-client-id.apps.googleusercontent.com
```

Remove `PUBLIC_SUPABASE_URL` and `PUBLIC_SUPABASE_ANON_KEY` if present.

- [ ] **Step 3: Lint**

Run (from `apps/web`): `bun run lint`
Expected: errors only in files that still use Supabase — fixed in later tasks.

- [ ] **Step 4: Commit**

```bash
git add src/lib/env.ts .env.example
git commit -m "chore(web): swap public supabase env for google client id"
```

---

## Task 13: Remove web Supabase packages

**Files:**

- Modify: `apps/web/package.json`

- [ ] **Step 1: Uninstall**

Run (from `apps/web`):

```bash
bun remove @supabase/supabase-js @supabase/ssr
```

- [ ] **Step 2: Verify**

Run: `grep supabase package.json` — expect no matches.

- [ ] **Step 3: Commit**

```bash
git add package.json bun.lock
git commit -m "chore(web): remove supabase packages"
```

---

## Task 14: Rewrite `auth-helpers.ts` and add fetch helpers

**Files:**

- Replace: `apps/web/src/lib/auth-helpers.ts`
- Update: `apps/web/src/lib/auth.extra.test.ts` (remove or trim sections that reference Supabase mappers)

- [ ] **Step 1: Replace `auth-helpers.ts`**

```ts
export type AuthUser = {
  id: string;
  email: string;
  username: string;
  name?: string | null;
  picture?: string | null;
};

export type GoogleLoginResult =
  | { success: true; user: AuthUser; accessToken: string }
  | { success: false; error: string };

export function resolveApiBaseUrl(publicApiUrl: string | undefined): string {
  const base = publicApiUrl || '/api';
  return base.replace(/\/$/, '') || '/api';
}

export function parseGoogleLoginBody(
  status: number,
  bodyText: string
): GoogleLoginResult {
  if (status < 200 || status >= 300) {
    let data: { error?: string } = {};
    try {
      data = JSON.parse(bodyText) as typeof data;
    } catch {
      // ignore
    }
    return {
      success: false,
      error: data.error || bodyText || 'Sign-in failed',
    };
  }
  let data: { access_token?: string; user?: AuthUser } = {};
  try {
    data = JSON.parse(bodyText) as typeof data;
  } catch {
    return { success: false, error: 'Unexpected response from server.' };
  }
  if (!data.access_token || !data.user) {
    return { success: false, error: 'Unexpected response from server.' };
  }
  return {
    success: true,
    user: data.user,
    accessToken: data.access_token,
  };
}

export const ACCESS_TOKEN_KEY = 'procyon_access_token';
```

- [ ] **Step 2: Trim `auth.extra.test.ts`**

Open `apps/web/src/lib/auth.extra.test.ts`. Delete any imports of and tests for `mapSupabaseUser`, `parseLoginBodyText`, `parseRegisterBodyText`. If the file becomes empty, delete it: `rm src/lib/auth.extra.test.ts`.

- [ ] **Step 3: Commit**

```bash
git add src/lib/auth-helpers.ts src/lib/auth.extra.test.ts
git commit -m "refactor(web): replace auth-helpers with google login shape"
```

---

## Task 15: Rewrite `useAuth` hook

**Files:**

- Replace: `apps/web/src/lib/auth.ts`
- Update or delete: `apps/web/src/lib/auth.test.ts`

- [ ] **Step 1: Replace `auth.test.ts` with tests for the new hook**

Replace `apps/web/src/lib/auth.test.ts`:

```ts
import { describe, test, expect, beforeEach, afterEach, mock } from 'bun:test';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useAuth } from './auth';
import { ACCESS_TOKEN_KEY } from './auth-helpers';

const mockUser = {
  id: 'user-1',
  email: 'a@example.com',
  username: 'alice',
  name: 'Alice',
  picture: null,
};

beforeEach(() => {
  globalThis.localStorage.clear();
});

afterEach(() => {
  // @ts-expect-error restore
  globalThis.fetch = undefined;
});

function mockFetch(handler: (url: string, init?: RequestInit) => Response) {
  globalThis.fetch = mock(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();
      return handler(url, init);
    }
  ) as typeof fetch;
}

describe('useAuth', () => {
  test('starts unauthenticated when no token', async () => {
    mockFetch(() => new Response('{}', { status: 200 }));
    const { result } = renderHook(() => useAuth());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.user).toBeNull();
    expect(result.current.isAuthenticated).toBe(false);
  });

  test('hydrates from /session when token present', async () => {
    localStorage.setItem(ACCESS_TOKEN_KEY, 'fake-token');
    mockFetch(url => {
      if (url.endsWith('/auth/session')) {
        return new Response(JSON.stringify({ user: mockUser }), {
          status: 200,
        });
      }
      return new Response('not-found', { status: 404 });
    });
    const { result } = renderHook(() => useAuth());
    await waitFor(() => expect(result.current.user?.username).toBe('alice'));
    expect(result.current.isAuthenticated).toBe(true);
  });

  test('signInWithGoogle stores token and sets user', async () => {
    mockFetch(url => {
      if (url.endsWith('/auth/google')) {
        return new Response(
          JSON.stringify({ access_token: 'new-token', user: mockUser }),
          { status: 200 }
        );
      }
      return new Response('{}', { status: 200 });
    });
    const { result } = renderHook(() => useAuth());
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => {
      const r = await result.current.signInWithGoogle('google-id-token');
      expect(r.success).toBe(true);
    });
    expect(localStorage.getItem(ACCESS_TOKEN_KEY)).toBe('new-token');
    expect(result.current.user?.username).toBe('alice');
  });

  test('logout clears storage and user', async () => {
    localStorage.setItem(ACCESS_TOKEN_KEY, 'fake-token');
    mockFetch(url => {
      if (url.endsWith('/auth/session')) {
        return new Response(JSON.stringify({ user: mockUser }), {
          status: 200,
        });
      }
      return new Response('{}', { status: 200 });
    });
    const { result } = renderHook(() => useAuth());
    await waitFor(() => expect(result.current.user?.username).toBe('alice'));
    await act(async () => {
      await result.current.logout();
    });
    expect(localStorage.getItem(ACCESS_TOKEN_KEY)).toBeNull();
    expect(result.current.user).toBeNull();
  });
});
```

If `@testing-library/react` is not already installed, use whatever the project already uses for hook tests (check existing `auth.test.ts` first and follow the same import style). If the project does not have a React testing library set up, simplify the tests to direct calls of the exported helpers rather than `renderHook`.

- [ ] **Step 2: Run to confirm failures**

Run (from `apps/web`): `bun test src/lib/auth.test.ts`
Expected: FAIL — current hook still uses Supabase.

- [ ] **Step 3: Replace `auth.ts`**

Replace `apps/web/src/lib/auth.ts`:

```ts
import { useCallback, useEffect, useState } from 'react';
import { env } from './env';
import {
  resolveApiBaseUrl,
  parseGoogleLoginBody,
  ACCESS_TOKEN_KEY,
  type AuthUser,
  type GoogleLoginResult,
} from './auth-helpers';

const API_BASE_URL = resolveApiBaseUrl(env.PUBLIC_API_URL);

function getStoredToken(): string | null {
  try {
    return globalThis.localStorage?.getItem(ACCESS_TOKEN_KEY) ?? null;
  } catch {
    return null;
  }
}

function setStoredToken(token: string | null): void {
  try {
    if (token) {
      globalThis.localStorage?.setItem(ACCESS_TOKEN_KEY, token);
    } else {
      globalThis.localStorage?.removeItem(ACCESS_TOKEN_KEY);
    }
  } catch {
    // ignore storage errors
  }
}

export async function getAuthHeaders(): Promise<Record<string, string>> {
  const token = getStoredToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function fetchSession(): Promise<AuthUser | null> {
  const headers = await getAuthHeaders();
  if (!headers.Authorization) return null;
  const res = await fetch(`${API_BASE_URL}/auth/session`, { headers });
  if (!res.ok) {
    if (res.status === 401) setStoredToken(null);
    return null;
  }
  const data = (await res.json()) as { user: AuthUser };
  return data.user;
}

async function postGoogleLogin(idToken: string): Promise<GoogleLoginResult> {
  const res = await fetch(`${API_BASE_URL}/auth/google`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id_token: idToken }),
  });
  const bodyText = await res.text();
  return parseGoogleLoginBody(res.status, bodyText);
}

async function postLogout(): Promise<void> {
  try {
    const headers = await getAuthHeaders();
    await fetch(`${API_BASE_URL}/auth/logout`, { method: 'POST', headers });
  } catch {
    // best-effort
  }
}

export function useAuth() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    fetchSession()
      .then(u => {
        if (mounted) setUser(u);
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, []);

  const signInWithGoogle = useCallback(
    async (idToken: string): Promise<GoogleLoginResult> => {
      const result = await postGoogleLogin(idToken);
      if (result.success) {
        setStoredToken(result.accessToken);
        setUser(result.user);
      }
      return result;
    },
    []
  );

  const logout = useCallback(async () => {
    await postLogout();
    setStoredToken(null);
    setUser(null);
  }, []);

  return {
    user,
    loading,
    signInWithGoogle,
    logout,
    isAuthenticated: !!user,
  };
}
```

- [ ] **Step 4: Run tests**

Run: `bun test src/lib/auth.test.ts`
Expected: PASS. If `renderHook` is unavailable, simplify the tests per the note in Step 1 and re-run.

- [ ] **Step 5: Commit**

```bash
git add src/lib/auth.ts src/lib/auth.test.ts
git commit -m "refactor(web): useAuth uses google sign-in + localStorage token"
```

---

## Task 16: Rewrite `LoginForm` with Google button

**Files:**

- Replace: `apps/web/src/components/LoginForm.tsx`

- [ ] **Step 1: Replace the component**

```tsx
import React, { useEffect, useRef, useState } from 'react';
import { useAuth } from '../lib/auth';
import { env } from '../lib/env';

interface GoogleCredentialResponse {
  credential: string;
}

declare global {
  interface Window {
    google?: {
      accounts?: {
        id?: {
          initialize: (config: {
            client_id: string;
            callback: (response: GoogleCredentialResponse) => void;
          }) => void;
          renderButton: (
            element: HTMLElement,
            options: Record<string, unknown>
          ) => void;
        };
      };
    };
  }
}

export function LoginForm() {
  const buttonRef = useRef<HTMLDivElement | null>(null);
  const [error, setError] = useState('');
  const [isHydrated, setIsHydrated] = useState(false);
  const { signInWithGoogle } = useAuth();

  useEffect(() => {
    setIsHydrated(true);
  }, []);

  useEffect(() => {
    if (!isHydrated || !buttonRef.current) return;
    const clientId = env.PUBLIC_GOOGLE_CLIENT_ID;
    if (!clientId) {
      setError('Google client ID is not configured.');
      return;
    }
    if (!window.google?.accounts?.id) {
      setError('Google sign-in script failed to load.');
      return;
    }
    window.google.accounts.id.initialize({
      client_id: clientId,
      callback: async response => {
        setError('');
        const result = await signInWithGoogle(response.credential);
        if (result.success) {
          window.location.href = '/';
        } else {
          setError(result.error || 'Sign-in failed');
        }
      },
    });
    window.google.accounts.id.renderButton(buttonRef.current, {
      theme: 'filled_black',
      size: 'large',
      shape: 'pill',
      text: 'signin_with',
      width: 320,
    });
  }, [isHydrated, signInWithGoogle]);

  return (
    <div
      className='w-full max-w-md mx-auto'
      data-testid='login-form'
      data-hydrated={isHydrated ? 'true' : 'false'}
    >
      <div className='bg-gradient-to-br from-purple-900/20 to-pink-900/20 backdrop-blur-lg border border-purple-500/30 shadow-2xl rounded-2xl p-8'>
        <div className='space-y-2 text-center mb-8'>
          <h1 className='text-3xl font-bold bg-gradient-to-r from-cyan-400 via-purple-400 to-pink-400 bg-clip-text text-transparent'>
            Sign In
          </h1>
          <p className='text-purple-200'>
            Sign in with your Google account to continue
          </p>
        </div>

        <div className='flex justify-center' ref={buttonRef} />

        {error && (
          <div className='mt-6 text-red-400 text-sm text-center bg-red-900/20 border border-red-500/30 rounded-lg p-3'>
            {error}
          </div>
        )}
      </div>
    </div>
  );
}

export default LoginForm;
```

- [ ] **Step 2: Lint**

Run: `bun run lint`
Expected: no errors in `LoginForm.tsx`.

- [ ] **Step 3: Commit**

```bash
git add src/components/LoginForm.tsx
git commit -m "refactor(web): LoginForm renders Google Identity button"
```

---

## Task 17: Load GIS script and clean up `login.astro`

**Files:**

- Modify: `apps/web/src/pages/login.astro`

- [ ] **Step 1: Add the GIS script**

Open `apps/web/src/pages/login.astro`. Inside `<Layout …>`, before the closing `</Layout>`, add:

```astro
<script is:inline src='https://accounts.google.com/gsi/client' async defer
></script>
```

Also remove the "Sign up" link / "Don't have an account?" footer if it's in this file (it's currently in `LoginForm`, which we already rewrote — so this is just visual cleanup of the surrounding page).

- [ ] **Step 2: Verify in dev**

(Manual; defer until Task 21 verification.) Just make sure the file parses.

- [ ] **Step 3: Commit**

```bash
git add src/pages/login.astro
git commit -m "feat(web): load Google Identity Services on login page"
```

---

## Task 18: Delete register page, register form, and Supabase client

**Files:**

- Delete: `apps/web/src/pages/register.astro`
- Delete: `apps/web/src/components/RegisterForm.tsx`
- Delete: `apps/web/src/lib/supabase.ts`

- [ ] **Step 1: Delete the files**

Run (from `apps/web`):

```bash
rm src/pages/register.astro \
   src/components/RegisterForm.tsx \
   src/lib/supabase.ts
```

- [ ] **Step 2: Find dangling imports**

Run: `grep -rn "RegisterForm\|/register\|supabase" src/ | grep -v node_modules`

For each match (e.g. a link to `/register` in another component): remove the link or replace with a link to `/login`.

- [ ] **Step 3: Lint and test**

Run: `bun run lint && bun test`
Expected: no errors, all tests pass.

- [ ] **Step 4: Commit**

```bash
git add -A src/
git commit -m "chore(web): remove register page, register form, supabase client"
```

---

## Task 19: Update E2E auth tests

**Files:**

- Replace: `apps/web/e2e/utils/auth-helpers.ts`
- Replace: `apps/web/e2e/auth.spec.ts`
- Delete: `apps/web/e2e/auth-basic.spec.ts` (or rewrite if it still has reusable coverage)

- [ ] **Step 1: Replace `e2e/utils/auth-helpers.ts`**

```ts
import type { Page } from '@playwright/test';

export interface TestUser {
  id: string;
  email: string;
  username: string;
}

export class AuthHelper {
  constructor(private page: Page) {}

  generateTestUser(): TestUser {
    const stamp = Date.now();
    return {
      id: `test-user-${stamp}`,
      email: `test-${stamp}@example.com`,
      username: `test_${stamp}`,
    };
  }

  /**
   * Mocks /api/auth/google so the GIS callback can be replaced
   * by directly invoking the API in tests.
   */
  async stubGoogleLogin(user: TestUser, accessToken = 'e2e-token') {
    await this.page.route('**/api/auth/google', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          access_token: accessToken,
          user: {
            id: user.id,
            email: user.email,
            username: user.username,
            name: user.username,
            picture: null,
          },
        }),
      });
    });
    await this.page.route('**/api/auth/session', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          user: {
            id: user.id,
            email: user.email,
            username: user.username,
          },
        }),
      });
    });
  }

  /**
   * Logs the user in by storing a token and reloading the page.
   * Use after stubGoogleLogin so /auth/session returns the mocked user.
   */
  async loginAsTestUser(user: TestUser, accessToken = 'e2e-token') {
    await this.stubGoogleLogin(user, accessToken);
    await this.page.addInitScript(token => {
      window.localStorage.setItem('procyon_access_token', token);
    }, accessToken);
    await this.page.goto('/');
  }
}
```

- [ ] **Step 2: Replace `auth.spec.ts`**

```ts
import { test, expect } from '@playwright/test';
import { AuthHelper } from './utils/auth-helpers';

test.describe('Google sign-in flow', () => {
  test('shows Google sign-in button on /login', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByTestId('login-form')).toBeVisible();
    // The GIS button is rendered as an iframe by Google's script; we just
    // assert the container is present.
    await expect(page.locator('[data-testid="login-form"]')).toContainText(
      'Sign in'
    );
  });

  test('shows authed UI after token is set', async ({ page }) => {
    const auth = new AuthHelper(page);
    const user = auth.generateTestUser();
    await auth.loginAsTestUser(user);
    await expect(page).toHaveURL(/\/$/);
    // AppNavBar/AuthNav should show username when authed
    await expect(page.locator('body')).toContainText(user.username);
  });

  test('logout clears the session', async ({ page }) => {
    const auth = new AuthHelper(page);
    const user = auth.generateTestUser();
    await auth.loginAsTestUser(user);
    await page.evaluate(() => {
      window.localStorage.removeItem('procyon_access_token');
    });
    await page.goto('/');
    // After clearing the token, the user should no longer be in the nav
    await expect(page.locator('body')).not.toContainText(user.username);
  });
});
```

- [ ] **Step 3: Delete the old basic spec if redundant**

Run: `rm apps/web/e2e/auth-basic.spec.ts`

(If it covers something not already covered, rewrite using the same `AuthHelper` pattern instead.)

- [ ] **Step 4: Run E2E**

Run (from repo root): `bun run test:e2e`
Expected: the new auth specs pass. Fix any selectors as needed (e.g. `getByTestId('login-form')` if your nav uses a different testid).

- [ ] **Step 5: Commit**

```bash
git add apps/web/e2e/
git commit -m "test(web): rewrite e2e auth specs for google sign-in"
```

---

## Task 20: Update docs and config notes

**Files:**

- Modify: `CLAUDE.md`
- Modify: `apps/api/wrangler.toml` (variables and secrets list)

- [ ] **Step 1: Update CLAUDE.md**

In `CLAUDE.md`, find the "Authentication Flow" section and the "API Server" section. Replace any mention of Supabase Auth/JWT with this paragraph:

```md
### Authentication Flow

Google sign-in is the only authentication method. The web app uses Google Identity Services (GIS) to obtain an ID token, which is POSTed to `/api/auth/google`. The API verifies the ID token against Google's JWKS (`jose`), upserts a row in the D1 `users` table keyed by `google_sub`, and returns an HS256 app JWT. The Bearer middleware (`apps/api/src/auth/middleware.ts`) verifies that JWT for protected routes.

User identity lives in D1 (`users` table). There are no separate Supabase tables.
```

In "Common Workflows → Adding API Endpoints", remove any mention of Supabase. In the "Key Dependencies" sections, remove `@supabase/*` packages and add `jose` to the API list.

- [ ] **Step 2: Update wrangler.toml**

In `apps/api/wrangler.toml`, remove any `SUPABASE_*` `[vars]` and add (or document via comment) the secrets to set:

```toml
# Required secrets, set with `wrangler secret put`:
#   GOOGLE_CLIENT_ID
#   JWT_SECRET
```

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md apps/api/wrangler.toml
git commit -m "docs: describe google-only auth flow and required secrets"
```

---

## Task 21: Final verification

- [ ] **Step 1: Run all unit tests**

Run (from repo root): `bun run lint`
Expected: clean across both apps.

Run: `cd apps/api && bun test`
Expected: all pass.

Run: `cd apps/web && bun test`
Expected: all pass.

- [ ] **Step 2: Run E2E**

Run (from repo root): `bun run test:e2e`
Expected: all pass.

- [ ] **Step 3: Manual smoke test**

In `apps/api/.env`, set `GOOGLE_CLIENT_ID` and `JWT_SECRET` to real values.
In `apps/web/.env`, set `PUBLIC_GOOGLE_CLIENT_ID` to the same client ID.

Start both servers:

```bash
bun run dev
```

Open `http://localhost:3500/login`. Click the Google button, complete sign-in.
Expected: redirected to `/`, nav shows your derived username.

Check `dev.db`:

```bash
sqlite3 apps/api/dev.db "SELECT id, email, username FROM users;"
```

Expected: one row with your Google email and a derived username.

- [ ] **Step 4: Deploy secrets to Cloudflare**

Run (from `apps/api`):

```bash
wrangler secret put GOOGLE_CLIENT_ID
wrangler secret put JWT_SECRET
# Remove old secrets after deploy verifies:
# wrangler secret delete SUPABASE_URL
# wrangler secret delete SUPABASE_ANON_KEY
# wrangler secret delete SUPABASE_SERVICE_ROLE_KEY
```

- [ ] **Step 5: Apply migration to D1**

Run: `bun run cf:d1:migrations:apply`
Expected: `0009_google_only_auth.sql` applies.

- [ ] **Step 6: Final commit (if any small fixes from verification)**

```bash
git add -A
git commit -m "chore: post-verification fixups"
```

---

## Self-Review (writer's notes)

- **Spec coverage:** All sections of `2026-05-22-google-only-auth-design.md` are covered: dependencies (T1, T13), users table + wipe migration (T3, T4), JWT helpers (T5), Google verifier (T6), upsert + username (T7), middleware (T8), routes (T9), endpoint behavior incl. errors (T9), env config (T2, T12), frontend hook (T15), login UI + GIS (T16, T17), file deletions (T10, T18), E2E (T19), docs + secrets + rollout (T20, T21).
- **No placeholders:** all code blocks are complete; no TBDs.
- **Open items the engineer must resolve in-flight:** (a) the exact D1/local-DB middleware shape in Task 11 — adapt to whatever pattern already exists, (b) the React hook test setup in Task 15 — if no testing-library is wired up, simplify to direct function tests, (c) selector specifics in Task 19 E2E tests may need adjusting to match the actual nav markup.
