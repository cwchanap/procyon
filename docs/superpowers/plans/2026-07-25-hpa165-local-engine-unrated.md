# HPA-165 Local-Engine Unrated — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make on-device engine (Stockfish) games unrated end-to-end — schema, API enforcement, client hook path, and history-page label — while leaving rated LLM behavior byte-for-byte unchanged.

**Architecture:** Add a third opponent type (`opponentEngineId`) to `play_history` as a nullable additive column. `POST /play-history` derives rated-ness from opponent kind (`llm` → rated, `engine` → unrated) and skips the rating service entirely for engine games, returning `ratingUpdate: null`. `usePlayHistory` gains an optional `OpponentDescriptor` so an engine game sends `opponentEngineId` and expects no rating; `PlayHistoryPage` renders engine rows with an "On-device rival" label and "Unrated" badge.

**Tech Stack:** Hono, Drizzle ORM (SQLite dev / Cloudflare D1), Zod, React 18 + `@testing-library/react`, TypeScript (strict), Bun test runner.

## Global Constraints

(From the approved design at `docs/superpowers/2026-07-25-hpa165-local-engine-unrated-design.md`. Every task implicitly includes these.)

- **Migration:** exactly ONE generated file in `apps/api/drizzle/` (next number `0010_*`). `wrangler.toml` sets `migrations_dir = "drizzle"`, so the same file feeds both `bun run db:migrate` (SQLite dev) and `bun run cf:d1:migrations:apply` (D1). Do NOT hand-write a second D1-specific file.
- **No DB-level `CHECK`** on `play_history`. The "exactly one opponent" invariant is three-way and enforced in route `superRefine` validation only.
- **Rating service signature is unchanged.** Engine games never reach `updatePlayerRating`; do not add an `opponentEngineId` parameter to it.
- **No backfill** of existing `play_history` rows (column is nullable; old rows get `NULL`).
- **Test runners:** API — `cd apps/api && bun test`; Web — `cd apps/web && bun test`.
- **Commit style:** Conventional Commits (e.g. `feat(api): ...`, `feat(web): ...`, `test(api): ...`). One commit per task unless a task says otherwise.
- **`aiPlayer` is mandatory for engine saves too** (it's "the non-human player's color"); never pass `aiPlayer: null` for an engine game.

---

## File Structure

**Create:**

- `apps/api/drizzle/0010_<auto>.sql` — generated additive migration (single file).
- `apps/web/src/lib/ai/opponent.ts` — renamed from `opponent-llm.ts`, adds `OpponentEngineId` + `OpponentDescriptor`.
- `apps/web/src/lib/ai/opponent.test.ts` — renamed from `opponent-llm.test.ts`.

**Delete:**

- `apps/web/src/lib/ai/opponent-llm.ts` (after creating `opponent.ts`).
- `apps/web/src/lib/ai/opponent-llm.test.ts` (after creating `opponent.test.ts`).

**Modify:**

- `apps/api/src/constants/game.ts` — `OpponentEngineId` enum + `ALL_OPPONENT_ENGINE_IDS`.
- `apps/api/src/constants/game.test.ts` — per-`ALL_*` test block for the new constant.
- `apps/api/src/db/schema.ts` — `opponentEngineId` column on `playHistory`.
- `apps/api/src/routes/play-history.ts` — request schema (3-way opponent), `getOpponentKind`, engine branch, `GET` column, logging.
- `apps/api/src/routes/play-history.test.ts` — engine unrated test block (table-driven win/loss/draw, 400 combos, GET round-trip).
- `apps/web/src/hooks/usePlayHistory.ts` — discriminated-union options, engine snapshot path, body construction.
- `apps/web/src/hooks/usePlayHistory.test.ts` — engine descriptor + 401-retry tests.
- `apps/web/src/components/PlayHistoryPage.tsx` — row type, `formatOpponent` engine branch, "Unrated" badge.

---

## Task 1: API — `OpponentEngineId` constant, schema column, migration, constants test

**Files:**

- Modify: `apps/api/src/constants/game.ts`
- Modify: `apps/api/src/db/schema.ts:59-77` (the `playHistory` table)
- Create: `apps/api/drizzle/0010_<auto>.sql` (via generator)
- Modify: `apps/api/src/constants/game.test.ts`
- Test: `apps/api/src/constants/game.test.ts`

**Interfaces:**

- Consumes: nothing (foundation task).
- Produces: `OpponentEngineId` enum (`Stockfish = 'stockfish'`), `ALL_OPPONENT_ENGINE_IDS` exported from `apps/api/src/constants/game.ts`; nullable `opponentEngineId` column on `playHistory`. Later tasks import these.

- [ ] **Step 1: Add the enum + ALL\_\* helper to constants**

In `apps/api/src/constants/game.ts`, after the `OpponentLlmId` enum block (lines 14-17), add:

```ts
export enum OpponentEngineId {
  Stockfish = 'stockfish',
}
```

And at the end of the file (after line 21), add:

```ts
export const ALL_OPPONENT_ENGINE_IDS = Object.values(OpponentEngineId);
```

- [ ] **Step 2: Add the column to the schema**

In `apps/api/src/db/schema.ts`, the `playHistory` table currently has these opponent columns (lines 68-69):

```ts
		opponentUserId: text('opponent_user_id').$type<string | null>(),
		opponentLlmId: text('opponent_llm_id').$type<OpponentLlmId | null>(),
```

Add the engine column immediately after `opponentLlmId`:

```ts
		opponentEngineId: text('opponent_engine_id').$type<OpponentEngineId | null>(),
```

The `OpponentEngineId` import already exists at the top of the file (line 12 imports from `'../constants/game'`) — extend that import line to include `OpponentEngineId`:

```ts
import {
  ChessVariantId,
  GameResultStatus,
  OpponentLlmId,
  OpponentEngineId,
} from '../constants/game';
```

- [ ] **Step 3: Generate the migration**

Run:

```bash
cd apps/api && bun run db:generate
```

Expected: a new file `apps/api/drizzle/0010_<random_name>.sql` is created. Open it and verify it contains exactly one additive statement and no table rebuild:

```sql
ALTER TABLE play_history ADD COLUMN opponent_engine_id TEXT;
```

If the generator emits a full `CREATE TABLE` rebuild instead, stop — that means the schema diff was not purely additive; re-check Step 2.

- [ ] **Step 4: Apply the migration to the local SQLite DB**

Run:

```bash
cd apps/api && bun run db:migrate
```

Expected: the migration applies cleanly (exit code 0). Do NOT create a second D1 file — `wrangler.toml`'s `migrations_dir = "drizzle"` means this same file is the D1 migration.

- [ ] **Step 5: Write the failing constants test**

In `apps/api/src/constants/game.test.ts`, extend the imports (lines 2-9) to include the new symbols:

```ts
import {
  ChessVariantId,
  GameResultStatus,
  OpponentLlmId,
  OpponentEngineId,
  ALL_CHESS_VARIANT_IDS,
  ALL_GAME_RESULT_STATUSES,
  ALL_OPPONENT_LLM_IDS,
  ALL_OPPONENT_ENGINE_IDS,
} from './game';
```

Add two new `describe` blocks at the end of the file (after line 87), mirroring the existing `ALL_OPPONENT_LLM_IDS` pattern:

```ts
describe('OpponentEngineId enum', () => {
  test('has the correct values', () => {
    expect(OpponentEngineId.Stockfish as string).toBe('stockfish');
  });

  test('has exactly 1 engine ID', () => {
    expect(Object.values(OpponentEngineId)).toHaveLength(1);
  });
});

describe('ALL_OPPONENT_ENGINE_IDS', () => {
  test('contains all opponent engine ID strings', () => {
    expect(ALL_OPPONENT_ENGINE_IDS).toContain(OpponentEngineId.Stockfish);
  });

  test('has the same length as OpponentEngineId enum', () => {
    expect(ALL_OPPONENT_ENGINE_IDS).toHaveLength(
      Object.values(OpponentEngineId).length
    );
  });
});
```

- [ ] **Step 6: Run the constants test**

Run:

```bash
cd apps/api && bun test src/constants/game.test.ts
```

Expected: PASS (all existing tests plus the 4 new ones).

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/constants/game.ts apps/api/src/constants/game.test.ts apps/api/src/db/schema.ts apps/api/drizzle/
git commit -m "feat(api): add OpponentEngineId enum and play_history.opponent_engine_id column"
```

---

## Task 2: API — route engine branch (POST unrated), GET column, tests

**Files:**

- Modify: `apps/api/src/routes/play-history.ts`
- Test: `apps/api/src/routes/play-history.test.ts`

**Interfaces:**

- Consumes: `OpponentEngineId` from Task 1; `updatePlayerRating` (unchanged) from `../services/rating-service`.
- Produces: `POST /play-history` accepts `opponentEngineId`, returns `ratingUpdate: null` for engine games and never calls the rating service; `GET /play-history` includes `opponentEngineId`; a route-local `getOpponentKind(body): 'engine' | 'llm'` helper.

- [ ] **Step 1: Write the failing route tests**

Open `apps/api/src/routes/play-history.test.ts`. Extend the top imports (currently `initializeDB` from `'../db'`) to also pull `getDB`, the two rating tables, and drizzle helpers:

```ts
import { initializeDB, getDB } from '../db';
import { playerRatings, ratingHistory } from '../db/schema';
import { and, eq } from 'drizzle-orm';
```

Add a new `describe` block at the end of the file (after line 434). It uses the same `mockSupabaseFetch`, `AUTH_HEADER`, `BASE_URL`, `CF_ENV`, and `initializeDB(undefined, { localDbPath: ':memory:', resetLocal: true })` patterns as the existing `'play-history routes - GET and POST success'` block:

```ts
describe('play-history routes - engine (unrated) games', () => {
  let restore: FetchMockRestore = () => {};
  let originalUrl: string | undefined;
  let originalAnonKey: string | undefined;

  beforeEach(() => {
    originalUrl = process.env.SUPABASE_URL;
    originalAnonKey = process.env.SUPABASE_ANON_KEY;
    process.env.SUPABASE_URL = SUPABASE_URL;
    process.env.SUPABASE_ANON_KEY = SUPABASE_ANON_KEY;
    restore = mockSupabaseFetch();
    initializeDB(undefined, { localDbPath: ':memory:', resetLocal: true });
  });

  afterEach(() => {
    restore();
    process.env.SUPABASE_URL = originalUrl;
    process.env.SUPABASE_ANON_KEY = originalAnonKey;
  });

  test.each(['win', 'loss', 'draw'] as const)(
    'POST / engine game (%s) leaves rating unchanged with no rating_history',
    async status => {
      const db = getDB();

      // 1. Establish a known rating via one rated LLM game.
      await playHistoryRoutes.request(
        `${BASE_URL}/`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...AUTH_HEADER },
          body: JSON.stringify({
            chessId: 'chess',
            status: 'win',
            date: new Date().toISOString(),
            opponentLlmId: 'gemini-2.5-flash',
          }),
        },
        CF_ENV
      );

      const [before] = await db
        .select()
        .from(playerRatings)
        .where(
          and(
            eq(playerRatings.userId, TEST_USER_ID),
            eq(playerRatings.variantId, 'chess')
          )
        );
      expect(before).toBeDefined();

      // 2. Submit the engine game.
      const res = await playHistoryRoutes.request(
        `${BASE_URL}/`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...AUTH_HEADER },
          body: JSON.stringify({
            chessId: 'chess',
            status,
            date: new Date().toISOString(),
            opponentEngineId: 'stockfish',
          }),
        },
        CF_ENV
      );
      expect(res.status).toBe(201);
      const body = (await res.json()) as {
        playHistory: {
          id: number;
          opponentEngineId: string | null;
          opponentLlmId: string | null;
        };
        ratingUpdate: { ratingChange: number } | null;
      };
      expect(body.ratingUpdate).toBeNull();
      expect(body.playHistory.opponentEngineId).toBe('stockfish');
      expect(body.playHistory.opponentLlmId).toBeNull();

      // 3. Rating row is byte-for-byte unchanged.
      const [after] = await db
        .select()
        .from(playerRatings)
        .where(
          and(
            eq(playerRatings.userId, TEST_USER_ID),
            eq(playerRatings.variantId, 'chess')
          )
        );
      expect(after).toEqual(before);

      // 4. No rating_history row for the engine game.
      const engineHistory = await db
        .select()
        .from(ratingHistory)
        .where(
          and(
            eq(ratingHistory.userId, TEST_USER_ID),
            eq(ratingHistory.playHistoryId, body.playHistory.id)
          )
        );
      expect(engineHistory).toHaveLength(0);
    }
  );

  test('POST / rejects engine + llm combination with 400', async () => {
    const res = await playHistoryRoutes.request(
      `${BASE_URL}/`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...AUTH_HEADER },
        body: JSON.stringify({
          chessId: 'chess',
          status: 'win',
          date: new Date().toISOString(),
          opponentEngineId: 'stockfish',
          opponentLlmId: 'gemini-2.5-flash',
        }),
      },
      CF_ENV
    );
    expect(res.status).toBe(400);
  });

  test('GET / returns engine row with opponentEngineId and null ratingChange', async () => {
    await playHistoryRoutes.request(
      `${BASE_URL}/`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...AUTH_HEADER },
        body: JSON.stringify({
          chessId: 'chess',
          status: 'win',
          date: new Date().toISOString(),
          opponentEngineId: 'stockfish',
        }),
      },
      CF_ENV
    );

    const getRes = await playHistoryRoutes.request(
      `${BASE_URL}/`,
      { headers: AUTH_HEADER },
      CF_ENV
    );
    expect(getRes.status).toBe(200);
    const body = (await getRes.json()) as {
      playHistory: Array<{
        opponentEngineId: string | null;
        ratingChange: number | null;
        newRating: number | null;
      }>;
    };
    expect(body.playHistory).toHaveLength(1);
    expect(body.playHistory[0]?.opponentEngineId).toBe('stockfish');
    expect(body.playHistory[0]?.ratingChange).toBeNull();
    expect(body.playHistory[0]?.newRating).toBeNull();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run:

