# Tier 4 — Shared Hooks & Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Converge all four game pages onto one Chess-derived play shell (`GamePlayLayout` + `BoardColumn` + `BoardSidePanel`), shared lifecycle hooks, `SidebarAIConfig` on every game route, correct capture accents, and delete `AISettingsDialog` / `GameScaffold` / `GameModeToggle`.

**Architecture:** Extract lifecycle primitives first (`useAiMoveGenerationToken`, `useGameIdentityReset`, `useGameDebugOutcomes`), then layout chrome (`GamePlayLayout`, `BoardColumn`, `board-accents`). Adopt on Chess with behavior-neutral refactors while keeping existing Chess tests green. Migrate Xiangqi → Shogi → Jungle onto the shell (Shogi uses `sideBySideFrom="xl"`). Flip AppShell to `isGamePage` for the AI rail only after non-chess games no longer mount the dialog. Rewrite dialog-coupled E2E in the same cutover as each game.

**Tech Stack:** TypeScript (strict), React 18, Astro SSR islands, Tailwind CSS, Bun test runner, `@testing-library/react` + `renderHook`, Playwright E2E.

**Spec:** `docs/superpowers/2026-07-14-tier4-shared-hooks-layout-design.md`

## Global Constraints

- Runtime/package manager: **Bun** (never npm/yarn/pnpm).
- No new third-party dependencies.
- TypeScript strict; no `any` in new code (narrow casts for variant status unions OK).
- Do **not** extract AI turn bodies / adapters / rule-guardian (Tier 3) or engine primitives (Tier 2).
- Never ship a non-chess game with **both** `AISettingsDialog` and `SidebarAIConfig` for provider/model.
- Gen-token `invalidate()` on **identity reset, mode switch, and manual New Game/reset** — never drop these when refactoring.
- Draw debug outcomes: `setOutcome({ status })` only — **omit** `currentPlayer`.
- AI-side select: always visible in AI mode panel; **`disabled` while game active**; id `{variant}-ai-side`.
- Shogi: `sideBySideFrom="xl"`; pass 1024px and 1280px layout tests (no horizontal overflow).
- Preserve Chess component tests for identity-reset / stale AI; add equivalent coverage for other variants.
- All commits use conventional-commit prefixes (`feat:`, `refactor:`, `test:`, `chore:`, `fix:`).
- Prefer barrel imports from `hooks/index.ts` when touching game components.

## File Structure

**Created:**

| Path                                                   | Responsibility                                                              |
| ------------------------------------------------------ | --------------------------------------------------------------------------- |
| `apps/web/src/hooks/useAiMoveGenerationToken.ts`       | Gen ref + `invalidate` + `isStale`                                          |
| `apps/web/src/hooks/useAiMoveGenerationToken.test.ts`  | Unit tests                                                                  |
| `apps/web/src/hooks/useGameIdentityReset.ts`           | Auth loss / identity-change → `onReset` (+ optional `invalidate`)           |
| `apps/web/src/hooks/useGameIdentityReset.test.ts`      | Unit tests                                                                  |
| `apps/web/src/hooks/useGameDebugOutcomes.ts`           | Win/loss/draw + Shift+D + `__…_TRIGGER_WIN__`                               |
| `apps/web/src/hooks/useGameDebugOutcomes.test.ts`      | Unit tests                                                                  |
| `apps/web/src/lib/board-accents.ts`                    | `CAPTURE_RING` + `CAPTURE_SWATCH` maps                                      |
| `apps/web/src/lib/board-accents.test.ts`               | Exhaustive key tests                                                        |
| `apps/web/src/components/game/GamePlayLayout.tsx`      | Island title + banner + two-column row                                      |
| `apps/web/src/components/game/BoardColumn.tsx`         | Board stack chrome                                                          |
| `apps/web/src/components/game/DebugOutcomeButtons.tsx` | DEV-only win/loss/draw buttons (Shift+D toggled via `useGameDebugOutcomes`) |

**Modified:**

| Path                                                            | Change                                       |
| --------------------------------------------------------------- | -------------------------------------------- |
| `apps/web/src/hooks/index.ts`                                   | Export new hooks + `useAIConfigHydration`    |
| `apps/web/src/components/{Chess,Xiangqi,Shogi,Jungle}Game.tsx`  | Hooks + shell + AI-side select               |
| `apps/web/src/components/{Chess,Xiangqi,Shogi,Jungle}Board.tsx` | Capture rings from `CAPTURE_RING`            |
| `apps/web/src/components/game/AIGameInstructions.tsx`           | `variant` → capture swatch                   |
| `apps/web/src/components/AppShell.tsx`                          | `isGamePage` for SidebarAIConfig surfaces    |
| `apps/web/src/pages/jungle.astro`                               | Use `GamePageLayout`                         |
| `apps/web/e2e/xiangqi-ai.spec.ts`                               | BoardSidePanel + SidebarAIConfig (no dialog) |
| `apps/web/e2e/shogi-ai.spec.ts`                                 | Same + 1024/1280 layout                      |
| `apps/web/e2e/critical-user-journeys.spec.ts`                   | Provider via rail                            |
| `apps/web/src/components/ChessGame.test.tsx`                    | Stay green through refactor                  |
| New/extended `*Game` tests                                      | Identity + mode-switch + new-game stale AI   |

