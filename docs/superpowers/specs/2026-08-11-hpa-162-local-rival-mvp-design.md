# HPA-162 — Local Rival MVP Difficulty and Bounded Failure Design

**Status:** Approved design and written spec  
**Date:** 2026-08-11  
**Linear:** HPA-162 — Finish local-rival MVP with simple difficulty and bounded failure recovery  
**Parent:** HPA-159 — Add a local non-LLM chess rival  
**Depends on:** HPA-161 — Let players choose a local engine or language-model opponent

## Summary

HPA-162 finishes the first local Stockfish rival MVP by extending the existing HPA-161 setup → frozen session → provider ownership flow with two deliberately small capabilities:

1. exactly three understandable on-device difficulty presets — **Casual**, **Normal**, and **Strong**; and
2. one bounded failure path — an on-device move that does not finish within 10 seconds ends that engine session cleanly and requires **New Game**.

This is not a new rival architecture. HPA-161 already owns editable setup, immutable active rival sessions, provider construction/disposal, stale-result checks keyed by generation/session/provider/FEN/turn, lazy Stockfish loading, and separate LLM retry behavior. HPA-162 extends those seams rather than creating an engine registry, cancellation protocol, retry framework, calibration layer, or second state store.

The selected difficulty is mutable device-local setup before Start and immutable engine-session identity after Start. The Stockfish provider receives that frozen preset and maps it to one fixed UCI `Skill Level` value. The existing 250 ms engine movetime remains unchanged.

The 10-second move deadline is owned by `useChessRivalSession`, because that hook already decides whether an async provider result still belongs to the current game. On timeout, the hook invalidates the request, detaches and disposes the provider, clears thinking, records a typed timeout error, preserves the board and frozen active session, and makes **New Game** the only recovery. Late output cannot apply, and clearing an error alone must not re-arm a timed-out engine session whose provider is gone.

This spec supersedes the older HPA-161 future-scope notes that mentioned four benchmarked presets or placed the per-move timeout in HPA-163. Linear now defines HPA-162 as the sole remaining HPA-159 MVP slice.

## Reuse survey

The implementation should extend these existing seams directly:

| Capability | Decision | Existing seam |
| --- | --- | --- |
| `EngineDifficulty` | New small domain type | `apps/web/src/lib/chess/rival/types.ts` |
| Editable difficulty | Extend | `GameSetup` |
| Frozen difficulty | Extend | `EngineOpponent` inside `ActiveRivalSession` |
| Device persistence | Rewrite current rival preferences payload as V2 | `preferences.ts` + `useChessRivalSetup.ts` |
| Stockfish skill mapping | Extend | `stockfish-provider.ts` + existing `formatSetSkillLevelCommand` |
| Provider construction | Extend exact factory contract | `UseChessRivalSessionOptions.createEngineProvider` |
| Move deadline | Extend | existing Start deadline/race ownership pattern in `useChessRivalSession.ts` |
| Timeout failure reason | Extend | `RivalMoveFailureReason` |
| Setup controls | Extend | `ChessRivalSetup` + `useChessRivalSetup` selectors |
| Frozen summary | Extend | `RivalSetupSummary` |
| Timeout copy | Extend | `EngineRivalDetails` |
| Move guard on error | Reuse | `ChessGame` turn effect already gates on `!rivalSession.rivalError` |
| Board preservation | Reuse | `ChessGame` applies only current successful legal moves |
| Real legal-move smoke | Extend/reuse | `stockfish-assets.spec.ts`, `parseBestMove`, `makeAIMove` |

No rival equivalent of `EngineDifficulty` exists today; unrelated puzzle difficulty types must not be reused.

## Goals

1. Offer exactly Casual, Normal, and Strong for the on-device computer.
2. Default a new device to Casual.
3. Remember the most recently selected engine difficulty on that device.
4. Freeze the selected difficulty on successful Start.
5. Map Casual → Stockfish Skill Level `0`, Normal → `8`, Strong → `16`.
6. Keep Stockfish movetime at the existing 250 ms for every preset.
7. Apply a 10-second deadline to each on-device move request.
8. On timeout, preserve the board, dispose the failed provider, ignore late output, clear thinking, show a clear error, and require New Game.
9. Extend the packaged-engine browser smoke test so the real distributed Worker returns one move accepted by Procyon's authoritative chess rules.
10. Preserve lazy engine loading, signed-out local play, unrated engine history, LLM behavior, reset semantics, and existing third-party/licensing assets.

