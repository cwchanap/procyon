# HPA-161 Opponent Selection and Rival Session Implementation Plan

> **For Procyon implementation owner:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Let standard-chess players choose an on-device Stockfish opponent or the existing language-model opponent, choose their side, start a clean immutable rival session, and complete legal games without opponent/side drift or stale asynchronous moves.

**Architecture:** Standard chess gains two isolated layers. `useChessRivalSetup` owns device-local preferences, cheap engine preflight, LLM usability, defaults, and editable pre-game selection. `useChessRivalSession` owns Start attempts, frozen `ActiveRivalSession`, provider lifecycle, move ownership, failure state, and disposal. Both providers implement one typed result contract; the LLM adapter preserves existing debug/export metadata, while Stockfish uses the stable assets delivered by packaging PR A. `ChessGame` remains the authoritative owner of chess state but delegates opponent policy and async provider ownership to the hooks. Every Play preview is `human-vs-ai`; only Start commits an active provider/session.

**Tech Stack:** React 18, TypeScript 5.9, Astro 4 static islands, Bun test, Testing Library, Playwright, existing chess rules/FEN engine, existing AI service and `usePlayHistory`, Stockfish Worker assets from HPA-161 packaging PR A.

---

## Dependency and branch strategy

1. Packaging PR A from `2026-07-30-hpa-161-engine-packaging.md` must be merged, or this branch must be based on it.
2. Create branch `codex/hpa-161-opponent-session` from the commit containing:
   - `stockfish@18.0.8`;
   - `apps/web/public/vendor/stockfish/stockfish-18-lite-single.js` generated at build time;
   - production-preview asset verification;
   - third-party notices/license.
3. Open runtime PR B titled `feat(chess): add local and language-model opponents`.
4. HPA-161 closes only after PR A and PR B merge.

Do not recalibrate difficulty, add engine same-position retry, add move timeouts, add engine export metadata, or generalize this framework to Xiangqi/Shogi/Jungle.

## Baseline verification

```bash
git status --short
git branch --show-current
bun install
bun test apps/web/src/components/ChessGame.test.tsx \
  apps/web/src/components/game/BoardSidePanel.test.tsx \
  apps/web/src/hooks/usePlayHistory.test.ts
bunx turbo run typecheck --filter=web
```

Expected:

- clean tree;
- branch `codex/hpa-161-opponent-session`;
- existing chess/shared/history tests pass;
- web typecheck passes.

---

## Task 1: Add canonical rival and provider result types

**Files:**

- Create: `apps/web/src/lib/chess/rival/types.ts`
- Create: `apps/web/src/lib/chess/rival/types.test.ts`
- Create: `apps/web/src/lib/chess/rival/provider.ts`

### Step 1: Write compile/runtime contract tests

Create `types.test.ts` covering pure helpers that will live next to the types:

```ts
import { describe, expect, test } from 'bun:test';
import {
  getRivalSide,
  isRivalMoveSuccess,
  type ActiveRivalSession,
  type RivalMoveResult,
} from './types';

describe('chess rival types', () => {
  test('derives the opposite rival side', () => {
    expect(getRivalSide('white')).toBe('black');
    expect(getRivalSide('black')).toBe('white');
  });

  test('narrows successful move results', () => {
    const result: RivalMoveResult = {
      ok: true,
      move: { from: 'e7', to: 'e5' },
      meta: { thinking: 'Develop', confidence: 0.7 },
    };
    expect(isRivalMoveSuccess(result)).toBe(true);
  });

  test('active sessions contain frozen ownership fields', () => {
    const session: ActiveRivalSession = {
      id: 1,
      opponent: { kind: 'engine', id: 'stockfish' },
      humanSide: 'white',
      rivalSide: 'black',
      startedByUserId: null,
    };
    expect(session.rivalSide).toBe('black');
  });
});
```

Run:

```bash
bun test apps/web/src/lib/chess/rival/types.test.ts
```

Expected: FAIL because modules do not exist.

### Step 2: Implement the canonical types

`types.ts` must define:

```ts
export type RivalKind = 'engine' | 'llm';
export type ChessSide = PieceColor;

export type EngineOpponent = { kind: 'engine'; id: 'stockfish' };
export type LlmOpponent = {
  kind: 'llm';
  provider: string;
  model: string;
};
export type ChessOpponent = EngineOpponent | LlmOpponent;

export interface GameSetup {
  rivalKind: RivalKind;
  humanSide: ChessSide;
}

export interface ActiveRivalSession {
  id: number;
  opponent: ChessOpponent;
  humanSide: ChessSide;
  rivalSide: ChessSide;
  startedByUserId: string | null;
}

export type EnginePreflight =
  | { status: 'supported' }
  | { status: 'unsupported'; message: string };

export type LlmUsability =
  | { status: 'loading' }
  | { status: 'signed-out' }
  | { status: 'unconfigured' }
  | { status: 'available'; provider: string; model: string };

export type RivalMoveFailureReason =
  | 'no-move'
  | 'invalid-response'
  | 'invalid-move'
  | 'protocol-error';

export interface RivalMoveMeta {
  thinking?: string;
  confidence?: number;
  interaction?: { prompt?: string; response?: string };
}

export type RivalMoveResult =
  | { ok: true; move: ChessMoveRequest; meta?: RivalMoveMeta }
  | { ok: false; reason: RivalMoveFailureReason; message?: string };
```

Add `getRivalSide()` and `isRivalMoveSuccess()`.

`provider.ts` defines:

