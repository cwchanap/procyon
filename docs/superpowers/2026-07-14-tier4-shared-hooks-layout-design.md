# Tier 4 — Extract Shared React Hooks and Layout Components (Design Spec)

**Status:** Design approved in brainstorming (pending written-spec review)  
**Date:** 2026-07-14  
**Ticket:** [HPA-155](https://linear.app/cwchanap/issue/HPA-155/tier-4-extract-shared-react-hooks-and-layout-components)  
**Project:** [procyon](https://linear.app/cwchanap/project/procyon-b82f2cc99230)  
**Related:** HPA-154 (Tier 2), HPA-156 (Tier 3), Tier 1 design (`docs/superpowers/2026-07-08-tier1-hook-adoption-design.md`)

## 1. Goal

Bring all four game pages (Chess, Xiangqi, Shogi, Jungle) onto one **UI/lifecycle shell** derived from the Chess layout redesign, without merging variant rules or AI move bodies.

**End state:**

- Every game page uses `GameLayout` + board-column chrome + `BoardSidePanel`
- App shell shows `SidebarAIConfig` on **all** game routes (`/chess`, `/xiangqi`, `/shogi`, `/jungle`)
- Shared lifecycle hooks replace copy-pasted identity-reset, AI gen-token, and debug-outcome logic
- Board capture rings use the correct per-variant accent (no more wrong `border-xiangqi` on Chess/Shogi/Jungle)
- `AISettingsDialog`, `GameScaffold`, and `GameModeToggle` are deleted

**Guiding principle (same as Tier 1):** _Normalize to one behavior._ Where Chess shell and a non-chess page disagree on chrome, prefer the Chess pattern, except where a variant needs real layout extras (e.g. Shogi hands).

## 2. Background

### 2.1 What Tier 1 already delivered

- All four games use `usePlayHistory` and `useAIConfigHydration` / the AI config store
- `useGameAI` deleted
- Config hydration is app-wide from `AppShell` on any game page

### 2.2 What remains (this tier)

| Gap        | Today                                                                                                            |
| ---------- | ---------------------------------------------------------------------------------------------------------------- |
| Layout     | Chess uses two-column `BoardSidePanel` shell; Xiangqi/Shogi/Jungle still use `GameScaffold` + `AISettingsDialog` |
| Sidebar AI | `SidebarAIConfig` gated to `/chess` only in `AppShell`                                                           |
| Lifecycle  | Identity-reset, `aiMoveGenRef`, debug win/loss/draw still inlined ×4 in `*Game.tsx`                              |
| Accents    | Capture rings hardcode `border-xiangqi` on Chess/Shogi/Jungle boards                                             |

Approximate component sizes: Chess ~914, Xiangqi ~886, Shogi ~1192, Jungle ~756 lines — mostly parallel structure, not unique rules.

### 2.3 Decisions locked in brainstorming

| Topic              | Decision                                                                                         |
| ------------------ | ------------------------------------------------------------------------------------------------ |
| Scope              | **Full convergence** (A): Chess shell + rail AI config everywhere                                |
| Layout flexibility | **Same shell, allow variant extras** (B): e.g. Shogi hands via slots / custom board column       |
| Extraction depth   | **Lifecycle + shell only** (A): not a generic AI-turn runner or `GameSession` mega-component     |
| Cleanup            | **Delete** `AISettingsDialog` + `GameScaffold` (+ `GameModeToggle`, sole consumer of the latter) |
| Approach           | **Shared modules first, then migrate games** (Approach 1)                                        |

## 3. Architecture

```
AppShell
  └─ SidebarAIConfig          (all game pages; provider/model only)
  └─ page island: *Game.tsx
        ├─ useAIConfigHydration / usePlayHistory   (Tier 1 — unchanged ownership)
        ├─ useGameIdentityReset                   (new)
        ├─ useAiMoveGenerationToken               (new — ref + invalidate only)
        ├─ useGameDebugOutcomes                   (new)
        └─ GameLayout
              ├─ header (title / subtitle)
              ├─ optional banner (hydrate / provider errors)
              ├─ boardColumn: BoardColumn slots
              │     board, overlay, controls, variant extras
              └─ sidePanel: BoardSidePanel children
                    AI side select | AIStatusPanel | instructions | demos
```

### 3.1 Ownership

| Shared (this tier)                        | Per game (stays local)                                            |
| ----------------------------------------- | ----------------------------------------------------------------- |
| Page chrome (`GameLayout`, `BoardColumn`) | Board engine, click handlers                                      |
| Auth identity reset timing                | `makeAIMove` body / adapter calls                                 |
| AI gen-token invalidate / stale check     | Demos, tips, color names                                          |
| Debug win/loss/draw + DEV globals         | Win conditions, hands, promotion                                  |
| Capture-ring accent tokens                | Player-tint colors that intentionally cross-map (Jungle red/blue) |
| `SidebarAIConfig` rail visibility         | Default AI side after reset                                       |

## 4. Shared lifecycle hooks

All new hooks live under `apps/web/src/hooks/` and are re-exported from `hooks/index.ts`.

### 4.1 `useAiMoveGenerationToken`

Tiny primitive used by reset paths and AI callbacks. Does **not** own the AI request.

```ts
function useAiMoveGenerationToken(): {
  /** Current generation; stamp into AI request metadata as requestId */
  genRef: React.MutableRefObject<number>;
  /** Bump gen so in-flight callbacks no-op */
  invalidate(): void;
  /** true if requestId is set and does not match current gen */
  isStale(requestId: number | undefined): boolean;
};
```

Each game keeps its own `makeAIMove` / effect; it only replaces local `aiMoveGenRef` usage with this hook.

### 4.2 `useGameIdentityReset`

Encodes the logout / account-switch reset pattern (currently ~20 lines × 4).

```ts
function useGameIdentityReset(options: {
  isAuthenticated: boolean;
  userId: string | null | undefined;
  /** Called on auth loss or identity change (not on mount / first login) */
  onReset: () => void;
}): void;
```

**Contract:**

- Fire only when: previous auth was true and now false (**logout**), or authenticated and `userId` changed from a non-null previous id (**account switch**).
- Do **not** fire on mount or first login from anonymous.
- `onReset` must fully clear local game UI (board, `gameStarted` / `gameActive`, errors, debug moves) and call `invalidate()` on the gen token.
- Default AI side after reset stays **inside** each game’s `onReset` (chess/xiangqi → `'black'`, shogi → `'gote'`, jungle → `'blue'`).

### 4.3 `useGameDebugOutcomes`

```ts
function useGameDebugOutcomes<TPlayer extends string>(options: {
  aiPlayer: TPlayer;
  getHumanPlayer: (ai: TPlayer) => TPlayer;
  setGameState: React.Dispatch<
    React.SetStateAction<
      { status: string; currentPlayer: TPlayer } & Record<string, unknown>
    >
  >;
  /** e.g. 'chess' → window.__PROCYON_DEBUG_CHESS_TRIGGER_WIN__ */
  debugVariantKey: string;
  /** Terminal status for forced draw (often 'stalemate') */
  drawStatus: string;
  onPrepareTriggerWin?: () => void;
}): {
  triggerDebugWin: () => void;
  triggerDebugLoss: () => void;
  triggerDebugDraw: () => void;
  showDebugWinButton: boolean;
  setShowDebugWinButton: (v: boolean) => void;
};
```

**Behavior pins:**

- Win/loss set a checkmate-like terminal `status` and set `currentPlayer` so existing `getWinnerColor` / play-history logic still works per variant.
- Draw uses the variant’s existing terminal status string (`drawStatus`) — no shared status enum.
- Global debug helper and DEV-only UI stay behind `import.meta.env.DEV`.
- Preserve existing `__PROCYON_DEBUG_<VARIANT>_TRIGGER_WIN__` globals used by tests/manual debug.

### 4.4 Explicitly not extracted

- Mode toggle / start-reset handlers (still call variant `createInitialGameState`)
- Full AI turn effect / adapter call loop
- Square-click / drop / promotion handlers

### 4.5 Naming note vs Tier 1 sketch

| Tier 1 sketch name | This design                                                       |
| ------------------ | ----------------------------------------------------------------- |
| `useGameLifecycle` | Split into the three hooks above (clearer than one mega-hook)     |
| `GameLayout`       | `GameLayout`                                                      |
| `BoardGrid`        | `BoardColumn` (board **column** chrome, not a shared square grid) |

## 5. Layout components

### 5.1 `GameLayout`

Replaces ad-hoc Chess header + flex row; supersedes `GameScaffold` for game pages.

```ts
type GameLayoutProps = {
  title: string;
  subtitle?: string;
  boardColumn: React.ReactNode;
  sidePanel: React.ReactNode;
  banner?: React.ReactNode;
  className?: string;
};
```

Structure:

```
<div>  <!-- centered page stack; Chess Nocturne classes -->
  <header> title + subtitle </header>
  {banner}
  <div class="flex flex-col gap-6 lg:flex-row ...">
    {boardColumn}
    {sidePanel}
  </div>
</div>
```

Chess cutover is behavior-preserving: same classes, same structure extracted into the component.

### 5.2 `BoardColumn`

Shareable **column chrome**, not a square-grid renderer. Boards remain variant-specific components.

```ts
type BoardColumnProps = {
  board: React.ReactNode;
  controls?: React.ReactNode;
  debugTools?: React.ReactNode;
  belowBoard?: React.ReactNode;
  aboveControls?: React.ReactNode;
};
```

Default stack order: `board → aboveControls → controls → debugTools → belowBoard`.

**Escape hatch (decision B):** games that need a different order pass a custom `boardColumn` node into `GameLayout` instead of using `BoardColumn`.

### 5.3 `BoardSidePanel` (existing)

API unchanged. All four games put:

| Mode     | Contents                                                             |
| -------- | -------------------------------------------------------------------- |
| AI       | AI-side `<select>` (variant labels) + `AIStatusPanel` + instructions |
| Tutorial | `DemoSelector` + `TutorialInstructions`                              |

AI **side/color** stays in the side panel (Chess pattern), **not** in `SidebarAIConfig`.

### 5.4 Files deleted after zero importers

| File                                 | Reason                                  |
| ------------------------------------ | --------------------------------------- |
| `components/ai/AISettingsDialog.tsx` | Only used by Xiangqi/Shogi/Jungle today |
| `components/game/GameScaffold.tsx`   | Same                                    |
| `components/game/GameModeToggle.tsx` | Only imported by `GameScaffold`         |

Update stale comments in `AppShell`, `SidebarAIConfig`, and `lib/ai/storage.ts` that still describe the dialog as live UI.

## 6. AppShell and SidebarAIConfig

### 6.1 Gating change

Today `isChessPage` gates desktop rail, mobile AI button, and mobile panel. After this tier, use existing `isGamePage` for all three:

| Surface                        | Before                 | After         |
| ------------------------------ | ---------------------- | ------------- |
| Desktop rail `SidebarAIConfig` | `/chess` only          | any game page |
| Mobile AI toggle               | `/chess` only          | any game page |
| Mobile collapsible panel       | `/chess` only          | any game page |
| Store `hydrate()`              | already all game pages | unchanged     |

`SidebarAIConfig` itself stays provider/model only (store-backed). No AI-side control in the rail.

### 6.2 Cutover constraint

**Never** ship a non-chess game page with **both** `AISettingsDialog` and `SidebarAIConfig` for provider/model (duplicate controls).

**Preferred sequence:** migrate all three non-chess games off the dialog, then flip AppShell to `isGamePage` once and delete dead files. Acceptable alternative: per-path enablement only after that path’s dialog is removed.

### 6.3 Per-game after dialog removal

For Xiangqi / Shogi / Jungle:

1. Drop `AISettingsDialog` / `GameScaffold`
2. Wrap with `GameLayout` + `BoardColumn` (or custom column) + `BoardSidePanel`
3. AI mode: AI-side select (existing labels) + `AIStatusPanel` (+ instructions where Chess has them)
4. Prefer `GameLayout` `banner` for hydrate/provider errors

## 7. Board accent fix

### 7.1 Problem

Capture/selection rings hardcode `border-xiangqi` on non-xiangqi boards.

| Board          | Wrong usage                   | Fix             |
| -------------- | ----------------------------- | --------------- |
| `ChessBoard`   | capture ring `border-xiangqi` | `border-chess`  |
| `ShogiBoard`   | capture ring `border-xiangqi` | `border-shogi`  |
| `JungleBoard`  | capture ring `border-xiangqi` | `border-jungle` |
| `XiangqiBoard` | `border-xiangqi`              | keep            |

Tailwind already defines per-variant DEFAULT accents; `GameVariant` / `Accent` live in `lib/ai/game-variant-types.ts`.

### 7.2 Approach

Small constant map (e.g. `lib/ui/board-accents.ts` or next to game-variant types):

```ts
export const CAPTURE_RING: Record<GameVariant, string> = {
  chess: 'absolute inset-0 border-4 border-chess rounded pointer-events-none',
  xiangqi:
    'absolute inset-0 border-4 border-xiangqi rounded pointer-events-none',
  shogi: 'absolute inset-0 border-2 border-shogi rounded pointer-events-none',
  jungle: 'absolute inset-0 border-2 border-jungle rounded pointer-events-none',
};
```

Preserve existing ring thickness differences (chess/xiangqi `border-4`, shogi/jungle `border-2`) unless a later visual pass intentionally unifies them.

### 7.3 Out of scope for accents

Jungle **player-tint** classes that use `xiangqi` / `shogi` tokens for red vs blue pieces/traps (`bg-xiangqi/15`, `border-shogi/40`, etc.) stay as-is. Those are two-player color coding, not mis-branded page accents.

## 8. Migration order (Approach 1)

1. Add hooks + `GameLayout` / `BoardColumn`; unit-test hooks.
2. Adopt hooks + layout on **Chess** (behavior-neutral refactor).
3. Migrate **Xiangqi** → shell + side-panel AI side; remove dialog from that file.
4. Migrate **Shogi** (hands via `BoardColumn` slots or custom column).
5. Migrate **Jungle**.
6. Flip AppShell to `isGamePage` for SidebarAIConfig (if not done path-by-path); delete unused files; comment cleanup.
7. Board accent map + board component updates (can land with or right after layout migration so visual QA is once).

Land as one PR if reviewable, or a short stack with the above commit order.

## 9. Testing

### 9.1 Unit

- `useGameIdentityReset`: fires on logout and user-id change; does not fire on mount or first login.
- `useAiMoveGenerationToken`: `invalidate` bumps gen; `isStale` true only when requestId set and mismatched.
- `useGameDebugOutcomes`: win/loss/draw set expected status/player; DEV global registration when applicable.

### 9.2 Existing safety net

Keep green:

- Unit: per-variant and hook suites (`bun test` under `apps/web`)
- E2E (mocked AI where relevant): `chess-ai`, `xiangqi-ai`, `shogi-ai`, `chess-layout`, `critical-user-journeys`, `rating-system`, `hasgameended-reset`, `game-history`

### 9.3 E2E additions (small)

- Side panel Tutorial / Play vs AI visible on **xiangqi** and **shogi** (mirror `chess-layout`).
- Optional jungle smoke if cheap.
- Assert SidebarAIConfig (or mobile AI toggle) on a non-chess game page at desktop width.

### 9.4 Manual smoke

Each game: start AI game, switch provider in rail, change AI side in panel, logout / identity switch resets board, capture ring color matches page accent bar.

## 10. Success criteria

1. All four game pages use `GameLayout` + board column chrome + `BoardSidePanel`.
2. `SidebarAIConfig` on all game routes; no game page mounts `AISettingsDialog`.
3. Shared hooks used by all four games; no remaining copy-pasted identity-reset / debug-win blocks.
4. Capture rings use correct variant accents.
5. `AISettingsDialog`, `GameScaffold`, `GameModeToggle` deleted; comments updated.
6. Unit + relevant E2E green; no intentional changes to rules, AI adapters, or play-history save semantics beyond where config UI lives.

## 11. Out of scope

- Tier 2 engine/board primitives (`Position`, `GridBoard`, chess shallow `copyBoard`, duplicate `algebraicToPosition`) — HPA-154
- Tier 3 AI adapter / rule-guardian dedup — HPA-156
- Generic AI-turn runner or near-generic `GameSession`
- Changing Jungle red/blue player color tokens that intentionally reuse xiangqi/shogi palettes
- Puzzles, profile, play-history page redesign
- New product features (multiplayer, new variants, etc.)

## 12. Risks

| Risk                                         | Mitigation                                                                                                      |
| -------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Auth identity reset omits gen invalidation   | Hook contract requires `onReset` to call `invalidate()`; unit tests; preserve existing comments/intent in Chess |
| Debug globals break E2E                      | Keep `__PROCYON_DEBUG_<VARIANT>_TRIGGER_WIN__` names and behavior                                               |
| Duplicate provider UI mid-migration          | Hard cutover rule §6.2                                                                                          |
| Shogi layout regressions (hands / promotion) | Slots / custom board column; do not force hands into Chess’s exact DOM order                                    |
| Large PR review cost                         | Stacked commits or PRs per migration step                                                                       |

## 13. File touch map (expected)

**New**

- `apps/web/src/hooks/useAiMoveGenerationToken.ts` (+ test)
- `apps/web/src/hooks/useGameIdentityReset.ts` (+ test)
- `apps/web/src/hooks/useGameDebugOutcomes.ts` (+ test)
- `apps/web/src/components/game/GameLayout.tsx`
- `apps/web/src/components/game/BoardColumn.tsx`
- `apps/web/src/lib/ui/board-accents.ts` (or equivalent)

**Modified**

- `apps/web/src/hooks/index.ts`
- `apps/web/src/components/{Chess,Xiangqi,Shogi,Jungle}Game.tsx`
- `apps/web/src/components/{Chess,Xiangqi,Shogi,Jungle}Board.tsx` (accents)
- `apps/web/src/components/AppShell.tsx`
- E2E layout specs as needed

**Deleted**

- `apps/web/src/components/ai/AISettingsDialog.tsx`
- `apps/web/src/components/game/GameScaffold.tsx`
- `apps/web/src/components/game/GameModeToggle.tsx`
