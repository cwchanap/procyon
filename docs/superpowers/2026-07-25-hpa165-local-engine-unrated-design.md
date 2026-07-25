# Keep Local-Engine Games Unrated — Design

**Status:** Draft
**Date:** 2026-07-25
**Linear:** [HPA-165 — Keep local-engine games unrated in the first release](https://linear.app/cwchanap/issue/HPA-165/keep-local-engine-games-unrated-in-the-first-release)

## Summary

Introduce the contract and guardrails that make on-device engine games (the
local-rival mode from umbrella issue [HPA-159](https://linear.app/cwchanap/issue/HPA-159/feature-add-a-local-non-llm-chess-rival))
provably **unrated**, on both client and server, while leaving the existing
rated language-model path byte-for-byte unchanged.

The change adds a third opponent type — `opponentEngineId` — to `play_history`,
extends the route's existing "exactly one opponent" validation to cover it, and
makes rating eligibility **derived from opponent kind**: LLM games are rated as
today; engine games never reach the rating service, create no `rating_history`
row, and return `ratingUpdate: null`. A contradictory request (engine + LLM) is
rejected as `400` by structural validation, satisfying the "reject or ignore"
acceptance criterion without introducing a redundant explicit `rated` flag.

This issue is the foundational slice — it is blocked by nothing and blocks
[HPA-164](https://linear.app/cwchanap/issue/HPA-164/record-and-export-local-rival-games-with-clear-opponent-metadata)
(record/export metadata), which later adds `difficulty` / `engine_version`
columns on the same additive pattern.

## Scope

**In scope (this issue):**

- Schema: additive nullable `opponent_engine_id` column + `OpponentEngineId` enum.
- API: `POST /play-history` accepts the engine opponent, skips rating, returns
  `ratingUpdate: null`; structural rejection of contradictory opponent combos.
- Client contract: an `OpponentDescriptor` union, `usePlayHistory` support for
  the engine path (testable without the Stockfish UI), and an "Unrated" label on
  the existing `PlayHistoryPage`.
- The result-screen contract (render no delta + "Unrated") is **documented here
  for HPA-159 to implement**; the screen itself is not built in this issue.

**Out of scope (owned elsewhere):**

- The local-rival game-mode UI, Stockfish integration, difficulty/side selection
  — HPA-159 (umbrella).
- Richer opponent metadata (`difficulty`, `engine_version`) in history/export,
  visual distinction of engine vs LLM rows beyond the "Unrated" badge — HPA-164.
- A trusted server-hosted engine, rated offline play, detection of undisclosed
  engine use, engine-to-rating calibration — explicitly out of scope per HPA-165.
- A deliberate `opponentType`/`opponentId` schema refactor — see "Alternatives".

## Goals

- **Engine games never affect rating.** Win, loss, and draw against the on-device
  rival leave `player_ratings` unchanged and create no `rating_history` entry.
- **LLM games are unchanged.** Existing rated language-model behavior (rating
  update, history row, K-factor math, idempotency) is identical to today.
- **Records are identifiable.** A stored engine game carries `opponentEngineId`
  (non-null) and `opponentLlmId`/`opponentUserId` (null).
- **Contradictory input is rejected.** A request combining an engine opponent
  with an LLM opponent is a `400` before any write.
- **The contract is real and testable now**, without the Stockfish UI.

## Non-goals

- Introducing an explicit `rated: boolean` request field (rating is derived from
  opponent kind — see "Rated model" decision).
- Backfilling or rewriting existing `play_history` rows.
- Changing ELO math, the `playerRatings`/`ratingHistory` table shapes, or any
  rated code path.
- Building the in-game result screen or pre-game "Unrated" entry label (HPA-159).

## Decisions

### Scope boundary

HPA-165 delivers **contract + guardrails only**. No new game-mode UI is built;
HPA-159's local-rival screen will consume this contract. Build/test is done
against the existing game components wired to send the new opponent type and
against `usePlayHistory`'s engine path.

### Rated model — implicit, derived from opponent kind

No new `rated` field. The server derives rated-ness from the opponent kind:
**LLM → rated, engine → unrated, always.** The "reject or ignore rated-engine
input" acceptance criterion is satisfied structurally — the route's "exactly one
opponent" `superRefine` rejects `opponentEngineId + opponentLlmId` as `400`, and
there is no separate channel through which a client can request a rating update.
This is the simplest contract that makes accidental rating of an engine game
impossible.

### Opponent representation — additive column (Approach 1)

Add a nullable `opponent_engine_id` column rather than generalizing to
`opponentType` + `opponentId`. Rationale: lowest blast radius for a guardrails
slice (pure-additive migration, no backfill, existing queries untouched),
preserves the established nullable-opponent-column pattern, and gives HPA-164 a
clean extension point for `difficulty`/`engine_version`. The rejected alternative
is documented below.

## Architecture

### Data model

**`apps/api/src/constants/game.ts`**

- Add `OpponentEngineId` enum: `Stockfish = 'stockfish'`.
- Add `ALL_OPPONENT_ENGINE_IDS = Object.values(OpponentEngineId)`.
- (Mirrors the existing `OpponentLlmId` / `ALL_OPPONENT_LLM_IDS` pattern.)

**`apps/api/src/db/schema.ts`** — `playHistory` gains:

```ts
opponentEngineId: text('opponent_engine_id').$type<OpponentEngineId | null>(),
```

The "exactly one opponent" invariant (currently over `opponentUserId` /
`opponentLlmId`) becomes a three-way invariant enforced in route validation, not
at the column level. No other table changes.

**Migration** — generated via `bun run db:generate` (SQLite dev) and the matching
D1 migration. Pure-additive nullable column: no backfill, no data movement, no
downtime. Existing rows get `opponent_engine_id = null` automatically.

**Web mirror** — generalize `apps/web/src/lib/ai/opponent-llm.ts` to carry:

```ts
export type OpponentEngineId = 'stockfish';
export type OpponentDescriptor =
  | { kind: 'llm'; id: OpponentLlmId }
  | { kind: 'engine'; id: OpponentEngineId };
```

`resolveOpponentLlmId` stays for LLM callers; a new `resolveOpponentDescriptor`
helper builds the union from the active configuration/mode.

### API contract

**`POST /play-history`** (`apps/api/src/routes/play-history.ts`)

- Request schema gains optional `opponentEngineId: z.nativeEnum(OpponentEngineId)`.
- The `superRefine` block is extended so **exactly one** of
  `{opponentUserId, opponentLlmId, opponentEngineId}` is present. A request with
  both `opponentEngineId` and `opponentLlmId` (or `opponentUserId`) is therefore
  a `400` — this is the structural "reject contradictory rated-engine input"
  guard. (The existing `opponentUserId` direct-submission `403` is unchanged.)
- Handler branch on opponent kind:
  - **engine** → insert the `play_history` row with `opponentEngineId` set and
    `opponentLlmId`/`opponentUserId` null. **Do not call `updatePlayerRating`.**
    Return `201` with `ratingUpdate: null`.
  - **LLM** → existing rated transaction, unchanged.

**`POST` response shape** becomes:

```ts
{
  message: string;
  playHistory: PlayHistory;
  ratingUpdate: RatingUpdate | null;
}
```

`RatingUpdate` is the existing `{ oldRating; newRating; ratingChange }`. It is
`null` for engine games and unchanged for LLM games.

**`GET /play-history`** — add `opponentEngineId` to the `selectDistinct` output.
Engine rows already yield `ratingChange`/`newRating` = `null` from the existing
left-join (no `rating_history` row is ever created for them), so no join change
is needed — only the added select column and the typed response field.

### Server enforcement

**`apps/api/src/services/rating-service.ts`**

- Add a small pure helper:
  ```ts
  function getOpponentKind(body): 'llm' | 'engine' | 'user' | 'none';
  ```
  centralizing the rule **rated ⇔ kind === 'llm'** (PvP `'user'` is handled by
  its own server-validated path and remains unreachable from `POST /play-history`
  direct submission). The route branches on this helper so only `'llm'` reaches
  `updatePlayerRating`.
- **Defense-in-depth:** `UpdateRatingParams` gains an optional `opponentEngineId`
  field. If it is set, `updatePlayerRating` throws **before touching any table**.
  The route never passes it for engine games; this guard exists so a future
  caller cannot accidentally rate an engine game. (The thrown error is caught by
  the route's existing transaction handler and surfaces as a `500`; because the
  guard fires before any write, no partial state is committed.)
- No change to ELO math, `getOrCreateRatingInTransaction`, `getAiOpponentRating`,
  or any rated code path.

### Client contract

**`usePlayHistory`** (`apps/web/src/hooks/usePlayHistory.ts`)

- Accept an optional `opponentDescriptor: OpponentDescriptor` on
  `UsePlayHistoryOptions`. Existing LLM callers are unchanged — when no
  descriptor is supplied the hook continues to resolve the LLM id from
  `aiConfig` exactly as today.
- When `descriptor.kind === 'engine'`, the snapshot/POST path:
  - sends `opponentEngineId` in the body and **omits** `opponentLlmId`;
  - treats the game as unrated (expects `ratingUpdate: null`, performs no rating
    read-back).
- The 401-retry, account-switch, generation-token, and "no retry on 5xx"
  guarantees are unchanged — they are orthogonal to opponent kind.

**`PlayHistoryPage`** (`apps/web/src/components/PlayHistoryPage.tsx`)

- Extend the row type with `opponentEngineId?: OpponentEngineId | null`.
- When `opponentEngineId` is set, render an **"Unrated"** badge and an
  **"On-device rival"** opponent label in place of the rating delta. (The delta
  rendering for null `ratingChange` already shows nothing; this adds the explicit
  label so the row is unambiguous.)
- LLM rows render exactly as today.

**Result-screen contract (documented for HPA-159, not built here):** engine
games return `ratingUpdate: null` and `playHistory.opponentEngineId`; the
local-rival result UI renders no rating delta and an "Unrated — on-device rival"
label, and the pre-game entry shows the game as unrated before the player starts.
HPA-159 implements the rendering against this contract.

## Testing

**API route tests** — new `play-history` engine cases (unit, alongside
`play-history.test.ts` / `play-history.pvp-security.test.ts`):

- Engine `POST` → `201`; stored row has `opponentEngineId` set and
  `opponentLlmId`/`opponentUserId` null; **no** `playerRatings` change; **no**
  `ratingHistory` row; response `ratingUpdate: null`.
- `opponentEngineId + opponentLlmId` → `400` (structural rejection).
- `opponentEngineId + opponentUserId` → rejected (validation order: the
  superRefine `400` fires on the contradictory pair; the existing `opponentUserId`
  `403` path is documented to remain for the lone-`opponentUserId` case).
- LLM regression: an LLM `POST` still updates `playerRatings`, creates one
  `ratingHistory` row, and returns a non-null `ratingUpdate`.

**rating-service test:**

- `updatePlayerRating` called with `opponentEngineId` set throws before any write.

**Web unit tests:**

- `usePlayHistory` with an engine descriptor sends a body containing
  `opponentEngineId` and no `opponentLlmId`, and expects no rating.
- `PlayHistoryPage` renders the "Unrated" badge for an engine row and the delta
  for an LLM row.

**E2E:** deferred to HPA-159 (requires the local-rival game mode). API-level
integration is covered by the route tests above.

## Acceptance-criteria mapping

| HPA-165 criterion                                                   | How met                                                                                                             |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Win/loss/draw vs on-device rival leaves rating unchanged            | Engine branch skips `updatePlayerRating` entirely                                                                   |
| No rating delta or `rating_history` entry for an engine game        | No `ratingHistory` insert on the engine path                                                                        |
| No rating delta on result screen or history entry                   | `ratingUpdate: null` response + "Unrated" badge on `PlayHistoryPage`; result-screen contract documented for HPA-159 |
| Stored record identifiable as on-device, unrated engine game        | `opponentEngineId` non-null, other opponent fields null                                                             |
| Engine + rated combination rejected/ignored without changing rating | `superRefine` `400` on contradictory opponents; no `rated` channel exists                                           |
| Eligible LLM results continue to update ratings                     | LLM path unchanged + regression test                                                                                |

## Security boundary (per HPA-165)

A modified client can conceal engine use by submitting a game as another
opponent type. Detecting undisclosed engine assistance or general cheating is
**out of scope** for client-run local play; the API enforces only that an
honestly-classified engine game cannot be rated.

## Alternatives considered

- **Generalized `opponentType` + `opponentId` columns.** Replace the three
  nullable opponent columns with `opponent_type: 'llm'|'engine'|'user'` (not
  null) + `opponent_id: text`. Cleaner long-term, but requires backfilling every
  existing row and rewriting all queries/joins/types/tests (ratings service,
  play-history GET, frontend types, tests). High blast radius for a guardrails
  slice; better as a deliberate standalone refactor. Rejected for this issue.
- **Sentinel in `opponentLlmId`.** Store `'stockfish'` in the LLM column.
  Rejected: breaks `OpponentLlmId` typing, mislabels engine games as LLM
  (directly violates HPA-164's "no engine record mislabeled as GPT/Gemini"), and
  conflates the rated/unrated code path.
- **Explicit `rated: boolean` request field.** Rejected in favor of the implicit
  derive-from-opponent-kind model (see "Rated model"). The structural
  "exactly-one-opponent" validation already rejects contradictory input, so an
  explicit flag would be redundant and would add a new client obligation.

## Open questions

None — scope, rated model, and opponent representation are settled. Difficulty /
engine-version metadata are intentionally deferred to HPA-164.