```ts
export interface ChessRivalProvider {
  readonly kind: RivalKind;
  initialize(): Promise<void>;
  beginGame(): Promise<void>;
  makeMove(state: GameState, requestToken: number): Promise<RivalMoveResult>;
  dispose(): void;
}
```

Providers never mutate game or React state.

### Step 3: Run tests and typecheck

```bash
bun test apps/web/src/lib/chess/rival/types.test.ts
bunx turbo run typecheck --filter=web
```

Expected: PASS.

### Step 4: Commit

```bash
git add apps/web/src/lib/chess/rival/types.ts \
  apps/web/src/lib/chess/rival/types.test.ts \
  apps/web/src/lib/chess/rival/provider.ts
git commit -m "feat(chess): define rival session contracts"
```

---

## Task 2: Implement versioned preferences and pure default resolution

**Files:**

- Create: `apps/web/src/lib/chess/rival/preferences.ts`
- Create: `apps/web/src/lib/chess/rival/preferences.test.ts`
- Create: `apps/web/src/lib/chess/rival/resolve-setup.ts`
- Create: `apps/web/src/lib/chess/rival/resolve-setup.test.ts`

### Step 1: Write failing preference tests

Cover:

- missing storage → default object with both human sides White;
- valid V1 round-trip;
- corrupt JSON → defaults;
- wrong version → defaults;
- invalid opponent/side values → defaults;
- deliberate changes persist;
- automatic fallback does not update `lastRivalKind`.

Use injectable storage:

```ts
export interface RivalPreferenceStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}
```

Run:

```bash
bun test apps/web/src/lib/chess/rival/preferences.test.ts
```

Expected: FAIL.

### Step 2: Implement the preference module

Use key:

```text
procyon.chess.rival-preferences.v1
```

Export:

```ts
export interface RivalPreferencesV1 {
  version: 1;
  lastRivalKind: RivalKind;
  humanSideByRival: Record<RivalKind, ChessSide>;
}

export function readRivalPreferences(storage: RivalPreferenceStorage): RivalPreferencesV1;
export function persistRivalKind(...): void;
export function persistHumanSide(...): void;
```

Keep parsing pure and fail closed.

### Step 3: Write the resolver matrix tests

Create `resolve-setup.test.ts` covering every design row:

1. no preference + signed out + supported engine → engine;
2. no preference + configured signed in + untouched setup → LLM;
3. remembered engine + supported → engine;
4. remembered engine + unsupported + usable LLM → LLM plus engine→LLM notice;
5. remembered engine + unsupported + unusable LLM → engine unavailable;
6. remembered LLM + loading → LLM provisional, Start disabled;
7. remembered LLM + usable → LLM;
8. remembered LLM + unusable + supported engine → engine plus LLM→engine notice;
9. remembered LLM + unusable + unsupported engine → engine unavailable;
10. explicit selections are not overridden;
11. first user interaction closes automatic resolution;
12. fallback never mutates the stored preference.

Model the pure input explicitly, for example:

```ts
interface ResolveSetupInput {
  rememberedKind: RivalKind | null;
  enginePreflight: EnginePreflight;
  llmUsability: LlmUsability;
  setupTouched: boolean;
  explicitKind: RivalKind | null;
}
```

### Step 4: Implement `resolveSetup()`

Return:

```ts
interface ResolvedSetupKind {
  kind: RivalKind;
  automatic: boolean;
  notice?: 'engine-to-llm' | 'llm-to-engine';
  startBlockedReason?: 'llm-loading' | 'llm-unusable' | 'engine-unsupported';
}
```

Do not access React, auth, localStorage, or network inside this module.

### Step 5: Run tests

```bash
bun test apps/web/src/lib/chess/rival/preferences.test.ts \
  apps/web/src/lib/chess/rival/resolve-setup.test.ts
```

Expected: PASS.

### Step 6: Commit

```bash
git add apps/web/src/lib/chess/rival/preferences* \
  apps/web/src/lib/chess/rival/resolve-setup*
git commit -m "feat(chess): resolve rival setup preferences"
```

---

## Task 3: Add cheap engine preflight without loading Stockfish

**Files:**

- Create: `apps/web/src/lib/chess/rival/engine-preflight.ts`
- Create: `apps/web/src/lib/chess/rival/engine-preflight.test.ts`

### Step 1: Write failing capability tests

Inject platform capabilities rather than reading globals directly in tests:

```ts
interface EngineCapabilityEnvironment {
  Worker?: typeof Worker;
  WebAssembly?: typeof WebAssembly;
}
```

Cover:

- missing Worker → unsupported;
- missing WebAssembly → unsupported;
- minimal WASM validation false/throws → unsupported;
- all cheap checks pass → supported;
- no Worker is constructed;
- no `fetch` is called;
- no Stockfish URL is requested.

### Step 2: Implement preflight

Use a tiny built-in valid WASM byte sequence only for `WebAssembly.validate`. Do not fetch the 7 MB asset and do not instantiate a Worker.

Player-facing message remains generic; technical reason can be retained for development diagnostics in a non-user field if needed.

### Step 3: Run tests

```bash
bun test apps/web/src/lib/chess/rival/engine-preflight.test.ts
```

Expected: PASS.

### Step 4: Commit

```bash
git add apps/web/src/lib/chess/rival/engine-preflight*
git commit -m "feat(chess): add local engine preflight"
```

---

## Task 4: Add backward-compatible shared UI overrides

**Files:**

