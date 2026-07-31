# HPA-161 — Local Engine or Language-Model Opponent Design

**Status:** Product-approved design
**PR state:** Draft, pending repository review
**Date:** 2026-07-30
**Linear:** [HPA-161 — Let players choose a local engine or language-model opponent](https://linear.app/cwchanap/issue/HPA-161/let-players-choose-a-local-engine-or-language-model-opponent)
**Parent:** [HPA-159 — Add a local non-LLM chess rival](https://linear.app/cwchanap/issue/HPA-159/feature-add-a-local-non-llm-chess-rival)

## Summary

Add an explicit opponent choice to standard chess so a player can choose either:

- **On-device computer** — Stockfish running in the browser, with no account or API key required; or
- **Language model** — the existing configured provider/model experience.

HPA-161 is the first playable local-rival vertical slice. It owns opponent and side selection, opponent-specific startup gating, a minimal Stockfish browser runtime, board orientation, clean session initialization, and basic safe failure handling. It does not absorb the calibrated difficulty work from HPA-162 or the production-grade lifecycle, cancellation, turn timeout, and retry work from HPA-163.

The central architecture decision is to keep an editable pre-game setup separate from an immutable active-session snapshot. Gameplay, history, turn ownership, and status render from the active snapshot, so authentication updates, preference hydration, or selector state cannot silently change the opponent or side during a game.

## Current state

The standard chess screen currently has two top-level modes: `tutorial` and `ai`. The user-facing label is hard-coded as **Play vs AI** in `BoardSidePanel`, and `ChessGame` treats every `ai` game as an LLM game.

Relevant current behavior:

- `ChessGame` stores a single `aiPlayer` side and creates one `createChessAI(defaultAIConfig)` service.
- `useAIConfigHydration` and the Start button assume AI play requires authenticated provider configuration.
- the move effect always calls the LLM-backed service;
- `AIStatusPanel` and `AIGameInstructions` contain provider/API-key-specific copy;
- `ChessBoard` always renders White's orientation;
- opponent history already supports `{ kind: 'engine', id: 'stockfish' }` through the HPA-165 contract;
- the chess rules state already exposes authoritative `fen`, legal move application, promotions, and terminal-state handling from HPA-160.

This issue should replace the LLM-only orchestration assumptions without redesigning shared game rules or the existing rated LLM path.

## Goals

1. A signed-out visitor can start and complete a standard chess game against an on-device computer without sign-in or API-key prompts.
2. A player can clearly choose **On-device computer** or **Language model** before starting.
3. The language-model option remains visible and preserves its existing sign-in/provider requirements.
4. The selected human side is respected from the first move, including when the rival plays White.
5. Opponent and side cannot drift during an active or completed session.
6. Switching opponent or side before Start always produces a clean preview position.
7. Starting always creates a clean game from a frozen setup snapshot.
8. A local-engine result cannot apply after reset, opponent change, navigation, or session replacement.
9. Unsupported browsers/devices receive an understandable and actionable unavailable state.
10. Existing language-model play, ratings, debug tooling, and prompt export continue to behave as before.

## Non-goals

- Difficulty selection, labels, calibration, or benchmark evidence — HPA-162.
- Full loading/ready/thinking/recovering state-machine design — HPA-163.
- Per-move timeout policy, in-position retry, robust cancellation, or recovery from a crashed Worker — HPA-163. The bounded preparation/initialization deadline required to prevent an unbounded **Checking** or Start state is explicitly in HPA-161.
- Engine version and difficulty presentation in history/export — HPA-164.
- Full browser matrix, performance budgets, and accessibility release verification — HPA-166/HPA-187.
- A real-engine cross-browser release smoke matrix — HPA-187.
- Local rivals for Xiangqi, Shogi, or Jungle.
- Multiple local engines.
- Multithreaded Stockfish, `SharedArrayBuffer`, or cross-origin isolation.
- Analysis boards, hints, evaluations, principal variations, coaching, or opening preparation.
- Rated local-engine play.
- Clocks, takebacks, undo, draw offers, or unfinished-game persistence.
- A generalized rival framework across every game component.

## Approved product decisions

### Delivery boundary

HPA-161 ships a **playable vertical slice**, not selection-only scaffolding. It includes the minimum Stockfish loading and move-generation path required to play a legal game. HPA-163 hardens that path afterward.

### Availability check

Use a lightweight real capability probe:

- check for browser Worker and WebAssembly primitives;
- initialize the selected Stockfish artifact;
- complete a UCI `uci` / `isready` handshake;
- enforce a 15-second wall-clock deadline for each probe or initialization attempt;
- show a plain-language unavailable state if the probe fails or times out;
- provide **Try checking again**, which invalidates and disposes the prior attempt before starting a fresh probe.

The 15-second deadline applies to preparation and to Start only when Start must initialize a new provider. It is not a chess-move timeout and does not absorb HPA-163.

HPA-166 remains responsible for the documented support matrix and performance validation.

### Language-model option when unusable

Keep **Language model** visible and selectable. When it is not usable:

- signed-out players see sign-in guidance;
- signed-in players without a usable provider see provider/API-key configuration guidance;
- Start is disabled only for the language-model selection.

Do not hide the option and do not apply LLM requirements to the on-device selection.

### Initial default

Remember the last deliberately selected opponent on the current device.

When no remembered choice exists:

- a signed-in player with a usable LLM configuration defaults to **Language model**;
- everyone else defaults to **On-device computer**.

### Side memory

Remember the human side separately for each opponent kind. A player can therefore prefer White against Stockfish and Black against the language model.

### Setup changes

Changing opponent or side before Start:

- immediately creates a clean preview position;
- updates board orientation to the human side;
- clears stale error/debug/export/terminal state;
- does not trigger the rival's first move before Start.

### Active-game locking

Keep opponent and side controls visible but disabled while an active-session snapshot exists, including the terminal result state. Show:

> Start a new game to change opponent or side.

The player must choose New Game/Play Again to clear the prior session before editing setup. This preserves the identity of the completed opponent and side on the result screen.

### Automatic remembered/default fallback

If a remembered engine selection is unavailable and a usable LLM configuration exists, automatically fall back to Language model and announce the change.

If a remembered LLM selection is confirmed unusable and the engine is available, automatically fall back to On-device computer and announce the change.

If neither opponent is usable, keep On-device computer selected in an actionable unavailable state.

An explicit user selection is never silently overridden:

- explicitly selecting an unusable LLM keeps it selected so setup guidance remains visible;
- explicitly selecting an unavailable engine keeps it selected so the unavailable explanation remains visible.

Automatic fallback applies only during remembered/default resolution and never overwrites the stored last-opponent preference.

## Approaches considered

### Approach A — Editable setup plus immutable active session (selected)

Maintain a mutable pre-game draft and create an immutable snapshot at Start. Use a small chess-rival provider interface to isolate LLM and Stockfish move generation.

Advantages:

- prevents opponent/side drift;
- gives history and status a trustworthy opponent identity;
- keeps setup hydration separate from gameplay;
- preserves the current generation-token safety model;
- creates a clean extension point for HPA-162/HPA-163;
- limits changes to standard chess.

### Approach B — Branch directly throughout `ChessGame`

Add `opponentKind` conditionals to the existing configuration, move, status, reset, export, and history code.

Rejected because `ChessGame` already combines authoritative game state, LLM hydration, move execution, debug state, history, export, tutorial mode, and reset behavior. More inline branching would make race and consistency bugs more likely.

### Approach C — Full rival-session state machine now

Model setup, probing, loading, ready, thinking, recovering, failed, terminal, and reset states in HPA-161.

Rejected because it would absorb the majority of HPA-163. HPA-161 needs explicit safe boundaries, but not the complete production lifecycle.

## Terminology and state model

Use player-facing **On-device computer** and **Language model**. Internal code may use `engine` and `llm`.

The existing top-level `gameMode: 'tutorial' | 'ai'` can remain to avoid unrelated cross-variant refactoring. For standard chess, the user-facing mode label becomes **Play** through an optional `BoardSidePanel` label override whose default preserves every existing caller.

### Canonical types

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

`humanSide` is canonical because the UI says **You play**. `rivalSide` is derived once as the opposite color and copied into the active snapshot.

`startedByUserId` freezes history ownership:

- a game started signed out remains unsaved even if somebody signs in later;
- a game started by account A is never saved under account B;
- an engine game can continue through logout/account changes without misattributing history.

### Setup versus active session

`GameSetup` is editable only when there is no active session and no Start attempt in progress.

`ActiveRivalSession` is created only after the selected provider initializes successfully. All of the following read from the active snapshot once it exists:

- turn ownership;
- board orientation;
- opponent summary;
- status copy;
- move provider;
- play-history opponent descriptor;
- history-owner eligibility;
- debug/export visibility.

Never derive active gameplay behavior from the mutable preference store, current auth state, or current AI configuration store.

### Session identity and stale-result protection

Keep the existing monotonic AI generation token and add the active session ID as an explicit ownership boundary.

A rival result may be applied only when:

1. its captured generation token is current;
2. its captured session ID matches the active session;
3. the provider instance is still the active provider;
4. the authoritative chess state is still waiting for the rival on the requested position.

`makeAIMove` remains the final legality gate. Provider output is never applied directly.

## Device preference model

Store one versioned object in local storage, for example under:

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

- validate parsed values; corrupt, partial, or unknown future payloads fall back safely;
- default both side entries to human White;
- persist deliberate opponent and side changes;
- do not overwrite `lastRivalKind` because of an automatic fallback;
- preferences are device-local and do not require an account;
- no server schema is introduced.

### Non-blocking initial resolution

The setup resolver must preserve both approved properties:

- signed-out engine play is not blocked by AI-config hydration;
- a configured signed-in player with no saved preference defaults to LLM.

Use a non-blocking, interaction-safe resolver:

1. Read preferences synchronously after client hydration.
2. If a stored opponent exists, use it provisionally and resolve only that opponent's usability.
3. If no stored opponent exists, provisionally select engine so signed-out play can proceed without waiting for account/config requests.
4. While setup is still untouched and no Start attempt has begun, a subsequently confirmed usable signed-in LLM configuration may switch the no-preference provisional default to LLM once.
5. The first deliberate setup interaction or Start attempt closes automatic default resolution for the visit.
6. Never switch the setup beneath a player after they interact or after a session starts.

This permits an immediately usable engine path while still converging to the configured-user default when auth/config resolves before interaction.

### Resolution matrix

| Source | Engine state | LLM state | Result |
|---|---|---|---|
| No stored choice, untouched | available/checking | confirmed usable | LLM |
| No stored choice | available/checking | signed out/unconfigured/failed | Engine |
| Remembered engine | available | any | Engine |
| Remembered engine | unavailable | usable | LLM + engine→LLM fallback notice |
| Remembered engine | unavailable | unusable | Engine unavailable state |
| Remembered LLM | any | loading | LLM provisionally; Start disabled |
| Remembered LLM | any | usable | LLM |
| Remembered LLM | available/checking | confirmed unusable | Engine + LLM→engine fallback notice |
| Remembered LLM | unavailable | confirmed unusable | Engine unavailable state |
| Explicit user selection | any | any | Keep explicit selection; gate Start and show its state |

A matrix result of **Engine** while the engine state is `checking` is provisional. Keep the engine selected and display its checking state, but keep Start disabled and create no active session until the probe reaches `available`. If the probe resolves to `unavailable`, rerun the remembered/default fallback rule for the current untouched setup; never override an explicit selection or any setup the player has already interacted with.

A remembered LLM remains selected while its usability is `loading`; do not start the engine probe merely because LLM hydration has not completed. Only a confirmed signed-out, unconfigured, or failed LLM state may trigger the remembered/default fallback rule.

## Opponent usability state

Track selection separately from usability.

### Engine availability

```ts
type EngineAvailability =
  | { status: 'idle' }
  | { status: 'checking' }
  | { status: 'available' }
  | { status: 'unavailable'; message: string };
```

Probe Stockfish only when engine is selected or needed as an automatic fallback. Do not download or initialize Stockfish when a usable or still-loading remembered LLM remains selected.

### LLM usability

Derive an explicit view state from the existing auth/config state:

```ts
type LlmUsability =
  | { status: 'loading' }
  | { status: 'signed-out' }
  | { status: 'unconfigured' }
  | { status: 'available'; provider: string; model: string };
```

`useAIConfigHydration` may continue hydrating authenticated configuration, but its `configPending`/Start gate is consumed only by the LLM selection. Engine Start, engine turns, and engine status must ignore LLM config loading and errors.

## User interface

### Mode label and tutorial interaction

Keep Tutorial as-is. Add the following backward-compatible shared prop:

```ts
interface BoardSidePanelProps {
  gameMode: Mode;
  onModeChange: (mode: Mode) => void;
  aiModeLabel?: string; // default: 'Play vs AI'
  children?: React.ReactNode;
}
```

Only standard `ChessGame` passes `aiModeLabel='Play'`. Xiangqi, Shogi, Jungle, and existing shared-component tests continue to receive **Play vs AI** by default.

Rival setup, opponent status, and side controls are hidden while `gameMode === 'tutorial'`. Switching Play → Tutorial invalidates pending preparation and Start work, disposes prepared or active providers, clears the active session, and loads a clean tutorial state. Switching Tutorial → Play leaves tutorial state, resolves the saved setup preferences, and creates a clean Play preview; it never reuses a provider or session from the prior Play visit.

### Opponent selector

Use an accessible radio group or two selectable cards, not a compact `<select>`.

**On-device computer**

- Runs on this device
- No account or API key required
- Unrated
- Inline checking/available/unavailable state

**Language model**

- Show configured provider/model when available
- Otherwise show sign-in or provider-configuration guidance
- Keep selectable when unusable

### Side selector

Use:

> **You play:** White / Black

Store and display the human side. Derive the computer side.

### Persistent setup/session summary

Show a concise summary before and during the game.

Examples:

```text
On-device computer · Computer plays Black · Unrated
```

```text
Language model · Gemini 2.5 Flash · Computer plays White
```

During an active or terminal session, render the summary from `ActiveRivalSession`, not the editable setup or live configuration store.

### Locked-state explanation

When the active snapshot exists, opponent and side controls remain visible but disabled. Show:

> Start a new game to change opponent or side.

### Automatic fallback notices

When remembered engine automatically falls back:

> The on-device computer is unavailable here, so Language model was selected.

When remembered LLM automatically falls back:

> Language model is not available with the current account or settings, so On-device computer was selected.

Render both automatic fallback notices in an `aria-live="polite"` region. Do not announce provisional selections while LLM hydration or the engine probe is still pending.

### Engine unavailable copy and recheck

Use plain language, for example:

> On-device computer is not available in this browser or device. Try checking again, use another supported browser/device, or choose Language model.

Show a **Try checking again** action. It must invalidate the current preparation generation, dispose the prior Worker/provider even if it appears hung, clear the unavailable error, and begin a new bounded probe. It must not start an automatic retry loop.

Do not surface Worker, WASM, MIME, UCI, CSP, timeout internals, or stack-trace terminology to players.

### Opponent-specific controls with shared compatibility

Refactor `GameControls` to accept chess-specific overrides without breaking its three other game callers:

```ts
interface GameControlsProps {
  hasGameStarted: boolean;
  isGameOver: boolean;
  aiConfigured?: boolean; // existing compatibility input; default false
  startDisabled?: boolean;
  startLabel?: string;
  showLlmTools?: boolean; // default: aiConfigured ?? false
  isDebugMode: boolean;
  canExport: boolean;
  onStartOrReset: () => void;
  onReset: () => void;
  onToggleDebug: () => void;
  onExport?: () => void;
}
```

Resolution rules:

- debug/export visibility uses `showLlmTools ?? aiConfigured ?? false`;
- `startLabel`, when provided, overrides only the Start/New Game button text;
- when `startLabel` is omitted, preserve the current label behavior, including **Loading AI config…**, **Start**, and **New Game**;
- existing Xiangqi/Shogi/Jungle call sites may continue passing only `aiConfigured` and require no edits;
- standard chess passes explicit `showLlmTools` and `startLabel` derived from the selected or active opponent.

Expected chess labels include:

- `Checking on-device computer…`
- `Loading language-model settings…`
- `Start`
- `New Game`

LLM debug and prompt-export controls remain visible only for an active LLM session. Engine export is deferred to HPA-164.

### Component boundaries

Do not generalize the existing LLM-specific status/instruction components into a large union of unrelated props. Keep them for the LLM path and add focused chess-rival components.

```text
ChessGame
├── ChessRivalSetup
│   ├── OpponentChoice
│   ├── SideChoice
│   ├── RivalSetupSummary
│   └── fallback / locked messages
├── LlmRivalDetails
│   ├── existing AIStatusPanel
│   └── existing AIGameInstructions
└── EngineRivalDetails
    ├── availability
    ├── basic starting/thinking/error status
    └── unrated explanation
```

`ChessGame` retains authoritative board/game state. Preference resolution and provider lifecycle should move into focused chess-rival modules/hooks rather than adding more unrelated state branches directly to the component.

## Board orientation

Add an orientation prop to `ChessBoard`:

```ts
orientation: 'white' | 'black';
```

Rules:

- White orientation traverses rows and columns in their current order.
- Black orientation traverses both in reverse order.
- Each rendered square still receives and reports its original logical `{ row, col }`.
- Never reverse or mutate the board array.
- Chess rules, FEN, move history, promotions, and provider serialization remain orientation-independent.
- During setup, orientation follows `GameSetup.humanSide` immediately.
- During a session, orientation follows `ActiveRivalSession.humanSide` and cannot change until New Game.

## Rival provider boundary

Introduce a standard-chess-only provider contract.

```ts
interface ChessRivalProvider {
  readonly kind: 'engine' | 'llm';

  initialize(): Promise<void>;

  makeMove(
    state: GameState,
    requestToken: number
  ): Promise<ChessMoveRequest>;

  dispose(): void;
}
```

Responsibilities:

- providers produce a move request only;
- providers never mutate React or chess state;
- the controller owns session/generation validation;
- the authoritative chess layer validates and applies the move;
- only one `makeMove` may be in flight for a provider instance;
- `dispose()` is idempotent.

### LLM provider

Wrap the existing `createChessAI` service.

- Capture the selected provider/model/API configuration when Start begins.
- Do not update the active provider from later AI-config store changes.
- Preserve the existing prompt generation, provider behavior, debug callback, retry UI, and rating path.
- `dispose()` removes callbacks and prevents future results from being accepted.

This replaces the current eager singleton service that is continuously updated from live configuration.

### Stockfish provider

Own a dedicated classic browser Worker and the UCI protocol interaction.

Minimum behavior:

1. Construct the Worker from a same-origin prepared asset URL.
2. Send `uci`; require `uciok`.
3. Send `isready`; require `readyok`.
4. When Start adopts the provider into a newly committed active session, send `ucinewgame` exactly once for that session. Capability probing and `initialize()` send only `uci` and `isready`; a successfully probed provider retained for Start must not receive `ucinewgame` during the probe.
5. For a move, send `position fen ${state.fen}`.
6. Send `go movetime 250` as the fixed bootstrap search policy.
7. Parse exactly one `bestmove` result.
8. Convert UCI coordinates and map promotion suffixes explicitly: `q → queen`, `r → rook`, `b → bishop`, and `n → knight`. Return the long-form value required by `ChessMoveRequest.promotion`; never pass a raw UCI suffix into chess state.
9. Reject `(none)`, missing, malformed, duplicate, or out-of-order results.
10. Terminate the Worker on `dispose()`.

The fixed `250 ms` search is an internal bootstrap value, not a difficulty label or rating claim. HPA-162 replaces it with calibrated preset policy. The bootstrap rival is intentionally uncalibrated and may feel too strong or harsh for casual players; do not claim beginner-friendliness in HPA-161 copy. HPA-162 is load-bearing for the intended approachable experience.

`movetime` begins only after the engine is initialized and the `go` command is accepted. Worker startup plus WASM fetch/compile are outside the 250 ms search budget and may dominate first-use latency on slower devices. Retaining a successfully probed provider avoids recompiling at Start; HPA-166 measures and validates the remaining first-use experience.

Use `GameState.fen` directly. Do not add a second board-to-FEN implementation.

## Stockfish packaging

Pin:

```text
stockfish@18.0.8
```

Use the Stockfish 18 lite, single-threaded browser artifacts:

```text
stockfish-18-lite-single.js
stockfish-18-lite-single.wasm
```

Published-package verification performed on 2026-07-30 confirmed that `stockfish@18.0.8` contains both artifacts at:

```text
node_modules/stockfish/bin/stockfish-18-lite-single.js
node_modules/stockfish/bin/stockfish-18-lite-single.wasm
```

The preparation script must still verify these exact paths and fail closed, because a later dependency change, corrupted install, or changed package layout must not silently produce an incomplete deployment.

Rationale:

- the upstream package recommends the lite single-threaded build for normal browser use;
- it avoids `SharedArrayBuffer`, thread headers, and cross-origin isolation;
- it is substantially smaller than the full engine;
- it remains more than sufficient for the initial uncalibrated local rival.

### Build preparation

Add a repository-owned preparation script that:

1. resolves the exact pinned package installation;
2. verifies both expected source paths exist under `node_modules/stockfish/bin/`;
3. copies them to a stable generated directory such as:

```text
apps/web/public/vendor/stockfish/
```

4. fails the build with a clear message if the package layout does not match expectations.

Invoke preparation before local web development and production web builds. Generated engine artifacts should not be manually edited. Application code loads stable same-origin URLs derived from Astro's base URL, not paths inside `node_modules`.

The package uses a `postinstall` script, so merge `stockfish` into Bun's root `trustedDependencies` configuration rather than relying on lifecycle scripts that Bun may skip.

### Static-host delivery requirements

The web app is an Astro static build, so HPA-161 must verify the generated engine files through the actual production-style static serving path, not only by checking the filesystem:

- construct the Worker URL from Astro's base URL and keep the Worker script same-origin;
- serve `stockfish-18-lite-single.wasm` with `Content-Type: application/wasm`;
- serve the Worker JavaScript with a JavaScript-compatible content type;
- verify the deployed or production-preview response does not redirect either asset to an HTML fallback;
- if a Content Security Policy is present now or added later, verify it permits same-origin workers and WebAssembly compilation for the supported browsers, including the applicable `worker-src` and `script-src`/`wasm-unsafe-eval` directives;
- fail the release smoke test when the Worker cannot fetch or compile the WASM asset under production headers.

HPA-161 owns deterministic build/preview checks for these requirements. HPA-187 owns the final real-deployment and browser-matrix release verification.

### Licensing boundary

Stockfish.js/Stockfish is GPL-3.0 licensed. HPA-161 must add:

- the upstream license text;
- a third-party notice naming Stockfish.js and Stockfish;
- the exact package/version and upstream source/tag reference used to create the distributed artifact.

Release remains blocked on HPA-187's compliance verification, including confirming the corresponding-source distribution/offer obligations for the actual deployed binary. This design does not claim that a notice alone completes GPL release compliance.

## Engine preparation and Start flow

### Lazy preparation and ownership

Prepare/probe Stockfish only when engine is selected or required as a fallback.

A successful probe may retain the ready provider as a prepared provider so Start does not repeat WASM compilation. The prepared provider is owned by setup state until one of these occurs:

- Start adopts it into the active session;
- the player switches away from engine;
- availability is rechecked;
- the component unmounts.

Every probe or Start attempt receives a unique preparation generation/attempt ID and owns exactly one disposer. Cleanup marks the attempt stale before terminating its Worker. Only the current attempt may publish availability or be adopted into Start. This rule must hold under React development Strict Mode and other mount/effect replay: duplicate construction may occur, but every superseded Worker is disposed and cannot mark the current setup available.

### Preparation deadline

Use one named constant:

```ts
const ENGINE_PREPARATION_TIMEOUT_MS = 15_000;
```

The deadline covers Worker script fetch, WASM fetch/compile, `uci`, and `isready`. It starts when the attempt constructs the provider and is cleared only after `readyok`, disposal, or failure. On timeout:

- mark the attempt stale;
- dispose/terminate the candidate provider;
- map the result to the normal plain-language unavailable state;
- unlock setup or abort the Start attempt;
- permit a user-triggered **Try checking again** probe.

Do not automatically retry and do not reuse a timed-out provider.

### Capability probe

The real handshake is authoritative. Preliminary checks provide faster messages only:

1. confirm `Worker` exists;
2. confirm `WebAssembly` exists;
3. construct and initialize the provider under `ENGINE_PREPARATION_TIMEOUT_MS`;
4. wait for `uciok` and `readyok`;
5. mark available only after both acknowledgements.

The probe does not send `ucinewgame`. That command belongs to the Start transaction after the prepared provider has been adopted into a specific active session.

Any script fetch, WASM fetch/compile, Worker startup, protocol, readiness, or deadline failure maps to the plain unavailable state. Development logging may retain the underlying technical error.

### Atomic Start transaction

Start is an atomic attempt, not an early `gameStarted = true` toggle.

1. Validate the selected opponent is usable.
2. Disable setup mutation for the Start attempt.
3. Increment/capture the generation and candidate session IDs.
4. Snapshot opponent, human side, rival side, and current user ID.
5. Adopt a ready prepared provider, or initialize a new provider under `ENGINE_PREPARATION_TIMEOUT_MS` when no current prepared provider exists.
6. Re-check that the Start attempt is current.
7. Create a fresh `createInitialGameState('human-vs-ai', rivalSide)`.
8. Commit the provider, `ActiveRivalSession`, clean game state, and `gameStarted` together.
9. For an engine session, send `ucinewgame` exactly once after the provider/session commit and before the first move request.
10. If the rival is White, allow the normal rival-turn effect to request the first move only after that session initialization is complete.

If initialization fails, times out, or the attempt becomes stale:

- do not create an active session;
- do not mark the game started;
- dispose the candidate provider;
- retain a clean preview board;
- unlock setup;
- show the appropriate LLM or engine error guidance.

## Rival-turn flow

The existing rival-turn effect becomes opponent-neutral.

It may request a move only when:

- an active session exists;
- `gameStarted` is true;
- the authoritative position is non-terminal;
- there is no pending human promotion;
- it is the frozen rival side's turn;
- no rival move is already in flight;
- the active provider is ready.

Request sequence:

1. capture generation ID, session ID, provider identity, and current FEN;
2. set the shared thinking flag/status;
3. call `provider.makeMove(gameState, generation)`;
4. reject the result if any captured ownership value is stale;
5. confirm the current FEN still matches the requested position;
6. call the existing authoritative `makeAIMove` path;
7. apply at most one legal move;
8. clear thinking state when the current request settles.

The FEN comparison adds a position-specific guard without introducing HPA-163's full cancellation protocol.

## Reset, switching, terminal state, and navigation

### Pre-game opponent or side change

- invalidate pending preparation/Start work;
- dispose any provider no longer owned;
- create a clean preview game state;
- clear rival errors, pause state, debug moves, exporter reference, forced outcome, and terminal latch;
- update orientation;
- keep `gameStarted = false` and `activeSession = null`.

A side-only change may retain a ready engine provider because provider readiness is side-independent.

### New Game / Play Again

- invalidate the current generation;
- dispose the active provider;
- clear `ActiveRivalSession`;
- clear game/error/debug/export/terminal state;
- create a clean preview from current preferences;
- re-enable setup controls;
- begin engine preparation again only if engine remains selected.

### Terminal game

Keep the active snapshot after checkmate/draw so the completed-game summary remains stable. New Game/Play Again clears it.

### Tutorial mode change or unmount

Switching either direction between Tutorial and Play is a full game/provider boundary. Invalidate generation, dispose prepared/active providers, clear the active session, and prevent all late callbacks from writing state. Rival setup is never rendered in Tutorial mode.

## Authentication and identity behavior

### LLM session

Preserve the existing security boundary:

- logout or account switch invalidates pending LLM work;
- the active LLM game resets;
- no prior user's captured API configuration may continue after identity loss/change.

### Engine session

An engine session does not depend on an account or API key and therefore continues through:

- logout;
- account switch;
- AI-config hydration failure;
- provider/model changes.

Identity changes must not reset or interrupt the engine Worker.

Extend `useGameIdentityReset` with an optional enable/policy input, defaulting to current behavior for all existing callers. It must continue updating its previous-auth refs even while reset callbacks are disabled, so re-enabling it does not process an old identity transition.

For standard chess, enable identity-driven game reset only for LLM setup/start/session ownership.

### History ownership and `usePlayHistory` call-site contract

The active-session snapshot, not live setup, determines the hook inputs.

For an engine session:

- `aiPlayer` receives `ActiveRivalSession.rivalSide`; the prop name is historical and represents the non-human player's side;
- `opponentDescriptor` is always `{ kind: 'engine', id: 'stockfish' }` from `ActiveRivalSession`;
- `aiConfig` is omitted;
- `userId` remains the live `user?.id`, never the frozen `startedByUserId`;
- `enabled` is true only when the game/session is active and saveable, `startedByUserId` is non-null, `isAuthenticated` is true, and live `user?.id === startedByUserId`.

For an LLM session, preserve the existing call shape and rated behavior, using the frozen active-session provider/model configuration rather than live setup.

Do not add a second save snapshot, retry timer, or account-switch detector around `usePlayHistory`. Its existing terminal snapshot, live-user guard, and bounded 401 recovery remain authoritative. Identity-reset suppression for engine play must not clear the board, terminal state, or `ActiveRivalSession` before the hook has a chance to save when the initiating user is still authenticated.

An anonymously started game is permanently ineligible because `startedByUserId` is null. Account B is ineligible because its live ID cannot match account A's frozen ID. If an actual logout or account switch occurs before the terminal save attempt, the board may continue but history can be lost; HPA-161 does not retroactively attribute a completed game after an identity transition. The hook's existing 401 retry remains available for the distinct case where the client still represents the same initiating user and the server session expires during the save request.

## History, rating, export, and debug behavior

### Engine

- Show **Unrated** before and during the game.
- Use the existing HPA-165 engine opponent descriptor for signed-in history.
- Do not display a rating delta on the terminal engine state.
- Do not initialize the existing prompt-oriented `GameExporter`.
- Hide LLM debug and prompt-export controls.
- Defer engine version/difficulty export metadata and downloadable engine-game export to HPA-164.

### LLM

- Keep the current rated history path.
- Keep current debug callbacks/dialog.
- Keep current prompt/response exporter.
- Keep provider/model instructions.
- Keep current error retry behavior.

All history/export/debug decisions read from `ActiveRivalSession.opponent.kind`, not editable setup.

## Basic failure behavior owned by HPA-161

| Failure | Required behavior |
|---|---|
| Worker or WebAssembly primitive missing | Engine unavailable; Start disabled for engine; actionable copy |
| JS/WASM asset or Worker initialization failure | Abort preparation/Start; dispose; clean preview remains |
| Probe or Start initialization exceeds 15 seconds | Dispose timed-out provider; map to unavailable; unlock setup; offer Try checking again |
| Missing `uciok` or `readyok` before deadline | Engine unavailable; no active session; offer Try checking again |
| Worker crashes during an active game | Preserve current board; stop engine play; offer New Game |
| Malformed or missing `bestmove` | Reject result; preserve board; offer New Game |
| `bestmove (none)` in non-terminal position | Treat as engine failure; preserve board |
| Illegal engine move | Reject through authoritative rules; preserve board |
| Duplicate/out-of-order engine output | Ignore after the accepted response |
| Old result after reset/switch/navigation or Strict Mode cleanup | Ignore through generation/session/provider/FEN checks |
| LLM signed out/unconfigured | Keep selected if explicit; show setup guidance; block LLM Start only |
| Auth/config changes during engine game | Continue engine game; prevent history misattribution |

HPA-161's active-game engine recovery action is New Game. HPA-163 later adds bounded move timeout, retry from the same position, cancellation semantics, and richer recoverable lifecycle states.

## Suggested file boundaries

Exact file names may be adjusted during planning, but responsibilities should remain isolated.

### New chess-rival modules

```text
apps/web/src/lib/chess/rival/types.ts
apps/web/src/lib/chess/rival/preferences.ts
apps/web/src/lib/chess/rival/resolve-setup.ts
apps/web/src/lib/chess/rival/provider.ts
apps/web/src/lib/chess/rival/llm-provider.ts
apps/web/src/lib/chess/rival/stockfish-provider.ts
apps/web/src/lib/chess/rival/stockfish-protocol.ts
```

Responsibilities:

- `types.ts`: setup/session/usability/provider types;
- `preferences.ts`: versioned parsing and persistence;
- `resolve-setup.ts`: pure default/fallback decisions;
- `provider.ts`: interface and factory;
- `llm-provider.ts`: existing AI-service wrapper;
- `stockfish-provider.ts`: Worker lifecycle, bounded initialization, and request ownership;
- `stockfish-protocol.ts`: pure UCI parsing/formatting.

### New UI modules

```text
apps/web/src/components/game/ChessRivalSetup.tsx
apps/web/src/components/game/EngineRivalDetails.tsx
apps/web/src/components/game/LlmRivalDetails.tsx
apps/web/src/components/game/RivalSetupSummary.tsx
```

### Existing files likely changed

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

Add the engine preparation script under `apps/web/scripts/` and the upstream license under a clear third-party licenses directory.

Avoid unrelated refactors in other variants.

## Testing strategy

### Pure preference/default tests

Cover:

- signed out + no preference → engine;
- configured signed in + no preference + untouched resolution → LLM;
- provisional engine remains when the user interacts before config resolves;
- provisional engine keeps Start disabled while its probe is checking;
- a provisional remembered/default engine selection reruns fallback resolution if the probe becomes unavailable;
- remembered engine + available → engine;
- remembered engine + unavailable + usable LLM → LLM with notice;
- remembered engine + unavailable + unusable LLM → engine unavailable;
- remembered LLM + loading → LLM remains selected and Start disabled;
- remembered LLM + usable → LLM;
- remembered LLM + unusable + available engine → engine with symmetric notice;
- explicit unusable LLM is not auto-overridden;
- explicit unavailable engine is not auto-overridden;
- side preferences are independent by opponent;
- automatic fallback does not overwrite remembered opponent;
- corrupt/partial/future preference payloads fall back safely.

### Board-orientation tests

Verify:

- White orientation preserves current traversal;
- Black orientation reverses visual rows and columns;
- clicking a visually reversed square reports canonical logical coordinates;
- board data is not mutated;
- setup side changes orientation immediately;
- active orientation remains frozen despite preference changes.

### UCI/protocol unit tests

Verify:

- `uci` / `uciok` and `isready` / `readyok` sequencing;
- the capability probe never emits `ucinewgame`;
- Start emits `ucinewgame` exactly once before the first position/search command, including when adopting a retained prepared provider;
- FEN command formatting;
- `go movetime 250` command;
- normal best move parsing;
- promotion parsing maps `q/r/b/n` to `queen/rook/bishop/knight`, including `e7e8q`;
- optional `ponder` text is ignored;
- `(none)`, malformed squares, invalid promotion suffixes, and duplicate responses are rejected.

### Stockfish provider tests

Inject a fake Worker factory and fake timers. Verify:

- preparation succeeds only after both readiness acknowledgements;
- no `uciok`, no `readyok`, or hung Worker reaches the 15-second deadline and terminates;
- Try checking again creates a fresh attempt and disposes the prior attempt;
- a Start-time reinitialization uses the same deadline;
- messages are emitted in order;
- only one move request is allowed at a time;
- Worker errors reject initialization or the current request appropriately;
- `dispose()` is idempotent and terminates the Worker;
- results after disposal are ignored;
- superseded/double-mounted probe attempts cannot publish availability;
- the provider never mutates game state.

Unit tests must not load the real WASM artifact.

### Session/controller tests

Verify:

- Start freezes opponent, sides, provider/model, and user ID;
- Start commits no active session before provider readiness;
- failed or timed-out initialization leaves a clean editable preview;
- side/opponent switch creates a clean preview;
- rival playing White moves only after Start commits;
- preference/config/auth updates cannot mutate an active engine session;
- LLM identity change still resets the active LLM session;
- engine identity change does not reset the board;
- stale generation/session/provider/FEN results cannot apply;
- at most one rival move applies for one requested position;
- Tutorial ↔ Play disposes providers, clears active session state, and creates the correct clean destination state.

### `ChessGame` component tests

Extend `ChessGame.test.tsx` to cover:

- signed-out player starts engine without account/API-key prompts;
- configured signed-in no-preference player resolves to LLM before interaction;
- remembered LLM stays selected during hydration;
- opponent cards and **You play** choices;
- persistent selected-opponent/side summary;
- controls disabled during active and terminal session;
- lock explanation is present;
- changing side before Start resets and flips the preview;
- changing opponent before Start resets the preview;
- Start gating is opponent-specific;
- unavailable-engine fallback notice;
- unavailable-LLM fallback notice;
- timed-out probe shows unavailable/recheck rather than indefinite checking;
- neither-usable state remains understandable;
- active engine game survives auth/config changes;
- engine game never exposes LLM debug/prompt export controls;
- LLM flow retains existing debug/export/status behavior;
- signed-in engine completion passes live `userId`, frozen engine descriptor, and frozen rival side to `usePlayHistory`;
- anonymous-start engine game does not save after later sign-in;
- account B cannot save account A's continuing engine game;
- engine result shows Unrated/no rating delta;
- rival setup is hidden in Tutorial mode.

### Shared-component regression tests

Verify:

- `BoardSidePanel` defaults `aiModeLabel` to **Play vs AI** and renders **Play** only when explicitly overridden;
- `GameControls` preserves existing label and debug/export behavior when only `aiConfigured` is supplied;
- `showLlmTools` overrides `aiConfigured` only for the explicit chess path;
- Xiangqi, Shogi, and Jungle behavior remains unchanged without call-site edits.

### Browser tests

HPA-161 adds mocked-Worker Playwright journeys for:

1. signed-out engine selection, side choice, Start, rival-first move, human move, reset;
2. configured LLM selection and existing startup flow;
3. engine unavailable/timeout/recheck fallback and guidance;
4. Tutorial ↔ Play provider disposal and clean-state behavior.

The real Stockfish/WASM browser smoke and supported-browser matrix remain HPA-187/HPA-166.

### Build and production-preview tests

Verify:

- the installed `stockfish@18.0.8` package exposes both exact source paths under `node_modules/stockfish/bin/`;
- engine preparation finds the exact pinned artifact names;
- missing or changed package layout fails clearly;
- web build contains both generated Stockfish assets;
- the Worker URL respects the configured Astro base path and remains same-origin;
- production preview returns JavaScript rather than HTML for the Worker URL;
- production preview returns `Content-Type: application/wasm` for the WASM URL;
- any configured CSP permits the Worker and WebAssembly compilation;
- a production-style Worker can fetch and compile the WASM artifact.

## Acceptance-criteria mapping

| HPA-161 acceptance criterion | Design coverage |
|---|---|
| Signed-out visitor starts local computer without account/API prompts | Provisional/default engine path, opponent-specific Start gating, lazy Stockfish provider |
| Signed-in player switches between local and LLM before Start | Explicit opponent cards and clean preview reset |
| Local computer defaults when no usable LLM exists | Default-resolution matrix and symmetric fallback notices |
| Selected side respected from first move | Canonical human side, derived frozen rival side, atomic Start, rival-first effect |
| Rival and side cannot become inconsistent during active game | Immutable `ActiveRivalSession`, disabled controls, session-owned rendering |
| Unsupported browser/device gets actionable message | Bounded real handshake probe, plain unavailable state, and recheck action |
| Existing language-model play remains available and behaves as before | LLM provider wrapper, existing rated/debug/export/error path retained |
| Starting/switching initializes a clean game | Clean preview reset plus atomic Start-created initial state |
| Selected opponent and side visible before/during game | Persistent setup/session summary |
| Reset required to change active settings | Active snapshot retained through terminal state and locked controls |

## Dependency and follow-up boundaries

- HPA-160 is complete and supplies authoritative standard rules/FEN/legal application.
- HPA-165 is complete and supplies the engine history/unrated contract; HPA-161 consumes it and closes the missing pre-game/in-game Unrated presentation.
- HPA-161 blocks HPA-162 because difficulty UI/policy needs an engine opponent/session boundary. The 250 ms bootstrap is intentionally uncalibrated and not a substitute for HPA-162.
- HPA-161 blocks HPA-163 because lifecycle hardening needs the provider/session boundary.
- HPA-164 adds richer history/export metadata on top of the active engine session.
- HPA-166 validates accessibility, compatibility, and performance rather than redefining selection behavior.
- HPA-187 performs real-engine release verification and GPL compliance validation.

## Completion checklist

HPA-161 is complete when:

- both opponent choices are present with approved copy;
- signed-out engine play is functional;
- LLM setup requirements remain isolated to LLM selection;
- the approved default/fallback/preference behavior and both automatic notices are covered by tests;
- human side and board orientation are correct;
- active opponent/side are immutable and visibly locked;
- Stockfish can initialize within the bounded deadline and make legal moves through the provider boundary;
- unavailable or timed-out engine preparation offers a working recheck action;
- reset/navigation/Strict Mode cleanup/stale results cannot mutate a replaced game;
- engine unavailable state is actionable;
- engine games use the existing unrated history descriptor when eligible without bypassing existing hook guards;
- shared `GameControls` and `BoardSidePanel` defaults preserve every non-chess caller;
- production-style serving provides valid same-origin Worker/WASM responses and compatible headers;
- Tutorial ↔ Play transitions fully dispose prior rival state;
- LLM rating/debug/export behavior is unchanged;
- pinned artifacts, notices, and license files are present;
- unit/component/mocked-browser/build tests pass;
- no HPA-162/HPA-163/HPA-164/HPA-166/HPA-187 scope is silently pulled into the implementation.