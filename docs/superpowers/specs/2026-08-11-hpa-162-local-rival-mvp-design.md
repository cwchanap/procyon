# HPA-162 — Local Rival MVP Difficulty and Bounded Failure Design

**Status:** Approved design, pending written-spec review  
**Date:** 2026-08-11  
**Linear:** HPA-162 — Finish local-rival MVP with simple difficulty and bounded failure recovery  
**Parent:** HPA-159 — Add a local non-LLM chess rival  
**Depends on:** HPA-161 — Let players choose a local engine or language-model opponent

## Summary

HPA-162 finishes the first local Stockfish rival MVP by extending the existing HPA-161 setup/session/provider boundaries with two intentionally small capabilities:

1. three understandable on-device difficulty presets — **Casual**, **Normal**, and **Strong**; and
2. one bounded failure path — an on-device move that does not finish within 10 seconds ends that engine session cleanly and requires **New Game**.

This is not a new rival architecture. HPA-161 already provides the important ownership model: editable pre-game setup, an immutable active rival session, provider ownership and disposal, stale-result guards keyed by generation/session/provider/FEN/turn, lazy Stockfish loading, and separate LLM behavior. HPA-162 reuses those seams.

The selected difficulty is device-local setup state before Start and frozen engine-session identity after Start. The Stockfish provider receives that frozen preset and maps it to one fixed UCI `Skill Level` value. Move time remains the existing 250 ms.

The 10-second move deadline is owned by `useChessRivalSession`, because that hook already decides whether an asynchronous provider result still belongs to the current game. When an engine request times out, the hook disposes the engine provider, invalidates the pending request, clears thinking, records a typed timeout error, preserves the board and frozen active-session summary, and blocks further engine moves until New Game. Late output cannot apply because the timed-out provider is no longer the active provider and the request no longer owns the pending slot.

This design supersedes the older deferred-scope notes in the HPA-161 design that referred to four benchmarked presets and placed per-move timeout work in HPA-163. Linear now defines HPA-162 as the sole remaining HPA-159 MVP slice: three fixed presets plus the bounded 10-second local-move failure path.

## Current repository state

The current code already contains the boundaries needed for this work:

- `GameSetup` contains editable rival kind and human side.
- `ActiveRivalSession` freezes opponent identity, human/rival side, starting user, and LLM config where applicable.
- `useChessRivalSetup` hydrates device-local rival preferences, resolves automatic fallback, persists deliberate setup changes, and locks setup while Start is in flight or a game is active/completed.
- `RivalPreferencesV1` stores last rival kind and per-rival human side under `procyon.chess.rival-preferences.v1`.
- `StockfishRivalProvider` uses a fixed `Skill Level 0` and fixed 250 ms `go movetime`.
- `useChessRivalSession` owns a 60-second Start deadline, committed provider/session refs, one pending move request, thinking/error state, reset disposal, and stale-result checks.
- `ChessGame` uses `rivalSession.rivalError` as a move-generation guard and already preserves the board when an engine move fails.
- `EngineRivalDetails` already directs move failures to New Game rather than retrying the same position.
- `stockfish-assets.spec.ts` already launches the packaged same-origin Stockfish Worker and verifies UCI readiness, but it does not yet ask the real engine for a move.

The remaining work can therefore stay local to standard chess rival setup/session/provider/UI tests and the existing Stockfish smoke test.

## Goals

1. Offer exactly three on-device difficulty choices: Casual, Normal, and Strong.
2. Default a new device to Casual.
3. Remember the most recently selected on-device difficulty on that device.
4. Freeze the chosen difficulty when Start succeeds so later preference/auth/config changes cannot alter an active or completed game.
5. Map the three presets to fixed Stockfish UCI `Skill Level` values: Casual `0`, Normal `8`, Strong `16`.
6. Keep the existing Stockfish move time unchanged at 250 ms.
7. Apply a 10-second deadline to each on-device move request in the existing rival-session ownership layer.
8. On timeout, preserve the board, dispose the failed provider, ignore all late output, clear thinking, show a clear error, and require New Game.
9. Extend the packaged-engine browser smoke test so the real distributed Worker returns one move that Procyon's chess rules accept as legal.
10. Preserve lazy engine loading, signed-out local play, unrated engine history, LLM behavior, reset semantics, and existing third-party/licensing assets.

## Non-goals