```bash
cd apps/api && bun test src/routes/play-history.test.ts
```

Expected: the 3 parameterized engine cases FAIL (engine `POST` currently `400`s because `opponentEngineId` isn't accepted; or the response/row assertions fail), the `engine + llm` 400 may pass coincidentally, and the GET round-trip fails. The LLM regression tests in the same file must still PASS.

- [ ] **Step 3: Add `opponentEngineId` to the request schema + 3-way validation**

In `apps/api/src/routes/play-history.ts`, extend the constants import (line 8-12) to include `OpponentEngineId`:

```ts
import {
  ChessVariantId,
  GameResultStatus,
  OpponentLlmId,
  OpponentEngineId,
} from '../constants/game';
```

Replace the entire `createPlayHistorySchema` (lines 22-67) with a 3-way version. The validation messages now name all three opponent fields:

```ts
const createPlayHistorySchema = z
  .object({
    chessId: z.nativeEnum(ChessVariantId),
    status: z.nativeEnum(GameResultStatus),
    date: z.string().datetime(),
    // Accept both UUID strings and legacy numeric IDs for backward compatibility
    opponentUserId: z.union([z.string(), z.number()]).optional(),
    opponentLlmId: z.nativeEnum(OpponentLlmId).optional(),
    opponentEngineId: z.nativeEnum(OpponentEngineId).optional(),
  })
  .superRefine((data, ctx) => {
    const hasUserOpponent =
      typeof data.opponentUserId === 'string' ||
      typeof data.opponentUserId === 'number';
    const hasLlmOpponent = typeof data.opponentLlmId === 'string';
    const hasEngineOpponent = typeof data.opponentEngineId === 'string';

    const opponentCount = [
      hasUserOpponent,
      hasLlmOpponent,
      hasEngineOpponent,
    ].filter(Boolean).length;

    if (opponentCount === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          'Provide exactly one of opponentUserId, opponentLlmId, or opponentEngineId',
        path: ['opponentUserId'],
      });
    }

    if (opponentCount > 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          'Specify exactly one opponent type (opponentUserId, opponentLlmId, or opponentEngineId)',
        path: ['opponentUserId'],
      });
    }

    // Validate opponentUserId format (UUID or legacy numeric)
    if (hasUserOpponent && data.opponentUserId != null) {
      const opponentId = String(data.opponentUserId);
      const isUuid = UUID_REGEX.test(opponentId);
      const isNumeric = NUMERIC_ID_REGEX.test(opponentId);

      if (!isUuid && !isNumeric) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'opponentUserId must be a valid UUID string or numeric ID',
          path: ['opponentUserId'],
        });
      }
    }
  });
```

- [ ] **Step 4: Add the `getOpponentKind` route helper**

Add this helper near the top of `apps/api/src/routes/play-history.ts`, just above `const app = new Hono();` (line 15). It returns opponent **kind** (not ratedness); the route applies the `rated ⇔ kind !== 'engine'` derivation at the branch:

```ts
/**
 * Classify the opponent of a validated POST body. The superRefine guarantees
 * exactly one opponent is present, and opponentUserId direct submission is
 * 403'd before this is reached, so only 'engine' and 'llm' are live arms.
 */
function getOpponentKind(body: {
  opponentUserId?: string | number | null;
  opponentLlmId?: OpponentLlmId | null;
  opponentEngineId?: OpponentEngineId | null;
}): 'engine' | 'llm' {
  return body.opponentEngineId ? 'engine' : 'llm';
}
```

- [ ] **Step 5: Rewrite the POST handler to branch on kind (engine = unrated)**

Replace the entire POST handler (lines 104-192, from `app.post('/', authMiddleware, ...` through its closing `});`) with:

```ts
app.post(
  '/',
  authMiddleware,
  zValidator('json', createPlayHistorySchema),
  async c => {
    const user = getUser(c);
    const body = c.req.valid('json');

    try {
      if (body.opponentUserId != null) {
        return c.json(
          {
            error:
              'PvP match results cannot be submitted directly. PvP matches require server-side validation through the match completion endpoint or real-time game server.',
          },
          403
        );
      }

      const kind = getOpponentKind(body);
      const db = getDB();

      // Perform all database operations in a single transaction.
      const result = await db.transaction(async tx => {
        let savedRecord: PlayHistory | null = null;
        let ratingUpdate: {
          oldRating: number;
          newRating: number;
          ratingChange: number;
        } | null = null;

        // Single play-history record. opponentEngineId is set explicitly
        // (null for LLM games) to mirror the existing opponentUserId: null.
        const newPlayHistory: typeof playHistory.$inferInsert = {
          userId: user.userId,
          chessId: body.chessId,
          status: body.status,
          date: new Date(body.date).toISOString(),
          opponentUserId: null,
          opponentLlmId: body.opponentLlmId ?? null,
          opponentEngineId: body.opponentEngineId ?? null,
        };

        const [record] = await tx
          .insert(playHistory)
          .values(newPlayHistory)
          .returning();

        if (!record) {
          throw new Error('Failed to create play history record');
        }

        savedRecord = record as PlayHistory;

        // Engine games are unrated: never touch the rating service.
        // Only the LLM path updates rating (rated ⇔ kind !== 'engine').
        if (kind === 'llm') {
          const ratingResult = await updatePlayerRating(
            {
              userId: user.userId,
              variantId: body.chessId,
              playHistoryId: record.id,
              gameResult: body.status,
              opponentLlmId: body.opponentLlmId ?? null,
              opponentUserId: null,
            },
            tx
          );
          ratingUpdate = {
            oldRating: ratingResult.oldRating,
            newRating: ratingResult.newRating,
            ratingChange: ratingResult.ratingChange,
          };
        }

        return { savedRecord, ratingUpdate };
      });

      if (result.ratingUpdate) {
        console.log('Rating updated', result.ratingUpdate);
      } else {
        console.log('Play history saved (unrated engine game)');
      }

      return c.json(
        {
          message: 'Play history saved',
          playHistory: result.savedRecord,
          ratingUpdate: result.ratingUpdate,
        },
        201
      );
    } catch (error) {
      console.error('Error saving play history:', error);
      // Only operations performed through the transaction object are rolled back.
      return c.json({ error: 'Failed to save play history' }, 500);
    }
  }
);
```

- [ ] **Step 6: Add `opponentEngineId` to the GET select**

In the GET handler (around lines 74-95), the `selectDistinct` currently selects `opponentUserId` and `opponentLlmId`. Add `opponentEngineId` immediately after `opponentLlmId`:

```ts
const history = await db.selectDistinct({
  id: playHistory.id,
  userId: playHistory.userId,
  chessId: playHistory.chessId,
  date: playHistory.date,
  status: playHistory.status,
  opponentUserId: playHistory.opponentUserId,
  opponentLlmId: playHistory.opponentLlmId,
  opponentEngineId: playHistory.opponentEngineId,
  ratingChange: ratingHistory.ratingChange,
  newRating: ratingHistory.newRating,
});
```

Leave the rest of the GET handler (`leftJoin`, `where`, `orderBy`) unchanged — engine rows already yield null `ratingChange`/`newRating` from the left-join because no `rating_history` row exists for them.

- [ ] **Step 7: Run the route tests**

Run:

```bash
cd apps/api && bun test src/routes/play-history.test.ts
```

Expected: PASS — the 3 parameterized engine cases, the `engine + llm` 400, the GET round-trip, plus all pre-existing LLM/validation/auth tests (those serve as the LLM-regression proof: LLM games still update rating).

- [ ] **Step 8: Run the full API test suite to confirm no regressions**

Run:

```bash
cd apps/api && bun test
```

Expected: all green.

- [ ] **Step 9: Commit**

```bash
git add apps/api/src/routes/play-history.ts apps/api/src/routes/play-history.test.ts
git commit -m "feat(api): keep engine games unrated in POST /play-history and surface opponentEngineId in GET"
```

---

## Task 3: Web — rename `opponent-llm.ts` → `opponent.ts`, add engine types

**Files:**

- Create: `apps/web/src/lib/ai/opponent.ts`
- Delete: `apps/web/src/lib/ai/opponent-llm.ts`
- Create: `apps/web/src/lib/ai/opponent.test.ts`
- Delete: `apps/web/src/lib/ai/opponent-llm.test.ts`

**Interfaces:**

- Consumes: nothing.
- Produces: `OpponentEngineId` (`'stockfish'`), `OpponentDescriptor` (`{ kind: 'llm'; id: OpponentLlmId } | { kind: 'engine'; id: OpponentEngineId }`), and the unchanged `resolveOpponentLlmId` — all exported from `apps/web/src/lib/ai/opponent`. Task 4 imports these.

- [ ] **Step 1: Create the new module with engine types**

Create `apps/web/src/lib/ai/opponent.ts` with the full contents (the LLM logic is identical to the old file; only the filename and the new exports change):

```ts
export type OpponentLlmId = 'gpt-4o' | 'gemini-2.5-flash';

export type OpponentEngineId = 'stockfish';

/**
 * The opponent a game was played against. The hook and history layer branch on
 * `kind`; only LLM games are rated.
 */
export type OpponentDescriptor =
  | { kind: 'llm'; id: OpponentLlmId }
  | { kind: 'engine'; id: OpponentEngineId };

/**
 * Bucket the active AI provider/model into one of the two tracked opponent
 * identifiers used by play-history / ratings. Any non-gpt-4o model (gemini,
 * anthropic, openrouter, chutes, …) is bucketed as 'gemini-2.5-flash'.
 */
export function resolveOpponentLlmId(
  provider: string,
  model: string
): OpponentLlmId {
  const providerModel = `${provider}/${model}`.toLowerCase();
  if (providerModel.includes('gpt-4o')) {
    return 'gpt-4o';
  }
  return 'gemini-2.5-flash';
}
```

- [ ] **Step 2: Move + update the test file**

Create `apps/web/src/lib/ai/opponent.test.ts` with the existing test contents but importing from `./opponent`, and add one descriptor sanity test:

```ts
import { test, expect, describe } from 'bun:test';
import { resolveOpponentLlmId, type OpponentDescriptor } from './opponent';

describe('resolveOpponentLlmId', () => {
  test('gpt-4o family maps to gpt-4o', () => {
    expect(resolveOpponentLlmId('openai', 'gpt-4o')).toBe('gpt-4o');
    expect(resolveOpponentLlmId('openai', 'gpt-4o-mini')).toBe('gpt-4o');
    expect(resolveOpponentLlmId('openrouter', 'gpt-4o')).toBe('gpt-4o');
  });

  test('is case-insensitive', () => {
    expect(resolveOpponentLlmId('OpenAI', 'GPT-4O')).toBe('gpt-4o');
  });

  test('gemini maps to gemini-2.5-flash', () => {
    expect(resolveOpponentLlmId('gemini', 'gemini-2.5-flash')).toBe(
      'gemini-2.5-flash'
    );
  });

  test('all other providers default to gemini-2.5-flash', () => {
    expect(resolveOpponentLlmId('chutes', 'deepseek-ai/DeepSeek-R1')).toBe(
      'gemini-2.5-flash'
    );
    expect(resolveOpponentLlmId('openrouter', 'claude-3-haiku')).toBe(
      'gemini-2.5-flash'
    );
    expect(resolveOpponentLlmId('anthropic', 'claude-3-opus')).toBe(
      'gemini-2.5-flash'
    );
    expect(resolveOpponentLlmId('unknown', 'unknown-model')).toBe(
      'gemini-2.5-flash'
    );
  });
});

describe('OpponentDescriptor', () => {
  test('engine descriptor carries the stockfish id', () => {
    const d: OpponentDescriptor = { kind: 'engine', id: 'stockfish' };
    expect(d.kind).toBe('engine');
    expect(d.id).toBe('stockfish');
  });
});
```

- [ ] **Step 3: Delete the old files**

```bash
git rm apps/web/src/lib/ai/opponent-llm.ts apps/web/src/lib/ai/opponent-llm.test.ts
```

- [ ] **Step 4: Update the existing importers to the new path**

There are exactly three importers of the old module. Update each import path from `'../lib/ai/opponent-llm'` (or `'./opponent-llm'`) to `'../lib/ai/opponent'` (or `'./opponent'`):

1. `apps/web/src/hooks/usePlayHistory.ts` line 3 — change to:
   ```ts
   import { resolveOpponentLlmId } from '../lib/ai/opponent';
   ```
   (Task 4 will extend this import further; for now just fix the path so the module resolves.)
2. `apps/web/src/hooks/usePlayHistory.test.ts` line 5 — change to:
   ```ts
   import { resolveOpponentLlmId } from '../lib/ai/opponent';
   ```
3. The test file moved in Step 2 already imports from `./opponent`.

- [ ] **Step 5: Run the opponent module tests**

Run:

```bash
cd apps/web && bun test src/lib/ai/opponent.test.ts
```

Expected: PASS (all moved tests + the new descriptor test).

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/lib/ai/opponent.ts apps/web/src/lib/ai/opponent.test.ts apps/web/src/hooks/usePlayHistory.ts apps/web/src/hooks/usePlayHistory.test.ts
git commit -m "refactor(web): rename opponent-llm to opponent and add OpponentDescriptor/OpponentEngineId types"
```

---

## Task 4: Web — `usePlayHistory` engine path

**Files:**

- Modify: `apps/web/src/hooks/usePlayHistory.ts`
- Test: `apps/web/src/hooks/usePlayHistory.test.ts`

**Interfaces:**

- Consumes: `OpponentDescriptor`, `OpponentEngineId`, `OpponentLlmId`, `resolveOpponentLlmId` from `../lib/ai/opponent` (Task 3); `AIConfig` from `../lib/ai/types`.
- Produces: `UsePlayHistoryOptions` as a discriminated union — LLM callers pass `aiConfig` (no descriptor) unchanged; engine callers pass `opponentDescriptor: { kind: 'engine'; id: 'stockfish' }` and omit `aiConfig`. Engine games POST `opponentEngineId` and expect no rating.

- [ ] **Step 1: Write the failing hook tests**

Open `apps/web/src/hooks/usePlayHistory.test.ts`. The existing top import (line 5) already brings `resolveOpponentLlmId` from the new path after Task 3. Extend it to also import the types:

```ts
import {
  resolveOpponentLlmId,
  type OpponentDescriptor,
} from '../lib/ai/opponent';
```

The existing `HookProps` (lines 334-345) and `makeProps` (347-360) types LLM-only and have `aiConfig: AIConfig` required. Do **not** widen them — instead, engine tests build props inline (the union cannot be expressed by a single loose `Partial`). Add this new `describe` block at the end of the file. It uses the same `renderHook` + fetch-mock + timer-mock machinery as the existing `'usePlayHistory — React integration (renderHook)'` block, but captures the POST body:

```ts
describe('usePlayHistory — engine (unrated) path', () => {
  let originalFetch: typeof globalThis.fetch;
  let capturedBody: Record<string, unknown> | undefined;
  let unmountHook: (() => void) | undefined;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    capturedBody = undefined;
    globalThis.fetch = mock((url: string, init?: RequestInit) => {
      if (url.includes('/play-history') && init?.body) {
        capturedBody = JSON.parse(init.body as string) as Record<
          string,
          unknown
        >;
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        statusText: 'OK',
        json: () => Promise.resolve({}),
      }) as unknown as Response;
    }) as unknown as typeof fetch;
  });

  afterEach(() => {
    unmountHook?.();
    globalThis.fetch = originalFetch;
  });

  test('engine descriptor sends opponentEngineId and omits opponentLlmId', () => {
    const { unmount } = renderHook(() =>
      usePlayHistory({
        gameVariant: 'chess',
        gameStatus: 'checkmate',
        aiPlayer: 'black', // engine's color; mandatory
        aiConfig: undefined,
        opponentDescriptor: { kind: 'engine', id: 'stockfish' },
        moveCount: 12,
        getWinnerColor: stableGetWinnerColor,
        enabled: true,
        isAuthenticated: true,
        userId: 'user-a',
      } as never)
    );
    unmountHook = unmount;

    expect(capturedBody).toBeDefined();
    expect(capturedBody).toHaveProperty('opponentEngineId', 'stockfish');
    expect(capturedBody).not.toHaveProperty('opponentLlmId');
    expect(capturedBody).toHaveProperty('chessId', 'chess');
  });

  test('LLM path (no descriptor) is unchanged — still sends opponentLlmId', () => {
    const { unmount } = renderHook(() =>
      usePlayHistory(
        makeProps({
          gameStatus: 'checkmate',
          moveCount: 8,
        }) as never
      )
    );
    unmountHook = unmount;

    expect(capturedBody).toBeDefined();
    expect(capturedBody).toHaveProperty('opponentLlmId');
    expect(capturedBody).not.toHaveProperty('opponentEngineId');
  });
});
```

Notes for the implementer:

- The `as never` casts are intentional — `makeProps` returns the old LLM-only shape and the engine inline object targets the new union; both satisfy `UsePlayHistoryOptions` once Step 3 lands. Remove the casts only if TS confirms they're unneeded after the signature change.
- `mock`, `renderHook`, `stableGetWinnerColor`, `testAIConfig`, and `makeProps` are already imported/defined at the top of the file and in the existing integration suite.

- [ ] **Step 2: Run the tests to verify they fail**

Run:

```bash
cd apps/web && bun test src/hooks/usePlayHistory.test.ts
```

Expected: the engine test FAILS (TS compile error on `opponentDescriptor` / `aiConfig: undefined`, or the body never carries `opponentEngineId`). The LLM-path test should still pass once it compiles.

- [ ] **Step 3: Convert `UsePlayHistoryOptions` to a discriminated union**

In `apps/web/src/hooks/usePlayHistory.ts`, replace the entire `UsePlayHistoryOptions` interface (lines 7-38) with a base type + union. Keep the existing JSDoc on the surviving fields; update the `enabled` doc to be kind-neutral:

```ts
type UsePlayHistoryBaseOptions = {
  gameVariant: GameVariant;
  gameStatus: GameStatus;
  /**
   * The non-human player's color (LLM or engine). Mandatory — the hook guards
   * `if (!aiPlayer) return`, so an engine caller passing null silently gets
   * no save. (The name is historical; engine games pass the engine's color.)
   */
  aiPlayer: string | null | undefined;
  moveCount: number;
  getWinnerColor: () => string;
  /**
   * True only while a saveable game is in progress. Set by the caller for both
   * AI and engine modes — this hook must not assume LLM-only.
   */
  enabled: boolean;
  isAuthenticated: boolean;
  userId: string | null | undefined;
  debugVariantKey?: string;
};

