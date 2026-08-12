# HPA-162 — Local Rival MVP Difficulty and Bounded Failure Design

**Status:** Approved design; follow-up review incorporated. This PR remains docs-only.  
**Date:** 2026-08-11  
**Linear:** HPA-162 — Finish local-rival MVP with simple difficulty and bounded failure recovery  
**Parent:** HPA-159 — Add a local non-LLM chess rival  
**Depends on:** HPA-161 — Let players choose a local engine or language-model opponent

## Summary

HPA-162 finishes the first local Stockfish rival MVP by extending the existing HPA-161 setup → frozen session → provider ownership flow with two small capabilities:

1. exactly three understandable on-device difficulty presets — **Casual**, **Normal**, and **Strong**; and
2. one bounded failure path — an on-device move that does not finish within 10 seconds ends that engine session cleanly and requires **New Game**.

The existing architecture already owns the important lifecycle boundaries: editable setup, immutable active rival sessions, lazy provider construction, provider disposal, stale-result guards keyed by generation/session/provider/FEN/turn, and separate LLM retry behavior. HPA-162 extends those seams; it does not add an engine registry, cancellation protocol, retry framework, calibration layer, or second rival state store.

The selected difficulty is mutable device-local setup before Start and frozen engine-session identity after Start. The Stockfish provider receives that frozen preset and maps it to one fixed UCI `Skill Level` value. The existing 250 ms `go movetime` remains unchanged.

The 10-second move deadline stays in `useChessRivalSession`. That hook already owns the request/session/provider tuple needed to decide whether an asynchronous result is still current. On timeout it invalidates the pending request, detaches and disposes the provider, clears thinking, records a typed timeout error, preserves the board and frozen active session, and leaves **New Game** as the only engine recovery offered by the UI.

The provider promise must be wrapped with result/error handlers before racing the deadline. `StockfishRivalProvider.dispose()` rejects an in-flight move waiter, so timeout → dispose naturally produces a later provider rejection. The wrapper makes that rejection observed without adding a cancellation protocol.

## Review resolution

The follow-up review was checked against both `main` and the current HPA-162 Linear contract.

Accepted refinements:

- remove the proposed `clearError()` dead-engine guard; no engine UI path calls `clearError()` today, so the guard would be speculative behavior;
- define one shared runtime difficulty vocabulary/label table and derive `EngineDifficulty` from it;
- split the broad types/preferences/factory work into independently verifiable slices;
- fold Stockfish difficulty mapping into the same slice that changes the engine factory/provider contract;
- include `apps/web/src/lib/chess/rival/types.test.ts` in the implementation surface;
- keep `RivalSetupSummary` difficulty access after its existing `if (!setup)` narrowing;
- add a lightweight manual Casual-vs-Strong sanity play in final verification without creating a benchmark/calibration harness.

One review suggestion is intentionally **not** adopted: keeping the existing `version: 1` rival-preference payload and adding `engineDifficulty` leniently. HPA-162 explicitly requires: **“Store the preference in a new version of the existing rival-preferences payload. Old payloads may reset to defaults; no migration or backward-compatibility layer is required.”** The implementation therefore keeps the V2 payload/key decision. Preserving V1 data would be a reasonable product choice in isolation, but it would change the current ticket contract rather than merely simplify its implementation.

## Reuse survey