- Elo estimates, calibration, tournaments, benchmarks, or per-device strength tuning.
- More than three presets or advanced Stockfish controls.
- Multiple local engines, an engine registry, or plugin configuration.
- Per-difficulty movetime changes.
- Same-position retry after timeout or Worker failure.
- Automatic Worker reconstruction.
- Retry counters, backoff, or a generalized recovery state machine.
- Provider cancellation/abort protocol changes.
- LLM move deadlines or changes to LLM retry behavior.
- Engine version/difficulty persistence in server play history.
- Full local-game export/history persistence.
- Formal browser certification or numeric performance budgets.
- Chess clocks, takebacks, draw offers, hints, analysis, or unfinished-game resume.
- Changes to Xiangqi, Shogi, Jungle, Aeroplane Chess, or shared game-core architecture.

## Architecture decision

### Selected approach — extend setup → frozen session → provider

Difficulty follows the same ownership path already used for rival kind and side:

```text
RivalPreferencesV2
        ↓
useChessRivalSetup
        ↓ editable GameSetup
Start ──────────────────────────────┐
                                    ↓
                         ActiveRivalSession
                                    ↓ frozen engine difficulty
                         createEngineProvider(...)
                                    ↓
                         Stockfish Skill Level
```

The move deadline stays in `useChessRivalSession`:

```text
ChessGame requests rival move
          ↓
useChessRivalSession captures
request/session/provider/FEN/generation/turn ownership
          ↓
engine provider.makeMove()  ← race → 10 s deadline
          ↓                         ↓
valid current result              timeout
          ↓                         ↓
return move                  drop pending ownership
                             detach + dispose provider
                             clear thinking
                             set timeout error
                             keep board/session
                             require New Game
```

This approach is preferred because it adds no new lifecycle owner. The same hook that currently decides whether a result is stale also decides whether a request timed out and whether the timed-out provider still belongs to the current session.

### Rejected approach — provider-owned timeout

Putting the 10-second deadline inside `StockfishRivalProvider.makeMove()` would make the provider responsible for application/session recovery policy. It would also leave `useChessRivalSession` to infer whether a provider error means timeout, Worker failure, reset, or stale replacement.

The provider should continue to own UCI communication only. Session ownership and failure consequences belong in the session hook.

### Rejected approach — generic engine/recovery framework

A generic engine options object, cancellation protocol, retry manager, or lifecycle state machine would solve problems HPA-162 explicitly does not have. Stockfish is the only engine and New Game is the only recovery path. Adding those abstractions would increase implementation and maintenance cost without improving the MVP.

## Canonical data model

### Difficulty type

Add a small shared rival type:

```ts
export type EngineDifficulty = 'casual' | 'normal' | 'strong';
```

No numeric UCI values appear in React setup code or persisted preferences.

### Editable setup

Extend the existing setup rather than introducing a union hierarchy:

```ts
export interface GameSetup {
  rivalKind: RivalKind;
  humanSide: ChessSide;
  engineDifficulty: EngineDifficulty;
}
```

`engineDifficulty` remains present while LLM is selected. It is simply inactive setup state, similar to how the preference object already remembers human side separately by rival kind. This keeps setup resolution and React call sites simple.

### Frozen active engine identity

Put the difficulty on the engine opponent descriptor:

```ts
export type EngineOpponent = {
  kind: 'engine';
  id: 'stockfish';
  difficulty: EngineDifficulty;
};
```

This makes the active-session source of truth self-contained:

- setup UI before Start reads `GameSetup.engineDifficulty`;
- active/terminal UI reads `activeSession.opponent.difficulty`;
- the provider factory receives the same frozen value;
- no active-game UI reads localStorage or mutable setup to display difficulty.

LLM opponent/session types remain unchanged.

## Stockfish preset mapping

Keep one centralized mapping beside the existing Stockfish provider because UCI `Skill Level` is Stockfish-specific:

```ts
export const STOCKFISH_SKILL_LEVEL_BY_DIFFICULTY = {
  casual: 0,
  normal: 8,
  strong: 16,
} as const satisfies Record<EngineDifficulty, number>;
```

`StockfishRivalProviderOptions` gains the difficulty required for normal production construction. Tests may continue to inject Worker factories/origin/base URL.

Initialization becomes conceptually:

```text
uci
→ verify Skill Level option exists
→ setoption name Skill Level value <mapped frozen preset>
→ isready
```

The existing `STOCKFISH_MOVE_TIME_MS = 250` is unchanged for every preset.

Do not publish an Elo label or imply that the three names are calibrated ratings. They are product-friendly relative presets backed only by fixed Stockfish Skill Level values.