## Non-goals

- Elo estimates, calibration, tournaments, benchmarks, or per-device strength tuning.
- More than three presets or advanced Stockfish controls.
- Per-difficulty movetime changes.
- Multiple local engines, an engine registry, or plugin configuration.
- Same-position retry after timeout or Worker failure.
- Automatic Worker reconstruction.
- Retry counters, backoff, or a generalized recovery state machine.
- AbortController/provider cancellation protocol changes.
- LLM move deadlines or changes to LLM pause/retry behavior.
- Engine version/difficulty persistence in server play history.
- Full local-game export/history persistence.
- Formal browser certification or numeric performance budgets.
- Chess clocks, takebacks, draw offers, hints, analysis, or unfinished-game resume.
- Changes to Xiangqi, Shogi, Jungle, Aeroplane Chess, or shared game-core architecture.

## Architecture decision

### Selected approach — extend setup → frozen session → provider

Difficulty follows the ownership path already used for rival kind and side:

```text
RivalPreferencesV2
        ↓
useChessRivalSetup
        ↓ editable GameSetup
Start ──────────────────────────────┐
                                    ↓
                         ActiveRivalSession
                                    ↓ frozen engine difficulty
                  createEngineProvider({ difficulty })
                                    ↓
                       StockfishRivalProvider
                                    ↓
                         UCI Skill Level
```

Move timeout remains inside the session owner:

```text
ChessGame requests rival move
          ↓
useChessRivalSession captures
request/session/provider/FEN/generation/turn ownership
          ↓
provider.makeMove()  ← race → 10 s engine deadline
          ↓                         ↓
current result                    timeout
          ↓                         ↓
return result                clear pending ownership
                             detach providerRef
                             dispose provider
                             clear thinking
                             set timeout error
                             keep active session + board
                             New Game only
```

This adds no lifecycle owner. The same hook that currently decides whether a provider result is stale also decides whether a deadline belongs to the current request/session/provider.

### Rejected — provider-owned timeout

Putting the 10-second deadline in `StockfishRivalProvider.makeMove()` would make the UCI transport layer responsible for application/session recovery policy and would weaken the existing request/session/provider stale-result ownership model.

The provider should continue to own Stockfish communication only. Session consequences belong in `useChessRivalSession`.

### Rejected — generic engine/recovery framework

A generic engine registry, options framework, cancellation protocol, retry manager, or recovery state machine would solve problems outside HPA-162. Stockfish is the only local engine and New Game is the only timeout recovery path.

## Canonical data model

### Difficulty type

Add one shared rival type:

```ts
export type EngineDifficulty = 'casual' | 'normal' | 'strong';
```

Do not persist or expose numeric UCI values outside the Stockfish integration.

### Editable setup

Extend the current setup shape:

```ts
export interface GameSetup {
  rivalKind: RivalKind;
  humanSide: ChessSide;
  engineDifficulty: EngineDifficulty;
}
```

`engineDifficulty` remains present while LLM is selected. It is inactive setup state, allowing the last engine choice to survive rival-kind switching without another store or union hierarchy.

Every setup reconstruction/comparison path must preserve it, including:

- `defaultSetup`;
- `setupForResolution`;
- `setupsEqual`;
- `selectRival`;
- `selectHumanSide`; and
- the new `selectDifficulty`.

### Frozen engine identity

Extend the engine opponent descriptor:

```ts
export type EngineOpponent = {
  kind: 'engine';
  id: 'stockfish';
  difficulty: EngineDifficulty;
};
```

Sources of truth:

- before Start: `GameSetup.engineDifficulty`;
- during/after Start: `activeSession.opponent.difficulty` for engine sessions;
- provider construction: the same frozen Start snapshot.

No active-game UI should read localStorage or mutable setup to display engine difficulty.

## Explicit provider factory contract

The factory boundary is load-bearing and must be changed explicitly rather than inferred during implementation.

Change:

```ts
createEngineProvider?: () => ChessRivalProvider;
```

to:

```ts
createEngineProvider?: (input: {
  difficulty: EngineDifficulty;
}) => ChessRivalProvider;
```

The default production factory mirrors the existing LLM factory style:

```ts
function defaultCreateEngineProvider({
  difficulty,
}: {
  difficulty: EngineDifficulty;
}): ChessRivalProvider {
  return new StockfishRivalProvider({ difficulty });
}
```

At Start, engine construction is therefore:

```ts
engineFactoryRef.current({
  difficulty: input.setup.engineDifficulty,
});
```

The session committed after successful initialization must contain the same difficulty value. Injected factories/fakes in session tests must adopt this signature so tests can assert exactly which frozen preset construction received.

`StockfishRivalProviderOptions` should require `difficulty: EngineDifficulty` for provider construction; Worker factory/origin/base URL remain optional test/runtime plumbing. The provider itself should not invent a device preference default — Casual is a setup/preferences default.

## Stockfish preset mapping

Keep the mapping beside the existing provider rather than create a generic engine-config module:

```ts
const STOCKFISH_SKILL_LEVEL_BY_DIFFICULTY = {
  casual: 0,
  normal: 8,
  strong: 16,
} as const satisfies Record<EngineDifficulty, number>;
```

Initialization continues to use the existing protocol helper:

```text
uci
→ verify Stockfish advertised Skill Level
→ formatSetSkillLevelCommand(mappedDifficulty)
→ isready
```

The existing `formatSetSkillLevelCommand` and Skill Level advertisement check are reused.

`STOCKFISH_MOVE_TIME_MS = 250` remains unchanged for all three presets.

The UI must not show Elo estimates or imply calibration. Casual/Normal/Strong are relative product labels backed only by fixed Stockfish Skill Level values.

## Preferences — atomic V1 → V2 rewrite

This work is a **full rival-preferences module rewrite to the V2 key**, not a field graft onto V1.

Change the canonical key to:

```text
procyon.chess.rival-preferences.v2
```

Canonical payload:

```ts
export interface RivalPreferencesV2 {
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
  humanSideByRival: {
    engine: 'white',
    llm: 'white',
  },
  engineDifficulty: 'casual',
}
```

The following paths must move to V2 together in one implementation step:

- `RIVAL_PREFERENCES_STORAGE_KEY` value;
- `RivalPreferencesV1` → `RivalPreferencesV2` usages;
- `createDefaultRivalPreferences` return type/data;
- `parseRivalPreferences` version/difficulty validation;
- `readRivalPreferences`;
- internal `writeRivalPreferences`;
- `persistRivalKind`;
- `persistHumanSide`;
- new `persistEngineDifficulty`;
- `useChessRivalSetup.readPreferencesOnce`;
- setup-hook preference state/type;
- `setupForResolution` and every selector that rebuilds setup.

Rules:

- read only the V2 key;
- do not read or migrate the V1 key;
- V1 may remain in localStorage unused;
- malformed, partial, unknown-version, or invalid-difficulty V2 data falls back to the full V2 default;
- persist difficulty only after deliberate difficulty selection;
- storage failures retain the existing in-memory fallback behavior;
- automatic rival fallback never changes difficulty;
- LLM configuration changes never change difficulty.

This deliberately accepts resetting old local rival/side preferences on upgrade. There is no compatibility or migration layer.

## Setup hook and component contracts

### `useChessRivalSetup`

Extend the result contract explicitly:

```ts
export interface UseChessRivalSetupResult {
  // existing fields...
  selectRival(kind: RivalKind): void;
  selectHumanSide(side: ChessSide): void;
  selectDifficulty(difficulty: EngineDifficulty): void;
  clearFallbackNotice(): void;
}
```

`selectDifficulty` parallels `selectHumanSide`:

1. mark setup as deliberately touched;
2. keep the explicit rival kind stable;
3. clear fallback notice state as existing deliberate setup changes do;
4. update in-memory `RivalPreferencesV2.engineDifficulty`;
5. persist through `persistEngineDifficulty` when storage exists;
6. update `GameSetup.engineDifficulty` without changing rival kind/side; and
7. call the existing `onSetupChange(nextSetup)` callback.

`ChessGame` already wires `onSetupChange` to `rivalSession.reset`; difficulty changes must use that same path, not a new session-reset mechanism.