| Capability | Decision | Existing seam |
| --- | --- | --- |
| Difficulty vocabulary | Add one small runtime table | `apps/web/src/lib/chess/rival/types.ts` |
| Editable difficulty | Extend | `GameSetup` |
| Frozen difficulty | Extend | `EngineOpponent` inside `ActiveRivalSession` |
| Device persistence | Version current rival-preference payload to V2 | `preferences.ts` + `useChessRivalSetup.ts` |
| Stockfish skill mapping | Extend | `stockfish-provider.ts` + `formatSetSkillLevelCommand` |
| Provider construction | Extend exact factory contract | `UseChessRivalSessionOptions.createEngineProvider` |
| Move deadline | Extend | `useChessRivalSession.ts` request ownership + existing Start race pattern |
| Timeout reason | Extend | `RivalMoveFailureReason` |
| Setup controls | Extend | `ChessRivalSetup` + `useChessRivalSetup` selectors |
| Frozen summary | Extend | `RivalSetupSummary` |
| Timeout copy | Extend | `EngineRivalDetails` |
| Move guard after failure | Reuse | `ChessGame` turn effect already gates on `!rivalSession.rivalError` |
| Board preservation | Reuse | `ChessGame` applies only current successful legal moves |
| Real legal-move smoke | Extend/reuse | `stockfish-assets.spec.ts`, `parseBestMove`, `makeAIMove` |

No rival equivalent of `EngineDifficulty` exists today. Unrelated puzzle difficulty types must not be reused.

## Goals

1. Offer exactly Casual, Normal, and Strong for the on-device computer.
2. Default a fresh V2 preference payload to Casual.
3. Remember the most recently selected local difficulty on the same device.
4. Freeze the selected difficulty when Start succeeds and keep it visible during/after the game.
5. Map Casual → Stockfish Skill Level `0`, Normal → `8`, Strong → `16`.
6. Keep Stockfish movetime at the existing `250` ms for every preset.
7. Apply a `10_000` ms deadline to each on-device move request.
8. On timeout, preserve the board, dispose the failed provider, ignore late resolve/reject output, clear thinking, show a clear error, and require New Game.
9. Extend the packaged-engine browser smoke test so the real distributed Worker returns one move accepted by Procyon's chess rules.
10. Preserve lazy engine loading, signed-out local play, unrated behavior, LLM behavior, reset semantics, and third-party/licensing assets.

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
- Automated strength calibration or a “Casual must score X% worse than Strong” gate.
- Chess clocks, takebacks, draw offers, hints, analysis, or unfinished-game resume.
- Changes to Xiangqi, Shogi, Jungle, Aeroplane Chess, or shared game-core architecture.

## Architecture

### Setup → frozen session → provider

```text
RivalPreferencesV2
        ↓
useChessRivalSetup
        ↓ editable GameSetup
Start ──────────────────────────────┐
                                    ↓
                         ActiveRivalSession
                                    ↓ frozen difficulty
                  createEngineProvider({ difficulty })
                                    ↓
                       StockfishRivalProvider
                                    ↓
                         UCI Skill Level
```

### Move deadline ownership

```text
ChessGame requests rival move
          ↓
useChessRivalSession captures
request/session/provider/FEN/generation/turn
          ↓
wrapped provider outcome ← race → 10 s engine deadline
          ↓                         ↓
current result                    timeout
          ↓                         ↓
return result                clear pending ownership
                             detach providerRef
                             dispose provider
                             clear thinking
                             set timeout error
                             keep board + active session
                             New Game only in engine UI
```

The provider remains a UCI transport. The session hook owns application/session consequences.

## Canonical difficulty vocabulary

Use one ordered runtime table as the product vocabulary and derive the type from it:

```ts
export const ENGINE_DIFFICULTIES = [
  { value: 'casual', label: 'Casual' },
  { value: 'normal', label: 'Normal' },
  { value: 'strong', label: 'Strong' },
] as const satisfies readonly { value: string; label: string }[];

export type EngineDifficulty =
  (typeof ENGINE_DIFFICULTIES)[number]['value'];
```

Add small helpers derived from the same table where useful:

```ts
export function isEngineDifficulty(value: unknown): value is EngineDifficulty {
  return ENGINE_DIFFICULTIES.some(option => option.value === value);
}

export function getEngineDifficultyLabel(value: EngineDifficulty): string {
  return ENGINE_DIFFICULTIES.find(option => option.value === value)!.label;
}
```