- Modify: `apps/web/src/components/game/BoardSidePanel.tsx`
- Modify: `apps/web/src/components/game/BoardSidePanel.test.tsx`
- Modify: `apps/web/src/components/game/GameControls.tsx`
- Create or modify: `apps/web/src/components/game/GameControls.test.tsx`

### Step 1: Add failing `BoardSidePanel` tests

Keep existing assertions and add:

```ts
expect(renderDefault().getByRole('button', { name: 'Play vs AI' })).toBeTruthy();
expect(renderWithLabel('Play').getByRole('button', { name: 'Play' })).toBeTruthy();
```

Also verify clicking the overridden label still emits `'ai'`.

### Step 2: Implement the optional label

Add:

```ts
aiModeLabel?: string;
```

Default it to `'Play vs AI'`. Change no existing caller.

### Step 3: Add failing `GameControls` compatibility tests

Cover:

- existing props render exact current labels and emoji;
- `startDisabled` with no override still renders `⏳ Loading AI config…`;
- `startLabel` renders verbatim as full React content even when disabled;
- `showLlmTools` overrides `aiConfigured`;
- omitted `showLlmTools` falls back to `aiConfigured`;
- export remains conditional on `canExport` and `onExport`.

### Step 4: Implement optional overrides

Use:

```ts
aiConfigured?: boolean;
startDisabled?: boolean;
startLabel?: React.ReactNode;
showLlmTools?: boolean;
```

Resolution:

```ts
const showTools = showLlmTools ?? aiConfigured ?? false;
const buttonContent =
  startLabel ??
  (startDisabled
    ? '⏳ Loading AI config…'
    : hasGameStarted
      ? '🆕 New Game'
      : '▶️ Start');
```

Do not change Xiangqi/Shogi/Jungle call sites.

### Step 5: Run focused tests

```bash
bun test apps/web/src/components/game/BoardSidePanel.test.tsx \
  apps/web/src/components/game/GameControls.test.tsx
```

Expected: PASS.

### Step 6: Commit

```bash
git add apps/web/src/components/game/BoardSidePanel.tsx \
  apps/web/src/components/game/BoardSidePanel.test.tsx \
  apps/web/src/components/game/GameControls.tsx \
  apps/web/src/components/game/GameControls.test.tsx
git commit -m "refactor(game): add rival control overrides"
```

---

## Task 5: Add board orientation and hydration-safe reveal

**Files:**

- Modify: `apps/web/src/components/ChessBoard.tsx`
- Modify or create: `apps/web/src/components/ChessBoard.test.tsx`
- Modify later integration tests: `apps/web/src/components/ChessGame.test.tsx`

### Step 1: Write failing orientation tests

Use a board with uniquely identifiable corner pieces. Verify:

- default/White orientation preserves current visual order;
- Black orientation reverses rows and columns;
- visual top-left under Black still calls the canonical logical coordinate;
- the original board array remains unchanged;
- disabled behavior remains unchanged.

### Step 2: Implement `orientation`

Add:

```ts
orientation?: 'white' | 'black'; // default 'white'
```

Build index arrays:

```ts
const indices = Array.from({ length: BOARD_SIZE }, (_, index) => index);
const rowOrder = orientation === 'black' ? [...indices].reverse() : indices;
const colOrder = orientation === 'black' ? [...indices].reverse() : indices;
```

Render using canonical indices; never reverse `board` itself.

### Step 3: Run tests

```bash
bun test apps/web/src/components/ChessBoard.test.tsx
```

Expected: PASS.

### Step 4: Commit

```bash
git add apps/web/src/components/ChessBoard.tsx apps/web/src/components/ChessBoard.test.tsx
git commit -m "feat(chess): support board orientation"
```

The hydration-safe board reveal is integrated after `useChessRivalSetup` exists; do not add ad-hoc localStorage reads to `ChessBoard`.

---

## Task 6: Implement and test pure UCI protocol handling

**Files:**

- Create: `apps/web/src/lib/chess/rival/stockfish-protocol.ts`
- Create: `apps/web/src/lib/chess/rival/stockfish-protocol.test.ts`

### Step 1: Write failing parser/formatter tests

Cover:

- detects `uciok`;
- parses advertised `option name Skill Level`;
- detects `readyok`;
- formats `setoption name Skill Level value 0`;
- formats `ucinewgame`, `isready`, `position fen ...`, and `go movetime 250`;
- parses `bestmove e7e5`;
- parses `bestmove e7e8q` as promotion `'queen'`;
- maps `r/b/n` to long-form promotion values;
- ignores optional `ponder` suffix;
- maps `bestmove (none)` to typed `no-move` failure;
- rejects malformed coordinates and unsupported promotion suffixes;
- ignores non-terminal info lines;
- allows exactly one accepted `bestmove` per request.

### Step 2: Implement pure protocol functions

No Worker or timers in this file. Export small functions such as:

```ts
parseUciOption(line: string): UciOption | null;
parseBestMove(line: string): RivalMoveResult | null;
formatPositionCommand(fen: string): string;
formatGoCommand(movetimeMs: number): string;
```

### Step 3: Run tests

```bash
bun test apps/web/src/lib/chess/rival/stockfish-protocol.test.ts
```

Expected: PASS.

### Step 4: Commit

```bash
git add apps/web/src/lib/chess/rival/stockfish-protocol*
git commit -m "feat(chess): add Stockfish UCI protocol"
```

---

## Task 7: Implement the Stockfish provider with an injected Worker

**Files:**

- Create: `apps/web/src/lib/chess/rival/stockfish-provider.ts`
- Create: `apps/web/src/lib/chess/rival/stockfish-provider.test.ts`