## Preference persistence

Create a new preference payload/key rather than migrating V1:

```text
procyon.chess.rival-preferences.v2
```

```ts
interface RivalPreferencesV2 {
  version: 2;
  lastRivalKind: RivalKind;
  humanSideByRival: Record<RivalKind, ChessSide>;
  engineDifficulty: EngineDifficulty;
}
```

Default:

```ts
{
  version: 2,
  lastRivalKind: 'engine',
  humanSideByRival: { engine: 'white', llm: 'white' },
  engineDifficulty: 'casual',
}
```

Rules:

- read only the V2 key;
- V1 is ignored and may remain in storage;
- malformed, partial, unknown-version, or invalid-difficulty V2 data falls back to the full V2 default;
- persist difficulty only on a deliberate difficulty selection;
- storage read/write failures retain the existing in-memory fallback behavior;
- automatic rival fallback never changes difficulty;
- changing LLM settings never changes engine difficulty.

This intentionally accepts resetting old local rival/side preferences on upgrade; HPA-162 explicitly requires no migration or backward-compatibility layer.

## Setup and UI behavior

### Difficulty selector

Add a compact radio group to `ChessRivalSetup` with labels:

- **Casual**
- **Normal**
- **Strong**

Show it only when `setup.rivalKind === 'engine'`.

It uses the same `disabled` setup lock as opponent and side controls. Therefore it is disabled:

- while Start is in flight;
- throughout an active game; and
- after a terminal result until New Game.

Do not show disabled engine-difficulty controls while LLM is selected; hide them entirely.

Changing difficulty before Start:

1. marks setup as deliberately touched;
2. updates in-memory V2 preferences;
3. persists the selected difficulty when storage is available;
4. updates `GameSetup.engineDifficulty`; and
5. calls the existing `onSetupChange`, so any stale failed/candidate provider state is reset using the same path as opponent/side changes.

No engine asset is loaded by selecting a difficulty.

### Persistent summary

Extend the engine summary to include difficulty.

Before Start:

```text
On-device computer · Casual · Computer plays Black · Unrated
```

During and after the game, the summary must use `activeSession.opponent.difficulty`, never the live setup preference.

The LLM summary remains unchanged.

### Failure presentation

A timeout should display plain-language engine-specific copy, for example:

```text
Computer move timed out
The on-device computer took too long to move.
Start a New Game to continue.
```

Do not offer **Try again** for a move timeout. The existing Start-load failure may continue to offer **Try again**, because no active game was committed in that case.

Do not expose Worker/UCI internals or the 10,000 ms constant to the player.

## Start and session freezing

`StartRivalSessionInput.setup` already carries the editable setup snapshot. On a successful engine Start:

1. capture `input.setup.engineDifficulty` with the rest of the setup;
2. construct the engine provider using that value;
3. initialize/begin the provider using the existing 60-second Start deadline;
4. only after initialization succeeds, commit `ActiveRivalSession` with `opponent: { kind: 'engine', id: 'stockfish', difficulty }`;
5. keep setup locked for the life of that active/terminal session.

If Start fails, no active session is committed. The player can retry Start, change difficulty, change side, or change rival kind exactly as the current pre-game failure flow allows.

Changes to localStorage, auth state, AI provider configuration, or setup-hook internal resolution after a successful Start cannot change the frozen difficulty.

## Bounded move deadline

### Scope

Apply the 10-second deadline only when the committed session's opponent kind is `engine`.

LLM `requestMove` behavior remains byte-for-byte equivalent in policy: no new timeout and no change to its pause/retry flow.

Add:

```ts
export const ENGINE_MOVE_TIMEOUT_MS = 10_000;
```

in `useChessRivalSession`, beside the existing Start timeout constant.

### Timeout result type

Extend the existing typed failure reason with:

```ts
export type RivalMoveFailureReason =
  | 'no-move'
  | 'invalid-response'
  | 'invalid-move'
  | 'protocol-error'
  | 'timeout';
```

This avoids adding another parallel error channel. `RivalSessionError` can continue using `kind: 'move-failed'` with `reason: 'timeout'`.

### Request lifecycle

For an engine request, after the current pending request and `rivalThinking` state are established:

1. start `provider.makeMove(state, requestId)`;
2. race it against the 10-second deadline;
3. clear the timer if the provider settles first;
4. attach a catch to the provider promise after racing so disposal or a later Worker failure cannot become an unhandled rejection;
5. re-check the same ownership guards before consuming either result.

If the provider result wins, existing result/staleness handling continues.

