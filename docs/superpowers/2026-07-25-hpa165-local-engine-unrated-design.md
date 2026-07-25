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
  and visual distinction of engine vs LLM rows beyond the "Unrated" badge and the
  "On-device rival" opponent label added in this issue — HPA-164.
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
- Validating `opponentEngineId × chessId` combinations at the API. The schema
  permits `stockfish` with any variant; HPA-159 is chess-only and the client
  controls when an engine id is sent, so per-variant engine validation is
  deferred (noted, not a blocker).

## Decisions

### Scope boundary

HPA-165 delivers **contract + guardrails only**. No new game-mode UI is built and
no existing game component is modified — HPA-159's local-rival screen will
consume this contract later. The engine path is exercised purely through
`usePlayHistory` unit tests; the four game components are untouched in this
issue.

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
at the column level. It is deliberately **not** a DB-level `CHECK` constraint:
SQLite cannot add one without a full table rebuild (the `0006_enhanced_constraints`
pattern), which would forfeit the pure-additive, no-data-movement property that
justifies Approach 1 — and `play_history` has exactly one writer
(`play-history.ts`), so route-level enforcement is sufficient. No other table
changes.

**Migration** — a single generated file in `apps/api/drizzle/` (next number,
`0010_*`), since `wrangler.toml` sets `migrations_dir = "drizzle"` and the same
directory feeds both `bun run db:migrate` (SQLite dev) and
`bun run cf:d1:migrations:apply` (D1). Pure-additive nullable column: no backfill,
no data movement, no downtime. Existing rows get `opponent_engine_id = null`
automatically. Do **not** hand-write a second D1-specific file.

**Web mirror** — rename `apps/web/src/lib/ai/opponent-llm.ts` → `opponent.ts`
(adding engine types to a file named `opponent-llm.ts` makes the name a lie) and
carry:

```ts
export type OpponentEngineId = 'stockfish';
export type OpponentDescriptor =
  | { kind: 'llm'; id: OpponentLlmId }
  | { kind: 'engine'; id: OpponentEngineId };
```

`resolveOpponentLlmId` stays for LLM callers. HPA-165 deliberately ships **no**
"from configuration/mode" resolver — there is no local-rival mode yet. The hook
accepts an optional `OpponentDescriptor`; when omitted, the LLM default path runs
unchanged. HPA-159 will pass a thin `{ kind: 'engine', id: 'stockfish' }` literal
from the local-rival screen. Update the three existing importers —
`usePlayHistory.ts`, `usePlayHistory.test.ts`, and `opponent-llm.test.ts` — to
`../lib/ai/opponent`, and rename `opponent-llm.test.ts` → `opponent.test.ts`.

### API contract

**`POST /play-history`** (`apps/api/src/routes/play-history.ts`)

