# HPA-161 — Local Engine or Language-Model Opponent Design

**Status:** Product-approved design
**PR state:** Draft, pending repository review
**Date:** 2026-07-30
**Linear:** [HPA-161 — Let players choose a local engine or language-model opponent](https://linear.app/cwchanap/issue/HPA-161/let-players-choose-a-local-engine-or-language-model-opponent)
**Parent:** [HPA-159 — Add a local non-LLM chess rival](https://linear.app/cwchanap/issue/HPA-159/feature-add-a-local-non-llm-chess-rival)

## Summary

Add a first-class opponent choice to standard chess:

- **On-device computer** — Stockfish running in the browser, with no account or API key required; or
- **Language model** — the existing configured provider/model experience.

HPA-161 is the first playable local-rival vertical slice. It owns opponent and side selection, opponent-specific Start gating, a minimal Stockfish browser runtime, board orientation, immutable active-session identity, safe Start/reset behavior, and basic failure handling.

The core architecture separates an editable pre-game `GameSetup` from an immutable `ActiveRivalSession`. Gameplay, history, turn ownership, status, debug/export visibility, and provider identity read from the frozen active session so live preferences, authentication, or AI configuration cannot silently change an in-progress or completed game.

The local engine is **not downloaded merely because it is the selected/default opponent**. Selection performs only cheap synchronous capability checks. The approximately 7 MB lite-single WASM artifact is fetched and compiled on the player's first Start attempt. This avoids charging every signed-out visitor the engine download before they choose to play.

## Current state

Standard chess currently has two top-level modes: `tutorial` and `ai`. `BoardSidePanel` hard-codes **Play vs AI**, and `ChessGame` treats every `ai` game as a language-model game.

Relevant current behavior:

- `ChessGame` stores one `aiPlayer` side and eagerly creates one `createChessAI(defaultAIConfig)` service;
- authenticated AI-config hydration can disable Start while configuration is loading or failed;
- signed-out visitors are not blocked by that hydration gate, but can start and then fail on the first LLM turn because no provider key exists;
- the move effect always calls the LLM-backed service;
- `AIStatusPanel`, `AIGameInstructions`, debug state, and `GameExporter` assume an LLM opponent;
- some mode/setup branches create `human-vs-human` state when no LLM key exists;
- `ChessBoard` always renders White's orientation;
- `GameState.fen`, `ChessMoveRequest`, legal move application, promotion handling, and terminal rules already exist;
- play history already accepts `{ kind: 'engine', id: 'stockfish' }` through HPA-165;
- the monotonic AI move-generation token already prevents many stale LLM callbacks.

HPA-161 replaces the LLM-only orchestration assumptions without redesigning chess rules or the rated LLM path.

## Goals

1. A signed-out visitor can start and complete a standard chess game against an on-device computer without account or API-key prompts.
2. A player can clearly choose **On-device computer** or **Language model** before starting.
3. The language-model option remains visible and preserves its existing sign-in/provider requirements.
4. The selected human side is respected from the first move, including when the rival plays White.
5. Opponent and side cannot drift during an active or completed session.
6. Switching opponent or side before Start produces a clean preview position.
7. Starting creates a clean game from a frozen setup snapshot only after the selected provider is ready.
8. A rival result cannot apply after reset, opponent change, navigation, position replacement, or session replacement.
9. Unsupported environments and engine load failures produce accurate, actionable states.
10. Existing language-model ratings, debug tooling, prompt export, and retry behavior remain available.
11. Opening `/chess` does not fetch or compile Stockfish until the player presses Start for an engine game.

## Non-goals

- Four difficulty presets, labels, calibration, or benchmark evidence — HPA-162.
- Full loading/ready/thinking/recovering state-machine design — HPA-163.
- Per-move timeout policy, same-position retry, robust search cancellation, or recovery from a crashed Worker — HPA-163.
- Engine version/difficulty presentation and downloadable engine-game export — HPA-164.
- Full browser matrix, performance budgets, and accessibility release verification — HPA-166/HPA-187.
- Local rivals for Xiangqi, Shogi, or Jungle.
- Multiple local engines.
- Multithreaded Stockfish, `SharedArrayBuffer`, or cross-origin isolation.
- Analysis boards, hints, evaluations, principal variations, coaching, or opening preparation.
- Rated local-engine play.
- Clocks, takebacks, undo, draw offers, or unfinished-game persistence.
- A generalized rival framework across every game component.

## Approved product decisions

### Delivery boundary

HPA-161 ships a playable standard-chess vertical slice, not selection-only scaffolding. It includes enough Stockfish integration to initialize and complete legal games. HPA-163 hardens the active-turn lifecycle afterward.

### Engine loading boundary

Selecting or defaulting to **On-device computer** performs only cheap synchronous checks:

- `Worker` exists;
- `WebAssembly` exists;
- a minimal WASM module validates successfully.

These checks may mark the engine as **ready to load**, not **loaded** or fully verified. They do not fetch the Worker script or WASM binary.

The first engine Start attempt performs the real Worker creation, WASM fetch/compile, UCI initialization, option configuration, and new-game readiness handshake. A successful engine instance is then owned by that active session.

### Language-model option when unusable

Keep **Language model** visible and selectable. When unusable:

- signed-out players see sign-in guidance;
- signed-in players without a usable provider see configuration guidance;
- Start is disabled only for the LLM selection.

Do not hide the option or apply LLM configuration requirements to the engine path.

### Initial default and memory

Remember the last deliberately selected opponent on the device.

When no remembered choice exists:

- a signed-in player with a confirmed usable LLM configuration defaults to **Language model**;
- everyone else defaults to **On-device computer**.

Remember the human side separately for each opponent kind.

### Automatic fallback

Automatic fallback applies only during untouched remembered/default resolution and never overwrites the stored preference.

- remembered engine + failed cheap capability check + usable LLM → select LLM and announce the fallback;
- remembered LLM + confirmed unusable LLM + engine passes cheap capability checks → select engine and announce the fallback;
- remembered LLM while auth/config is still loading → keep LLM selected provisionally and disable Start;
- explicit user selections are never silently overridden.

A failed **engine load at Start** does not silently switch opponents. Preserve the engine selection, show the load failure, and offer **Try again** or a manual switch to Language model.

### Setup changes and locking

Changing opponent or side before Start:

- immediately creates a clean Play preview;
- updates orientation to the human side;
- clears stale errors, debug moves, exporter state, and terminal state;
- does not load the engine or generate a rival move.

Once Start begins, setup mutation is disabled. Opponent and side controls remain visible but disabled through the terminal result state, with:

> Start a new game to change opponent or side.

## Architecture approaches

### Approach A — Editable setup plus immutable active session (selected)

Use a mutable pre-game setup, then freeze opponent, side, provider identity, provider/model configuration, and history ownership into an active session after provider initialization succeeds.

This approach:

- prevents opponent/side drift;
- gives history and result UI a trustworthy opponent identity;
- preserves the current stale-generation guard while adding session/provider/position guards;
- isolates engine and LLM move production;
- creates clean extension points for HPA-162 and HPA-163;
- limits changes to standard chess.

### Approach B — Inline opponent branches in `ChessGame` (rejected)

Adding engine/LLM conditionals throughout startup, move generation, history, export, status, and reset would make an already broad component more race-prone.

### Approach C — Full lifecycle state machine in HPA-161 (rejected)

A complete loading/thinking/recovering/canceling state machine would absorb most of HPA-163. HPA-161 defines safe minimal lifecycle boundaries only.

## Canonical state model

```ts
type RivalKind = 'engine' | 'llm';
type ChessSide = 'white' | 'black';

type EngineOpponent = {
  kind: 'engine';
  id: 'stockfish';
};

type LlmOpponent = {
  kind: 'llm';
  provider: string;
  model: string;
};

type ChessOpponent = EngineOpponent | LlmOpponent;

interface GameSetup {
  rivalKind: RivalKind;
  humanSide: ChessSide;
}

interface ActiveRivalSession {
  id: number;
  opponent: ChessOpponent;
  humanSide: ChessSide;
  rivalSide: ChessSide;
  startedByUserId: string | null;
}
```

`humanSide` is canonical because the UI says **You play**. `rivalSide` is derived once as the opposite color.

`startedByUserId` freezes history ownership:

- anonymous-start games remain unsaved after later sign-in;
- account A's game is never recorded under account B;
- engine play can continue through logout/account changes without misattribution.

`GameSetup` is editable only when there is no active session and no Start attempt in progress.

`ActiveRivalSession` is created only after the selected provider completes initialization and per-game readiness. All active behavior reads from it:

- turn ownership;
- board orientation;
- opponent summary;
- move provider;
- history descriptor and ownership;
- debug/export visibility;
- status and result copy.

## Session and stale-result protection

Keep the existing monotonic generation token and add explicit session/provider/position ownership.

A move result may be consumed only when:

1. the captured generation token is current;
2. the captured session ID matches the active session;
3. the provider instance is still the active provider;
4. the current FEN matches the requested FEN;
5. the authoritative game is still waiting for the frozen rival side;
6. no result has already been accepted for the request.

`makeAIMove` remains the final legality gate. Providers never mutate chess or React state.

## Device preference and first render

Store a versioned local object, for example:

```text
procyon.chess.rival-preferences.v1
```

```ts
interface RivalPreferencesV1 {
  version: 1;
  lastRivalKind: RivalKind;
  humanSideByRival: Record<RivalKind, ChessSide>;
}
```

Rules:

- validate all parsed values;
- default both human sides to White;
- persist only deliberate opponent/side changes;
- automatic fallback does not overwrite `lastRivalKind`;
- preferences are device-local and require no account;
- corrupt, partial, or future-version payloads fall back safely.

Because the Astro output is static, do not render an interactive White-oriented board and then flip it after client preference hydration. Render the board area behind the existing start overlay or a neutral loading skeleton until the synchronous client preference read completes. Then reveal the resolved orientation and setup. This avoids a visible orientation flash and prevents pre-resolution interaction.

### Resolution matrix

| Source | Engine preflight | LLM state | Result |
|---|---|---|---|
| No stored choice, untouched | supported | confirmed usable | LLM |
| No stored choice | supported | signed out/unconfigured/failed | Engine |
| No stored choice | unsupported | usable | LLM + notice if selection changes |
| Remembered engine | supported | any | Engine |
| Remembered engine | unsupported | usable | LLM + engine→LLM notice |
| Remembered engine | unsupported | unusable | Engine unavailable state |
| Remembered LLM | any | loading | LLM provisionally; Start disabled |
| Remembered LLM | any | usable | LLM |
| Remembered LLM | supported | confirmed unusable | Engine + LLM→engine notice |
| Remembered LLM | unsupported | confirmed unusable | Engine unavailable state |
| Explicit user selection | any | any | Keep selection; gate Start and show its state |

Engine preflight support is not proof that the binary can load. Real engine availability is established only by a successful Start-time initialization.

## User interface

### Mode label and tutorial interaction

Keep the internal `gameMode: 'tutorial' | 'ai'` key to avoid unrelated cross-variant work. Add a backward-compatible label override:

```ts
interface BoardSidePanelProps {
  gameMode: Mode;
  onModeChange: (mode: Mode) => void;
  aiModeLabel?: string; // default: 'Play vs AI'
  children?: React.ReactNode;
}
```

Only standard chess passes `aiModeLabel='Play'`. Existing variants retain **Play vs AI**.

Rival setup is hidden in Tutorial. Switching modes disposes any provider, invalidates pending Start/move work, clears the active session, and initializes a clean destination state. Tutorial state never reuses a Play provider or session.

### Opponent selector

Use an accessible radio group or selectable cards.

**On-device computer**

- Runs on this device
- No account or API key required
- Unrated
- Ready to load / Loading / Load failed / Unsupported state

**Language model**

- configured provider/model when available;
- otherwise sign-in or provider-configuration guidance;
- remains selectable when unusable.

### Side selector

Use:

> **You play:** White / Black

### Persistent summary

Before Start, render from `GameSetup` and current resolved opponent details. During active/terminal play, render only from `ActiveRivalSession`.

Examples:

```text
On-device computer · Computer plays Black · Unrated
```

```text
Language model · Gemini 2.5 Flash · Computer plays White
```

### Automatic fallback notices

Engine to LLM:

> The on-device computer is not supported here, so Language model was selected.

LLM to engine:

> Language model is not available with the current account or settings, so On-device computer was selected.

Render notices in `aria-live='polite'`. Do not announce provisional states while auth/config is loading.

### Engine failure copy

Distinguish unsupported capability from load failure.

Unsupported:

> On-device computer is not supported in this browser or device. Choose Language model or use another supported browser or device.

Load/timeout failure:

> On-device computer could not finish loading. Check your connection and try again, or choose Language model.

**Try again** starts a fresh bounded Start initialization attempt. It invalidates and disposes the previous candidate first. Do not automatically retry.

Do not expose Worker, WASM, MIME, UCI, CSP, timeout constants, or stack traces to players.

### Shared `GameControls` compatibility

Do not replace the existing shared API in a way that forces unrelated variant edits. Add optional overrides while retaining legacy behavior:

```ts
interface GameControlsProps {
  hasGameStarted: boolean;
  isGameOver: boolean;
  aiConfigured?: boolean; // existing compatibility input; default false
  startDisabled?: boolean;
  startLabel?: React.ReactNode;
  showLlmTools?: boolean; // default: aiConfigured ?? false
  isDebugMode: boolean;
  canExport: boolean;
  onStartOrReset: () => void;
  onReset: () => void;
  onToggleDebug: () => void;
  onExport?: () => void;
}
```

`startLabel` is the **complete rendered button content**, including any icon/emoji. It is not a suffix.

Resolution rules:

- `startLabel` wins whenever supplied, regardless of `startDisabled`;
- without `startLabel`, preserve the exact current labels and their emoji behavior;
- debug/export visibility uses `showLlmTools ?? aiConfigured ?? false`;
- Xiangqi, Shogi, and Jungle require no call-site changes;
- standard chess supplies explicit label and tool visibility derived from setup/session state.

Chess labels:

- ready: `▶️ Start`;
- engine loading: `⏳ Loading on-device computer…`;
- engine unsupported/load failed: `⚠️ On-device computer unavailable`;
- LLM config loading: `⏳ Loading language-model settings…`;
- LLM unusable: `⚠️ Language model setup required`;
- active/terminal reset entry: `🆕 New Game`.

Detailed guidance remains outside the button.

## Board orientation and Play preview

Add:

```ts
orientation: 'white' | 'black';
```

Rules:

- White orientation traverses rows/columns in current order;
- Black orientation traverses both in reverse;
- each rendered square reports its canonical logical coordinates;
- never reverse or mutate the board array;
- FEN, rules, move history, promotion, and providers remain orientation-independent;
- setup orientation follows resolved `GameSetup.humanSide`;
- active orientation follows frozen `ActiveRivalSession.humanSide`.

Every Play preview must use:

```ts
createInitialGameState('human-vs-ai', rivalSide)
```

for both engine and LLM selections, even when the selected opponent is not yet usable. Remove the existing `aiConfig`-conditioned `human-vs-human` fallback branches from Play-mode setup/mode-switch logic. Tutorial-only state may continue using its tutorial/human state as appropriate.

The preview board remains interaction-disabled until Start commits an active session.

## Rival provider boundary

The provider contract must preserve LLM metadata and typed non-exception failures.

```ts
type RivalMoveFailureReason =
  | 'no-move'
  | 'invalid-response'
  | 'invalid-move'
  | 'protocol-error';

interface RivalMoveMeta {
  thinking?: string;
  confidence?: number;
  interaction?: {
    prompt?: string;
    response?: string;
  };
}

type RivalMoveResult =
  | {
      ok: true;
      move: ChessMoveRequest;
      meta?: RivalMoveMeta;
    }
  | {
      ok: false;
      reason: RivalMoveFailureReason;
      message?: string;
    };

interface ChessRivalProvider {
  readonly kind: 'engine' | 'llm';

  initialize(): Promise<void>;
  beginGame(): Promise<void>;
  makeMove(state: GameState, requestToken: number): Promise<RivalMoveResult>;
  dispose(): void;
}
```

Provider rules:

- `initialize()` prepares the provider process/service;
- `beginGame()` performs per-game setup; it is a no-op for LLM and a UCI new-game readiness sequence for Stockfish;
- expected no-response/protocol failures return `ok: false`;
- thrown errors are reserved for unexpected transport/provider crashes or aborted ownership;
- only one `makeMove` may be in flight for an instance;
- `dispose()` is idempotent;
- providers never mutate game state.

### LLM provider

Wrap the existing `createChessAI` service and freeze its configuration at Start.

The adapter maps current outcomes:

- valid AI response → `ok: true` with move plus `thinking`, `confidence`, and last prompt/raw-response interaction;
- null/missing move response → `ok: false, reason: 'no-move'`;
- existing thrown provider errors remain thrown for the controller's current error path.

The LLM provider accepts a debug-event callback at construction or through a provider-level listener API, so `ChessGame` never casts or reaches into the concrete provider. Preserve the existing debug dialog, prompt generation, prompt/response export, retry UI, and rating behavior.

### Stockfish provider

Use a dedicated classic same-origin Worker.

Initialization sequence:

1. construct the Worker;
2. send `uci` and wait for `uciok`;
3. verify the advertised **Skill Level** option exists;
4. send `setoption name Skill Level value 0` as the fixed bootstrap strength;
5. send `isready` and wait for `readyok`.

Per-game sequence:

1. send `ucinewgame`;
2. send `isready`;
3. wait for `readyok`;
4. only then allow the active session to commit and the first move request to run.

Move sequence:

1. send `position fen ${state.fen}`;
2. send `go movetime 250`;
3. parse exactly one `bestmove`;
4. map promotion suffixes `q/r/b/n` to `queen/rook/bishop/knight`;
5. return `ok: true` for one valid move request;
6. return typed failures for `(none)`, malformed output, or protocol failure;
7. ignore duplicate output after a request has settled.

`Skill Level 0` is an uncalibrated bootstrap safeguard, not a player-facing preset or Elo claim. HPA-162 replaces it with the four benchmarked presets. Do not describe HPA-161 as beginner-calibrated.

Use `GameState.fen` directly. Do not add another FEN serializer.

## Start-time initialization deadline

Because the engine is loaded only after an explicit Start, use a bounded but download-aware deadline:

```ts
const ENGINE_START_TIMEOUT_MS = 60_000;
```

The deadline covers Worker script fetch, WASM fetch/compile, UCI initialization, bootstrap option application, and `beginGame()` readiness.

On timeout:

- mark the candidate attempt stale;
- terminate/dispose the candidate provider;
- do not create an active session or set `gameStarted`;
- leave a clean locked-then-unlocked preview;
- show the load/timeout failure copy;
- allow a user-triggered **Try again**.

A timeout is a load failure, not proof that the browser/device is unsupported. HPA-166 must measure first-use latency and may revise the budget before release.

No per-move timeout is introduced here; that remains HPA-163.

## Atomic Start transaction

1. Validate selected-opponent usability:
   - LLM must be configured and hydrated;
   - engine must pass cheap capability checks.
2. Disable setup mutation.
3. Increment and capture generation/candidate session IDs.
4. Snapshot opponent, human/rival sides, selected LLM configuration, and current user ID.
5. Create the matching provider.
6. Run `initialize()` within the Start deadline.
7. Run `beginGame()` within the same deadline.
8. Re-check generation/provider ownership.
9. Create fresh `human-vs-ai` state using the frozen rival side.
10. Commit provider, active session, game state, and `gameStarted` together.
11. If the rival is White, allow the normal rival-turn effect only after commit.

Failure before step 10 commits nothing. Dispose the candidate and return to editable setup.

## Rival-turn flow

The opponent-neutral turn controller runs only when:

- an active session exists;
- the position is non-terminal;
- there is no pending promotion;
- it is the frozen rival side's turn;
- no request is in flight;
- the active provider is ready.

Request flow:

1. capture generation, session ID, provider identity, and FEN;
2. set shared thinking state;
3. call `provider.makeMove`;
4. reject stale ownership/FEN results;
5. for `ok: false`, preserve the board and enter the opponent-specific basic failure UI;
6. for `ok: true`, call authoritative `makeAIMove`;
7. if legal, apply one move and use metadata for LLM debug/export;
8. if illegal, preserve the board and report invalid-move failure;
9. clear thinking only for the current request.

HPA-161 engine recovery is **New Game**. Existing LLM retry behavior remains. HPA-163 adds engine same-position retry, cancellation, and move timeouts.

## Provider ownership and React replay

Every Start/preparation attempt receives a unique attempt ID and exactly one disposer. Cleanup marks the attempt stale before terminating its Worker/provider.

This must hold under React development Strict Mode and effect replay:

- duplicate construction may occur;
- every superseded instance is disposed;
- a disposed instance cannot publish readiness or mutate setup/session state;
- no Worker is shared across component mounts.

## Reset, mode changes, and terminal state

### Pre-game opponent or side change

- invalidate pending Start work;
- dispose any candidate provider;
- create a clean `human-vs-ai` preview for the new rival side;
- clear errors/debug/export/terminal state;
- update orientation;
- keep `activeSession = null` and `gameStarted = false`.

### New Game / Play Again

- invalidate move and Start generations;
- dispose the active provider;
- clear active session and all game-specific auxiliary state;
- create a clean preview from current preferences;
- re-enable setup controls.

### Terminal game

Retain the active snapshot through the result state. New Game clears it.

### Tutorial or unmount

Invalidate all work, dispose providers, and prevent late callbacks. Tutorial mode hides rival setup and owns a clean tutorial state.

## Authentication and identity

### LLM session

Preserve the current security boundary:

- logout/account switch invalidates LLM work;
- active LLM play resets;
- captured API configuration cannot continue after identity loss/change.

### Engine session

Engine play does not depend on account/config and continues through logout, account switch, AI-config hydration failure, and provider/model changes.

Extend `useGameIdentityReset` with an optional enable/policy input that defaults to current behavior. Even while callbacks are disabled, the hook must update previous-auth refs so re-enabling does not process an old transition.

Enable identity-driven reset for LLM setup/start/session ownership, not active engine sessions.

## Play-history call-site contract

Do not add a second retry or terminal snapshot mechanism around `usePlayHistory`. Preserve its existing terminal snapshot, account-switch guard, and bounded 401 behavior.

For an active engine session, call the hook with:

```ts
const isSameStartingUser =
  activeSession.startedByUserId !== null &&
  isAuthenticated &&
  user?.id === activeSession.startedByUserId;

usePlayHistory({
  gameVariant: 'chess',
  gameStatus: effectiveStatus,
  aiPlayer: activeSession.rivalSide,
  opponentDescriptor: { kind: 'engine', id: 'stockfish' },
  moveCount: gameState.moveHistory.length,
  getWinnerColor,
  enabled:
    gameMode === 'ai' &&
    gameStarted &&
    activeSession.opponent.kind === 'engine' &&
    isSameStartingUser,
  isAuthenticated,
  userId: user?.id,
  debugVariantKey: 'CHESS',
});
```

Engine callers omit `aiConfig`. LLM callers preserve the existing LLM options and pass the frozen active provider/model configuration.

Identity-reset suppression for an engine game must not clear a terminal active-session snapshot while the same starting user is still authenticated and the history hook is attempting its save. If the user logs out or switches account first, `enabled` becomes false and the engine game remains playable but unsaved rather than being attributed incorrectly.

## History, rating, export, and debug

### Engine

- Show **Unrated** before, during, and after the game.
- Use the HPA-165 engine descriptor when history-eligible.
- Show no rating delta.
- Do not initialize the prompt-oriented `GameExporter`.
- Hide LLM debug and prompt-export controls.
- Defer downloadable engine export and richer metadata to HPA-164.

### LLM

- Preserve rated history.
- Preserve debug callbacks/dialog.
- Preserve prompt/response export.
- Preserve provider/model instructions and existing retry behavior.

All decisions read from the active opponent kind, not editable setup.

## Stockfish packaging

Pin:

```text
stockfish@18.0.8
```

Consume the shipped lite single-threaded files:

```text
node_modules/stockfish/bin/stockfish-18-lite-single.js
node_modules/stockfish/bin/stockfish-18-lite-single.wasm
```

The selected files ship directly in the package tarball. The package's `postinstall` only creates a convenience symlink for another entry point and is not required for these artifacts. **Do not add `stockfish` to Bun `trustedDependencies`.** Skipping that lifecycle script is acceptable and reduces unnecessary install-time execution.

### Preparation script

Add a repository-owned script that:

1. resolves the pinned package installation;
2. verifies both exact source paths;
3. verifies the `.js` and `.wasm` files have the identical basename and are colocated;
4. copies both without renaming or content hashing to:

```text
apps/web/public/vendor/stockfish/
```

5. verifies the destination pair remains:

```text
stockfish-18-lite-single.js
stockfish-18-lite-single.wasm
```

6. fails clearly on any package-layout or basename mismatch.

The loader derives its WASM sibling from the Worker script filename, so the pair must remain in the same directory with matching basenames. Application code loads the stable same-origin Worker URL derived from Astro's base URL.

### Turborepo cache behavior

No extra `bun.lock` entry is required in `globalDependencies`: Turborepo includes the root package manifest and lockfile in the global hash by default. The root/package manifest, preparation script, and tracked source configuration already invalidate the build when the pinned dependency changes.

Do not add redundant global invalidation solely for Stockfish. Add a build-cache regression check proving that a dependency/version or preparation-script change misses the web build cache and regenerates the packaged pair.

### Static delivery

Verify through production-style preview, not only filesystem assertions:

- Worker URL respects Astro's base path and is same-origin;
- WASM is served as `application/wasm`;
- Worker JS has a JavaScript-compatible content type;
- neither URL redirects to an HTML fallback;
- applicable CSP permits same-origin Worker and WASM compilation;
- the Worker successfully initializes under production headers.

HPA-161 owns deterministic build/preview checks. HPA-187 owns final deployed/browser-matrix verification.

### Licensing

Add:

- the upstream GPL-3.0 `Copying.txt`;
- third-party notices naming Stockfish.js and Stockfish;
- exact package version and source/tag/commit reference used for the binary.

Release remains blocked on HPA-187 confirming corresponding-source obligations for the deployed artifact. A notice alone is not sufficient.

## Basic failure behavior

| Failure | HPA-161 behavior |
|---|---|
| Worker/WASM primitives absent | Unsupported state; engine Start disabled |
| Engine script/WASM load or Start timeout | Load-failed state; clean preview; Try again/manual LLM switch |
| Missing `uciok`/`readyok` | Typed protocol/init failure; no active session |
| Missing advertised Skill Level option | Protocol incompatibility; no active session |
| Worker crashes during active game | Preserve board; stop engine play; offer New Game |
| `bestmove (none)` or malformed response | Typed failure; preserve board; offer New Game |
| Illegal move | Reject through chess rules; preserve board |
| Duplicate/out-of-order output | Ignore after request settlement |
| Old result after reset/switch/navigation | Ignore via generation/session/provider/FEN guards |
| LLM signed out/unconfigured | Keep explicit selection; guidance; LLM Start disabled |
| Auth/config changes during engine game | Continue play; prevent history misattribution |

## Implementation delivery sequence

HPA-161 may land as two implementation PRs under the same Linear issue:

### PR A — Engine packaging and production loading fixture

- pin dependency;
- preparation script;
- stable public asset pair;
- static headers/base-path/CSP checks;
- license and third-party notices;
- fake/minimal Worker loading fixture and build-cache checks.

This PR is independently reviewable and has no opponent UI dependency.

### PR B — Opponent/session UI and runtime integration

- setup/preferences/default resolution;
- shared-component compatible overrides;
- board orientation;
- provider interfaces and adapters;
- Start/session/move/reset/history integration;
- component and browser journeys.

HPA-161 closes only after both land. No separate product ticket is required unless implementation planning discovers a new independent deliverable.

## Suggested file boundaries

New chess-rival modules:

```text
apps/web/src/lib/chess/rival/types.ts
apps/web/src/lib/chess/rival/preferences.ts
apps/web/src/lib/chess/rival/resolve-setup.ts
apps/web/src/lib/chess/rival/provider.ts
apps/web/src/lib/chess/rival/llm-provider.ts
apps/web/src/lib/chess/rival/stockfish-provider.ts
apps/web/src/lib/chess/rival/stockfish-protocol.ts
```

New UI modules:

```text
apps/web/src/components/game/ChessRivalSetup.tsx
apps/web/src/components/game/EngineRivalDetails.tsx
apps/web/src/components/game/LlmRivalDetails.tsx
apps/web/src/components/game/RivalSetupSummary.tsx
```

Likely existing changes:

```text
apps/web/src/components/ChessGame.tsx
apps/web/src/components/ChessBoard.tsx
apps/web/src/components/game/BoardSidePanel.tsx
apps/web/src/components/game/GameControls.tsx
apps/web/src/hooks/useGameIdentityReset.ts
apps/web/package.json
package.json
bun.lock
.gitignore
THIRD_PARTY_NOTICES.md
```

Add preparation under `apps/web/scripts/` and upstream license under a third-party licenses directory. Avoid unrelated non-chess refactors.

## Testing strategy

### Preference/default tests

- signed out + no preference → engine without downloading engine assets;
- configured signed in + no preference + untouched setup → LLM;
- remembered LLM + loading → remain LLM, Start disabled;
- engine/LLM automatic fallback notices;
- explicit unusable choice not overridden;
- independent side preferences;
- automatic fallback does not alter stored opponent;
- corrupt/future preference recovery;
- board remains hidden/non-interactive until preference resolution.

### Shared UI tests

- `BoardSidePanel` defaults to **Play vs AI**;
- standard chess override displays **Play**;
- `GameControls` legacy labels/emoji remain unchanged without overrides;
- `startLabel` is rendered verbatim as full content;
- `showLlmTools` override works while legacy `aiConfigured` remains compatible;
- Xiangqi/Shogi/Jungle call sites need no changes.

### Orientation and preview tests

- White/Black traversal and canonical click coordinates;
- no board-array mutation;
- no hydration orientation flash;
- all Play previews use `human-vs-ai` with derived rival side;
- no LLM-key-conditioned `human-vs-human` fallback remains;
- active orientation is immutable.

### Provider contract tests

- LLM valid response maps move plus metadata;
- LLM null response maps typed `no-move` failure;
- LLM debug callback remains provider-boundary-safe;
- exporter receives prompt/response/thinking/confidence without concrete-provider casts;
- expected engine failures return `ok: false` rather than throwing;
- unexpected Worker/provider crashes reject/throw and reach controller error handling.

### UCI tests

- `uci` → `uciok`;
- advertised Skill Level option required;
- `setoption name Skill Level value 0` precedes readiness;
- `isready` → `readyok` after options;
- `ucinewgame` then second `isready` → `readyok` before session commit;
- `position fen` and `go movetime 250` order;
- promotion suffix mapping;
- `(none)`, malformed, duplicate, and out-of-order handling;
- disposal and stale-attempt suppression.

### Start/session tests

- selection alone never constructs Worker or downloads WASM;
- first engine Start initializes under the deadline;
- timeout produces load-failed, not unsupported, state;
- failed Start commits no session/game;
- successful Start freezes opponent/sides/user/provider;
- rival White moves only after session commit;
- generation/session/provider/FEN guards reject stale results;
- Strict Mode replay leaks no Worker;
- engine survives auth/config changes;
- LLM identity change still resets LLM play.

### History tests

- signed-in engine terminal game passes engine descriptor and frozen rival side;
- anonymous-start engine game never saves after sign-in;
- account switch disables engine save without resetting play;
- existing terminal snapshot and 401 retry semantics remain unchanged;
- LLM history/rating behavior is unchanged.

### Packaging/build tests

- exact package paths exist;
- postinstall is not required and `trustedDependencies` is unchanged;
- copied files keep exact matching basenames and directory;
- package/layout mismatch fails closed;
- production preview returns correct MIME types and no HTML fallback;
- Worker loads WASM successfully under headers/CSP;
- build cache invalidates when package version or prep script changes;
- no engine asset request occurs before engine Start.

### Browser journeys

Mocked Worker journeys:

1. signed-out engine selection, side choice, Start loading, rival-first move, human move, New Game;
2. configured LLM startup and existing debug/export path;
3. unsupported engine preflight;
4. engine load timeout/failure and manual retry;
5. automatic fallback notices.

The real Stockfish/WASM cross-browser smoke remains HPA-187/HPA-166.

## Acceptance-criteria mapping

| HPA-161 criterion | Design coverage |
|---|---|
| Signed-out local play without account/API prompts | Engine default, cheap preflight, Start-time local provider |
| Switch between engine and LLM before Start | Explicit cards and clean preview reset |
| Engine default when no usable LLM | Preference/default matrix |
| Selected side respected from move one | Frozen human/rival sides and rival-first post-commit effect |
| Opponent/side consistent during active game | Immutable active session and disabled controls |
| Unsupported environment gets actionable message | Cheap capability checks and separate unsupported copy |
| Existing LLM play remains available | LLM adapter preserves metadata/debug/export/rating/retry |
| Starting/switching creates clean game | `human-vs-ai` preview plus atomic Start |
| Opponent and side visible before/during play | Setup/session summary |
| Reset required to change active settings | Active snapshot retained through terminal state |
| Local option does not impose page-load engine cost | No Worker/WASM fetch before explicit engine Start |

## Dependency boundaries

- HPA-160 supplies authoritative rules/FEN/legal move application.
- HPA-165 supplies engine history/unrated contract.
- HPA-162 replaces bootstrap Skill Level 0 and fixed movetime with calibrated presets.
- HPA-163 adds active-turn cancellation, move timeout, same-position retry, and richer lifecycle recovery.
- HPA-164 adds engine version/difficulty history/export metadata.
- HPA-166 validates browser/performance/accessibility targets, including first-load budget.
- HPA-187 completes real deployment verification and GPL compliance.

## Completion checklist

HPA-161 is complete when:

- both opponent choices and side selector are present;
- engine selection does not fetch Stockfish until Start;
- signed-out engine play completes legally;
- LLM requirements affect only the LLM path;
- preferences/default/fallback behavior is tested;
- first render avoids an orientation flash;
- all Play previews use `human-vs-ai` with the selected rival side;
- active opponent/side/provider/history ownership are frozen;
- provider result union preserves LLM metadata and typed engine failures;
- Stockfish runs Skill Level 0 with correct UCI readiness sequencing;
- reset/navigation/stale results cannot mutate a replaced game;
- engine unsupported and load-failure states are distinct and actionable;
- LLM rating/debug/export behavior remains unchanged;
- exact asset pairing, MIME/base-path/CSP, build-cache, license, and source-notice checks pass;
- implementation may be reviewed in packaging and runtime PRs, but both are complete;
- no HPA-162/163/164/166/187 scope is silently absorbed.