### Step 1: Build a fake Worker test harness

The harness records commands, emits string messages, emits errors, and records termination. Inject:

```ts
export type WorkerFactory = (url: URL) => WorkerLike;
```

Do not patch the global Worker in unit tests.

### Step 2: Write failing initialization tests

Verify:

1. constructor receives same-origin URL ending in `/vendor/stockfish/stockfish-18-lite-single.js`;
2. `initialize()` sends `uci`;
3. it waits for `uciok`;
4. it fails if Skill Level is not advertised;
5. it sends `setoption name Skill Level value 0`;
6. it sends `isready` and waits for `readyok`;
7. it does not send `ucinewgame` during initialize;
8. `dispose()` is idempotent and terminates the Worker.

### Step 3: Write failing `beginGame()` tests

Verify:

- sends `ucinewgame`;
- sends `isready` afterward;
- resolves only after `readyok`;
- rejects/returns protocol failure on disposal or Worker error;
- repeated Start uses a new provider instance rather than reusing a prior game provider.

### Step 4: Write failing move tests

Verify:

- sends current `state.fen` directly;
- sends `go movetime 250` after position;
- resolves one typed move result;
- rejects concurrent `makeMove()` calls;
- `(none)` and malformed output return `ok: false`;
- duplicate later `bestmove` is ignored;
- result after disposal is rejected/ignored;
- provider never mutates `GameState`.

### Step 5: Implement provider

Use a small internal waiter registry for `uciok`, `readyok`, and the current bestmove. Every listener checks `disposed` and the current request token. Remove/settle waiters exactly once.

The provider itself does not own the 60-second Start timeout; `useChessRivalSession` wraps `initialize()` plus `beginGame()` in the shared deadline.

### Step 6: Run tests

```bash
bun test apps/web/src/lib/chess/rival/stockfish-provider.test.ts
```

Expected: PASS.

### Step 7: Commit

```bash
git add apps/web/src/lib/chess/rival/stockfish-provider*
git commit -m "feat(chess): add Stockfish rival provider"
```

---

## Task 8: Wrap the existing LLM service behind the provider contract

**Files:**

- Create: `apps/web/src/lib/chess/rival/llm-provider.ts`
- Create: `apps/web/src/lib/chess/rival/llm-provider.test.ts`
- Read/consume without changing behavior: `apps/web/src/lib/ai/factory.ts`
- Read/consume without changing public semantics: `apps/web/src/lib/ai/service.ts`

### Step 1: Write failing adapter tests

Inject the existing AI service through a narrow test interface. Cover:

- `initialize()` and `beginGame()` are no-op/resolved for LLM;
- service config is frozen at construction;
- valid response maps `move`, `thinking`, `confidence`;
- `getLastInteraction()` maps prompt/raw response into `meta.interaction`;
- null/missing move maps `{ ok: false, reason: 'no-move' }`;
- thrown provider errors remain thrown;
- debug callback is delivered through an adapter-level callback/listener without concrete casts;
- `dispose()` clears callbacks and prevents later debug events/results from being accepted.

### Step 2: Implement `createLlmRivalProvider()`

Constructor input should include:

```ts
interface CreateLlmRivalProviderOptions {
  config: AIConfig;
  debug: boolean;
  onDebugEvent?: (event: RivalDebugEvent) => void;
  createService?: typeof createChessAI;
}
```

Freeze a cloned config; do not subscribe the active provider to later config-store updates.

### Step 3: Preserve existing metadata exactly

For successful moves return:

```ts
{
  ok: true,
  move: aiResponse.move,
  meta: {
    thinking: aiResponse.thinking,
    confidence: aiResponse.confidence,
    interaction: {
      prompt: interaction?.prompt,
      response: interaction?.rawResponse,
    },
  },
}
```

### Step 4: Run tests

```bash
bun test apps/web/src/lib/chess/rival/llm-provider.test.ts
```

Expected: PASS.

### Step 5: Commit

```bash
git add apps/web/src/lib/chess/rival/llm-provider*
git commit -m "refactor(chess): wrap language model rival"
```

---

## Task 9: Add identity-reset policy without changing existing callers

**Files:**

- Modify: `apps/web/src/hooks/useGameIdentityReset.ts`
- Modify: `apps/web/src/hooks/useGameIdentityReset.test.ts`

### Step 1: Add failing policy tests

Add optional input:

```ts
enabled?: boolean; // default true
```

Verify:

- default behavior is unchanged;
- logout resets when enabled;
- account switch resets when enabled;
- disabled policy does not call `invalidate` or `onReset`;
- previous-auth/user refs still update while disabled;
- re-enabling does not replay a transition that occurred while disabled.

### Step 2: Implement the gate

Wrap only the reset action:

```ts
if (enabled && (authLost || identityChanged)) {
  invalidateRef.current?.();
  onResetRef.current();
}
```

Always update previous refs after evaluating the transition.

### Step 3: Run tests

```bash
bun test apps/web/src/hooks/useGameIdentityReset.test.ts
```

Expected: PASS.

### Step 4: Commit

```bash
git add apps/web/src/hooks/useGameIdentityReset.ts apps/web/src/hooks/useGameIdentityReset.test.ts
git commit -m "refactor(auth): make game identity reset conditional"
```

---

## Task 10: Implement `useChessRivalSetup`

**Files:**

- Create: `apps/web/src/hooks/useChessRivalSetup.ts`
- Create: `apps/web/src/hooks/useChessRivalSetup.test.tsx`
- Modify: `apps/web/src/hooks/index.ts`