If the deadline wins **and the request is still current**:

1. clear `pendingRequestRef` for that exact request;
2. clear `rivalThinking`;
3. detach the timed-out provider from `providerRef` before disposal;
4. dispose the provider, which terminates its Worker and rejects its internal pending waiter;
5. keep `activeSessionRef` and React `activeSession` unchanged;
6. set `rivalError` to a typed timeout move failure;
7. return a typed `{ ok: false, reason: 'timeout', ... }` result to the caller.

Detaching `providerRef` before/while disposing is important: even if a fake/test provider resolves after the deadline, the existing `isCurrent()` predicate fails the provider-identity check. The pending slot has also been cleared, so the timed-out result has two independent stale guards.

If reset/navigation/session replacement happens before the timeout wins, the request is stale and the timeout path must not write a new error or dispose a newer provider. Existing reset ownership remains authoritative.

### Board preservation

The hook never mutates chess state. `ChessGame` already applies a provider move only after `requestMove` returns a current successful result and the existing `makeAIMove` legality gate accepts it.

Therefore timeout handling leaves:

- the current FEN unchanged;
- all prior legal moves unchanged;
- move history unchanged;
- active opponent/side/difficulty summary unchanged.

`ChessGame` clears its board-level `isAiThinking` flag for the typed failure exactly as it already does for other move failures.

### Why keep the active session after timeout

Do not set `activeSession = null` on timeout.

Keeping the session committed provides the desired product state:

- setup remains locked, so the failed position cannot silently become a different rival configuration;
- the frozen difficulty remains visible;
- play-history ownership metadata remains coherent if the board was already terminal for an unrelated reason;
- `rivalError` prevents the move effect from starting another request;
- the existing New Game action is the only way to reset provider/session/game state together.

The provider itself is gone, so the timed-out game cannot resume accidentally.

## Real packaged-engine legal-move smoke test

Extend the existing `apps/web/e2e/stockfish-assets.spec.ts` test rather than creating another Playwright project or CI job.

After the same-origin Worker passes `uci` / `uciok` and `isready` / `readyok`:

1. send `ucinewgame`;
2. send `isready` and wait for `readyok`;
3. send `position startpos`;
4. send `go movetime 250`;
5. wait for one `bestmove ...` line with the existing generous browser-smoke timeout;
6. terminate the Worker in `finally`;
7. return the `bestmove` line/string to the test runner;
8. parse it with the existing Stockfish protocol collector/parser rather than adding a second UCI parser;
9. create Procyon's standard starting chess state; and
10. pass the parsed move through the existing authoritative `makeAIMove`/chess-rules path and assert that it produces a non-null legal next state.

The assertion is deliberately semantic: the distributed Worker must produce a move that Procyon's own chess rules accept. Do not assert one exact opening move.

Existing static-asset, MIME, license, corresponding-source, failed-request, and console-error assertions stay intact.

## Test strategy

### Difficulty and persistence

Extend `types.test.ts` / `preferences.test.ts` / `useChessRivalSetup.test.tsx` to cover:

- exactly the three allowed difficulty values;
- Casual default;
- V2 round-trip persistence;
- invalid/corrupt/future payload fallback;
- V1 ignored/reset behavior;
- difficulty restored on a later setup mount;
- LLM selection retaining remembered engine difficulty without displaying the selector;
- selector change persistence;
- setup change callback on difficulty mutation;
- setup mutation blocked while Start/active/terminal locks are applied.

### Provider mapping

Extend `stockfish-provider.test.ts` to prove:

- Casual emits Skill Level 0;
- Normal emits 8;
- Strong emits 16;
- movetime remains 250 ms for every preset;
- the existing failure when Stockfish does not advertise `Skill Level` remains intact.

### Session freezing

Extend `useChessRivalSession.test.tsx` to prove:

- the engine factory receives the Start snapshot's difficulty;
- the committed engine opponent contains the frozen difficulty;
- changing the source setup object after Start does not alter the session;
- LLM factory/session behavior is unchanged.

### Timeout and stale results

Use an injected fake engine provider whose `makeMove()` can remain pending and later be resolved manually.

Cover:

- pending engine move transitions to timeout at 10 seconds;
- provider is disposed exactly once;
- committed session remains present;
- thinking clears;
- timeout error is typed as `reason: 'timeout'`;
- timeout returns no successful move to apply;
- late resolution after timeout returns/applies nothing and cannot clear/replace the timeout error;
- reset before the deadline prevents the old timer/request from writing a timeout error;
- a newer session/provider is never disposed by an older request's deadline;
- normal engine result before deadline clears the timer and behaves as today;
- LLM requests are not subject to `ENGINE_MOVE_TIMEOUT_MS`.

