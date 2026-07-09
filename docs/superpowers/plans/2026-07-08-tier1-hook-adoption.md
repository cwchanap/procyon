# Tier 1 — Hook Adoption & Bug Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `ai-config-store` the single AI-config mechanism and `usePlayHistory` the single play-history mechanism across all four game components; centralize `resolveOpponentLlmId`; fix three hook-layer drift bugs; delete the bypassed `useGameAI` hook.

**Architecture:** The store (`lib/ai/ai-config-store.ts`) already hydrates at the app level (`AppShell.tsx`) and owns config (provider/model/apiKey/enabled/gameVariant). It becomes the single source of truth — but **config-only**: the chess-specific `aiPlayer`/`gameActive` slices move to per-component local state. `usePlayHistory` is reshaped to take an `enabled` flag + `debugVariantKey`, use the real `env` and the shared `resolveOpponentLlmId`, and apply the normalized save guards. Each game component drops its inline config-load/provider-change/play-history copies and wires the shared mechanisms.

**Tech Stack:** TypeScript (strict), React 18, Astro SSR, Bun test runner, `useSyncExternalStore` store.

**Spec:** `docs/superpowers/2026-07-08-tier1-hook-adoption-design.md`

## Global Constraints

- Runtime/package manager: **Bun** (never npm/yarn/pnpm).
- API base URL: always `import { env } from '../lib/env'` — never inline `import.meta.env.PUBLIC_API_URL`.
- No new third-party dependencies.
- TypeScript strict; no `any` in new code.
- Existing tests (`apps/web/src/**/*.test.ts`, `*.test.tsx`, E2E `apps/web/e2e/*.spec.ts`) must stay green after each task.
- Result-determination equivalence: in checkmate the **winner is the side opposite `gameState.currentPlayer`** (the checkmated side). `getWinnerColor` must return that opposite color.
- All commits use conventional-commit prefixes (`feat:`, `refactor:`, `test:`, `chore:`).

## File Structure

**Created:**

- `apps/web/src/lib/ai/opponent-llm.ts` — `resolveOpponentLlmId(provider, model)` pure helper (single source of truth for the opponent-rating bucket).
- `apps/web/src/lib/ai/opponent-llm.test.ts` — unit tests for the helper.

**Modified:**

- `apps/web/src/hooks/usePlayHistory.ts` — reshape options (`enabled`, `debugVariantKey`), real `env`, shared `resolveOpponentLlmId`, normalized guards.
- `apps/web/src/hooks/usePlayHistory.test.ts` — import the real helper instead of mirroring it.
- `apps/web/src/lib/ai/ai-config-store.ts` — remove `aiPlayer`/`gameActive` slices (config-only).
- `apps/web/src/lib/ai/ai-config-store.test.ts` — drop `aiPlayer` assertions.
- `apps/web/src/components/{Chess,Xiangqi,Shogi,Jungle}Game.tsx` — adopt store + `usePlayHistory`; delete inline copies.
- `apps/web/src/hooks/index.ts` — drop `useGameAI` export.

**Deleted:**

- `apps/web/src/hooks/useGameAI.ts` + `apps/web/src/hooks/useGameAI.test.ts`.
- `apps/web/src/lib/ai/ai-config-store-slices.test.tsx` (slice-isolation is moot once only the config slice remains).

---

### Task 1: `resolveOpponentLlmId` helper

**Files:**

- Create: `apps/web/src/lib/ai/opponent-llm.ts`
- Test: `apps/web/src/lib/ai/opponent-llm.test.ts`

**Interfaces:**