/**
 * LLM games pass `aiConfig` (and may omit `opponentDescriptor`). Engine games
 * pass `opponentDescriptor: { kind: 'engine', ... }` and omit `aiConfig`.
 *
 * NOTE: this union guarantees call-site safety only. The hook destructures its
 * options in the signature, which severs the correlation — inside the body TS
 * sees `aiConfig` and `opponentDescriptor` as independent optionals, so the LLM
 * branch guards `!aiConfig` explicitly (see savePlayHistory).
 */
export type UsePlayHistoryOptions = UsePlayHistoryBaseOptions &
  (
    | {
        opponentDescriptor?: { kind: 'llm'; id: OpponentLlmId };
        aiConfig: AIConfig;
      }
    | {
        opponentDescriptor: { kind: 'engine'; id: OpponentEngineId };
        aiConfig?: AIConfig;
      }
  );
```

Extend the import at line 3 to bring the new types:

```ts
import {
  resolveOpponentLlmId,
  type OpponentLlmId,
  type OpponentEngineId,
} from '../lib/ai/opponent';
```

- [ ] **Step 4: Destructure `opponentDescriptor` in the signature**

The hook signature (lines 85-96) destructures options. Add `opponentDescriptor` to the destructuring list (leave the rest of the signature intact):

```ts
export function usePlayHistory({
	gameVariant,
	gameStatus,
	aiPlayer,
	aiConfig,
	opponentDescriptor,
	moveCount,
	getWinnerColor,
	enabled,
	isAuthenticated,
	userId,
	debugVariantKey,
}: UsePlayHistoryOptions): void {
```

- [ ] **Step 5: Make the snapshot a discriminated union**

The `saveSnapshotRef` declaration (lines 110-115) is LLM-hardcoded. Replace its type with a discriminant:

```ts
const saveSnapshotRef = useRef<
  | ({
      result: 'win' | 'loss' | 'draw';
      gameVariant: GameVariant;
      userId: string | null | undefined;
    } & (
      | { kind: 'llm'; opponentLlmId: string }
      | { kind: 'engine'; opponentEngineId: OpponentEngineId }
    ))
  | null
>(null);
```

- [ ] **Step 6: Rewrite the snapshot-resolution block to branch on descriptor kind**

In `savePlayHistory`, replace the block that currently declares `let opponentLlmId: string;` and resolves the snapshot (roughly lines 177-199 — from `let result: 'win' | 'loss' | 'draw';` through the closing of the `else` that assigns `saveSnapshotRef.current`) with the discriminant version. The engine branch never touches `aiConfig`; the LLM branch guards `!aiConfig` loudly:

```ts
let result: 'win' | 'loss' | 'draw';
let snapshotGameVariant: GameVariant;
let snapshotKind: 'llm' | 'engine';
let snapshotOpponentLlmId: string | undefined;
let snapshotOpponentEngineId: OpponentEngineId | undefined;
if (saveSnapshotRef.current) {
  result = saveSnapshotRef.current.result;
  snapshotGameVariant = saveSnapshotRef.current.gameVariant;
  snapshotKind = saveSnapshotRef.current.kind;
  if (saveSnapshotRef.current.kind === 'llm') {
    snapshotOpponentLlmId = saveSnapshotRef.current.opponentLlmId;
  } else {
    snapshotOpponentEngineId = saveSnapshotRef.current.opponentEngineId;
  }
} else {
  if (gameStatus === 'draw' || gameStatus === 'stalemate') {
    result = 'draw';
  } else {
    const winnerColor = getWinnerColor();
    result = winnerColor === aiPlayer ? 'loss' : 'win';
  }
  snapshotGameVariant = gameVariant;
  if (opponentDescriptor?.kind === 'engine') {
    snapshotKind = 'engine';
    snapshotOpponentEngineId = opponentDescriptor.id;
    saveSnapshotRef.current = {
      result,
      gameVariant,
      userId,
      kind: 'engine',
      opponentEngineId: opponentDescriptor.id,
    };
  } else {
    // LLM path requires aiConfig. The options union guarantees it at
    // the call site, but the destructured signature severs that
    // correlation, so guard explicitly — bail loudly, never silently
    // (a silent return would reproduce the aiPlayer trap for LLM
    // callers).
    if (!aiConfig) {
      if (import.meta.env.DEV) {
        // eslint-disable-next-line no-console
        console.error(
          '[usePlayHistory] LLM save attempted without aiConfig; skipping.'
        );
      }
      savedRef.current = true;
      return;
    }
    const llmId = resolveOpponentLlmId(aiConfig.provider, aiConfig.model);
    snapshotKind = 'llm';
    snapshotOpponentLlmId = llmId;
    saveSnapshotRef.current = {
      result,
      gameVariant,
      userId,
      kind: 'llm',
      opponentLlmId: llmId,
    };
  }
}
```

- [ ] **Step 7: Build the POST body from the snapshot discriminant**

The fetch `body` (around lines 215-220) currently sends `opponentLlmId` unconditionally. Replace the `body` field with a discriminant-spread built from the snapshot:

```ts
				body: JSON.stringify({
					chessId: snapshotGameVariant,
					status: result,
					date: new Date().toISOString(),
					...(snapshotKind === 'llm'
						? { opponentLlmId: snapshotOpponentLlmId }
						: { opponentEngineId: snapshotOpponentEngineId }),
				}),
```

- [ ] **Step 8: Fix the `useCallback` dependency array**

The deps array (around lines 305-316) reads `aiConfig.provider` and `aiConfig.model` unconditionally — a TS error and a render-time `TypeError` now that `aiConfig` is optional. Use optional chaining, and add the descriptor kind so the engine path re-evaluates correctly:

```ts
	], [
		enabled,
		isAuthenticated,
		userId,
		aiPlayer,
		gameStatus,
		aiConfig?.provider,
		aiConfig?.model,
		gameVariant,
		getWinnerColor,
		debugVariantKey,
		opponentDescriptor?.kind,
	]);