**Deleted (after zero importers):**

- `apps/web/src/components/ai/AISettingsDialog.tsx`
- `apps/web/src/components/game/GameScaffold.tsx`
- `apps/web/src/components/game/GameModeToggle.tsx`

**Unchanged layer:**

- `apps/web/src/components/GamePageLayout.tsx` — page accent wrapper

---

### Task 1: `useAiMoveGenerationToken`

**Files:**

- Create: `apps/web/src/hooks/useAiMoveGenerationToken.ts`
- Test: `apps/web/src/hooks/useAiMoveGenerationToken.test.ts`

**Interfaces:**

- Produces:

```ts
export function useAiMoveGenerationToken(): {
  genRef: React.MutableRefObject<number>;
  invalidate(): void;
  isStale(requestId: number | undefined): boolean;
};
```

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/hooks/useAiMoveGenerationToken.test.ts`:

```ts
import { test, expect, describe } from 'bun:test';
import { renderHook, act } from '@testing-library/react';
import { setupReactDom } from '../test/reactSetup';
import { useAiMoveGenerationToken } from './useAiMoveGenerationToken';

setupReactDom();

describe('useAiMoveGenerationToken', () => {
  test('starts at generation 0', () => {
    const { result } = renderHook(() => useAiMoveGenerationToken());
    expect(result.current.genRef.current).toBe(0);
  });

  test('invalidate bumps generation', () => {
    const { result } = renderHook(() => useAiMoveGenerationToken());
    act(() => {
      result.current.invalidate();
    });
    expect(result.current.genRef.current).toBe(1);
    act(() => {
      result.current.invalidate();
    });
    expect(result.current.genRef.current).toBe(2);
  });

  test('isStale is false when requestId is undefined', () => {
    const { result } = renderHook(() => useAiMoveGenerationToken());
    act(() => {
      result.current.invalidate();
    });
    expect(result.current.isStale(undefined)).toBe(false);
  });

  test('isStale is false when requestId matches current gen', () => {
    const { result } = renderHook(() => useAiMoveGenerationToken());
    act(() => {
      result.current.invalidate();
    });
    const gen = result.current.genRef.current;
    expect(result.current.isStale(gen)).toBe(false);
  });

  test('isStale is true when requestId is set and mismatched', () => {
    const { result } = renderHook(() => useAiMoveGenerationToken());
    const old = result.current.genRef.current;
    act(() => {
      result.current.invalidate();
    });
    expect(result.current.isStale(old)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && bun test src/hooks/useAiMoveGenerationToken.test.ts`  
Expected: FAIL — module not found / export missing.

- [ ] **Step 3: Implement the hook**

Create `apps/web/src/hooks/useAiMoveGenerationToken.ts`:

```ts
import { useCallback, useRef } from 'react';

export function useAiMoveGenerationToken(): {
  genRef: React.MutableRefObject<number>;
  invalidate(): void;
  isStale(requestId: number | undefined): boolean;
} {
  const genRef = useRef(0);

  const invalidate = useCallback(() => {
    genRef.current += 1;
  }, []);

  const isStale = useCallback((requestId: number | undefined): boolean => {
    return requestId !== undefined && requestId !== genRef.current;
  }, []);

  return { genRef, invalidate, isStale };
}
```

- [ ] **Step 4: Run tests — expect PASS**

Run: `cd apps/web && bun test src/hooks/useAiMoveGenerationToken.test.ts`

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/hooks/useAiMoveGenerationToken.ts apps/web/src/hooks/useAiMoveGenerationToken.test.ts
git commit -m "feat(web, hooks): add useAiMoveGenerationToken for AI request generations"
```

---

### Task 2: `useGameIdentityReset`

**Files:**

- Create: `apps/web/src/hooks/useGameIdentityReset.ts`
- Test: `apps/web/src/hooks/useGameIdentityReset.test.ts`

**Interfaces:**

- Consumes: nothing from Task 1 (callers pass `invalidate` optionally)
- Produces:

```ts
export function useGameIdentityReset(options: {
  isAuthenticated: boolean;
  userId: string | null | undefined;
  onReset: () => void;
  /** Called immediately before onReset when auth is lost or identity changes */
  invalidate?: () => void;
}): void;
```

- [ ] **Step 1: Write the failing test**

```ts
import { test, expect, describe, mock } from 'bun:test';
import { renderHook } from '@testing-library/react';
import { setupReactDom } from '../test/reactSetup';
import { useGameIdentityReset } from './useGameIdentityReset';

setupReactDom();

describe('useGameIdentityReset', () => {
  test('does not fire on mount', () => {
    const onReset = mock(() => {});
    renderHook(() =>
      useGameIdentityReset({
        isAuthenticated: true,
        userId: 'a',
        onReset,
      })
    );
    expect(onReset).not.toHaveBeenCalled();
  });

  test('does not fire on first login from anonymous', () => {
    const onReset = mock(() => {});
    const { rerender } = renderHook(
      (props: {
        isAuthenticated: boolean;
        userId: string | null | undefined;
      }) => useGameIdentityReset({ ...props, onReset }),
      { initialProps: { isAuthenticated: false, userId: undefined } }
    );
    rerender({ isAuthenticated: true, userId: 'a' });
    expect(onReset).not.toHaveBeenCalled();
  });

  test('fires on logout (true → false)', () => {
    const onReset = mock(() => {});
    const invalidate = mock(() => {});
    const { rerender } = renderHook(
      (props: {
        isAuthenticated: boolean;
        userId: string | null | undefined;
      }) => useGameIdentityReset({ ...props, onReset, invalidate }),
      { initialProps: { isAuthenticated: true, userId: 'a' } }
    );
    rerender({ isAuthenticated: false, userId: undefined });
    expect(invalidate).toHaveBeenCalledTimes(1);
    expect(onReset).toHaveBeenCalledTimes(1);
  });

  test('fires on identity change while authenticated', () => {
    const onReset = mock(() => {});
    const invalidate = mock(() => {});
    const { rerender } = renderHook(
      (props: {
        isAuthenticated: boolean;
        userId: string | null | undefined;
      }) => useGameIdentityReset({ ...props, onReset, invalidate }),
      { initialProps: { isAuthenticated: true, userId: 'a' } }
    );
    rerender({ isAuthenticated: true, userId: 'b' });
    expect(invalidate).toHaveBeenCalledTimes(1);
    expect(onReset).toHaveBeenCalledTimes(1);
  });

  test('does not fire when userId goes null→value while already authenticated without prior id', () => {
    // previous userId null + authenticated: treat as first known id, not switch
    const onReset = mock(() => {});
    const { rerender } = renderHook(
      (props: {
        isAuthenticated: boolean;
        userId: string | null | undefined;
      }) => useGameIdentityReset({ ...props, onReset }),
      { initialProps: { isAuthenticated: true, userId: null } }
    );
    rerender({ isAuthenticated: true, userId: 'a' });
    expect(onReset).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

Run: `cd apps/web && bun test src/hooks/useGameIdentityReset.test.ts`

- [ ] **Step 3: Implement**

```ts
import { useEffect, useRef } from 'react';

export function useGameIdentityReset(options: {
  isAuthenticated: boolean;
  userId: string | null | undefined;
  onReset: () => void;
  invalidate?: () => void;
}): void {
  const { isAuthenticated, userId, onReset, invalidate } = options;
  const prevAuthenticatedRef = useRef(isAuthenticated);
  const prevUserIdRef = useRef<string | null | undefined>(userId);
  // Keep latest callbacks without re-subscribing logic via identity of onReset
  const onResetRef = useRef(onReset);
  const invalidateRef = useRef(invalidate);
  onResetRef.current = onReset;
  invalidateRef.current = invalidate;

  useEffect(() => {
    const currentUserId = userId;
    const authLost = prevAuthenticatedRef.current && !isAuthenticated;
    const identityChanged =
      isAuthenticated &&
      prevUserIdRef.current != null &&
      prevUserIdRef.current !== currentUserId;
    if (authLost || identityChanged) {
      invalidateRef.current?.();
      onResetRef.current();
    }
    prevAuthenticatedRef.current = isAuthenticated;
    prevUserIdRef.current = currentUserId;
  }, [isAuthenticated, userId]);
}
```

**Note:** Call `invalidate` **before** `onReset` so the game’s `onReset` may also call `invalidate` without harm (double-bump is fine) or can omit it when the hook owns the bump. Spec requires `onReset` still clear UI; games may call `invalidate` inside `onReset` for symmetry with mode/reset paths.

- [ ] **Step 4: Run — expect PASS**

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/hooks/useGameIdentityReset.ts apps/web/src/hooks/useGameIdentityReset.test.ts
git commit -m "feat(web, hooks): add useGameIdentityReset for logout and account switch"
```

---

### Task 3: `useGameDebugOutcomes`

**Files:**

- Create: `apps/web/src/hooks/useGameDebugOutcomes.ts`
- Test: `apps/web/src/hooks/useGameDebugOutcomes.test.ts`

**Interfaces:**

- Produces: see spec §4.3 (`setOutcome` with optional `currentPlayer`; Shift+D; `__PROCYON_DEBUG_<KEY>_TRIGGER_WIN__`)

- [ ] **Step 1: Write the failing test**

```ts
import { test, expect, describe, mock, beforeEach, afterEach } from 'bun:test';
import { renderHook, act } from '@testing-library/react';
import { setupReactDom } from '../test/reactSetup';
import { useGameDebugOutcomes } from './useGameDebugOutcomes';

setupReactDom();

describe('useGameDebugOutcomes', () => {
  const winStatus = 'checkmate';
  const drawStatus = 'stalemate';

  beforeEach(() => {
    // @ts-expect-error test env
    import.meta.env.DEV = true;
  });

  test('triggerDebugWin calls setOutcome with winStatus and aiPlayer', () => {
    const setOutcome = mock(
      (_p: { status: string; currentPlayer?: string }) => {}
    );
    const { result } = renderHook(() =>
      useGameDebugOutcomes({
        aiPlayer: 'black',
        getHumanPlayer: ai => (ai === 'black' ? 'white' : 'black'),
        setOutcome,
        debugVariantKey: 'CHESS',
        winStatus,
        drawStatus,
      })
    );
    act(() => {
      result.current.triggerDebugWin();
    });
    expect(setOutcome).toHaveBeenCalledWith({
      status: 'checkmate',
      currentPlayer: 'black',
    });
  });

  test('triggerDebugLoss uses human as currentPlayer', () => {
    const setOutcome = mock(
      (_p: { status: string; currentPlayer?: string }) => {}
    );
    const { result } = renderHook(() =>
      useGameDebugOutcomes({
        aiPlayer: 'black',
        getHumanPlayer: ai => (ai === 'black' ? 'white' : 'black'),
        setOutcome,
        debugVariantKey: 'CHESS',
        winStatus,
        drawStatus,
      })
    );
    act(() => {
      result.current.triggerDebugLoss();
    });
    expect(setOutcome).toHaveBeenCalledWith({
      status: 'checkmate',
      currentPlayer: 'white',
    });
  });

  test('triggerDebugDraw omits currentPlayer', () => {
    const setOutcome = mock(
      (_p: { status: string; currentPlayer?: string }) => {}
    );
    const { result } = renderHook(() =>
      useGameDebugOutcomes({
        aiPlayer: 'black',
        getHumanPlayer: ai => (ai === 'black' ? 'white' : 'black'),
        setOutcome,
        debugVariantKey: 'CHESS',
        winStatus,
        drawStatus,
      })
    );
    act(() => {
      result.current.triggerDebugDraw();
    });
    expect(setOutcome).toHaveBeenCalledTimes(1);
    const arg = setOutcome.mock.calls[0][0];
    expect(arg.status).toBe('stalemate');
    expect('currentPlayer' in arg).toBe(false);
  });

  test('registers __PROCYON_DEBUG_<KEY>_TRIGGER_WIN__ and runs prepare then win', () => {
    const setOutcome = mock(() => {});
    const onPrepareTriggerWin = mock(() => {});
    renderHook(() =>
      useGameDebugOutcomes({
        aiPlayer: 'black',
        getHumanPlayer: ai => (ai === 'black' ? 'white' : 'black'),
        setOutcome,
        debugVariantKey: 'CHESS',
        winStatus,
        drawStatus,
        onPrepareTriggerWin,
      })
    );
    const g = window as unknown as {
      __PROCYON_DEBUG_CHESS_TRIGGER_WIN__?: () => void;
    };
    expect(typeof g.__PROCYON_DEBUG_CHESS_TRIGGER_WIN__).toBe('function');
    act(() => {
      g.__PROCYON_DEBUG_CHESS_TRIGGER_WIN__!();
    });
    expect(onPrepareTriggerWin).toHaveBeenCalled();
    expect(setOutcome).toHaveBeenCalled();
  });

  test('Shift+D toggles showDebugWinButton in DEV', () => {
    const { result } = renderHook(() =>
      useGameDebugOutcomes({
        aiPlayer: 'black',
        getHumanPlayer: ai => (ai === 'black' ? 'white' : 'black'),
        setOutcome: () => {},
        debugVariantKey: 'CHESS',
        winStatus,
        drawStatus,
      })
    );
    expect(result.current.showDebugWinButton).toBe(false);
    act(() => {
      window.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'd', shiftKey: true })
      );
    });
    expect(result.current.showDebugWinButton).toBe(true);
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Implement**

> **Implementation drift note:** The shipped version adds an optional
> `invalidate?: () => void` option and stashes `setOutcome`,
> `onPrepareTriggerWin`, and `invalidate` in refs so the trigger callbacks
> and DEV-global registration effect stay stable (effect re-runs only when
> `debugVariantKey` changes, not on every caller re-render). Each trigger
> calls `invalidateRef.current?.()` before `setOutcome` to bail any in-flight
> `makeAIMove` callback whose `setGameState` would overwrite the debug
> outcome. The code below reflects the shipped implementation.

```ts
import { useCallback, useEffect, useRef, useState } from 'react';

export function useGameDebugOutcomes<TPlayer extends string>(options: {
  aiPlayer: TPlayer;
  getHumanPlayer: (ai: TPlayer) => TPlayer;
  setOutcome: (patch: { status: string; currentPlayer?: TPlayer }) => void;
  debugVariantKey: string;
  winStatus: string;
  drawStatus: string;
  onPrepareTriggerWin?: () => void;
  /** Invalidate the AI move-generation token so any in-flight makeAIMove
   * callback bails before its setGameState overwrites the debug outcome.
   * Optional only so non-AI test harnesses can omit it. */
  invalidate?: () => void;
}): {
  triggerDebugWin: () => void;
  triggerDebugLoss: () => void;
  triggerDebugDraw: () => void;
  showDebugWinButton: boolean;
  setShowDebugWinButton: (v: boolean) => void;
} {
  const {
    aiPlayer,
    getHumanPlayer,
    setOutcome,
    debugVariantKey,
    winStatus,
    drawStatus,
    onPrepareTriggerWin,
    invalidate,
  } = options;

  const [showDebugWinButton, setShowDebugWinButton] = useState(false);

  // Callers pass inline `setOutcome` / `onPrepareTriggerWin` closures that
  // change identity every render. Stash them in refs so the trigger
  // callbacks (and the DEV global registration effect) stay stable and the
  // effect re-runs only when `debugVariantKey` actually changes.
  const setOutcomeRef = useRef(setOutcome);
  setOutcomeRef.current = setOutcome;
  const onPrepareRef = useRef(onPrepareTriggerWin);
  onPrepareRef.current = onPrepareTriggerWin;
  const invalidateRef = useRef(invalidate);
  invalidateRef.current = invalidate;

  const triggerDebugWin = useCallback(() => {
    invalidateRef.current?.();
    setOutcomeRef.current({ status: winStatus, currentPlayer: aiPlayer });
  }, [winStatus, aiPlayer]);

  const triggerDebugLoss = useCallback(() => {
    invalidateRef.current?.();
    setOutcomeRef.current({
      status: winStatus,
      currentPlayer: getHumanPlayer(aiPlayer),
    });
  }, [winStatus, getHumanPlayer, aiPlayer]);

  const triggerDebugDraw = useCallback(() => {
    // Status only — do not include currentPlayer key
    invalidateRef.current?.();
    setOutcomeRef.current({ status: drawStatus });
  }, [drawStatus]);

  // Latest "trigger win" sequence (prepare + show + win) via ref so the
  // global registration effect below can depend only on `debugVariantKey`.
  const triggerWinSequenceRef = useRef<() => void>(() => {});
  triggerWinSequenceRef.current = () => {
    onPrepareRef.current?.();
    setShowDebugWinButton(true);
    triggerDebugWin();
  };

  // DEV global win trigger
  useEffect(() => {
    if (!import.meta.env.DEV || typeof window === 'undefined') return;
    const key = `__PROCYON_DEBUG_${debugVariantKey}_TRIGGER_WIN__` as const;
    const global = window as unknown as Record<
      string,
      (() => void) | undefined
    >;
    global[key] = () => triggerWinSequenceRef.current();
    return () => {
      delete global[key];
    };
  }, [debugVariantKey]);

  // Shift+D
  useEffect(() => {
    if (!import.meta.env.DEV || typeof window === 'undefined') return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.shiftKey && e.key.toLowerCase() === 'd') {
        setShowDebugWinButton(prev => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return {
    triggerDebugWin,
    triggerDebugLoss,
    triggerDebugDraw,
    showDebugWinButton,
    setShowDebugWinButton,
  };
}
```

- [ ] **Step 4: Run — expect PASS** (adjust KeyboardEvent construction if happy-dom needs `window.KeyboardEvent`)

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/hooks/useGameDebugOutcomes.ts apps/web/src/hooks/useGameDebugOutcomes.test.ts
git commit -m "feat(web, hooks): add useGameDebugOutcomes with Shift+D and draw-safe setOutcome"
```

---

### Task 4: Board accents + `AIGameInstructions`

**Files:**

- Create: `apps/web/src/lib/board-accents.ts`
- Test: `apps/web/src/lib/board-accents.test.ts`
- Modify: `apps/web/src/components/game/AIGameInstructions.tsx`
- Modify: `apps/web/src/components/{Chess,Xiangqi,Shogi,Jungle}Board.tsx` (capture ring class only)

**Interfaces:**

```ts
import type { GameVariant } from './ai/game-variant-types';
export const CAPTURE_RING: Record<GameVariant, string>;
export const CAPTURE_SWATCH: Record<GameVariant, string>;
```

- [ ] **Step 1: Failing test for maps**

```ts
import { test, expect } from 'bun:test';
import { CAPTURE_RING, CAPTURE_SWATCH } from './board-accents';

test('CAPTURE_RING has all variants with expected border tokens', () => {
  expect(CAPTURE_RING.chess).toContain('border-chess');
  expect(CAPTURE_RING.xiangqi).toContain('border-xiangqi');
  expect(CAPTURE_RING.shogi).toContain('border-shogi');
  expect(CAPTURE_RING.jungle).toContain('border-jungle');
});

test('CAPTURE_SWATCH has all variants', () => {
  expect(CAPTURE_SWATCH.chess).toContain('border-chess');
  expect(CAPTURE_SWATCH.shogi).toContain('border-shogi');
});
```

- [ ] **Step 2: Implement `board-accents.ts`**

```ts
import type { GameVariant } from './ai/game-variant-types';

export const CAPTURE_RING: Record<GameVariant, string> = {
  chess: 'absolute inset-0 border-4 border-chess rounded pointer-events-none',
  xiangqi:
    'absolute inset-0 border-4 border-xiangqi rounded pointer-events-none',
  shogi: 'absolute inset-0 border-2 border-shogi rounded pointer-events-none',
  jungle: 'absolute inset-0 border-2 border-jungle rounded pointer-events-none',
};

export const CAPTURE_SWATCH: Record<GameVariant, string> = {
  chess: 'border-2 border-chess rounded',
  xiangqi: 'border-2 border-xiangqi rounded',
  shogi: 'border-2 border-shogi rounded',
  jungle: 'border-2 border-jungle rounded',
};
```

- [ ] **Step 3: Wire boards**

In each board’s capture-indicator div, replace hardcoded `border-xiangqi` classes with `CAPTURE_RING.<variant>` (import from `../lib/board-accents`). Leave Xiangqi board lines that are part of the xiangqi board geometry as `border-xiangqi` where they are correct (palace lines etc.); only the **capture ring** overlay uses the map (Xiangqi stays `CAPTURE_RING.xiangqi`).

- [ ] **Step 4: Update `AIGameInstructions`**

Add prop `variant: GameVariant` (required). Use `CAPTURE_SWATCH[variant]` for the captures legend span instead of `border-xiangqi`. Update all call sites to pass the page variant (`chess` / `xiangqi` / `shogi` / `jungle`).

- [ ] **Step 5: Run unit tests**

```bash
cd apps/web && bun test src/lib/board-accents.test.ts
```

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/lib/board-accents.ts apps/web/src/lib/board-accents.test.ts \
  apps/web/src/components/game/AIGameInstructions.tsx \
  apps/web/src/components/ChessBoard.tsx apps/web/src/components/XiangqiBoard.tsx \
  apps/web/src/components/ShogiBoard.tsx apps/web/src/components/JungleBoard.tsx
git commit -m "feat(web): variant capture accents for boards and AI instructions legend"
```

---

### Task 5: `GamePlayLayout` + `BoardColumn` + hooks barrel

**Files:**

- Create: `apps/web/src/components/game/GamePlayLayout.tsx`
- Create: `apps/web/src/components/game/BoardColumn.tsx`
- Modify: `apps/web/src/hooks/index.ts`

**Interfaces:**

```ts
// GamePlayLayout
type GamePlayLayoutProps = {
  title: string;
  subtitle?: string;
  boardColumn: React.ReactNode;
  sidePanel: React.ReactNode;
  banner?: React.ReactNode;
  className?: string;
  sideBySideFrom?: 'lg' | 'xl'; // default 'lg'
};

// BoardColumn
type BoardColumnProps = {
  board: React.ReactNode;
  controls?: React.ReactNode;
  debugTools?: React.ReactNode;
  belowBoard?: React.ReactNode;
  aboveControls?: React.ReactNode;
};
```

- [ ] **Step 1: Implement `GamePlayLayout`**

Match Chess island root classes (`mx-auto w-full max-w-7xl px-4 py-6`), centered title (`font-display text-4xl…`), optional subtitle, banner slot, then:

```tsx
const rowBp = sideBySideFrom === 'xl' ? 'xl:flex-row' : 'lg:flex-row';
// ...
<div
  className={`flex flex-col gap-6 ${rowBp} xl:items-start lg:items-start lg:justify-center`}
>
  {boardColumn}
  {sidePanel}
</div>;
```

Use exact Chess alignment classes from current `ChessGame.tsx` return (`lg:flex-row lg:items-start lg:justify-center`) when `sideBySideFrom === 'lg'`. For `xl`, substitute `xl:flex-row` and keep column stack below that breakpoint.

- [ ] **Step 2: Implement `BoardColumn`**

```tsx
export default function BoardColumn({
  board,
  aboveControls,
  controls,
  debugTools,
  belowBoard,
}: BoardColumnProps) {
  return (
    <div className='flex flex-col items-center gap-6'>
      {board}
      {aboveControls}
      {controls}
      {debugTools}
      {belowBoard}
    </div>
  );
}
```

- [ ] **Step 3: Update barrel**

`apps/web/src/hooks/index.ts`:

```ts
export { usePlayHistory, type UsePlayHistoryOptions } from './usePlayHistory';
export { usePuzzle, readLocalPuzzleProgress } from './usePuzzle';
export { useAIConfigHydration } from './useAIConfigHydration';
export { useAiMoveGenerationToken } from './useAiMoveGenerationToken';
export { useGameIdentityReset } from './useGameIdentityReset';
export { useGameDebugOutcomes } from './useGameDebugOutcomes';
```

Export any option types if useful for consumers.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/game/GamePlayLayout.tsx \
  apps/web/src/components/game/BoardColumn.tsx \
  apps/web/src/hooks/index.ts
git commit -m "feat(web): add GamePlayLayout, BoardColumn, and hooks barrel exports"
```

---

### Task 6: Adopt hooks + layout on Chess (behavior-neutral)

**Files:**

- Modify: `apps/web/src/components/ChessGame.tsx`
- Verify: `apps/web/src/components/ChessGame.test.tsx` (must stay green)

**Interfaces:**

- Consumes: all hooks + `GamePlayLayout` + `BoardColumn` + `CAPTURE_*` already done

- [ ] **Step 1: Wire hooks**

Replace:

- `aiMoveGenRef` → `const { genRef, invalidate, isStale } = useAiMoveGenerationToken()`
- Identity effect → `useGameIdentityReset({ isAuthenticated, userId: user?.id, invalidate, onReset: () => { resetGame(); setAIPlayer('black'); } })`  
  Ensure `onReset` still clears everything `resetGame` already does; avoid double-reset bugs.
- Debug win/loss/draw + Shift+D + `__PROCYON_DEBUG_CHESS_TRIGGER_WIN__` → `useGameDebugOutcomes` with:

```ts
setOutcome: patch =>
  setGameState(prev => ({
    ...prev,
    status: patch.status as GameState['status'],
    ...(patch.currentPlayer !== undefined
      ? { currentPlayer: patch.currentPlayer }
      : {}),
  })),
debugVariantKey: 'CHESS',
winStatus: 'checkmate',
drawStatus: 'stalemate',
onPrepareTriggerWin: () => {
  setGameMode('ai');
  setGameStarted(true);
  setHasGameEnded(false);
  setShowDebugWinButton(true); // hook also sets true; redundant OK
},
```

Remove local `showDebugWinButton` state if the hook owns it; use returned value for DEV buttons.

- [ ] **Step 2: Replace JSX shell with `GamePlayLayout` + `BoardColumn`**

Keep AI-side select (`id="chess-ai-side"`, `disabled={gameActive}`), `AIStatusPanel`, instructions with `variant="chess"`.

- [ ] **Step 3: Keep invalidation on mode toggle and reset**

`toggleToMode` and `resetGame` / start-or-reset must call `invalidate()`.

- [ ] **Step 4: Run Chess unit tests**

```bash
cd apps/web && bun test src/components/ChessGame.test.tsx
```

Expected: PASS (identity-change select re-enable; stale AI guards).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/ChessGame.tsx
git commit -m "refactor(web, chess): adopt shared lifecycle hooks and GamePlayLayout"
```

---

### Task 7: Migrate Xiangqi + rewrite E2E

**Files:**

- Modify: `apps/web/src/components/XiangqiGame.tsx`
- Modify: `apps/web/e2e/xiangqi-ai.spec.ts`
- Optional: add `XiangqiGame` identity/mode/reset tests if no existing component suite

- [ ] **Step 1: Remove `GameScaffold` + `AISettingsDialog`**

Wire `GamePlayLayout` (`sideBySideFrom` default `lg`), `BoardColumn`, `BoardSidePanel`.

AI panel content:

```tsx
<label htmlFor="xiangqi-ai-side">…</label>
<select
  id="xiangqi-ai-side"
  value={aiPlayer}
  disabled={/* game started and not over — use same flag as locking today */}
  ...
>
  <option value="black">AI plays Black (黑方)</option>
  <option value="red">AI plays Red (红方)</option>
</select>
```

Use a boolean equivalent to Chess `gameActive` (if Xiangqi only has `gameStarted`, disable when `hasGameStarted && !isGameOver`).

- [ ] **Step 2: Adopt shared hooks** (same pattern as Chess; default AI side `'black'`; `debugVariantKey: 'XIANGQI'`)

Keep `__PROCYON_DEBUG_XIANGQI_STATE__` local.

- [ ] **Step 3: Rewrite `xiangqi-ai.spec.ts`**

Replace every `⚙️ AI Settings` assertion/click with:

- Mode: `getByRole('button', { name: /^Tutorial$/ })` / `Play vs AI` (BoardSidePanel labels)
- Settings empty state / provider: desktop `aside` `SidebarAIConfig` selectors (mirror chess-ai / critical journeys rail patterns)

- [ ] **Step 4: Run unit + xiangqi e2e**

```bash
cd apps/web && bun test src/hooks
cd apps/web && bun run test:e2e -- xiangqi-ai
```

- [ ] **Step 5: Commit**

```bash
git commit -m "refactor(web, xiangqi): GamePlayLayout shell and drop AISettingsDialog"
```

---

### Task 8: Migrate Shogi + layout E2E

**Files:**

- Modify: `apps/web/src/components/ShogiGame.tsx`
- Modify: `apps/web/e2e/shogi-ai.spec.ts`

- [ ] **Step 1: Shell with `sideBySideFrom="xl"`**

Custom board column: hands + board layout usable at 1024px. Recommended approach:

- At default (narrow): stack `gote hand → board → sente hand` vertically centered
- Or use a responsive flex that wraps

Do **not** put side panel inside the hands row.

- [ ] **Step 2: AI-side select** `id="shogi-ai-side"`, options Sente/Gote, disabled while active.

- [ ] **Step 3: Hooks** — `debugVariantKey: 'SHOGI'`; keep promotion global + STATE local; replace inline capture legend swatch with `CAPTURE_SWATCH.shogi`.

- [ ] **Step 4: Rewrite `shogi-ai.spec.ts`** (no dialog) + add layout tests:

```ts
test('shogi layout has no horizontal overflow at 1024', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 800 });
  await page.goto('/shogi');
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth <= window.innerWidth + 1
  );
  expect(overflow).toBe(true);
  await expect(page.getByRole('button', { name: /^Tutorial$/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Play vs AI/i })).toBeVisible();
});

test('shogi layout at 1280 keeps board and mode controls', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/shogi');
  // same overflow check + mode toggles visible
});
```

- [ ] **Step 5: Run e2e shogi-ai**

- [ ] **Step 6: Commit**

```bash
git commit -m "refactor(web, shogi): GamePlayLayout with xl side-by-side and layout e2e"
```

---

### Task 9: Migrate Jungle + `jungle.astro`

**Files:**

- Modify: `apps/web/src/components/JungleGame.tsx`
- Modify: `apps/web/src/pages/jungle.astro`

- [ ] **Step 1: `jungle.astro`**

```astro
---
import Layout from '../layouts/Layout.astro';
import GamePageLayout from '../components/GamePageLayout.tsx';
import JungleGame from '../components/JungleGame';
---

<Layout title='Jungle Chess (鬥獸棋) - Procyon'>
  <GamePageLayout variant='jungle' client:load>
    <JungleGame client:load />
  </GamePageLayout>
</Layout>
```

Remove inlined accent/max-w markup.

- [ ] **Step 2: JungleGame** — same shell as Xiangqi (`sideBySideFrom` default); AI side `id="jungle-ai-side"` (red/blue); hooks with `debugVariantKey: 'JUNGLE'`.

- [ ] **Step 3: Commit**

```bash
git commit -m "refactor(web, jungle): GamePlayLayout and GamePageLayout on jungle page"
```

---

### Task 10: AppShell rail for all game pages + delete dead UI

**Files:**

- Modify: `apps/web/src/components/AppShell.tsx`
- Delete: `AISettingsDialog.tsx`, `GameScaffold.tsx`, `GameModeToggle.tsx`
- Modify: comments in `SidebarAIConfig.tsx`, `lib/ai/storage.ts`
- Modify: `apps/web/e2e/critical-user-journeys.spec.ts`

**Preconditions:** Tasks 7–9 done — no game imports the dialog.

- [ ] **Step 1: AppShell**

Replace `isChessPage(path)` for SidebarAIConfig / mobile AI toggle / mobile panel with `isGamePage(path)`. Remove `isChessPage` if unused. Update comments.

- [ ] **Step 2: Rewrite critical-user-journeys AI Settings steps**

Provider select via rail `SidebarAIConfig` on the game page under test (chess may already work; fix any xiangqi/shogi paths that open the dialog).

- [ ] **Step 3: Delete dead files** after confirming zero importers:

```bash
rg -n "AISettingsDialog|GameScaffold|GameModeToggle" apps/web --glob '*.{ts,tsx}'
# should only show the files themselves if any
rm apps/web/src/components/ai/AISettingsDialog.tsx \
   apps/web/src/components/game/GameScaffold.tsx \
   apps/web/src/components/game/GameModeToggle.tsx
```

- [ ] **Step 4: Commit**

```bash
git commit -m "feat(web): SidebarAIConfig on all game pages; remove AISettingsDialog shell"
```

---

### Task 11: Cross-variant invalidation component tests

**Files:**

- Extend or create tests under `apps/web/src/components/` (parameterized helpers preferred)
- Ensure Chess existing tests still cover identity + stale AI

- [ ] **Step 1: For each migrated game (at least Xiangqi + one more), add tests that:**

1. **Identity change** mid-game re-enables AI-side select / clears started state (pattern from `ChessGame.test.tsx`).
2. **Mode switch** after “AI thinking” generation started: capture gen, call mode toggle, assert stale callback would be `isStale` / board not updated (can simulate by invoking invalidate path and checking gen bump via debug state or by mocking AI).
3. **New Game / Reset** bumps generation the same way.

If full AI mock is heavy, a minimal approach: spy/export is not available — instead assert post-reset UI state (started false, select enabled) and that starting a new AI turn still works without throwing. Prefer following ChessGame.test patterns with `AUTH_CHANGE_EVENT`.

- [ ] **Step 2: Run**

```bash
cd apps/web && bun test src/components/
```

- [ ] **Step 3: Commit**

```bash
git commit -m "test(web): identity, mode-switch, and reset invalidation across games"
```

---

### Task 12: Final verification

- [ ] **Step 1: Unit suite**

```bash
cd apps/web && bun test src/
```

Expected: all green.

- [ ] **Step 2: Typecheck / lint**

```bash
cd apps/web && bunx tsc --noEmit && bun run lint
```

Expected: no new errors from this work.

- [ ] **Step 3: E2E**

```bash
cd apps/web && bun run test:e2e -- chess-ai xiangqi-ai shogi-ai chess-layout critical-user-journeys rating-system hasgameended-reset game-history
```

Expected: all green. Confirm no remaining locators for `⚙️ AI Settings` in e2e:

```bash
rg -n "AI Settings" apps/web/e2e
```

- [ ] **Step 4: Manual smoke checklist** (document in PR if not run):

- Each game: Start AI, rail provider change, AI-side select disables after start
- Logout / account switch resets board
- Capture ring color matches page accent
- Shogi at 1024 and 1280: no horizontal scroll

- [ ] **Step 5: Final commit if any fixes**; open PR referencing HPA-155 and the design doc.

---

## Spec coverage checklist (self-review)

| Spec requirement                                     | Task                  |
| ---------------------------------------------------- | --------------------- |
| `useAiMoveGenerationToken`                           | 1                     |
| `useGameIdentityReset` (+ optional invalidate)       | 2                     |
| `useGameDebugOutcomes` / Shift+D / draw omits player | 3                     |
| Board accents + legend / AIGameInstructions          | 4                     |
| `GamePlayLayout` / `BoardColumn` / barrel            | 5                     |
| Chess adoption; preserve Chess tests                 | 6                     |
| Xiangqi migration + E2E rewrite                      | 7                     |
| Shogi `xl` + 1024/1280 E2E                           | 8                     |
| Jungle + `GamePageLayout`                            | 9                     |
| AppShell all game pages; delete dialog/scaffold      | 10                    |
| Mode/reset/identity invalidation tests               | 11                    |
| Full verification                                    | 12                    |
| No AI turn extraction / no Tier 2–3                  | Global constraints    |
| Never dual dialog+rail                               | Tasks 7–10 sequencing |

## Placeholder scan

No TBD steps; E2E selector details may need minor adjustment to match real `SidebarAIConfig` labels — use existing chess rail tests as the source of truth when rewriting.

---

## Execution handoff

Plan complete and saved to `docs/superpowers/plans/2026-07-14-tier4-shared-hooks-layout.md`.

**Two execution options:**

1. **Subagent-Driven (recommended)** — fresh subagent per task, review between tasks
2. **Inline Execution** — execute tasks in this session with checkpoints

Which approach?