- Produces: `export type OpponentLlmId = 'gpt-4o' | 'gemini-2.5-flash';` and `export function resolveOpponentLlmId(provider: string, model: string): OpponentLlmId`. Rule: `gpt-4o` family → `'gpt-4o'`; all other providers/models → `'gemini-2.5-flash'`.

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/lib/ai/opponent-llm.test.ts`:

```ts
import { test, expect, describe } from 'bun:test';
import { resolveOpponentLlmId } from './opponent-llm';

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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && bun test src/lib/ai/opponent-llm.test.ts`
Expected: FAIL — "Cannot find module './opponent-llm'".

- [ ] **Step 3: Write minimal implementation**

Create `apps/web/src/lib/ai/opponent-llm.ts`:

```ts
export type OpponentLlmId = 'gpt-4o' | 'gemini-2.5-flash';

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

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/web && bun test src/lib/ai/opponent-llm.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/ai/opponent-llm.ts apps/web/src/lib/ai/opponent-llm.test.ts
git commit -m "feat(ai): add resolveOpponentLlmId helper"
```

---

### Task 2: Reshape `usePlayHistory`

**Files:**

- Modify: `apps/web/src/hooks/usePlayHistory.ts`
- Test: `apps/web/src/hooks/usePlayHistory.test.ts`

**Interfaces:**

- Consumes: `resolveOpponentLlmId` from Task 1; `env` from `../lib/env`.
- Produces: `usePlayHistory(options)` with new options shape `{ gameVariant, gameStatus, aiPlayer, aiConfig, moveCount, getWinnerColor, enabled, debugVariantKey? }` and the same return `{ savePlayHistory }`.

- [ ] **Step 1: Update the logic-mirror test to import the real helper**

In `apps/web/src/hooks/usePlayHistory.test.ts`, replace the locally-mirrored `getOpponentLlmId` function (lines 7-16) and its `describe` block's calls. Change the import block at the top to add:

```ts
import { resolveOpponentLlmId } from '../lib/ai/opponent-llm';
```

Delete the local `function getOpponentLlmId(...)` (lines 7-16). Replace the `describe('getOpponentLlmId mapping logic', ...)` block's body so each assertion calls `resolveOpponentLlmId(...)` instead of the deleted local function (8 assertions — same inputs/expected values). Leave the `determineResult`, save-guard, `isGameOver`, and preconditions `describe` blocks untouched (they test pure logic independent of the hook).

- [ ] **Step 2: Run test to verify it still passes (logic unchanged, just relocated)**

Run: `cd apps/web && bun test src/hooks/usePlayHistory.test.ts`
Expected: PASS — all existing tests green (the mapping logic is identical, now imported).

- [ ] **Step 3: Rewrite `usePlayHistory`**

Replace the entire contents of `apps/web/src/hooks/usePlayHistory.ts` with:

```ts
import { useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../lib/auth';
import { env } from '../lib/env';
import { resolveOpponentLlmId } from '../lib/ai/opponent-llm';
import type { AIConfig } from '../lib/ai/types';
import type { GameVariant, GameStatus } from '../lib/ai/game-variant-types';

export interface UsePlayHistoryOptions {
  gameVariant: GameVariant;
  gameStatus: GameStatus;
  aiPlayer: string | null | undefined;
  aiConfig: AIConfig;
  moveCount: number;
  getWinnerColor: () => string | null;
  /** True only while an AI game is in progress (gameMode === 'ai' && gameStarted). */
  enabled: boolean;
  /** When set, bumps window.__PROCYON_DEBUG_<KEY>_SAVE_COUNT__ before the fetch. */
  debugVariantKey?: string;
}

export interface UsePlayHistoryReturn {
  savePlayHistory: () => Promise<void>;
}

function isGameOverStatus(status: GameStatus): boolean {
  return status === 'checkmate' || status === 'stalemate' || status === 'draw';
}

/**
 * Auto-saves a play-history record when an AI game ends. Single source of
 * truth for all four game variants. Save guards: enabled (AI game in
 * progress), authenticated-or-DEV, game over, not already saved.
 */
export function usePlayHistory({
  gameVariant,
  gameStatus,
  aiPlayer,
  aiConfig,
  moveCount,
  getWinnerColor,
  enabled,
  debugVariantKey,
}: UsePlayHistoryOptions): UsePlayHistoryReturn {
  const { isAuthenticated } = useAuth();
  const savedRef = useRef(false);

  const savePlayHistory = useCallback(async () => {
    if (!enabled || savedRef.current) return;
    if (!(isAuthenticated || import.meta.env.DEV)) return;
    if (!aiPlayer) return;
    if (!isGameOverStatus(gameStatus)) return;

    let result: 'win' | 'loss' | 'draw';
    if (gameStatus === 'draw' || gameStatus === 'stalemate') {
      result = 'draw';
    } else {
      const winnerColor = getWinnerColor();
      if (winnerColor === null) return;
      result = winnerColor === aiPlayer ? 'loss' : 'win';
    }

    savedRef.current = true;

    if (debugVariantKey && typeof window !== 'undefined') {
      const w = window as unknown as Record<string, number | undefined>;
      const key = `__PROCYON_DEBUG_${debugVariantKey}_SAVE_COUNT__`;
      w[key] = (w[key] ?? 0) + 1;
    }

    try {
      const opponentLlmId = resolveOpponentLlmId(
        aiConfig.provider,
        aiConfig.model
      );
      const response = await fetch(`${env.PUBLIC_API_URL}/play-history`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          chessId: gameVariant,
          status: result,
          date: new Date().toISOString(),
          opponentLlmId,
        }),
      });
      if (!response.ok) {
        savedRef.current = false;
      }
    } catch (error) {
      savedRef.current = false;
      // eslint-disable-next-line no-console
      console.error('Error saving play history:', error);
    }
  }, [
    enabled,
    isAuthenticated,
    aiPlayer,
    gameStatus,
    aiConfig.provider,
    aiConfig.model,
    gameVariant,
    getWinnerColor,
    debugVariantKey,
  ]);

  useEffect(() => {
    if (isGameOverStatus(gameStatus) && !savedRef.current) {
      void savePlayHistory();
    }
  }, [gameStatus, savePlayHistory]);

  useEffect(() => {
    if (gameStatus === 'playing' && moveCount === 0) {
      savedRef.current = false;
    }
  }, [gameStatus, moveCount]);

  return { savePlayHistory };
}
```

- [ ] **Step 4: Run the hook's test + full unit suite**

Run: `cd apps/web && bun test src/hooks/usePlayHistory.test.ts && bun test`
Expected: PASS — hook logic-mirror tests green; no regressions across the suite.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/hooks/usePlayHistory.ts apps/web/src/hooks/usePlayHistory.test.ts
git commit -m "refactor(hooks): reshape usePlayHistory to shared env + resolveOpponentLlmId + normalized guards"
```