This gives runtime extent for tests and persistence validation without duplicating labels in setup and summary components.

The Stockfish numeric mapping is deliberately separate because UCI values are engine integration details, not product vocabulary:

```ts
const STOCKFISH_SKILL_LEVEL_BY_DIFFICULTY = {
  casual: 0,
  normal: 8,
  strong: 16,
} as const satisfies Record<EngineDifficulty, number>;
```

## Editable and frozen data model

Extend setup:

```ts
export interface GameSetup {
  rivalKind: RivalKind;
  humanSide: ChessSide;
  engineDifficulty: EngineDifficulty;
}
```

`engineDifficulty` stays present while LLM is selected so switching rival kind does not need another store.

Every setup reconstruction/comparison path must preserve it:

- `defaultSetup`;
- `setupForResolution`;
- `setupsEqual`;
- `selectRival`;
- `selectHumanSide`;
- new `selectDifficulty`.

Freeze it into the engine opponent descriptor:

```ts
export type EngineOpponent = {
  kind: 'engine';
  id: 'stockfish';
  difficulty: EngineDifficulty;
};
```

Sources of truth:

- before Start: `GameSetup.engineDifficulty`;
- during/after Start: `activeSession.opponent.difficulty`;
- provider construction: the same Start snapshot.

The separate play-history `OpponentDescriptor` remains unchanged; HPA-162 does not persist engine difficulty to server history.

## Provider factory contract

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

Default production factory:

```ts
function defaultCreateEngineProvider({
  difficulty,
}: {
  difficulty: EngineDifficulty;
}): ChessRivalProvider {
  return new StockfishRivalProvider({ difficulty });
}
```

Engine Start constructs with the frozen setup snapshot:

```ts
engineFactoryRef.current({
  difficulty: input.setup.engineDifficulty,
});
```

`StockfishRivalProviderOptions` requires `difficulty: EngineDifficulty`; `workerFactory`, `origin`, and `baseUrl` remain optional runtime/test plumbing.

The provider maps the difficulty immediately during `initialize()` and continues to send `go movetime 250` for all three presets.

## Preferences — V2 by ticket contract

Use the new key:

```text
procyon.chess.rival-preferences.v2
```

Payload:

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

The version/key change is atomic. Update together:

- `RIVAL_PREFERENCES_STORAGE_KEY`;
- preference payload type;
- default creator;
- parser/version/difficulty validation;
- read/write helpers;
- `persistRivalKind`;
- `persistHumanSide`;
- new `persistEngineDifficulty`;
- setup-hook preference state and `readPreferencesOnce`;
- test helpers/fixtures that import the payload type;
- browser E2E preference fixture.

Rules:

- read only V2;
- do not migrate/read V1;
- V1 may remain unused in localStorage;
- malformed/partial/future-version/invalid-difficulty V2 falls back to the full V2 default;
- persist difficulty only after deliberate selection;
- storage failures preserve current in-memory behavior;
- automatic fallback and LLM config changes never change engine difficulty.

The browser E2E should import the canonical storage key from the app source rather than introducing another hard-coded version string where practical.

## Setup and UI contracts

### `useChessRivalSetup`

Add:

```ts
selectDifficulty(difficulty: EngineDifficulty): void;
```

The selector parallels `selectHumanSide`:

1. mark setup touched;
2. keep explicit rival kind stable;
3. clear fallback notice state;
4. update in-memory V2 preferences;
5. persist via `persistEngineDifficulty` when storage exists;
6. update `GameSetup.engineDifficulty`; and
7. call existing `onSetupChange(nextSetup)`.

`ChessGame` already supplies `rivalSession.reset` through `onSetupChange`; difficulty changes reuse that path.

### `ChessRivalSetup`

Add:

```ts
onSelectDifficulty: (difficulty: EngineDifficulty) => void;
```

Render the radio choices from `ENGINE_DIFFICULTIES` only while `setup.rivalKind === 'engine'`.