```

- [ ] **Step 9: Run the hook tests**

Run:

```bash
cd apps/web && bun test src/hooks/usePlayHistory.test.ts
```

Expected: PASS — the engine test asserts the body carries `opponentEngineId` and no `opponentLlmId`; the LLM-path test asserts the reverse; and all pre-existing LLM/save-precondition/401 tests remain green (the LLM path is behaviorally unchanged).

- [ ] **Step 10: Run the full web test suite**

Run:

```bash
cd apps/web && bun test
```

Expected: all green.

- [ ] **Step 11: Commit**

```bash
git add apps/web/src/hooks/usePlayHistory.ts apps/web/src/hooks/usePlayHistory.test.ts
git commit -m "feat(web): add engine (unrated) opponent path to usePlayHistory"
```

---

## Task 5: Web — `PlayHistoryPage` engine rendering

**Files:**

- Modify: `apps/web/src/components/PlayHistoryPage.tsx`
- Test: a new test exercising the engine row. If a `PlayHistoryPage.test.tsx` exists, add to it; otherwise the rendering is verified via the existing component-test patterns. (See Step 1 — if no component test file exists, add a focused render test.)

**Interfaces:**

- Consumes: `opponentEngineId` on the `GET /play-history` row (Task 2).
- Produces: engine rows render "On-device rival" in the opponent column and an "Unrated" badge in the rating column; legacy null-`ratingChange` rows keep `—`; summary cards still count engine games (a documented decision, no code change needed beyond not excluding them).

- [ ] **Step 1: Write a failing render test for the engine row**

Check whether `apps/web/src/components/PlayHistoryPage.test.tsx` (or `.test.ts`) exists. If it does, add to it; if not, create `apps/web/src/components/PlayHistoryPage.test.tsx` using the project's existing React component test setup (`@testing-library/react`, `bun:test`). The test mocks `fetch` to return one engine row and one legacy null-rating row, then asserts the labels:

```tsx
import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { render, screen, waitFor } from '@testing-library/react';
import PlayHistoryPage from './PlayHistoryPage';