### Step 1: Write failing hook tests

Use Testing Library's hook/component harness and injectable storage/preflight. Cover:

- reads preferences once after client mount;
- exposes `resolved=false` before client preference read;
- default signed-out setup is engine/White;
- configured signed-in no-preference setup can resolve to LLM before interaction;
- remembered LLM stays selected while config is loading;
- selecting a rival persists deliberate kind;
- selecting a side persists it separately per rival;
- automatic fallback emits the correct notice but does not persist kind;
- first interaction closes automatic resolution;
- preflight performs no fetch/Worker creation;
- switching opponent/side emits a setup-change callback for clean preview reset.

### Step 2: Define a narrow hook API

```ts
interface UseChessRivalSetupResult {
  resolved: boolean;
  setup: GameSetup;
  enginePreflight: EnginePreflight;
  llmUsability: LlmUsability;
  fallbackNotice: 'engine-to-llm' | 'llm-to-engine' | null;
  startBlockedReason: string | null;
  selectRival(kind: RivalKind): void;
  selectHumanSide(side: ChessSide): void;
  clearFallbackNotice(): void;
}
```

Inputs include auth snapshot, AI config hydration result, and optional test dependencies.

### Step 3: Implement setup resolution

Use the pure modules from Tasks 2–3. Do not initialize providers here. Keep all automatic changes guarded by `setupTouchedRef` and absence of active/starting state supplied by the caller.

### Step 4: Run tests

```bash
bun test apps/web/src/hooks/useChessRivalSetup.test.tsx
bunx turbo run typecheck --filter=web
```

Expected: PASS.

### Step 5: Commit

```bash
git add apps/web/src/hooks/useChessRivalSetup* apps/web/src/hooks/index.ts
git commit -m "feat(chess): manage rival setup preferences"
```

---

## Task 11: Implement `useChessRivalSession`

**Files:**

- Create: `apps/web/src/hooks/useChessRivalSession.ts`
- Create: `apps/web/src/hooks/useChessRivalSession.test.tsx`
- Modify: `apps/web/src/hooks/index.ts`

### Step 1: Write failing Start transaction tests

Inject provider factories and fake timers. Cover:

- Start validates selected usability;
- Start disables mutation while pending;
- engine provider is not constructed before Start;
- engine Start calls `initialize()` then `beginGame()`;
- LLM Start uses frozen provider/model/config;
- 60-second timeout disposes candidate and commits nothing;
- timeout is `load-failed`, not `unsupported`;
- failed initialize/beginGame commits nothing;
- successful Start returns one frozen session and provider;
- `startedByUserId` captures current user/null;
- rival White is eligible to move only after commit;
- reset invalidates and disposes candidate/active provider;
- Strict Mode replay leaks no provider/Worker.

### Step 2: Write failing ownership/move tests

Cover:

- captures generation/session/provider/FEN per request;
- stale generation result ignored;
- stale session result ignored;
- replaced provider result ignored;
- changed FEN result ignored;
- result ignored if no longer rival turn;
- accepts at most one result per request;
- typed failure preserves board and exposes basic error;
- unexpected thrown failure preserves board and exposes error;
- reset/unmount disposes provider;
- active engine session survives auth/config changes;
- active LLM identity reset is delegated to caller policy.

### Step 3: Define hook responsibilities narrowly

The hook owns async provider/session state, not chess state mutation. Suggested API:

```ts
interface StartRivalSessionInput {
  setup: GameSetup;
  userId: string | null;
  llmConfig: AIConfig;
}

interface RivalMoveRequestContext {
  gameState: GameState;
  generation: number;
  isCurrentGeneration(value: number): boolean;
}

interface UseChessRivalSessionResult {
  activeSession: ActiveRivalSession | null;
  startState: 'idle' | 'starting' | 'load-failed';
  rivalThinking: boolean;
  rivalError: RivalSessionError | null;
  start(input: StartRivalSessionInput): Promise<ActiveRivalSession | null>;
  requestMove(context: RivalMoveRequestContext): Promise<RivalMoveResult | null>;
  reset(): void;
  clearError(): void;
}
```

The caller applies successful moves through `makeAIMove` and passes the current FEN/turn checks back into the hook, or the hook accepts a guarded `onResult` callback. Do not let the provider mutate chess state.

### Step 4: Implement deadline and ownership

Use:

```ts
const ENGINE_START_TIMEOUT_MS = 60_000;
```

Create one attempt ID per Start. Timeout and cleanup mark the attempt stale before disposal. Never reuse a timed-out provider.

### Step 5: Run tests

```bash
bun test apps/web/src/hooks/useChessRivalSession.test.tsx
bunx turbo run typecheck --filter=web
```

Expected: PASS.

### Step 6: Commit

```bash
git add apps/web/src/hooks/useChessRivalSession* apps/web/src/hooks/index.ts
git commit -m "feat(chess): manage rival session lifecycle"
```

---

## Task 12: Build focused rival setup/status components

**Files:**

- Create: `apps/web/src/components/game/ChessRivalSetup.tsx`
- Create: `apps/web/src/components/game/ChessRivalSetup.test.tsx`
- Create: `apps/web/src/components/game/RivalSetupSummary.tsx`
- Create: `apps/web/src/components/game/RivalSetupSummary.test.tsx`
- Create: `apps/web/src/components/game/EngineRivalDetails.tsx`
- Create: `apps/web/src/components/game/EngineRivalDetails.test.tsx`
- Create: `apps/web/src/components/game/LlmRivalDetails.tsx`
- Create: `apps/web/src/components/game/LlmRivalDetails.test.tsx`