### `ChessRivalSetup`

Extend the component contract explicitly:

```ts
interface ChessRivalSetupProps {
  // existing props...
  onSelectRival: (kind: RivalKind) => void;
  onSelectHumanSide: (side: ChessSide) => void;
  onSelectDifficulty: (difficulty: EngineDifficulty) => void;
}
```

Render exactly three compact radio choices only while `setup.rivalKind === 'engine'`:

- Casual
- Normal
- Strong

Use the same `disabled` prop as opponent/side controls, so difficulty is locked:

- while Start is in flight;
- throughout an active game; and
- after a terminal result until New Game.

When LLM is selected, hide the difficulty controls rather than showing disabled engine controls.

Selecting a difficulty must not instantiate or download Stockfish.

### Summary

Before Start, engine summary uses setup state, for example:

```text
On-device computer · Casual · Computer plays Black · Unrated
```

After successful Start and through terminal/timeout states, engine summary uses `activeSession.opponent.difficulty`.

LLM summary remains unchanged.

## Start and session freezing

`StartRivalSessionInput.setup` already captures the editable setup snapshot passed to Start.

For an engine Start:

1. read `input.setup.engineDifficulty`;
2. call `createEngineProvider({ difficulty })` with that snapshot;
3. initialize/begin the provider using the existing 60-second Start deadline;
4. only after readiness succeeds, commit `ActiveRivalSession` with `opponent: { kind: 'engine', id: 'stockfish', difficulty }`;
5. retain existing setup locking for the life of the active/terminal session.

If Start fails, no active session is committed. The player may retry Start or change setup exactly as today.

Changes to localStorage, auth state, AI provider configuration, or setup-hook resolution after a successful Start cannot change the active engine difficulty.

The existing `ENGINE_START_TIMEOUT_MS = 60_000` remains unchanged.

## Bounded engine move deadline

### Scope

Add in `useChessRivalSession`:

```ts
export const ENGINE_MOVE_TIMEOUT_MS = 10_000;
```

Apply it only when the committed session's opponent kind is `engine`.

LLM `requestMove` behavior stays unchanged: no new deadline and no change to its pause/retry flow.

### Typed timeout reason

Extend the existing failure union:

```ts
export type RivalMoveFailureReason =
  | 'no-move'
  | 'invalid-response'
  | 'invalid-move'
  | 'protocol-error'
  | 'timeout';
```

Add the timeout message to the existing `failureMessages` record. `RivalSessionError` continues to use `kind: 'move-failed'` with `reason: 'timeout'`; do not add a parallel timeout error channel.

### Request race

Reuse the Start-deadline pattern, but preserve the move request's stronger ownership checks.

For an engine request:

1. establish the existing `PendingMoveRequest` and `rivalThinking` state;
2. call `provider.makeMove(state, requestId)`;
3. race it against the 10-second deadline;
4. clear the timer if the provider settles first;
5. ensure the provider promise has a catch path so disposal/late rejection cannot become unhandled;
6. re-check the existing request/session/provider/generation/FEN/turn guards before consuming either outcome.

If the provider wins while current, continue existing result handling.

If the deadline wins **and that exact request still owns the current session/provider**:

1. clear `pendingRequestRef` only for that request;
2. clear `rivalThinking`;
3. set `providerRef.current = null` before disposal;
4. dispose the captured provider;
5. keep `activeSessionRef` and React `activeSession` unchanged;
6. set a typed timeout move failure;
7. return `{ ok: false, reason: 'timeout', ... }` to the caller.

If reset, navigation, generation replacement, FEN change, turn change, or a newer provider/session occurs before the deadline, the old deadline is stale: it must not write an error and must never dispose the newer provider.

### Dead-provider recovery invariant

A timed-out engine session intentionally has this state:

```text
activeSession = committed engine session
providerRef = null
rivalError = timeout
```

`rivalError` is already the normal `ChessGame` turn-effect guard, but it must not be the **only** invariant preventing accidental resume.

The simplest ownership-safe rule is:

> `clearError()` must not clear the error for a committed engine session whose provider has been detached/disposed.

Conceptually:

```ts
if (
  activeSessionRef.current?.opponent.kind === 'engine' &&
  providerRef.current === null
) {
  return;
}
setRivalError(null);
```