describe('PlayHistoryPage — engine row rendering', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    // PlayHistoryPage only fetches when authenticated.
    (
      window as unknown as { __PROCYON_INITIAL_AUTH_USER__: unknown }
    ).__PROCYON_INITIAL_AUTH_USER__ = {
      id: 'user-a',
      email: 'a@b.com',
      username: 'a',
    };
    globalThis.fetch = (async (url: RequestInfo | URL) => {
      const u = typeof url === 'string' ? url : url.toString();
      if (u.includes('/auth/v1/user') || u.includes('/users/')) {
        return new Response(JSON.stringify({ id: 'user-a' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (u.includes('/play-history')) {
        return new Response(
          JSON.stringify({
            playHistory: [
              {
                id: 1,
                userId: 'user-a',
                chessId: 'chess',
                date: new Date().toISOString(),
                status: 'win',
                opponentUserId: null,
                opponentLlmId: null,
                opponentEngineId: 'stockfish',
                ratingChange: null,
                newRating: null,
              },
              {
                id: 2,
                userId: 'user-a',
                chessId: 'chess',
                date: new Date().toISOString(),
                status: 'win',
                opponentUserId: null,
                opponentLlmId: 'gemini-2.5-flash',
                opponentEngineId: null,
                ratingChange: null, // legacy pre-rating row
                newRating: null,
              },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      return new Response('Not Found', { status: 404 });
    }) as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  test('engine row shows "On-device rival" and "Unrated"; legacy null row keeps —', async () => {
    render(<PlayHistoryPage />);

    await waitFor(() =>
      expect(screen.getByText('On-device rival')).toBeDefined()
    );
    expect(screen.getByText('Unrated')).toBeDefined();
    // Legacy pre-rating LLM row (no engine id, null ratingChange) keeps the em dash.
    expect(screen.getByText('—')).toBeDefined();
  });
});
```

Note for the implementer: confirm the exact auth-gating mechanism `PlayHistoryPage` uses (it reads `useAuth()`). If the `window.__PROCYON_INITIAL_AUTH_USER__` seed is not how this codebase seeds auth in tests, mirror whatever the nearest existing component test (e.g. `ChessGame.test.tsx`) does to make `useAuth()` report `isAuthenticated: true` before adjusting the mock. The assertion intent is what matters: engine row → "On-device rival" + "Unrated"; legacy null-`ratingChange` row → `—`.

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
cd apps/web && bun test src/components/PlayHistoryPage.test.tsx
```

Expected: FAIL — engine row currently renders "Unknown opponent" (no engine branch in `formatOpponent`) and `—` (no "Unrated" badge).

- [ ] **Step 3: Extend the row type**

In `apps/web/src/components/PlayHistoryPage.tsx`, the `ServerPlayHistory` type (lines 8-19) needs the engine field. Add `opponentEngineId` after `opponentLlmId` (line 14):

```ts
type ServerPlayHistory = {
  id: number;
  chessId: 'chess' | 'shogi' | 'xiangqi' | 'jungle';
  date: string;
  status: 'win' | 'loss' | 'draw';
  opponentUserId: string | null;
  opponentLlmId: 'gpt-4o' | 'gemini-2.5-flash' | null;
  opponentEngineId: 'stockfish' | null;
  // Rating fields (populated after rating system was added)
  // Can be null when rating history doesn't exist (e.g., older games)
  ratingChange: number | null | undefined;
  newRating: number | null | undefined;
};
```

- [ ] **Step 4: Add the engine branch to `formatOpponent`**

In `formatOpponent` (lines 54-72), add an `opponentEngineId` branch ahead of the `opponentLlmId` check and the fallthrough:

```ts
function formatOpponent(entry: ServerPlayHistory): string {
  if (entry.opponentUserId) {
    const isUuid = entry.opponentUserId.includes('-');
    if (isUuid) {
      return `Human opponent (${entry.opponentUserId.slice(0, 8)}...)`;
    } else {
      return `Human opponent #${entry.opponentUserId}`;
    }
  }

  if (entry.opponentEngineId) {
    return 'On-device rival';
  }

  if (entry.opponentLlmId) {
    return `AI · ${LLM_LABELS[entry.opponentLlmId] ?? 'Unknown Model'}`;
  }

  return 'Unknown opponent';
}
```

- [ ] **Step 5: Replace the rating-column `—` with an "Unrated" badge for engine rows**

The rating cell (lines 349-376) currently renders an em dash when `ratingChange` is null. Change the `: (` branch so engine rows render an "Unrated" badge, while legacy null rows keep `—`. Replace the whole `{entry.ratingChange != null ? (...) : (...)}` expression with:

```tsx
{
  entry.ratingChange != null ? (
    <div className='flex flex-col'>
      <span
        className={`font-mono font-semibold ${
          entry.ratingChange > 0
            ? 'text-jungle'
            : entry.ratingChange < 0
              ? 'text-destructive'
              : 'text-ivory-dim'
        }
															`}
      >
        {entry.ratingChange > 0 ? '+' : ''}
        {entry.ratingChange}
      </span>
      {entry.newRating != null && (
        <span className='text-xs font-mono text-ivory-dim'>
          {entry.newRating}
        </span>
      )}
    </div>
  ) : entry.opponentEngineId ? (
    <span className='inline-flex items-center rounded-full border border-line bg-ink-600 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-ivory-dim'>
      Unrated
    </span>
  ) : (
    <span className='text-ivory-dim text-xs font-mono'>—</span>
  );
}
```

Summary cards (lines 159-182) are intentionally left unchanged: engine games count toward Total/Wins/Losses/Win-Rate (game-volume stats, not rating stats). No code change there.

- [ ] **Step 6: Run the component test**

Run:

```bash
cd apps/web && bun test src/components/PlayHistoryPage.test.tsx
```

Expected: PASS — "On-device rival", "Unrated", and the legacy `—` all render.

- [ ] **Step 7: Run the full web test suite**

Run:

```bash
cd apps/web && bun test
```

Expected: all green.

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/components/PlayHistoryPage.tsx apps/web/src/components/PlayHistoryPage.test.tsx
git commit -m "feat(web): label engine games On-device rival / Unrated in play history"
```

---

## Self-Review (run before handoff)

**1. Spec coverage:**

- Additive `opponent_engine_id` + `OpponentEngineId` enum → Task 1.
- Migration single file in `drizzle/` → Task 1 Step 3-4 (no D1 duplicate).
- `POST /play-history` accepts engine, skips rating, `ratingUpdate: null` → Task 2 Step 5.
- 3-way `superRefine` (engine+llm → 400) + updated messages → Task 2 Step 3.
- `getOpponentKind` route helper (`'engine' | 'llm'`) → Task 2 Step 4.
- `GET` includes `opponentEngineId` → Task 2 Step 6.
- LLM insert writes `opponentEngineId: null` → Task 2 Step 5 (`opponentEngineId: body.opponentEngineId ?? null`).
- Logging split → Task 2 Step 5.
- Table-driven win/loss/draw engine test + GET round-trip + 400 → Task 2 Step 1.
- `game.test.ts` per-`ALL_*` block → Task 1 Step 5.
- Rename `opponent-llm.ts` → `opponent.ts`, 3 importers, test rename → Task 3.
- `usePlayHistory` discriminated union, `aiConfig` optional, dep-array optional-chaining, `aiPlayer` mandatory doc → Task 4 Steps 3-4, 8.
- Snapshot discriminant + 401-retry frozen path + `!aiConfig` loud bail + destructuring caveat → Task 4 Steps 5-6.
- `PlayHistoryPage` row type, `formatOpponent` branch, "Unrated" badge, legacy `—` preserved, summary-card decision → Task 5 Steps 3-5.
- Result-screen + pre-game label: NOT in this plan — deferred to HPA-159 (matches the spec's Completion boundary; AC-mapping split).
- Rating-service signature unchanged (no `opponentEngineId` param) → Task 2 never touches `rating-service.ts`. ✓

**2. Placeholder scan:** None. Every code step shows complete code; the one "mirror nearest existing component test" note in Task 5 Step 1 is qualified with a concrete fallback assertion set, not a "TODO".

**3. Type consistency:**

- `OpponentEngineId` enum value `'stockfish'` is used identically in constants (Task 1), schema (Task 1), route body (Task 2), web type `'stockfish'` (Task 3), hook (Task 4), page (Task 5). ✓
- `getOpponentKind` returns `'engine' | 'llm'` and the handler compares `kind === 'llm'`. ✓
- `OpponentDescriptor` shape `{ kind: 'engine'; id: OpponentEngineId }` matches between `opponent.ts` (Task 3) and the union in `usePlayHistory.ts` (Task 4). ✓
- Snapshot discriminant `kind: 'llm' | 'engine'` matches between the ref type (Task 4 Step 5) and the body spread (Task 4 Step 7). ✓

No issues found.