### Step 1: Write setup accessibility tests

Verify:

- opponent choices are an accessible radio group/selectable cards;
- labels are exactly **On-device computer** and **Language model**;
- engine copy includes runs on device, no account/API key, and Unrated;
- side control says **You play** with White/Black;
- active/starting state disables both selectors;
- lock explanation appears for active/terminal session;
- fallback notice uses `aria-live='polite'`;
- explicit unusable selection remains selected.

### Step 2: Write summary tests

Verify setup summary and frozen active summary:

```text
On-device computer · Computer plays Black · Unrated
Language model · <model> · Computer plays White
```

The active summary takes a complete `ActiveRivalSession`; do not read current config/preferences inside the component.

### Step 3: Write opponent-detail tests

Engine details states:

- ready to load;
- unsupported;
- loading;
- load failed with **Try again**;
- thinking;
- active failure with New Game guidance.

LLM details:

- preserve sign-in/config guidance;
- wrap/reuse current `AIStatusPanel` and `AIGameInstructions` where practical;
- preserve existing LLM retry/debug copy;
- never show engine copy.

### Step 4: Implement components

Keep components presentation-only. Callbacks and state arrive via props. Do not create providers or read localStorage in components.

### Step 5: Run tests

```bash
bun test apps/web/src/components/game/ChessRivalSetup.test.tsx \
  apps/web/src/components/game/RivalSetupSummary.test.tsx \
  apps/web/src/components/game/EngineRivalDetails.test.tsx \
  apps/web/src/components/game/LlmRivalDetails.test.tsx
```

Expected: PASS.

### Step 6: Commit

```bash
git add apps/web/src/components/game/ChessRivalSetup* \
  apps/web/src/components/game/RivalSetupSummary* \
  apps/web/src/components/game/EngineRivalDetails* \
  apps/web/src/components/game/LlmRivalDetails*
git commit -m "feat(chess): add rival setup interface"
```

---

## Task 13: Refactor `ChessGame` preview and setup integration

**Files:**

- Modify: `apps/web/src/components/ChessGame.tsx`
- Modify: `apps/web/src/components/ChessGame.test.tsx`

### Step 1: Add failing setup/preview tests

Before changing production code, add cases for:

- rival setup hidden until preference hydration resolves;
- board is not interactable and does not visibly flash White orientation before resolution;
- signed-out no-preference setup shows engine;
- configured signed-in untouched setup shows LLM;
- standard mode label is **Play**;
- selected side changes orientation immediately;
- changing opponent/side creates a clean preview;
- every Play preview uses `human-vs-ai` and derived rival side;
- no `aiConfig`-conditioned `human-vs-human` fallback remains;
- no Worker/provider is constructed before Start;
- Tutorial hides rival setup and disposes/clears Play state.

### Step 2: Replace `aiPlayer` setup state

Use `useChessRivalSetup`. Derive preview rival side through `getRivalSide(setup.humanSide)`.

All Play preview creation must be:

```ts
createInitialGameState('human-vs-ai', previewRivalSide)
```

Remove the existing branches that create `human-vs-human` because API configuration is absent.

### Step 3: Add hydration-safe reveal

Until `setup.resolved`:

- keep board behind the existing start overlay or a neutral skeleton;
- disable interaction;
- do not show a White-oriented interactive board;
- render no opponent fallback announcement.

After resolution, pass setup/active orientation to `ChessBoard`.

### Step 4: Integrate shared components

Pass:

```tsx
<BoardSidePanel aiModeLabel='Play' ... />
```

Use `ChessRivalSetup` and setup summary in Play mode. Preserve Tutorial UI.

### Step 5: Run focused tests

```bash
bun test apps/web/src/components/ChessGame.test.tsx
```

Expected: setup/preview tests pass; existing LLM tests may still fail until session integration is complete. Keep failures limited and documented before proceeding.

### Step 6: Commit

```bash
git add apps/web/src/components/ChessGame.tsx apps/web/src/components/ChessGame.test.tsx
git commit -m "refactor(chess): separate rival setup from preview"
```

---

## Task 14: Integrate atomic Start, rival moves, and reset

**Files:**

- Modify: `apps/web/src/components/ChessGame.tsx`
- Modify: `apps/web/src/components/ChessGame.test.tsx`
- Modify if needed: `apps/web/src/lib/chess/rival/provider.ts`

### Step 1: Add failing atomic-Start component tests

Cover:

- engine Start shows `⏳ Loading on-device computer…`;
- selectors lock while starting;
- failed engine Start leaves clean preview and no active session;
- successful Start freezes opponent and side;
- engine White moves only after session commit;
- LLM Start is blocked until configured/hydrated;
- engine Start ignores LLM hydration failure;
- active/terminal selectors stay disabled;
- New Game disposes provider and returns to editable clean preview;
- Tutorial switch disposes provider;
- Try again creates a fresh engine provider after failure.

### Step 2: Replace eager LLM service ownership

Remove:

```ts
const [aiService] = useState(() => createChessAI(defaultAIConfig));
```

Do not continuously update an active service from live config. Let the LLM provider factory freeze config during Start.

### Step 3: Integrate `useChessRivalSession`

Start flow:

1. snapshot setup/auth/config;
2. start provider under session hook;
3. only after success create fresh `human-vs-ai` state and commit `gameStarted`;
4. initialize `GameExporter` only for an LLM session;
5. if rival is White, normal turn effect requests first move after commit.

Move flow:

1. read rival side/opponent only from active session;
2. request typed provider result;
3. apply `ok: true` through existing `makeAIMove` legality gate;
4. use LLM metadata for debug/export;
5. preserve board on typed/throwing failure;
6. retain existing LLM pause/retry semantics;
7. engine active failure offers New Game only.

### Step 4: Replace board/input gates

All turn ownership checks must use:

```ts
activeSession?.rivalSide
```

Never use mutable setup side once active. Continue blocking on pending promotion, terminal state, and current rival request.

### Step 5: Wire reset/mode/unmount disposal

Ensure every path invalidates move generation and calls session reset/disposal:

- New Game;
- Play Again;
- setup change before Start cancels candidate Start;
- Tutorial switch;
- component unmount;
- LLM identity reset.

### Step 6: Run component tests

```bash
bun test apps/web/src/components/ChessGame.test.tsx \
  apps/web/src/components/AiMovePaths.test.tsx \
  apps/web/src/components/CrossVariantInvalidation.test.tsx \
  apps/web/src/components/game/GameDebugAndModeGuard.test.tsx
```

Expected: PASS.

### Step 7: Commit

```bash
git add apps/web/src/components/ChessGame.tsx \
  apps/web/src/components/ChessGame.test.tsx \
  apps/web/src/lib/chess/rival/provider.ts
git commit -m "feat(chess): start immutable rival sessions"
```

---

## Task 15: Integrate identity policy, history, rating, debug, and export

**Files:**

- Modify: `apps/web/src/components/ChessGame.tsx`
- Modify: `apps/web/src/components/ChessGame.test.tsx`
- Modify if required for call-site typing only: `apps/web/src/hooks/usePlayHistory.ts`
- Modify if required: `apps/web/src/hooks/usePlayHistory.test.ts`

### Step 1: Add failing identity/history tests

Cover:

- active LLM session resets on logout/account change;
- active engine session continues through logout/account change/config change;
- engine game started anonymously never saves after later sign-in;
- signed-in engine terminal game passes `{ kind: 'engine', id: 'stockfish' }`;
- engine history uses frozen rival side;
- account switch disables engine save without attributing to new user;
- same starting user terminal save remains enabled;
- existing 401 terminal snapshot/retry tests remain unchanged;
- LLM history/rating path remains unchanged;
- engine result shows Unrated and no rating delta;
- LLM debug/export controls remain present;
- engine hides prompt-oriented debug/export controls.

### Step 2: Apply conditional identity reset

Call `useGameIdentityReset` with `enabled` true for LLM setup/start/active ownership and false for an active engine session. The hook still receives current auth/user on every render.

### Step 3: Wire exact engine history eligibility

Compute:

```ts
const isSameStartingUser =
  activeSession?.startedByUserId !== null &&
  isAuthenticated &&
  user?.id === activeSession.startedByUserId;
```

Engine `usePlayHistory` inputs:

```ts
aiPlayer: activeSession.rivalSide,
opponentDescriptor: { kind: 'engine', id: 'stockfish' },
enabled:
  gameMode === 'ai' &&
  gameStarted &&
  activeSession.opponent.kind === 'engine' &&
  isSameStartingUser,
isAuthenticated,
userId: user?.id,
```

Omit `aiConfig` on engine branch. Pass frozen config on LLM branch.

Do not add a second terminal snapshot or retry mechanism.

### Step 4: Preserve debug/export metadata

When an LLM move succeeds:

- append current debug move entries using provider debug events/meta;
- send prompt, response, reasoning, confidence to `GameExporter` exactly as before;
- initialize exporter only for LLM Start;
- keep existing retry behavior for LLM typed failures/errors.

### Step 5: Run focused tests

```bash
bun test apps/web/src/components/ChessGame.test.tsx \
  apps/web/src/hooks/usePlayHistory.test.ts \
  apps/web/src/hooks/useGameIdentityReset.test.ts
```

Expected: PASS.

### Step 6: Commit

```bash
git add apps/web/src/components/ChessGame.tsx \
  apps/web/src/components/ChessGame.test.tsx \
  apps/web/src/hooks/usePlayHistory.ts \
  apps/web/src/hooks/usePlayHistory.test.ts
git commit -m "feat(chess): preserve rival history and tools"
```

Only stage `usePlayHistory` files if the existing union/call-site contract genuinely requires a typing adjustment.

---

## Task 16: Add mocked browser journeys and no-eager-download assertion

**Files:**

- Create: `apps/web/e2e/chess-rival.spec.ts`
- Modify only if needed: `apps/web/playwright.config.ts`

### Step 1: Add a browser-level fake Worker bootstrap

Inject a deterministic Worker implementation before app scripts for runtime tests. It must emulate:

- `uci`/`uciok`;
- Skill Level option advertisement;
- `isready`/`readyok`;
- `ucinewgame`;
- a scripted `bestmove`;
- load timeout/error variants.

Do not load the real 7 MB WASM in these UI journeys; packaging PR A owns the real production Worker smoke.

### Step 2: Add signed-out engine journey

Verify:

1. visit `/chess` signed out;
2. no request to `/vendor/stockfish/*` occurs before Start;
3. engine is selected by default;
4. choose human Black;
5. board orientation resolves without White flash;
6. press Start;
7. loading label appears;
8. session locks controls;
9. rival White moves first after readiness;
10. human move works;
11. New Game unlocks setup and disposes provider.

### Step 3: Add configured LLM journey

Mock auth/config/provider requests using existing E2E patterns. Verify:

