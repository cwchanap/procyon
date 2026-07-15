# Tier 4 — Extract Shared React Hooks and Layout Components (Design Spec)

**Status:** Design approved in brainstorming (revised after codebase + implementation-risk review)  
**Date:** 2026-07-14  
**Ticket:** [HPA-155](https://linear.app/cwchanap/issue/HPA-155/tier-4-extract-shared-react-hooks-and-layout-components)  
**Project:** [procyon](https://linear.app/cwchanap/project/procyon-b82f2cc99230)  
**Related:** HPA-154 (Tier 2), HPA-156 (Tier 3), Tier 1 design (`docs/superpowers/2026-07-08-tier1-hook-adoption-design.md`)

## 1. Goal

Bring all four game pages (Chess, Xiangqi, Shogi, Jungle) onto one **UI/lifecycle shell** derived from the Chess layout redesign, without merging variant rules or AI move bodies.

**End state:**

- Every game page uses `GamePlayLayout` + board-column chrome + `BoardSidePanel` (inside existing page chrome — see §3.2)
- App shell shows `SidebarAIConfig` on **all** game routes (`/chess`, `/xiangqi`, `/shogi`, `/jungle`)
- Shared lifecycle hooks replace copy-pasted identity-reset, AI gen-token, and debug-outcome logic
- Board capture rings use the correct per-variant accent (no more wrong `border-xiangqi` on Chess/Shogi/Jungle)
- `AISettingsDialog`, `GameScaffold`, and `GameModeToggle` are deleted
- `jungle.astro` uses `GamePageLayout` like the other three game pages (today it inlines the same markup)

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
Layout.astro
  └─ AppShell (nav + SidebarAIConfig on all game pages)
  └─ GamePageLayout            (existing — page accent bar + max-w-6xl)
        └─ *Game.tsx island
              ├─ useAIConfigHydration / usePlayHistory   (Tier 1)
              ├─ useGameIdentityReset                   (new)
              ├─ useAiMoveGenerationToken               (new — ref + invalidate only)
              ├─ useGameDebugOutcomes                   (new)
              └─ GamePlayLayout                         (new — island content shell)
                    ├─ header (title / subtitle)
                    ├─ optional banner (hydrate / provider errors)
                    ├─ boardColumn: BoardColumn slots
                    │     board, overlay, controls, variant extras
                    └─ sidePanel: BoardSidePanel children
                          AI side select | AIStatusPanel | instructions | demos
```

### 3.1 Ownership

| Shared (this tier)                              | Per game (stays local)                                                   |
| ----------------------------------------------- | ------------------------------------------------------------------------ |
| Island chrome (`GamePlayLayout`, `BoardColumn`) | Board engine, click handlers                                             |
| Auth identity reset timing                      | `makeAIMove` body / adapter calls                                        |
| AI gen-token invalidate / stale check           | Demos, tips, color names                                                 |
| Debug win/loss/draw + `__…_TRIGGER_WIN__` only  | Other DEV globals (`_STATE__`, `_TRIGGER_PROMOTION__`), hands, promotion |
| Capture-ring accent tokens                      | Player-tint colors that intentionally cross-map (Jungle red/blue)        |
| `SidebarAIConfig` rail visibility               | Default AI side after reset                                              |
| `GamePageLayout` on all four `.astro` pages     | —                                                                        |

### 3.2 `GamePageLayout` vs `GamePlayLayout` (coexist; different layers)

These are **not** the same component and neither subsumes the other:

| Component                                                             | Layer                                                | Role today / after this tier                                                                                                                                   |
| --------------------------------------------------------------------- | ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GamePageLayout`                                                      | Astro page wrapper (`components/GamePageLayout.tsx`) | Variant accent bar (`h-0.5 bg-*`) + `max-w-6xl` content well + optional back button. Used by `chess.astro`, `xiangqi.astro`, `shogi.astro`. **Unchanged API.** |
| `GamePlayLayout` (new; was sketched as `GameLayout` in brainstorming) | React island inside `*Game.tsx`                      | Title/subtitle + optional banner + two-column board/side panel. Extracted from Chess’s inner markup.                                                           |

**Why not name the new component `GameLayout`:** that name collides with `GamePageLayout` and is easy to confuse during implementation and review. **`GamePlayLayout`** names the play-area shell; page chrome stays `GamePageLayout`.

**Pre-existing nesting note:** `GamePageLayout` uses `max-w-6xl`; Chess’s island root uses `max-w-7xl`. The outer constraint wins. Extracting Chess’s classes into `GamePlayLayout` preserves this quirk (not a regression).

**Jungle page inconsistency (in scope, small):** `jungle.astro` does **not** import `GamePageLayout`; it inlines the same accent-bar + `max-w-6xl` markup with `bg-jungle`. Visually it has an accent bar; structurally it drifts. When migrating Jungle, switch `jungle.astro` to `<GamePageLayout variant="jungle">` like the other three pages.

## 4. Shared lifecycle hooks

All new hooks live under `apps/web/src/hooks/`.

### 4.0 Barrel export consistency

`hooks/index.ts` today re-exports `usePlayHistory` and `usePuzzle` only. `useAIConfigHydration` is imported via **direct path** by all four games (`from '../hooks/useAIConfigHydration'`).

**This tier:**

1. Re-export **all** shared game hooks from `hooks/index.ts`: the three new hooks **and** `useAIConfigHydration` (plus existing `usePlayHistory` / `usePuzzle`).
2. When touching each `*Game.tsx`, prefer barrel imports for hooks that the barrel exposes (e.g. `from '../hooks'` or `from '../hooks/index'`), so import style does not stay split between barrel and deep paths.

Direct-path imports remain valid TypeScript; the goal is one consistent convention after migration, not a runtime change.

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

**Do not type the hook as accepting `Dispatch<SetStateAction<{ status; currentPlayer } & Record<string, unknown>>>`.**  
That signature is not assignable from the real setters (`Dispatch<SetStateAction<GameState>>`, `XiangqiGameState`, etc.): `Dispatch` is invariant in the wrong direction, and the concrete state interfaces have no `Record<string, unknown>` index signature. Passing `setGameState` from Chess/Xiangqi/Shogi/Jungle would fail typecheck.

**Preferred API — narrow outcome callback** (avoids variance issues entirely):

```ts
function useGameDebugOutcomes<TPlayer extends string>(options: {
  aiPlayer: TPlayer;
  getHumanPlayer: (ai: TPlayer) => TPlayer;
  /**
   * Apply only the terminal outcome fields. Each game wraps its full setter:
   *   setOutcome: (p) => setGameState(prev => ({ ...prev, ...p }))
   * with status cast/narrowed to the variant's status union as needed.
   */
  setOutcome: (patch: { status: string; currentPlayer: TPlayer }) => void;
  /** e.g. 'chess' → window.__PROCYON_DEBUG_CHESS_TRIGGER_WIN__ */
  debugVariantKey: string;
  /** Terminal status for forced win/loss (today: 'checkmate' on all four) */
  winStatus: string;
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

**Acceptable alternative:** generic over the full state type

```ts
function useGameDebugOutcomes<
  TPlayer extends string,
  TState extends { status: string; currentPlayer: TPlayer },
>(options: {
  setGameState: React.Dispatch<React.SetStateAction<TState>>;
  winStatus: TState['status'];
  drawStatus: TState['status'];
  // ...same other options
}): /* same returns */;
// internally: setGameState(prev => ({ ...prev, status, currentPlayer }))
```

Prefer `setOutcome` in the implementation plan unless a strong reason emerges for the generic form. Do **not** invent a structural partial-state `Dispatch` type.

**Behavior pins:**

- Win/loss set a checkmate-like terminal `status` (`winStatus`) and set `currentPlayer` so existing `getWinnerColor` / play-history logic still works per variant.
- Draw uses the variant’s existing terminal status string (`drawStatus`) — no shared status enum.
- Global debug helper and DEV-only UI stay behind `import.meta.env.DEV`.
- Preserve existing `__PROCYON_DEBUG_<VARIANT>_TRIGGER_WIN__` globals used by tests/manual debug.

**`onPrepareTriggerWin` is a callback because prep differs per variant today** (do not hardcode uniform prep inside the hook):

| Variant                  | Prep before `triggerDebugWin` (current code)                                                                           |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| Chess                    | `setGameMode('ai')` + `setGameStarted(true)` + `setHasGameEnded(false)` + `setShowDebugWinButton(true)`                |
| Shogi / Xiangqi / Jungle | typically `setGameStarted(true)` + `setShowDebugWinButton(true)` only (no mode force / no `hasGameEnded` where absent) |

Each game supplies its current prep sequence via `onPrepareTriggerWin` (or an equivalent option) so E2E/debug behavior stays variant-identical.

**DEV globals this hook owns vs leaves local:**

| Global pattern                                             | Owner                                                                   |
| ---------------------------------------------------------- | ----------------------------------------------------------------------- |
| `__PROCYON_DEBUG_<VARIANT>_TRIGGER_WIN__`                  | `useGameDebugOutcomes`                                                  |
| `__PROCYON_DEBUG_SHOGI_TRIGGER_PROMOTION__`                | **stays in `ShogiGame`** (promotion-dialog test helper, not an outcome) |
| `__PROCYON_DEBUG_<VARIANT>_STATE__` (Xiangqi, Shogi today) | **stays in the game component** (state exposure for test inspection)    |

§9.1 “DEV global registration” for this hook means **only** the win-trigger global (and show/hide of the win/loss/draw DEV buttons), not routing every `__PROCYON_DEBUG_*` through the hook.

### 4.4 Explicitly not extracted

- Mode toggle / start-reset handlers (still call variant `createInitialGameState`)
- Full AI turn effect / adapter call loop
- Square-click / drop / promotion handlers
- Promotion debug trigger and `*_STATE__` debug globals (§4.3)

### 4.5 Naming note vs Tier 1 sketch

| Tier 1 sketch name | This design                                                               |
| ------------------ | ------------------------------------------------------------------------- |
| `useGameLifecycle` | Split into the three hooks above (clearer than one mega-hook)             |
| `GameLayout`       | `GamePlayLayout` (avoids collision with existing `GamePageLayout` — §3.2) |
| `BoardGrid`        | `BoardColumn` (board **column** chrome, not a shared square grid)         |

## 5. Layout components

### 5.1 `GamePlayLayout`

Replaces ad-hoc Chess header + flex row inside the game island; supersedes `GameScaffold` for game pages. Does **not** replace `GamePageLayout` (page accent bar — §3.2).

```ts
type GamePlayLayoutProps = {
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
<div>  <!-- Chess island root classes (max-w-7xl etc.); nested under GamePageLayout's max-w-6xl -->
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

**Escape hatch (decision B):** games that need a different order pass a custom `boardColumn` node into `GamePlayLayout` instead of using `BoardColumn`.

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
2. Wrap with `GamePlayLayout` + `BoardColumn` (or custom column) + `BoardSidePanel`
3. AI mode: AI-side select (existing labels) + `AIStatusPanel` (+ instructions where Chess has them)
4. Prefer `GamePlayLayout` `banner` for hydrate/provider errors
5. Ensure the corresponding `*.astro` page uses `GamePageLayout` (Jungle: replace inlined accent markup — §3.2)

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

Small constant map at **`apps/web/src/lib/board-accents.ts`** (new file next to existing `lib/utils.ts` — avoids inventing a greenfield `lib/ui/` tree and avoids stuffing presentation into `lib/ai/`).

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

1. Add hooks + `GamePlayLayout` / `BoardColumn`; unit-test hooks; extend `hooks/index.ts` barrel (§4.0).
2. Adopt hooks + layout on **Chess** (behavior-neutral refactor); **keep ChessGame.test.tsx** identity-reset / stale-AI coverage green.
3. Migrate **Xiangqi** → shell + side-panel AI side; remove dialog from that file; rewrite **xiangqi-ai** E2E dialog steps (§9.2); add §9.1b component tests.
4. Migrate **Shogi** (hands via `BoardColumn` slots or custom column); rewrite **shogi-ai** E2E; add §9.1b tests.
5. Migrate **Jungle** (island shell + `jungle.astro` → `GamePageLayout`); add §9.1b tests.
6. Flip AppShell to `isGamePage` for SidebarAIConfig (if not done path-by-path); rewrite **critical-user-journeys** AI-settings steps; delete unused files; comment cleanup.
7. Board accent map (`lib/board-accents.ts`) + board component updates (can land with or right after layout migration so visual QA is once).

Land as one PR if reviewable, or a short stack with the above commit order. E2E rewrites land **with** the game they depend on (not as a forgotten follow-up).

## 9. Testing

### 9.1 Unit — hooks

- `useGameIdentityReset`: fires on logout and user-id change; does not fire on mount or first login. **These tests only prove _when_ the hook fires** — they do not prove each game’s `onReset` body is correct (§9.1b).
- `useAiMoveGenerationToken`: `invalidate` bumps gen; `isStale` true only when requestId set and mismatched.
- `useGameDebugOutcomes`: win/loss/draw call `setOutcome` with expected status/player; registers `__PROCYON_DEBUG_<VARIANT>_TRIGGER_WIN__` only (not `_STATE__` / `_TRIGGER_PROMOTION__`); `onPrepareTriggerWin` is invoked before win when provided.

### 9.1b Unit — caller obligations (identity reset + stale AI)

The identity-reset **contract** requires every game’s `onReset` to:

1. Reset board / `gameStarted` / `gameActive` (as applicable)
2. Clear errors + debug move history (+ thinking flags where used)
3. Call `invalidate()` on the gen token (so in-flight `makeAIMove` cannot resurrect pre-reset state)
4. Restore default AI side

Hook-only tests stay green if a migrated game forgets (2) or (3). **Required coverage:**

| Coverage                                                                                                                                                  | Notes                                                                                                                                                                                                                                                  |
| --------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Preserve** existing Chess integration tests in `ChessGame.test.tsx` (identity-change re-enables AI-side select; AI gen stale / requestId guards)        | Do not delete or weaken these when extracting hooks                                                                                                                                                                                                    |
| **Add equivalent component-level tests** for Xiangqi / Shogi / Jungle after migration                                                                     | Prefer a **parameterized** pattern (shared helpers or `test.each` over variant fixtures) covering at least: account-switch mid-game resets local lock/state; after reset, a late AI callback with stale `requestId` does not apply board/error updates |
| Optional: unit-test a documented “canonical `onReset` recipe” helper if one is extracted; otherwise keep the obligations enforced at the `*Game` boundary |

### 9.2 E2E — rewrite required (not “keep green as-is”)

Several suites **explicitly depend on `AISettingsDialog` UI that this tier deletes**. Listing them under “keep green” without a rewrite plan is incorrect.

| Spec                                                                              | Today (dialog-coupled)                                                          | After migration                                                                                                                                                              |
| --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `xiangqi-ai.spec.ts`                                                              | Asserts/clicks `⚙️ AI Settings`; mode switch back to AI via that button         | Assert `BoardSidePanel` mode toggles (`Tutorial` / `Play vs AI`); provider/model via `SidebarAIConfig` (desktop rail or mobile AI panel) where the test cared about settings |
| `shogi-ai.spec.ts`                                                                | Opens dialog, inspects “AI Settings” heading / provider empty state             | Same rewrite: side panel for mode; rail/mobile for provider config empty-state copy if still applicable                                                                      |
| `critical-user-journeys.spec.ts`                                                  | Clicks `⚙️ AI Settings`, expects dialog heading, selects provider inside dialog | Drive provider selection through `SidebarAIConfig` on the relevant game page(s); mode via side panel                                                                         |
| `chess-ai`, `chess-layout`, `rating-system`, `hasgameended-reset`, `game-history` | Mostly Chess shell already                                                      | Expect minor selector updates only if any still mention the dialog                                                                                                           |

**§9.3 layout additions are in addition to these rewrites**, not a substitute.

Implementation plan must include an explicit task: _“Update E2E that target AI Settings dialog to BoardSidePanel + SidebarAIConfig.”_ Touch map lists those spec files as **modified**, not merely “as needed.”

### 9.3 E2E additions (small)

- Side panel Tutorial / Play vs AI visible on **xiangqi** and **shogi** (mirror `chess-layout`) — may fold into the rewrites in §9.2.
- Optional jungle smoke if cheap.
- Assert `SidebarAIConfig` (or mobile AI toggle) on a non-chess game page at desktop width.

### 9.4 Manual smoke

Each game: start AI game, switch provider in rail, change AI side in panel, logout / identity switch resets board, capture ring color matches page accent bar.

## 10. Success criteria

1. All four game islands use `GamePlayLayout` + board column chrome + `BoardSidePanel`.
2. All four `*.astro` game pages use `GamePageLayout` (including Jungle).
3. `SidebarAIConfig` on all game routes; no game page mounts `AISettingsDialog`.
4. Shared hooks used by all four games; no remaining copy-pasted identity-reset / debug-win blocks.
5. Capture rings use correct variant accents.
6. `AISettingsDialog`, `GameScaffold`, `GameModeToggle` deleted; comments updated.
7. Hook barrel exports include new hooks + `useAIConfigHydration`; migrated games import consistently.
8. E2E suites that targeted `⚙️ AI Settings` are rewritten for `BoardSidePanel` + `SidebarAIConfig` and pass (§9.2).
9. Chess identity-reset / stale-AI component tests preserved; Xiangqi/Shogi/Jungle have equivalent coverage after migration (§9.1b).
10. Unit + relevant E2E green; no intentional changes to rules, AI adapters, or play-history save semantics beyond where config UI lives.

## 11. Out of scope

- Tier 2 engine/board primitives (`Position`, `GridBoard`, chess shallow `copyBoard`, duplicate `algebraicToPosition`) — HPA-154
- Tier 3 AI adapter / rule-guardian dedup — HPA-156
- Generic AI-turn runner or near-generic `GameSession`
- Changing Jungle red/blue player color tokens that intentionally reuse xiangqi/shogi palettes
- Puzzles, profile, play-history page redesign
- New product features (multiplayer, new variants, etc.)

## 12. Risks

| Risk                                           | Mitigation                                                                                                                                                          |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Auth identity reset omits gen invalidation     | Hook contract requires `onReset` to call `invalidate()`; **component-level** tests per variant (§9.1b), not hook fire tests alone; preserve Chess integration tests |
| Debug globals break E2E                        | Keep `__…_TRIGGER_WIN__` via the shared hook; leave `_STATE__` / `_TRIGGER_PROMOTION__` in game components                                                          |
| Name collision `GameLayout` / `GamePageLayout` | New island shell is **`GamePlayLayout`**; page wrapper stays `GamePageLayout` (§3.2)                                                                                |
| `setGameState` type vs real setters            | Use `setOutcome` callback (or full-state generic) — §4.3; never partial-state `Dispatch`                                                                            |
| E2E still clicks deleted dialog                | Mandatory rewrite of xiangqi-ai / shogi-ai / critical-user-journeys (§9.2) before claiming green                                                                    |
| Duplicate provider UI mid-migration            | Hard cutover rule §6.2                                                                                                                                              |
| Shogi layout regressions (hands / promotion)   | Slots / custom board column; do not force hands into Chess’s exact DOM order                                                                                        |
| Large PR review cost                           | Stacked commits or PRs per migration step                                                                                                                           |

## 13. File touch map (expected)

**New**

- `apps/web/src/hooks/useAiMoveGenerationToken.ts` (+ test)
- `apps/web/src/hooks/useGameIdentityReset.ts` (+ test)
- `apps/web/src/hooks/useGameDebugOutcomes.ts` (+ test)
- `apps/web/src/components/game/GamePlayLayout.tsx`
- `apps/web/src/components/game/BoardColumn.tsx`
- `apps/web/src/lib/board-accents.ts`

**Modified**

- `apps/web/src/hooks/index.ts` (export new hooks + `useAIConfigHydration`)
- `apps/web/src/components/{Chess,Xiangqi,Shogi,Jungle}Game.tsx`
- `apps/web/src/components/{Chess,Xiangqi,Shogi,Jungle}Board.tsx` (accents)
- `apps/web/src/components/AppShell.tsx`
- `apps/web/src/pages/jungle.astro` (use `GamePageLayout`)
- `apps/web/e2e/xiangqi-ai.spec.ts` — remove `⚙️ AI Settings` / dialog flows; BoardSidePanel + SidebarAIConfig
- `apps/web/e2e/shogi-ai.spec.ts` — same
- `apps/web/e2e/critical-user-journeys.spec.ts` — same for non-chess AI settings steps
- `apps/web/e2e/chess-layout.spec.ts` and/or new layout assertions for xiangqi/shogi as needed
- `apps/web/src/components/ChessGame.test.tsx` — preserve identity-reset / stale-AI coverage through hook adoption
- New or extended `*Game` tests for Xiangqi/Shogi/Jungle identity-reset + stale AI (§9.1b)

**Unchanged (layer remains)**

- `apps/web/src/components/GamePageLayout.tsx` — still the page accent wrapper

**Deleted**

- `apps/web/src/components/ai/AISettingsDialog.tsx`
- `apps/web/src/components/game/GameScaffold.tsx`
- `apps/web/src/components/game/GameModeToggle.tsx`