- Request schema gains optional `opponentEngineId: z.nativeEnum(OpponentEngineId)`.
- The `superRefine` block is extended so **exactly one** of
  `{opponentUserId, opponentLlmId, opponentEngineId}` is present. A request with
  both `opponentEngineId` and `opponentLlmId` (or `opponentUserId`) is therefore
  a `400` — this is the structural "reject contradictory rated-engine input"
  guard. (The existing `opponentUserId` direct-submission `403` is unchanged.)
  Update the existing validation messages, which currently name only
  `opponentUserId`/`opponentLlmId` ("Provide either opponentUserId or
  opponentLlmId" / "Specify only one opponent type"), to mention
  `opponentEngineId`.
- Handler branch on opponent kind (see `getOpponentKind` under Server enforcement):
  - **engine** → insert the `play_history` row with `opponentEngineId` set and
    `opponentLlmId`/`opponentUserId` null. **Do not call `updatePlayerRating`.**
    Return `201` with `ratingUpdate: null`.
  - **LLM** → existing rated transaction, unchanged. Set `opponentEngineId: null` explicitly on the insert for symmetry with the existing hardcoded `opponentUserId: null` (Drizzle would default it, but follow the established shape).
- Logging: the handler currently always runs `console.log('Rating updated',
result.ratingUpdate)`. On the engine path this would print `… null` and mislead
  ops into thinking a rating fired. Log e.g. `"Play history saved (unrated)"` for
  engine games; keep the existing log for the LLM path.

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

**Route layer** (`apps/api/src/routes/play-history.ts`) — add a small pure helper
typed on the validated request body (the rating service takes `UpdateRatingParams`,
not the HTTP body, so this helper belongs in the route, not the service):

```ts
function getOpponentKind(body): 'engine' | 'llm';
```

Returns opponent **kind**, not ratedness (keep the two axes separate so the model
stays coherent if a second unrated kind appears later). Two arms only: the
`superRefine` already guarantees exactly one opponent is present, and
`opponentUserId` direct submission is `403`'d before this branch, so the only
live cases are `opponentEngineId` (`'engine'`) and `opponentLlmId` (`'llm'`).
The route applies the derivation `rated ⇔ kind !== 'engine'` at the branch:
`'engine'` → unrated insert path; `'llm'` → the existing `updatePlayerRating`
transaction, unchanged.

**Rating service** (`apps/api/src/services/rating-service.ts`) — **no signature
change.** `updatePlayerRating` already throws when neither `opponentLlmId` nor
`opponentUserId` is provided, and the route never calls it for engine games, so
an engine game cannot reach the rating code. A dedicated `opponentEngineId`
field on `UpdateRatingParams` was considered and **dropped**: its only purpose
would be to be rejected, the route never passes it, and the existing
"must have llm|user" guard plus the route branch already close the HTTP path.
The hypothetical misuse case (a future in-process caller passing an engine id
alongside an llm id) is not worth a parameter that exists only to throw. The
acceptance criteria do not depend on it.

No change to ELO math, `getOrCreateRatingInTransaction`, `getAiOpponentRating`,
or any rated code path.

### Client contract

**`usePlayHistory`** (`apps/web/src/hooks/usePlayHistory.ts`)

- Accept an optional `opponentDescriptor: OpponentDescriptor` on
  `UsePlayHistoryOptions`. Existing LLM callers are unchanged — when no
  descriptor is supplied the hook continues to resolve the LLM id from
  `aiConfig` exactly as today.
- `aiConfig: AIConfig` is currently required, but an engine game (HPA-159) has no
  LLM config. Make the options a discriminated union so engine callers need no
  dummy config and the LLM path still type-requires one:
  ```ts
  type UsePlayHistoryOptions = Base &
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
  The existing `useCallback` dep array reads `aiConfig.provider` / `aiConfig.model`
  unconditionally (usePlayHistory.ts:311-312); with `aiConfig` optional that
  becomes both a TS error and a render-time `TypeError`. Use optional chaining
  (`aiConfig?.provider`, `aiConfig?.model`) in the deps. Also rewrite the
  `enabled` option doc, which today says "True only while an AI game is in
  progress (`gameMode === 'ai'`)": for HPA-165 the hook must not assume LLM-only;
  `enabled` means "a saveable game for this component is in progress," set by the
  caller for both AI and engine modes.
- **Two body-level `aiConfig` fixes the union does not cover.** (a) The snapshot
  LLM branch calls `resolveOpponentLlmId(aiConfig.provider, aiConfig.model)`
  (usePlayHistory.ts:191); under `aiConfig?` this is a compile error. The engine
  branch never reaches it, but on the LLM branch guard explicitly: if
  `!aiConfig`, emit a dev-mode `console.error` and bail (mirror the existing
  failure logging) — **not** a silent `return`, which would reproduce the
  `aiPlayer` trap for LLM callers. (b) The hook destructures its options in the
  signature (usePlayHistory.ts:85-96), which severs the union correlation:
  inside the body TS sees `aiConfig` and `opponentDescriptor` as independent
  optionals, so `opponentDescriptor?.kind === 'engine'` does **not** narrow
  `aiConfig`. The union therefore buys **call-site** safety only; the body
  treats them as independent optionals and guards explicitly as in (a).
- **`aiPlayer` is mandatory for engine games too (do not pass null).** The hook
  guards `if (!aiPlayer) return;` (usePlayHistory.ts:145) and derives the result
  from it (`result = winnerColor === aiPlayer ? 'loss' : 'win'`, line 189), so an
  engine caller that passes `aiPlayer: null` gets **no save, no error, no log**.
  Semantically `aiPlayer` is "the non-human player's color," which holds for both
  LLM and engine — engine callers pass the engine's color here. The name is a
  known misnomer for engine games (like `opponent-llm.ts` was), but it has ~60
  references across the four game components and `useGameDebugOutcomes`, so
  renaming it (e.g. to `opponentPlayer`) is deferred to a separate cleanup ticket
  rather than folded into this guardrails slice.
- **Snapshot discriminant (important — do not bolt engine onto
  `opponentLlmId`).** Today `saveSnapshotRef` is LLM-hardcoded to
  `{ result, opponentLlmId: string, gameVariant, userId }` and the POST body
  always sends `opponentLlmId`. The snapshot becomes a discriminated union:
  ```ts
  type SaveSnapshot = { result; gameVariant; userId } & (
    | { kind: 'llm'; opponentLlmId: string }
    | { kind: 'engine'; opponentEngineId: OpponentEngineId }
  );
  ```
  First-attempt resolution: if `opponentDescriptor?.kind === 'engine'`, snapshot
  `{ kind: 'engine', opponentEngineId: descriptor.id }`; otherwise snapshot
  `{ kind: 'llm', opponentLlmId: resolveOpponentLlmId(aiConfig…) }` as today. The
  POST body is built from the snapshot discriminant — engine sends
  `opponentEngineId` and **omits** `opponentLlmId`; LLM is unchanged. 401 retries
  reuse the frozen snapshot, preserving the existing guarantee that a provider/
  mode change after game-over cannot corrupt the record.
- The account-switch, generation-token, and "no retry on 5xx" guarantees are
  unchanged — they are orthogonal to opponent kind.

**`PlayHistoryPage`** (`apps/web/src/components/PlayHistoryPage.tsx`) — note the
actual current rendering, which is **not** "shows nothing" for missing ratings:

- Extend the `ServerPlayHistory` row type with
  `opponentEngineId?: OpponentEngineId | null`, matching the added `GET` field.
- **Opponent column:** `formatOpponent` currently falls through to
  `'Unknown opponent'` when both opponent fields are null — exactly the case an
  engine row would hit. Add an `opponentEngineId` branch returning
  **"On-device rival"** ahead of the fallthrough.
- **Rating column:** today a null `ratingChange` renders an em dash `—` (not
  "nothing"). Replace that `—` with an **"Unrated"** badge **only when
  `opponentEngineId` is set**; legacy pre-rating rows (null `ratingChange`, no
  engine id) keep the `—` so their appearance is unchanged.
- LLM rows render exactly as today.
- **Summary cards** (PlayHistoryPage.tsx:159-182: Total / Wins / Losses / Win
  Rate, computed over every row): engine games **are** counted there. Those are
  game-volume stats, not rating stats, so including engine games does not imply a
  rating change — consistent with HPA-165's rule that only _rating_ fields are
  suppressed for engine games. (If product later wants engine games excluded
  from headline stats, that is a separate HPA-164 decision.)

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
- `GET /play-history`: an engine row comes back with `opponentEngineId` set and
  `ratingChange`/`newRating` = `null`. This closes the only untested link in the
  chain — the `selectDistinct` column actually round-trips through the API; the
  "record is identifiable" AC and the `PlayHistoryPage` badge both depend on it.

**(No rating-service test is added.)** The service signature is unchanged and the
route never calls it for engine games; the existing "must have llm|user" guard
already covers malformed calls, and the engine-unrated behavior is proven at the
route level above.

**Constants test:** extend `apps/api/src/constants/game.test.ts`'s per-`ALL_*`
convention (a "contains all…" test + a "has the same length as the enum" test for
each constant) with an `ALL_OPPONENT_ENGINE_IDS` block, mirroring the existing
`ALL_OPPONENT_LLM_IDS` block. The new constant has no production consumer today
— same as `ALL_OPPONENT_LLM_IDS` — which is consistent, not a smell.

**Web unit tests:**

- `usePlayHistory` with an engine descriptor: snapshot is
  `{ kind: 'engine', opponentEngineId }`; POST body contains `opponentEngineId`
  and no `opponentLlmId`; expects no rating. Add a 401-retry case proving the
  engine path is reused from the frozen snapshot (mirrors the existing LLM 401
  test).
- `PlayHistoryPage`: engine row renders "On-device rival" + "Unrated" badge; LLM
  row renders the delta; a legacy null-`ratingChange`-without-engine row still
  renders `—`.

**E2E:** deferred to HPA-159 (requires the local-rival game mode). API-level
integration is covered by the route tests above.

## Acceptance-criteria mapping

| HPA-165 criterion                                                   | How met                                                                                                                                                                                                                                                                                  |
| ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Win/loss/draw vs on-device rival leaves rating unchanged            | Engine branch skips `updatePlayerRating` entirely                                                                                                                                                                                                                                        |
| No rating delta or `rating_history` entry for an engine game        | No `ratingHistory` insert on the engine path                                                                                                                                                                                                                                             |
| No rating delta on result screen or history entry                   | `ratingUpdate: null` response + "Unrated" badge on `PlayHistoryPage`; result-screen contract documented for HPA-159. **Split:** history-entry side is met in this issue; result-screen side is **deferred to HPA-159** and must not be marked verified until HPA-159 ships the result UI |
| Stored record identifiable as on-device, unrated engine game        | `opponentEngineId` non-null, other opponent fields null                                                                                                                                                                                                                                  |
| Engine + rated combination rejected/ignored without changing rating | `superRefine` `400` on contradictory opponents; no `rated` channel exists                                                                                                                                                                                                                |
| Eligible LLM results continue to update ratings                     | LLM path unchanged + regression test                                                                                                                                                                                                                                                     |

## Security boundary (per HPA-165)

A modified client can conceal engine use by submitting a game as another
opponent type. Detecting undisclosed engine assistance or general cheating is
**out of scope** for client-run local play; the API enforces only that an
honestly-classified engine game cannot be rated. The reverse — submitting a
_lost_ LLM game as an engine game to dodge the rating loss — is newly
expressible, but it grants no new capability **with respect to rating**: it is equivalent to
simply not POSTing the result, which a modified client can already do today. (It
is not literally equivalent — the mislabeled game still creates a `play_history`
row that counts toward the Total/Wins/Losses/Win-Rate cards, per the summary-card
decision above — but rating is unaffected either way.)

## Alternatives considered

- **Generalized `opponentType` + `opponentId` columns.** Replace the three
  nullable opponent columns with `opponent_type: 'llm'|'engine'|'user'` (not
  null) + `opponent_id: text`. Cleaner long-term, but requires backfilling every
  existing row and rewriting all queries/joins/types/tests (ratings service,
  play-history GET, frontend types, tests). High blast radius for a guardrails
  slice; better as a deliberate standalone refactor. Rejected for this issue.
  Note: HPA-164 will add `difficulty` and `engine_version`, both meaningful only
  when `opponent_engine_id` is set — four sparse engine-only columns — which
  makes this generalized refactor strictly more expensive over time; it should
  be tracked as a follow-up ticket rather than left as prose here.
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