- configured untouched user resolves to LLM;
- no Stockfish request;
- Start uses existing LLM path;
- debug/export behavior remains available;
- switching to engine before Start creates clean preview.

### Step 4: Add failure/fallback journeys

Cover:

- cheap engine preflight unsupported → actionable copy/manual LLM choice;
- engine Start timeout/load failure → load-failed copy and Try again;
- remembered engine unsupported + usable LLM → fallback notice;
- remembered LLM unavailable + supported engine → fallback notice;
- explicit unusable choice is not overridden.

### Step 5: Run focused browser tests

```bash
cd apps/web
bunx playwright test e2e/chess-rival.spec.ts --project=chromium
```

Expected: PASS.

### Step 6: Commit

```bash
git add apps/web/e2e/chess-rival.spec.ts apps/web/playwright.config.ts
git commit -m "test(chess): cover rival selection journeys"
```

Only stage the shared Playwright config if a real configuration change is required.

---

## Task 17: Run cross-variant and complete verification

### Step 1: Run the HPA-161 focused matrix

```bash
bun test \
  apps/web/src/lib/chess/rival \
  apps/web/src/hooks/useChessRivalSetup.test.tsx \
  apps/web/src/hooks/useChessRivalSession.test.tsx \
  apps/web/src/hooks/useGameIdentityReset.test.ts \
  apps/web/src/hooks/usePlayHistory.test.ts \
  apps/web/src/components/ChessBoard.test.tsx \
  apps/web/src/components/ChessGame.test.tsx \
  apps/web/src/components/game/BoardSidePanel.test.tsx \
  apps/web/src/components/game/GameControls.test.tsx \
  apps/web/src/components/game/ChessRivalSetup.test.tsx \
  apps/web/src/components/game/RivalSetupSummary.test.tsx \
  apps/web/src/components/game/EngineRivalDetails.test.tsx \
  apps/web/src/components/game/LlmRivalDetails.test.tsx
```

Expected: PASS.

### Step 2: Run shared/cross-variant regressions

```bash
bun test \
  apps/web/src/components/XiangqiGame.test.tsx \
  apps/web/src/components/ShogiGame.test.tsx \
  apps/web/src/components/JungleGame.test.tsx \
  apps/web/src/components/AiMovePaths.test.tsx \
  apps/web/src/components/CrossVariantInvalidation.test.tsx \
  apps/web/src/components/game/GameDebugAndModeGuard.test.tsx
```

Expected: PASS; shared default labels/tool behavior remain unchanged.

### Step 3: Run browser tests

```bash
cd apps/web
bunx playwright test e2e/chess-rival.spec.ts --project=chromium
bun run test:e2e:stockfish-assets
cd ../..
```

Expected:

- mocked UI journeys pass;
- real production-preview Stockfish asset smoke from PR A still passes.

### Step 4: Run repository quality gates

```bash
bunx turbo run typecheck --filter=web
bunx turbo run lint --filter=web
PUBLIC_GOOGLE_CLIENT_ID=verification-only bunx turbo run build --filter=web --force
bun run test
```

Expected:

- no type errors;
- no new lint errors;
- production build succeeds;
- full monorepo test suite passes.

### Step 5: Verify page-load network boundary manually

Run production preview or dev server and inspect `/chess` before Start:

```bash
bun run web:dev
```

Expected in browser network panel:

- no `stockfish-18-lite-single.js` request before engine Start;
- no `stockfish-18-lite-single.wasm` request before engine Start;
- both requests occur after explicit Start;
- a second New Game creates a fresh provider only when Start is pressed again.

Record this in the PR validation section.

### Step 6: Check branch hygiene

```bash
git diff --check
git status --short
git log --oneline --decorate -15
```

Expected: clean tree and intentional, reviewable commits.

### Step 7: Final commit if required

```bash
git add <only-intended-files>
git commit -m "feat(chess): finalize rival opponent flow"
```

Skip if clean.

### Step 8: Push and create draft PR B

```bash
git push -u origin codex/hpa-161-opponent-session
```

PR body must state:

- dependency on/relationship to packaging PR A;
- editable setup vs immutable session architecture;
- no engine asset download before Start;
- Skill Level 0/bootstrap limitations and HPA-162 dependency;
- engine lifecycle limitations deferred to HPA-163;
- signed-out and identity/history behavior;
- exact focused/full/browser validation results;
- no changes to rating semantics or non-chess variants.

---

## Runtime PR B completion criteria

PR B is complete when:

- signed-out users can start and complete engine games without account/API-key prompts;
- selecting/defaulting to engine does not request Stockfish assets before Start;
- configured signed-in untouched users default to LLM;
- opponent and human side are independently remembered and editable before Start;
- all Play previews use `human-vs-ai` with the derived rival side;
- board orientation resolves without a visible White-to-Black flash;
- Start commits one immutable session only after provider readiness;
- engine UCI sequencing includes Skill Level 0 and post-`ucinewgame` readiness;
- provider result union preserves LLM debug/export metadata and typed failures;
- stale generation/session/provider/FEN results cannot apply;
- engine games continue across auth/config changes without history misattribution;
- LLM identity reset, rating, debug, export, and retry behavior remain unchanged;
- engine games are visibly Unrated and use the HPA-165 history descriptor when eligible;
- Tutorial and all reset/navigation paths dispose providers and clear sessions;
- Xiangqi, Shogi, and Jungle retain shared-component behavior without call-site migration;
- focused, cross-variant, browser, production Worker, build, lint, typecheck, and full tests pass;
- HPA-162/163/164/166/187 scope remains deferred as documented.