This keeps provider liveness private to the session hook and avoids adding a new public `hasProvider`/`canRetry` state just to gate `ChessGame`.

Current `clearError()` usage is the LLM retry path; that behavior remains available because an LLM retry retains its provider. `reset()` / New Game is the only operation that clears the timed-out engine session and allows another Start.

Do not add a same-position retry button, provider reconstruction, or hidden auto-restart.

### Board preservation

`useChessRivalSession` never mutates chess state. `ChessGame` applies a move only after `requestMove` returns a current successful result and `makeAIMove` accepts it.

Therefore timeout preserves:

- current FEN;
- all prior legal moves;
- move history;
- active rival side/difficulty summary.

`ChessGame` clears its board-level AI-thinking flag for the typed failure as it already does for other provider failures.

### Timeout presentation

Use engine-specific plain language, for example:

```text
Computer move timed out
The on-device computer took too long to move.
Start a New Game to continue.
```

Do not show the Start-load **Try again** action for a move timeout. Start-load failure may keep its current retry affordance because no active game was committed.

Do not expose Worker/UCI internals or the 10,000 ms constant to the player.

## Real packaged-engine legal-move smoke

Extend `apps/web/e2e/stockfish-assets.spec.ts`; do not add another Playwright project or CI job.

After the same-origin Worker completes the existing `uci` / `uciok` and readiness flow:

1. send `ucinewgame`;
2. wait for `readyok`;
3. send the standard starting position;
4. send `go movetime 250`;
5. wait for one `bestmove ...` line using the existing generous browser-smoke timeout;
6. terminate the Worker in `finally`;
7. return the line/string to the Playwright test runner;
8. parse it with existing `parseBestMove` / collector logic rather than adding a second UCI parser;
9. create Procyon's standard initial chess state;
10. pass the parsed move through existing authoritative `makeAIMove`; and
11. assert a non-null legal next state.

Do not assert a specific opening move.

Keep existing asset, MIME, license, corresponding-source, failed-request, and console-error assertions intact.

## Test strategy

### 1. Timeout ownership first

The timeout race is the highest-risk change and must be proven with fake timers before UI work.

Extend `useChessRivalSession.test.tsx` with a controllable fake engine provider and cover:

- engine move still pending at 10 seconds becomes `reason: 'timeout'`;
- provider is detached/disposed exactly once;
- committed session remains present;
- thinking clears;
- timeout returns no successful move;
- late resolve after timeout cannot apply, clear, or replace the timeout error;
- late reject after timeout is handled and does not become an unhandled rejection;
- reset before deadline prevents the old request from writing timeout state;
- a newer session/provider is never disposed by an older deadline;
- normal engine result before deadline clears the timer and behaves as today;
- LLM requests are not subject to `ENGINE_MOVE_TIMEOUT_MS`;
- `clearError()` cannot re-arm a timed-out engine session with no provider;
- New Game/reset clears the dead engine session and permits a later Start.

Use fake timers; no unit test should wait 10 real seconds.

### 2. Types, persistence, and factory freezing

Cover:

- exactly the three `EngineDifficulty` values used by the product;
- V2 Casual default;
- V2 round-trip persistence;
- invalid/corrupt/future payload fallback;
- V1 key ignored/reset behavior;
- `persistRivalKind`, `persistHumanSide`, and `persistEngineDifficulty` all write V2;
- restored difficulty on later setup mount;
- setup reconstruction/equality keeps difficulty;
- engine factory receives the Start snapshot's difficulty;
- committed `EngineOpponent` contains the same frozen difficulty;
- later mutable preference/setup changes cannot alter the committed session;
- LLM factory/session behavior remains unchanged.

### 3. Stockfish mapping

Extend provider tests to prove:

- Casual emits Skill Level 0;
- Normal emits 8;
- Strong emits 16;
- all presets continue to emit `go movetime 250`;
- existing failure when Stockfish does not advertise Skill Level remains intact.

### 4. Setup/UI wiring

Extend setup/component tests to prove:

- `selectDifficulty` persists and calls `onSetupChange`;
- three difficulty choices are visible only for engine setup;
- Casual is initially selected on a fresh device;
- controls use the existing disabled/lock behavior;
- switching to LLM hides but does not forget engine difficulty;
- active/terminal/timeout summary reads frozen session difficulty;
- timeout copy directs New Game and exposes no move retry;
- existing LLM setup/details remain unchanged.

### 5. Browser smoke

Extend the existing Stockfish asset test to obtain one real packaged-engine `bestmove`, parse it with existing UCI logic, and validate it with `makeAIMove`.

## Implementation-plan ordering constraint

The detailed implementation plan must be **risk-first**, not "typecheck first, timeout last".

Required task order:

1. establish failing fake-timer session tests for timeout/dispose/stale/late-result/dead-provider recovery;
2. implement the minimal session timeout behavior needed to pass those tests;
3. perform the atomic V1 → V2 preferences rewrite plus `EngineDifficulty`, frozen-session data, and explicit engine factory signature;
4. wire Stockfish 0/8/16 mapping and unchanged 250 ms movetime;
5. wire setup hook/component/summary/error UI;
6. extend the real Worker smoke from readiness through `bestmove` → `parseBestMove` → `makeAIMove`;
7. run focused checks after each task and the full validation matrix at the end.

The plan should use the existing Start-deadline race as the implementation template, but preserve the stronger move ownership guards.

No new abstraction should be introduced to satisfy this order.

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
- corresponding existing unit/component tests and fake provider helpers.

No API, database, migration, rating, shared game-core, or non-chess variant files should be required.

## Implementation boundaries

- Reuse `useChessRivalSetup`; do not create a difficulty store/hook.
- Reuse `ActiveRivalSession`; do not create an engine-game session beside it.
- Reuse `StockfishRivalProvider`; do not add an engine registry.
- Reuse existing UCI helpers, especially Skill Level formatting and bestmove parsing.
- Reuse stale-result ownership checks; do not add provider cancellation protocol.
- Keep provider liveness private to `useChessRivalSession`; do not expose it merely to recover from timeout.
- Reuse existing engine error/New Game presentation; specialize timeout wording only.
- Reuse existing Stockfish Playwright project and CI step.
- Reuse authoritative chess move application for the real-engine smoke assertion.
- Do not edit HPA-161 historical design docs merely to rewrite superseded future-scope notes; this spec is the current authority.

## Acceptance matrix

| Requirement | Design proof |
| --- | --- |
| Casual / Normal / Strong | Engine-only selector in existing setup |
| Casual fresh-device default | RivalPreferencesV2 default |
| Remember last difficulty | V2 device-local persistence |
| Freeze difficulty at Start | `EngineOpponent.difficulty` + explicit factory input |
| Skill values 0 / 8 / 16 | One Stockfish-specific map |
| Keep engine movetime | Existing 250 ms constant unchanged |
| Selector locked during Start/game | Existing setup `disabled` lock reused |
| No eager engine download | Difficulty selection is pure setup/persistence state |
| 10-second engine move deadline | Engine-only race in session hook |
| Preserve board on timeout | No successful move reaches `makeAIMove` |
| Dispose failed Worker | Timed-out provider detached then disposed |
| Ignore late output | Pending ownership cleared + provider identity invalidated |
| New Game only | Dead-provider engine error cannot be cleared into resume |
| Existing 60-second Start deadline | Unchanged |
| LLM behavior unchanged | No LLM deadline; LLM `clearError` retry remains viable |
| Real Worker returns legal move | Existing smoke extended through parser + `makeAIMove` |

## Completion criteria

HPA-162 is complete when:

- all three presets can be selected and persisted through the V2-only preference path;
- successful Start freezes and visibly retains the selected engine difficulty;
- the exact frozen difficulty reaches provider construction;
- Stockfish receives Skill Level 0/8/16 while movetime stays 250 ms;
- an engine move still pending at 10 seconds enters the timeout path, detaches/disposes its provider, preserves the board/session, and cannot apply a late result;
- clearing an error cannot resume a timed-out engine session without a provider;
- New Game fully resets that failed session and permits a fresh Start;
- the real packaged Worker returns at least one move accepted by Procyon's chess rules;
- focused tests, typecheck, lint, build, full unit suite, existing rival E2E, and Stockfish asset smoke pass without changing LLM, rating, or lazy-load behavior.