Reuse the current `disabled` setup lock so the choices are disabled during Start and throughout an active/completed game. Hide them entirely while LLM is selected.

Selecting a difficulty must not instantiate/download Stockfish.

### `RivalSetupSummary`

Keep the existing active-session-first flow and existing optional-setup narrowing:

```ts
if (activeSession?.opponent.kind === 'engine') {
  return engineSummary(
    getEngineDifficultyLabel(activeSession.opponent.difficulty),
    activeSession.rivalSide
  );
}

// existing LLM active-session branch

if (!setup) {
  return '';
}

const rivalSide = getRivalSide(setup.humanSide);
if (setup.rivalKind === 'engine') {
  return engineSummary(
    getEngineDifficultyLabel(setup.engineDifficulty),
    rivalSide
  );
}
```

Example engine summary:

```text
On-device computer · Casual · Computer plays Black · Unrated
```

LLM summary stays unchanged.

## Start/session freezing

For engine Start:

1. read `input.setup.engineDifficulty`;
2. call `createEngineProvider({ difficulty })`;
3. run existing initialize/beginGame sequence under the unchanged `ENGINE_START_TIMEOUT_MS = 60_000`;
4. only after readiness, commit `ActiveRivalSession` with `opponent: { kind: 'engine', id: 'stockfish', difficulty }`;
5. keep setup locked for the life of the active/terminal session.

If Start fails, no active session is committed. The player can retry Start or change setup exactly as today.

Live preferences/auth/LLM configuration after Start cannot alter the frozen engine difficulty.

## Bounded engine move deadline

Add:

```ts
export const ENGINE_MOVE_TIMEOUT_MS = 10_000;
```

Extend the existing failure union with `'timeout'` and add a plain-language timeout message to `failureMessages`.

### Wrapped provider outcome

Do not race the raw provider promise. Attach both settlement handlers first:

```ts
type ProviderOutcome =
  | { kind: 'result'; result: RivalMoveResult }
  | { kind: 'error'; error: unknown };

const providerOutcome: Promise<ProviderOutcome> = provider
  .makeMove(context.gameState, requestId)
  .then(
    result => ({ kind: 'result', result }) as const,
    error => ({ kind: 'error', error }) as const
  );
```

For engine sessions only, race that wrapped promise against the deadline and clear the timer when either side settles. LLM sessions await `providerOutcome` directly.

### Current timeout path

If the deadline wins and `isCurrent()` still proves ownership:

1. clear `pendingRequestRef` for that exact request;
2. detach `providerRef` if it still points to the timed-out provider;
3. clear rival thinking;
4. dispose the provider;
5. keep `activeSessionRef` and React `activeSession` unchanged;
6. set a `move-failed` timeout error;
7. return `{ ok: false, reason: 'timeout', ... }`.

If reset/session replacement happened first, the timeout path is stale and must not write an error or dispose a newer provider.

The wrapper is load-bearing for **late rejection**: real Stockfish disposal rejects its move waiter. A late provider resolve has no consumer after `Promise.race` has already returned the timeout; board-level integration coverage is the meaningful proof that no late move can apply.

### Recovery semantics

Do **not** add special behavior to `clearError()` for HPA-162.

Current ownership is sufficient:

- engine move failure/timeout renders `EngineRivalDetails` error copy with no same-position retry action;
- `ChessGame`'s rival-turn effect already stops while `rivalSession.rivalError` is present;
- the only current `clearError()` caller is the LLM retry path;
- timeout detaches the provider, so `requestMove()` also returns `null` if called without a live provider;
- New Game calls the existing reset path and is the only engine recovery surfaced by the UI.

If an engine-facing `clearError()` caller is introduced later, revisit this invariant then rather than silently making the public method conditionally no-op today.

## Timeout presentation

Timeout copy should be engine-specific, for example:

```text
Computer move timed out
The on-device computer took too long to move.
Start a New Game to reset the computer opponent.
```