---

### Task 3: Migrate ChessGame to local `aiPlayer`/`gameActive` + `usePlayHistory`

ChessGame already reads config from the store (`useAIConfig`). This task moves `aiPlayer` and `gameActive` to local state (per the approved design), adopts `usePlayHistory`, and deletes the inline play-history effect (which also fixes bug 7.3 — the missing `gameMode==='ai' && gameStarted` guard, now enforced by the hook's `enabled` flag).

**Files:**

- Modify: `apps/web/src/components/ChessGame.tsx`
- Test: existing `apps/web/e2e/chess-ai.spec.ts`, `apps/web/e2e/critical-user-journeys.spec.ts`, `apps/web/e2e/rating-system.spec.ts`

**Interfaces:**

- Consumes: `usePlayHistory` (Task 2).
- Produces: ChessGame no longer imports `useAIPlayer` / `setGameActive` from the store (unblocks Task 7).

- [ ] **Step 1: Update imports**

In `apps/web/src/components/ChessGame.tsx`, change the store import (lines 24-28):

```ts
import {
  useAIConfig,
  useAIPlayer,
  setGameActive,
} from '../lib/ai/ai-config-store';
```

to:

```ts
import { useAIConfig } from '../lib/ai/ai-config-store';
import { usePlayHistory } from '../hooks/usePlayHistory';
```

Delete the now-unused import on line 31:

```ts
import { env } from '../lib/env';
```

(`env` was only used by the deleted play-history fetch.)

- [ ] **Step 2: Move `aiPlayer` to local state**

Replace line 53 `const aiPlayer = useAIPlayer();` with a local state declaration. Add it alongside the other `useState` calls (e.g. immediately after line 52):

```ts
const [aiPlayer, setAIPlayer] = useState<'white' | 'black'>('black');
const [gameActive, setGameActive] = useState(false);
```

(ChessGame never calls `setAIPlayer`/`setGameActive` from the store today; the local `setGameActive` replaces the imported one used at lines 97, 477, 609, 667, 670. `setAIPlayer` is declared for completeness but chess keeps a fixed `'black'` AI side — matching current behavior.)

- [ ] **Step 3: Delete the inline play-history effect and adopt the hook**

Delete the entire `useEffect` block at lines 88-160 (the "Save play history when game ends" effect including the debug counter, result derivation, opponent-llm mapping, and fetch). In its place, add the hook call and a slim latch effect that preserves the `hasGameEnded`/`gameActive` side-effects:

```ts
usePlayHistory({
  gameVariant: 'chess',
  gameStatus: gameState.status,
  aiPlayer,
  aiConfig,
  moveCount: gameState.moveHistory.length,
  getWinnerColor: () =>
    gameState.currentPlayer === 'white' ? 'black' : 'white',
  enabled: gameMode === 'ai' && gameStarted,
  debugVariantKey: 'CHESS',
});

// Latch game-ended + clear gameActive when the game finishes (the hook owns
// the actual play-history save + dedup).
useEffect(() => {
  const over =
    gameState.status === 'checkmate' ||
    gameState.status === 'stalemate' ||
    gameState.status === 'draw';
  if (over && !hasGameEnded) {
    setHasGameEnded(true);
    setGameActive(false);
  }
}, [gameState.status, hasGameEnded]);
```

- [ ] **Step 4: Verify typecheck + lint**

Run: `cd apps/web && bunx tsc --noEmit && bun run lint`
Expected: no errors. (If `setAIPlayer` is flagged unused, prefix it `_setAIPlayer` or remove it — chess uses a fixed `'black'` AI side, so the setter is not required.)

- [ ] **Step 5: Run the chess E2E + unit suites**

Run: `cd apps/web && bun test` then `bun run test:e2e -- chess-ai critical-user-journeys rating-system`
Expected: PASS. The `__PROCYON_DEBUG_CHESS_SAVE_COUNT__` counter is still bumped (now by the hook via `debugVariantKey: 'CHESS'`), and the debug-win-triggered save fires in DEV.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/ChessGame.tsx
git commit -m "refactor(chess): adopt usePlayHistory; move aiPlayer/gameActive to local state"
```

---

### Task 4: Migrate XiangqiGame to the store + `usePlayHistory`

XiangqiGame currently uses local `aiConfig` state + `loadAIConfig()` + a 97-line inline `handleProviderChange` + a ~60-line inline play-history effect. All replaced by the store + hook. (The store is hydrated app-wide by `AppShell.tsx`, so no per-component hydrate is needed.)

**Files:**

- Modify: `apps/web/src/components/XiangqiGame.tsx`
- Test: `apps/web/e2e/xiangqi-ai.spec.ts`, `apps/web/e2e/critical-user-journeys.spec.ts`

**Interfaces:**

- Consumes: `useAIConfig`, `setProvider`, `setModel` from `ai-config-store`; `usePlayHistory` from Task 2.
- Produces: XiangqiGame no longer imports `loadAIConfig`/`defaultAIConfig` from `../lib/ai`.

- [ ] **Step 1: Update imports**

Change line 15 from:

```ts
import { createXiangqiAI, defaultAIConfig, loadAIConfig } from '../lib/ai';
```

to:

```ts
import { createXiangqiAI } from '../lib/ai';
import {
  useAIConfig,
  setProvider as setAIProvider,
  setModel as setAIModel,
} from '../lib/ai/ai-config-store';
import { usePlayHistory } from '../hooks/usePlayHistory';
```

Delete line 16 `import { env } from '../lib/env';` (only the deleted play-history fetch used it) and the `AI_PROVIDERS` import on line 18 if no longer referenced (it is not, after Step 5 deletes `handleProviderChange`) — remove `import { AI_PROVIDERS } from '../lib/ai/types';`. Keep `import type { AIConfig, AIProvider } from '../lib/ai/types';`.

- [ ] **Step 2: Replace local config state with the store**

Replace the local `aiConfig` `useState` (lines 51-54):

```ts
const [aiConfig, setAIConfig] = useState<AIConfig>({
  ...defaultAIConfig,
  gameVariant: 'xiangqi',
});
```

and the `_isLoadingConfig` declaration (line 59):

```ts
const [_isLoadingConfig, setIsLoadingConfig] = useState(true);
```

with the store slice:

```ts
const { config: aiConfig } = useAIConfig();
```

(`setAIConfig` is removed — its only remaining call site, the `onModelChange` prop, is rewired in Step 5 to `setAIModel`. `_isLoadingConfig` was only set by the deleted load effect and is otherwise unused.)

- [ ] **Step 3: Delete the `loadAIConfig` effect**

Delete the `useEffect` at lines 90-103 (the "Load AI config on client side" block). The store hydrates app-wide.

- [ ] **Step 4: Delete the inline play-history effect; adopt the hook**

Delete the `useEffect` at lines 119-192 (the "Save play history when game ends" block). Add the hook call (place it near the other hooks, e.g. after the `createAIMove` callback):

```ts
usePlayHistory({
  gameVariant: 'xiangqi',
  gameStatus: gameState.status,
  aiPlayer,
  aiConfig,
  moveCount: gameState.moveHistory.length,
  getWinnerColor: () => (gameState.currentPlayer === 'red' ? 'black' : 'red'),
  enabled: gameMode === 'ai' && gameStarted,
  debugVariantKey: 'XIANGQI',
});
```

- [ ] **Step 5: Replace `handleProviderChange` with `setProvider`**

Delete the entire `handleProviderChange` `useCallback` (lines 573-669). The `AISettingsDialog` wiring (around lines 756-778) now calls the store directly. Update those props:

```tsx
				aiSettingsButton={
					<AISettingsDialog
						aiPlayer={aiPlayer}
						onAIPlayerChange={player => setAIPlayer(player as 'red' | 'black')}
						provider={aiConfig.provider}
						model={aiConfig.model}
						onProviderChange={async provider => {
							const err = await setAIProvider(provider as AIProvider);
							setErrorMsg(err);
						}}
						onModelChange={model => setAIModel(model)}
						aiPlayerOptions={[
							{ value: 'black', label: 'AI plays Black (黑方)' },
							{ value: 'red', label: 'AI plays Red (红方)' },
						]}
						isActive={gameMode === 'ai'}
						onActivate={() => toggleToMode('ai')}
					/>
				}
```

- [ ] **Step 6: Verify typecheck + lint**

Run: `cd apps/web && bunx tsc --noEmit && bun run lint`
Expected: no errors. Remove any now-unused imports flagged by the linter (e.g. `AIConfig` if no longer referenced as a value — it remains used as a type, keep it; `AIProvider` stays used in the cast).

- [ ] **Step 7: Run E2E + unit suites**

Run: `cd apps/web && bun test && bun run test:e2e -- xiangqi-ai critical-user-journeys`
Expected: PASS. The xiangqi provider-change flow now goes through the store's `setProvider` (which surfaces the same user-facing error strings via `setErrorMsg`).

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/components/XiangqiGame.tsx
git commit -m "refactor(xiangqi): adopt ai-config-store + usePlayHistory; drop inline config/play-history"
```

---

### Task 5: Migrate ShogiGame to the store + `usePlayHistory`

Same shape as Task 4. Adopting the hook also fixes bug 7.2: Shogi's inline `isGameOver` only checked `checkmate || draw` (missing `stalemate`); the hook's `isGameOverStatus` checks all three (harmless for shogi, which never produces stalemate, but consistent).

**Files:**

- Modify: `apps/web/src/components/ShogiGame.tsx`
- Test: `apps/web/e2e/shogi-ai.spec.ts`, `apps/web/e2e/critical-user-journeys.spec.ts`

**Interfaces:** same as Task 4 (consumes store + hook).

- [ ] **Step 1: Update imports**

Change line 12 from:

```ts
import { createShogiAI, defaultAIConfig, loadAIConfig } from '../lib/ai';
```

to:

```ts
import { createShogiAI } from '../lib/ai';
import {
  useAIConfig,
  setProvider as setAIProvider,
  setModel as setAIModel,
} from '../lib/ai/ai-config-store';
import { usePlayHistory } from '../hooks/usePlayHistory';
```

Delete line 16 `import { env } from '../lib/env';`.

- [ ] **Step 2: Replace local config state with the store**

Replace lines 42-45 (the `aiConfig` `useState`) and line 50 (`_isLoadingConfig`) with:

```ts
const { config: aiConfig } = useAIConfig();
```

(Remove the `_isLoadingConfig` declaration.)

- [ ] **Step 3: Delete the `loadAIConfig` effect**

Delete the `useEffect` at lines 83-96 (the "Load AI config" block).

- [ ] **Step 4: Delete the inline play-history effect; adopt the hook**

Delete the `useEffect` at lines 112-177 (the "Save play history when game ends" block). Add:

```ts
usePlayHistory({
  gameVariant: 'shogi',
  gameStatus: gameState.status,
  aiPlayer,
  aiConfig,
  moveCount: gameState.moveHistory.length,
  getWinnerColor: () =>
    gameState.currentPlayer === 'sente' ? 'gote' : 'sente',
  enabled: gameMode === 'ai' && gameStarted,
  debugVariantKey: 'SHOGI',
});
```

- [ ] **Step 5: Wire `AISettingsDialog` to the store**

ShogiGame does not define a standalone `handleProviderChange` (its `AISettingsDialog` is wired inline — locate the `<AISettingsDialog ...>` JSX and update `onProviderChange`/`onModelChange`):

```tsx
						onProviderChange={async provider => {
							// setErrorMsg-equivalent: shogi surfaces provider errors via its
							// own error state if present; otherwise call setAIProvider and
							// ignore the returned string (shogi has no inline error banner).
							await setAIProvider(provider as AIProvider);
						}}
						onModelChange={model => setAIModel(model)}
```

(If ShogiGame exposes an error-state setter for provider failures, assign the returned string to it instead — mirroring Xiangqi Task 4 Step 5. Inspect the existing `<AISettingsDialog>` block to confirm; the default above is the no-error-banner path.)

- [ ] **Step 6: Verify typecheck + lint**

Run: `cd apps/web && bunx tsc --noEmit && bun run lint`
Expected: no errors. Remove unused imports the linter flags.

- [ ] **Step 7: Run E2E + unit suites**

Run: `cd apps/web && bun test && bun run test:e2e -- shogi-ai critical-user-journeys`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/components/ShogiGame.tsx
git commit -m "refactor(shogi): adopt ai-config-store + usePlayHistory; fix missing stalemate guard"
```

---

### Task 6: Migrate JungleGame to the store + `usePlayHistory`

Same shape as Tasks 4–5.

**Files:**

- Modify: `apps/web/src/components/JungleGame.tsx`
- Test: `apps/web/e2e/critical-user-journeys.spec.ts`

**Interfaces:** same as Task 4.

- [ ] **Step 1: Update imports**

Change line 15 from:

```ts
import { createJungleAI, defaultAIConfig, loadAIConfig } from '../lib/ai';
```

to:

```ts
import { createJungleAI } from '../lib/ai';
import {
  useAIConfig,
  setProvider as setAIProvider,
  setModel as setAIModel,
} from '../lib/ai/ai-config-store';
import { usePlayHistory } from '../hooks/usePlayHistory';
```

Delete line 16 `import { env } from '../lib/env';`.

- [ ] **Step 2: Replace local config state with the store**

Replace lines 49-52 (the `aiConfig` `useState`) and line 57 (`_isLoadingConfig`) with:

```ts
const { config: aiConfig } = useAIConfig();
```

(Remove the `_isLoadingConfig` declaration.)

- [ ] **Step 3: Delete the `loadAIConfig` effect**

Delete the `useEffect` at lines 63-76 (the "Load AI config" block).

- [ ] **Step 4: Delete the inline play-history effect; adopt the hook**

Delete the `useEffect` at lines 92-159 (the "Save play history when game ends" block). Add:

```ts
usePlayHistory({
  gameVariant: 'jungle',
  gameStatus: gameState.status,
  aiPlayer,
  aiConfig,
  moveCount: gameState.moveHistory.length,
  getWinnerColor: () => (gameState.currentPlayer === 'red' ? 'blue' : 'red'),
  enabled: gameMode === 'ai' && gameStarted,
  debugVariantKey: 'JUNGLE',
});
```

- [ ] **Step 5: Wire `AISettingsDialog` to the store**

Locate JungleGame's `<AISettingsDialog ...>` JSX and update `onProviderChange`/`onModelChange`:

```tsx
						onProviderChange={async provider => {
							await setAIProvider(provider as AIProvider);
						}}
						onModelChange={model => setAIModel(model)}
```

(If JungleGame has a provider-error banner setter, assign `setAIProvider`'s returned string to it — mirroring Xiangqi Task 4 Step 5.)

- [ ] **Step 6: Verify typecheck + lint**

Run: `cd apps/web && bunx tsc --noEmit && bun run lint`
Expected: no errors.

- [ ] **Step 7: Run E2E + unit suites**

Run: `cd apps/web && bun test && bun run test:e2e -- critical-user-journeys`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/components/JungleGame.tsx
git commit -m "refactor(jungle): adopt ai-config-store + usePlayHistory; drop inline config/play-history"
```

---

### Task 7: Generalize `ai-config-store` to config-only

Now that no component reads `useAIPlayer`/`useGameActive` (Tasks 3–6), remove the `aiPlayer` and `gameActive` slices so the store owns config only.

**Files:**

- Modify: `apps/web/src/lib/ai/ai-config-store.ts`
- Modify: `apps/web/src/lib/ai/ai-config-store.test.ts`
- Delete: `apps/web/src/lib/ai/ai-config-store-slices.test.tsx`

**Interfaces:**

- Produces: store exports now limited to `useAIConfig`, `subscribeConfig`, `getConfigSlice`, `setConfig`, `setModel`, `setProvider`, `hydrate`, `rehydrate`, `resetAIConfigStore`, and the `AIConfigSlice` type. Removed: `useAIPlayer`, `getAIPlayer`, `setAIPlayer`, `subscribeAIPlayer`, `useGameActive`, `getGameActive`, `setGameActive`, `subscribeGameActive`.

- [ ] **Step 1: Update the store unit test first (TDD — express the new surface)**

In `apps/web/src/lib/ai/ai-config-store.test.ts`:

- Remove `subscribeAIPlayer`, `getAIPlayer`, `setAIPlayer` from the import (lines 4, 6, 9).
- In `beforeEach` (line 22), delete `setAIPlayer('black');`.
- Delete the test `'initial snapshot is defaults with black AI'` (lines 25-28) — replace with:

```ts
test('initial snapshot is defaults', () => {
  expect(getConfigSlice().config).toEqual(defaultAIConfig);
});
```

- Delete the test `'setAIPlayer updates aiPlayer'` (lines 35-38).
- Rewrite the `'config subscribers are notified on config changes only'` test (lines 40-60) to drop the aiPlayer listener:

```ts
test('config subscribers are notified on config changes', () => {
  let configCalls = 0;
  const unsubConfig = subscribeConfig(() => configCalls++);

  setModel('gpt-4o');
  expect(configCalls).toBe(1);

  unsubConfig();
  setModel('gemini-2.5-pro');
  expect(configCalls).toBe(1);
});
```

- [ ] **Step 2: Run the store test to confirm it fails against the old module**

Run: `cd apps/web && bun test src/lib/ai/ai-config-store.test.ts`
Expected: FAIL — the old module still exports `setAIPlayer`/`getAIPlayer`/`subscribeAIPlayer`, but the test no longer references them; the failure is a typecheck/lint on the now-removed `aiPlayer` reset inside `resetAIConfigStore` only after Step 3. (If it passes here because the old exports are simply unused by the test, proceed — the real gate is Step 4.)

- [ ] **Step 3: Remove the `aiPlayer`/`gameActive` slices from the store**

In `apps/web/src/lib/ai/ai-config-store.ts`:

- Delete `let aiPlayer ...` (line 32), `let gameActive ...` (lines 34-41), `aiPlayerListeners`/`gameActiveListeners` sets (lines 44-45), `subscribeAIPlayer`/`subscribeGameActive` (lines 54-66), `getAIPlayer`/`getGameActive` (lines 72-78), `emitAIPlayer`/`emitGameActive` (lines 84-90), `setAIPlayer`/`setGameActive` (lines 107-117), `useAIPlayer`/`useGameActive` (lines 229-240).
- In `resetAIConfigStore` (lines 250-261), remove the `aiPlayer = 'black';`, `gameActive = false;`, `emitAIPlayer();`, `emitGameActive();` lines.
- Keep the config slice, `subscribeConfig`/`getConfigSlice`/`emitConfig`/`setConfigSlice`, `setConfig`/`setModel`/`setProvider`, `hydrate`/`rehydrate`/`runHydrate`, `useAIConfig`, and `resetAIConfigStore`.

- [ ] **Step 4: Delete the now-moot slice-isolation test**

```bash
git rm apps/web/src/lib/ai/ai-config-store-slices.test.tsx
```

(With only the config slice remaining, "slice isolation" is vacuous; config-subscriber notification is still covered by `ai-config-store.test.ts`.)

- [ ] **Step 5: Verify typecheck + lint + tests**

Run: `cd apps/web && bunx tsc --noEmit && bun run lint && bun test`
Expected: no errors; all unit tests PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/lib/ai/ai-config-store.ts apps/web/src/lib/ai/ai-config-store.test.ts
git commit -m "refactor(ai-store): make ai-config-store config-only; move aiPlayer/gameActive to components"
```

---

### Task 8: Delete `useGameAI` + clean up the hooks barrel

`useGameAI` is now fully subsumed by the store (Tasks 4–6 use `setProvider`/`setModel`; Task 7 made the store config-only). No component imports it.

**Files:**

- Delete: `apps/web/src/hooks/useGameAI.ts`, `apps/web/src/hooks/useGameAI.test.ts`
- Modify: `apps/web/src/hooks/index.ts`

- [ ] **Step 1: Remove the `useGameAI` export from the barrel**

Replace the contents of `apps/web/src/hooks/index.ts` with:

```ts
export {
  usePlayHistory,
  type UsePlayHistoryOptions,
  type UsePlayHistoryReturn,
} from './usePlayHistory';
export { usePuzzle, readLocalPuzzleProgress } from './usePuzzle';
```

- [ ] **Step 2: Delete the hook and its test**

```bash
git rm apps/web/src/hooks/useGameAI.ts apps/web/src/hooks/useGameAI.test.ts
```

- [ ] **Step 3: Verify nothing references `useGameAI`**

Run: `cd apps/web && rg --no-heading -n "useGameAI" src || echo "no references"`
Expected: `no references`.

- [ ] **Step 4: Verify typecheck + lint + full suite**

Run: `cd apps/web && bunx tsc --noEmit && bun run lint && bun test`
Expected: no errors; PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/hooks/index.ts
git commit -m "chore(hooks): delete subsumed useGameAI hook"
```

---

## Final Verification

- [ ] **Full unit suite:** `cd apps/web && bun test` — all green.
- [ ] **Typecheck + lint:** `cd apps/web && bunx tsc --noEmit && bun run lint` — clean.
- [ ] **E2E (mocked AI):** `cd apps/web && bun run test:e2e -- chess-ai xiangqi-ai shogi-ai critical-user-journeys rating-system` — all green. The `__PROCYON_DEBUG_<VARIANT>_SAVE_COUNT__` counters still increment (now via the hook's `debugVariantKey`).
- [ ] **Manual smoke:** start `bun run web:dev` + `bun run api:dev`, play an AI game in each variant to checkmate, confirm a play-history record is created; switch provider in each variant's AI Settings and confirm the key loads.

## Out of Scope (tracked elsewhere)

- Engine/board-layer bugs (chess shallow `copyBoard`, duplicate `algebraicToPosition`, `border-xiangqi`) — HPA-154 (Tier 2) / HPA-155 (Tier 4).
- React lifecycle/layout extraction (`useGameLifecycle`, `GameLayout`, `BoardGrid`) — HPA-155 (Tier 4).
- AI adapter / rule-guardian dedup — HPA-156 (Tier 3).