Prefer fake timers for the hook-level deadline tests so the suite does not wait 10 real seconds.

### UI

Extend `ChessRivalSetup.test.tsx`, `RivalSetupSummary.test.tsx`, `EngineRivalDetails.test.tsx`, and focused `ChessGame` tests to cover:

- three difficulty choices visible only for the engine;
- Casual initially selected;
- difficulty disabled with the rest of setup while locked;
- active summary reads frozen session difficulty;
- timeout copy directs the player to New Game and does not show the Start-load **Try again** action;
- existing LLM setup/details remain unchanged.

### Browser smoke

Extend the existing Stockfish asset Playwright test to obtain and validate one legal starting move from the real packaged Worker.

## Expected implementation surface

Primary files:

- `apps/web/src/lib/chess/rival/types.ts`
- `apps/web/src/lib/chess/rival/preferences.ts`
- `apps/web/src/lib/chess/rival/stockfish-provider.ts`
- `apps/web/src/hooks/useChessRivalSetup.ts`
- `apps/web/src/hooks/useChessRivalSession.ts`
- `apps/web/src/components/game/ChessRivalSetup.tsx`
- `apps/web/src/components/game/RivalSetupSummary.tsx`
- `apps/web/src/components/game/EngineRivalDetails.tsx`
- `apps/web/src/components/ChessGame.tsx` for wiring only
- `apps/web/e2e/stockfish-assets.spec.ts`
- corresponding existing unit/component tests

No API, database, migration, rating, shared game-core, or non-chess variant files should be required.

## Implementation boundaries

- Reuse the existing setup hook; do not create a second difficulty store/hook.
- Reuse the existing active rival session; do not create an engine-game session type beside it.
- Reuse the existing Stockfish provider; do not add an engine registry.
- Reuse existing stale-result ownership checks; do not create an AbortController/cancellation protocol.
- Reuse existing engine error/New Game presentation; only distinguish timeout wording where useful.
- Reuse the existing Stockfish Playwright project and CI step.
- Reuse Procyon's authoritative chess move application to validate the real engine smoke move.
- Do not modify HPA-161 historical documents just to rewrite their old deferred-scope notes; this HPA-162 spec is the current authority for the remaining MVP slice.

## Acceptance matrix

| Requirement | Design proof |
| --- | --- |
| Casual / Normal / Strong before Start | Engine-only difficulty radio group in existing setup |
| Casual default | RivalPreferencesV2 default |
| Remember last difficulty | Device-local V2 persistence |
| Freeze difficulty at Start | Difficulty stored in frozen `EngineOpponent` and passed to provider factory |
| Skill values 0 / 8 / 16 | One Stockfish-specific mapping |
| Keep current engine movetime | Existing 250 ms constant unchanged |
| Selector locked during Start/game | Existing `disabled` setup lock reused |
| 10-second local move deadline | Engine-only race in `useChessRivalSession` |
| Preserve board on timeout | Session hook owns no board mutation; failure returns without applying a move |
| Dispose failed Worker | Timed-out provider detached and disposed |
| Ignore late output | Pending ownership cleared + active provider identity changed |
| New Game only | Active session retained with timeout error; no retry/rebuild path |
| Existing Start timeout unchanged | `ENGINE_START_TIMEOUT_MS = 60_000` untouched |
| Real Worker produces legal move | Existing Stockfish Playwright smoke extended through Procyon chess rules |
| No eager engine download | Difficulty remains pure setup/persistence state; Worker construction still occurs only on Start |
| LLM behavior unchanged | Deadline gated to engine sessions and no LLM contract changes |

## Completion criteria

HPA-162 is complete when:

- all three presets can be selected and persisted;
- a successful Start freezes and visibly retains the selected engine difficulty;
- Stockfish receives only the mapped Skill Level while keeping 250 ms movetime;
- an engine move still pending at 10 seconds enters the terminal-for-that-session error path, disposes the provider, preserves the board, and cannot apply a late result;
- New Game fully resets the failed session and allows a new setup/start;
- the real packaged Stockfish Worker returns at least one move accepted by Procyon's chess rules;
- focused tests, typecheck, lint, build, the full unit suite, existing rival E2E, and the Stockfish asset smoke suite pass without changing LLM/rating/lazy-load behavior.