Do not render **Try again** for a committed move failure/timeout. The existing Start-load failure can retain **Try again**, because no active game was committed in that path.

Do not expose Worker/UCI internals or the `10_000` ms constant to the player.

## Real packaged-engine legal-move smoke

Extend `apps/web/e2e/stockfish-assets.spec.ts`; do not add another Playwright project or CI job.

After current UCI readiness:

1. `ucinewgame`;
2. wait for `readyok`;
3. `position startpos`;
4. `go movetime 250`;
5. capture one `bestmove ...` line;
6. terminate Worker in `finally`;
7. parse with existing `parseBestMove`;
8. create `createInitialGameState('human-vs-ai', 'white')` so White is both the AI and side to move;
9. pass parsed `from`, `to`, and optional `promotion` to existing `makeAIMove`;
10. assert the next state is non-null.

Do not assert an exact opening move.

Existing static asset, MIME, license, corresponding-source, failed-request, and console-error assertions stay intact.

## Test strategy

### Timeout/session ownership — first

Use fake timers in `useChessRivalSession.test.tsx` for:

- engine move reaches timeout at exactly `ENGINE_MOVE_TIMEOUT_MS`;
- provider disposed exactly once;
- active session retained;
- thinking cleared;
- timeout returned/set as typed failure;
- dispose-induced late rejection is handled and cannot replace timeout state;
- reset before deadline prevents stale timeout state;
- old request deadline never disposes a newer provider/session;
- normal engine result before deadline works as today;
- LLM move is not subject to the engine deadline.

A separate hook-level “late resolve after Promise.race” test is optional and not relied upon. The meaningful late-move proof is the ChessGame integration test that verifies the board remains unchanged even after the fake provider is later resolved.

### Difficulty vocabulary/preferences

Test the runtime table rather than pretending a TypeScript union has runtime extent:

```ts
expect(ENGINE_DIFFICULTIES).toEqual([
  { value: 'casual', label: 'Casual' },
  { value: 'normal', label: 'Normal' },
  { value: 'strong', label: 'Strong' },
]);
```

Preference tests cover:

- V2 key/default;
- Casual default;
- V2 round trip;
- all three valid difficulties;
- invalid/corrupt/future V2 fallback;
- V1 is not read;
- independent rival/side/difficulty persistence;
- blocked storage remains non-throwing.

### Setup/session/provider

Cover:

- stored difficulty restored;
- engine→LLM→engine keeps remembered engine difficulty;
- automatic fallback never mutates difficulty;
- `selectDifficulty` persists and calls existing `onSetupChange`;
- engine factory receives exact Start snapshot difficulty;
- committed engine opponent freezes the same difficulty;
- changing source setup after Start cannot alter it;
- Stockfish emits Skill Level `0`/`8`/`16` for Casual/Normal/Strong;
- `go movetime 250` remains unchanged for every preset;
- missing Skill Level advertisement still fails initialization.

### UI/integration

Cover:

- three choices come from the shared table and appear only for engine;
- choice callback is `onSelectDifficulty`;
- controls lock with opponent/side during Start/active/terminal state;
- pre-Start summary reads setup difficulty;
- active/terminal summary reads frozen session difficulty;
- timeout copy has no move retry affordance;
- timeout preserves the board;
- resolving the fake provider after timeout still cannot apply a move;
- New Game resets the failed session and allows a fresh Start;
- no engine asset is requested before explicit engine Start.

## Expected implementation surface

Primary files:

- `apps/web/src/lib/chess/rival/types.ts`
- `apps/web/src/lib/chess/rival/types.test.ts`
- `apps/web/src/lib/chess/rival/preferences.ts`
- `apps/web/src/lib/chess/rival/preferences.test.ts`
- `apps/web/src/lib/chess/rival/stockfish-provider.ts`
- `apps/web/src/lib/chess/rival/stockfish-provider.test.ts`
- `apps/web/src/hooks/useChessRivalSetup.ts`
- `apps/web/src/hooks/useChessRivalSetup.test.tsx`
- `apps/web/src/hooks/useChessRivalSession.ts`
- `apps/web/src/hooks/useChessRivalSession.test.tsx`
- `apps/web/src/test/fakeRival.ts`
- `apps/web/src/components/game/ChessRivalSetup.tsx`
- `apps/web/src/components/game/ChessRivalSetup.test.tsx`
- `apps/web/src/components/game/RivalSetupSummary.tsx`
- `apps/web/src/components/game/RivalSetupSummary.test.tsx`
- `apps/web/src/components/game/EngineRivalDetails.tsx`
- `apps/web/src/components/game/EngineRivalDetails.test.tsx`
- `apps/web/src/components/ChessGame.tsx`
- `apps/web/src/components/ChessGame.test.tsx`
- `apps/web/e2e/chess-rival.spec.ts`
- `apps/web/e2e/stockfish-assets.spec.ts`

No API, database, migration, rating, shared game-core, or non-chess variant changes are expected.

## Implementation boundaries

- Reuse `useChessRivalSetup`; no second difficulty store/hook.
- Reuse `ActiveRivalSession`; no engine-game session type beside it.
- Reuse `StockfishRivalProvider`; no engine registry.
- Reuse existing stale-result ownership checks; no cancellation protocol.
- Reuse existing `EngineRivalDetails` error/New Game presentation; no same-position retry.
- Leave `clearError()` semantics unchanged for this ticket.
- Reuse existing Stockfish Playwright project/CI step.
- Reuse `parseBestMove` and authoritative `makeAIMove` for real-engine smoke validation.
- Keep server play-history `OpponentDescriptor` unchanged.
- Do not modify historical HPA-161 documents just to rewrite old future-scope notes.

## Acceptance matrix

| Requirement | Design proof |
| --- | --- |
| Exactly three named presets | `ENGINE_DIFFICULTIES` runtime table |
| Casual default | V2 preference default |
| Remember last difficulty | V2 device persistence |
| Freeze at Start | `EngineOpponent.difficulty` + factory input |
| Skill 0/8/16 | provider-local mapping |
| Movetime unchanged | shared `250` ms constant for all presets |
| Selector locked | existing setup `disabled` state reused |
| 10-second engine deadline | engine-only race in session hook |
| Board preserved | no successful move returned/applied on timeout |
| Provider disposed | timeout detaches/disposes current provider |
| Late rejection handled | provider outcome wraps rejection before race |
| Late move cannot apply | ChessGame integration resolves fake after timeout and board stays unchanged |
| New Game only | engine error UI has no move retry; current turn effect stops on `rivalError` |
| Start timeout unchanged | existing `60_000` ms constant untouched |
| Real Worker legal move | existing Stockfish smoke → `parseBestMove` → `makeAIMove` |
| No eager download | difficulty selection is setup/persistence only |
| LLM unchanged | deadline gated to engine; `clearError()` stays LLM retry behavior |

## Completion criteria

HPA-162 is complete when:

- the shared runtime table exposes exactly Casual/Normal/Strong;
- V2 device preferences default/persist/restore engine difficulty as specified by Linear;
- successful Start freezes and visibly retains difficulty;
- Stockfish receives only mapped Skill Level while keeping 250 ms movetime;
- an engine move still pending at 10 seconds enters the error path, disposes the provider, preserves the board, and cannot apply a late move;
- New Game resets the failed session and allows a fresh setup/start;
- the real packaged Stockfish Worker returns at least one move accepted by Procyon's chess rules;
- focused tests, typecheck, lint, build, unit suite, rival E2E, and Stockfish asset smoke pass;
- a brief manual Casual-vs-Strong play sanity check confirms both presets run correctly and are observably different enough to justify the user-facing choice, without treating that check as calibration or an Elo claim.
