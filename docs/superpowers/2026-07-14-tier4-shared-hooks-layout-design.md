# Tier 4 — Extract Shared React Hooks and Layout Components (Design Spec)

**Status:** Design approved in brainstorming (revised after layout/API/test risk review)  
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
   * Apply terminal outcome fields. Each game wraps its full setter, e.g.:
   *   setOutcome: (p) =>
   *     setGameState(prev => ({
   *       ...prev,
   *       status: p.status as GameStatus,
   *       ...(p.currentPlayer !== undefined ? { currentPlayer: p.currentPlayer } : {}),
   *     }))
   *
   * currentPlayer is optional: win/loss always pass it; draw must omit it
   * so the previous player is preserved (matches today's handlers).
   */
  setOutcome: (patch: { status: string; currentPlayer?: TPlayer }) => void;
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

**Draw vs win/loss (preserve current behavior):**

| Action     | `status`          | `currentPlayer`                                            |
| ---------- | ----------------- | ---------------------------------------------------------- |
| Win / loss | `winStatus`       | required (AI-to-move vs human-to-move encoding)            |
| Draw       | `drawStatus` only | **omitted** — do not pass; leave previous player unchanged |

Today’s `triggerDebugDraw` is `setGameState(prev => ({ ...prev, status: 'stalemate' }))` with no player field. A required `currentPlayer` on every `setOutcome` call would change behavior or force inventing a player. **Status-only draw patches are required.**

**Acceptable alternative:** generic over the full state type with the same win/draw semantics (`setGameState(prev => ({ ...prev, status, ...(player !== undefined ? { currentPlayer: player } : {}) }))`).

Prefer `setOutcome` in the implementation plan unless a strong reason emerges for the generic form. Do **not** invent a structural partial-state `Dispatch` type.

**Behavior pins:**

- Win/loss set a checkmate-like terminal `status` (`winStatus`) and set `currentPlayer` so existing `getWinnerColor` / play-history logic still works per variant.
- Draw uses the variant’s existing terminal status string (`drawStatus`) and **does not** touch `currentPlayer` — no shared status enum.
- Global debug helper and DEV-only UI stay behind `import.meta.env.DEV`.
- Preserve existing `__PROCYON_DEBUG_<VARIANT>_TRIGGER_WIN__` globals used by tests/manual debug.

**Shift+D ownership (in scope for this hook):**  
All four games today register a DEV-only `keydown` listener (`Shift+D` → toggle `showDebugWinButton`). That is pure debug-outcome chrome, not variant rules. **`useGameDebugOutcomes` owns the Shift+D listener** (register/cleanup under `import.meta.env.DEV`) so the four copies are deleted. Promotion focus traps and other non-debug key handlers stay local.

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

- Mode toggle / start-reset handlers (still call variant `createInitialGameState`) — but they **must** call `invalidate()`; see §4.6
- Full AI turn effect / adapter call loop
- Square-click / drop / promotion handlers
- Promotion debug trigger and `*_STATE__` debug globals (§4.3)

### 4.6 Gen-token invalidation sites (all required)

`useAiMoveGenerationToken().invalidate()` (or equivalent gen bump) must run on **every** path that abandons an in-flight AI turn, not only identity reset:

| Site                             | Today                                 | After this tier                                       |
| -------------------------------- | ------------------------------------- | ----------------------------------------------------- |
| Identity logout / account switch | via `onReset`                         | `onReset` must call `invalidate()` (§4.2)             |
| Manual reset / New Game          | `aiMoveGenRef.current++` in each game | same, via token hook                                  |
| Mode switch (`toggleToMode`)     | all four games bump gen               | same — **must not drop** when wiring `BoardSidePanel` |

**Optional API tightening:** `useGameIdentityReset({ …, invalidate })` may accept the invalidate function and call it **before** `onReset`, so identity paths cannot forget the bump. Manual reset and mode switch still call `invalidate()` in the game (or a tiny shared `resetGameSession()` helper if one is introduced). Do **not** put mode-switch logic inside `useGameIdentityReset`.

**Tests:** see §9.1b — coverage must include mode-switch and new-game late-callback cases, not only account switch.

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
  /**
   * Min breakpoint at which board column and side panel sit side-by-side.
   * Default: 'lg' (1024px) — Chess / Xiangqi / Jungle.
   * Shogi: 'xl' (1280px) — see §5.1.1.
   */
  sideBySideFrom?: 'lg' | 'xl';
};
```

Structure:

```
<div>  <!-- Chess island root classes; nested under GamePageLayout's max-w-6xl -->
  <header> title + subtitle </header>
  {banner}
  <div class="flex flex-col gap-6 {sideBySideFrom}:flex-row ...">
    {boardColumn}
    {sidePanel}
  </div>
</div>
```

Chess cutover is behavior-preserving: same classes, same structure extracted into the component (`sideBySideFrom='lg'`).

#### 5.1.1 Shogi width / stacking (required — escape hatch is not enough)

**Problem:** `GamePageLayout` caps content at `max-w-6xl` (1152px). Shogi AI mode renders **two** `ShogiHand` panels at `w-48` each (~192px) flanking the board, plus `BoardSidePanel` at `lg:w-72` (~288px). Naively applying Chess’s `lg:flex-row` puts hands + board + side panel in one row inside 1152px and overflows/crushes at 1024px. A custom `boardColumn` only reorders content **inside** the board column; it does **not** fix the parent row (board column + side panel).

**Required Shogi rules:**

1. **`GamePlayLayout` for Shogi uses `sideBySideFrom="xl"`** — side panel stacks **below** the board row at `lg` (1024px); side-by-side only from `xl` (1280px).
2. **Hands layout is Shogi-owned** (custom board column is fine): prefer a layout that remains usable at 1024px (e.g. hands flank the board only when there is room; otherwise stack hands above/below the board). Exact DOM is an implementation choice so long as tests below pass and promotion modal still works.
3. **Do not widen `GamePageLayout` globally** for this tier unless a measured Shogi-only page override is clearly needed after stacking is applied; prefer stacking over fighting the outer `max-w-6xl`.
4. **Layout tests (required):** viewport assertions at **1024×800** and **1280×800** for `/shogi` — no horizontal page overflow (`document.documentElement.scrollWidth <= viewport`), board and both hands visible/interactable, side panel mode toggles visible (stacked or beside per breakpoint). Chess layout tests at 1024 remain the baseline for the default shell.

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

**Escape hatch (decision B):** games that need a different order pass a custom `boardColumn` node into `GamePlayLayout` instead of using `BoardColumn`. **Shogi width is not solved by this hatch alone** — see §5.1.1.

### 5.3 `BoardSidePanel` (existing)

API unchanged. All four games put:

| Mode     | Contents                                                             |
| -------- | -------------------------------------------------------------------- |
| AI       | AI-side `<select>` (variant labels) + `AIStatusPanel` + instructions |
| Tutorial | `DemoSelector` + `TutorialInstructions`                              |

AI **side/color** stays in the side panel (Chess pattern), **not** in `SidebarAIConfig`.

### 5.3.1 AI-side selector behavior (required after dialog removal)

Today’s behaviors differ:

| Surface                      | AI-side control                                                                                                                                                                                                                                    |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Chess `BoardSidePanel`       | Always visible in AI mode; **`disabled={gameActive}`** while a game is in progress; stable `id` / label (`chess-ai-side` / “AI plays”)                                                                                                             |
| Non-chess `AISettingsDialog` | Side control lives **inside the dialog**; mode toggle (and thus the settings button) is often **hidden after start** (`showModeToggle = tutorial \|\| !hasGameStarted`), so the side cannot be changed mid-game because the entry point disappears |

After convergence the side panel (and its AI-side select) is **always mounted** in AI mode (Chess pattern). **Do not** leave the select enabled mid-game on Xiangqi/Shogi/Jungle — that would be a behavior regression vs “cannot change side once started.”

**Required for all four games:**

1. AI-side `<select>` lives in `BoardSidePanel` AI mode content.
2. **`disabled` when the game is active** — use the same notion Chess uses (`gameActive`, or equivalent “game started and not over” flag the game already maintains). Re-enabled after reset / new game / identity reset.
3. **Stable accessible wiring per variant:**
   - `id`: `{variant}-ai-side` (e.g. `xiangqi-ai-side`, `shogi-ai-side`, `jungle-ai-side`; Chess keeps `chess-ai-side`)
   - `<label htmlFor={id}>` with clear text (“AI plays” or existing localized labels)
4. Options keep existing variant labels (White/Black, Red/Black, Sente/Gote, Red/Blue).
5. Provider/model remain in `SidebarAIConfig` only (rail may stay usable mid-game as today on Chess — out of scope to lock mid-game).

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
3. AI mode: AI-side select per §5.3.1 (disabled when active, stable ids) + `AIStatusPanel` (+ instructions where Chess has them)
4. Prefer `GamePlayLayout` `banner` for hydrate/provider errors
5. Ensure the corresponding `*.astro` page uses `GamePageLayout` (Jungle: replace inlined accent markup — §3.2)
6. Shogi: `sideBySideFrom="xl"` + hands layout per §5.1.1

## 7. Accent fix (capture indicators)

### 7.1 Problem

Capture **indicators** hardcode `border-xiangqi` on non-xiangqi surfaces in more than just board overlays:

| Location                                                    | Wrong usage         | In scope?                                                                                           |
| ----------------------------------------------------------- | ------------------- | --------------------------------------------------------------------------------------------------- |
| `ChessBoard` / `ShogiBoard` / `JungleBoard` capture rings   | `border-xiangqi`    | **Yes** — fix to variant accent                                                                     |
| `XiangqiBoard` rings / lines                                | `border-xiangqi`    | Keep (correct)                                                                                      |
| `AIGameInstructions` capture legend swatch                  | `border-xiangqi`    | **Yes** — pass variant accent (or accept `captureSwatchClass`) so the legend matches the board ring |
| Shogi inline capture legend (`ShogiGame` “Captures” swatch) | `border-xiangqi`    | **Yes** — same as instructions; use shogi accent                                                    |
| `ShogiHand` gote border `border-xiangqi/40`                 | player-color coding | **No** — same class of intentional multi-palette player tint as Jungle red/blue (§7.3)              |

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

/** Small legend swatches (AIGameInstructions, inline tips) — border color only */
export const CAPTURE_SWATCH: Record<GameVariant, string> = {
  chess: 'border-2 border-chess rounded',
  xiangqi: 'border-2 border-xiangqi rounded',
  shogi: 'border-2 border-shogi rounded',
  jungle: 'border-2 border-jungle rounded',
};
```

Preserve existing board ring thickness differences (chess/xiangqi `border-4`, shogi/jungle `border-2`) unless a later visual pass intentionally unifies them.

`AIGameInstructions` gains a required `variant: GameVariant` (or `captureSwatchClass: string`) so the capture legend is not hard-coded to xiangqi. Call sites pass the page’s variant.

**Success criterion for accents:** board capture overlays **and** capture-legend swatches match the page variant. Player-tint borders are out of scope.

### 7.3 Out of scope for accents

- Jungle **player-tint** classes that use `xiangqi` / `shogi` tokens for red vs blue pieces/traps (`bg-xiangqi/15`, `border-shogi/40`, etc.)
- `ShogiHand` gote/sente border colors used as **side identity**, not capture indicators

## 8. Migration order (Approach 1)

1. Add hooks + `GamePlayLayout` / `BoardColumn`; unit-test hooks; extend `hooks/index.ts` barrel (§4.0).
2. Adopt hooks + layout on **Chess** (behavior-neutral refactor); **keep ChessGame.test.tsx** identity-reset / stale-AI coverage green.
3. Migrate **Xiangqi** → shell + side-panel AI side; remove dialog from that file; rewrite **xiangqi-ai** E2E dialog steps (§9.2); add §9.1b component tests.
4. Migrate **Shogi** (`sideBySideFrom="xl"`, hands layout per §5.1.1); rewrite **shogi-ai** E2E + 1024/1280 layout tests; add §9.1b tests.
5. Migrate **Jungle** (island shell + `jungle.astro` → `GamePageLayout`); add §9.1b tests.
6. Flip AppShell to `isGamePage` for SidebarAIConfig (if not done path-by-path); rewrite **critical-user-journeys** AI-settings steps; delete unused files; comment cleanup.
7. Board accent map (`lib/board-accents.ts`) + board component updates (can land with or right after layout migration so visual QA is once).

Land as one PR if reviewable, or a short stack with the above commit order. E2E rewrites land **with** the game they depend on (not as a forgotten follow-up).

## 9. Testing

### 9.1 Unit — hooks

- `useGameIdentityReset`: fires on logout and user-id change; does not fire on mount or first login. **These tests only prove _when_ the hook fires** — they do not prove each game’s `onReset` body is correct (§9.1b). If the hook accepts `invalidate`, assert it is invoked on fire.
- `useAiMoveGenerationToken`: `invalidate` bumps gen; `isStale` true only when requestId set and mismatched.
- `useGameDebugOutcomes`:
  - win/loss call `setOutcome` with `status` + `currentPlayer`
  - **draw calls `setOutcome` with `status` only** (no `currentPlayer` key)
  - registers `__PROCYON_DEBUG_<VARIANT>_TRIGGER_WIN__` only (not `_STATE__` / `_TRIGGER_PROMOTION__`)
  - `onPrepareTriggerWin` invoked before win when provided
  - **Shift+D** toggles `showDebugWinButton` in DEV (listener registered/cleaned up)

### 9.1b Unit — caller obligations (invalidation + stale AI)

Every path that abandons an in-flight AI turn must `invalidate()` (§4.6). Hook fire tests alone stay green if a migrated game forgets cleanup.

**Required coverage:**

| Coverage                                                                                                                                           | Notes                                                                                                                         |
| -------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| **Preserve** existing Chess integration tests in `ChessGame.test.tsx` (identity-change re-enables AI-side select; AI gen stale / requestId guards) | Do not delete or weaken these when extracting hooks                                                                           |
| **Identity change** (all four games after migration)                                                                                               | Account-switch mid-game resets local lock/state; late AI callback with stale `requestId` does not apply board/error updates   |
| **Mode switch** (all four)                                                                                                                         | After `toggleToMode` / BoardSidePanel mode change mid-AI-turn, a late callback must not apply; gen must have been invalidated |
| **Manual reset / New Game** (all four)                                                                                                             | Same late-callback guarantee after Start→play→New Game (or Reset)                                                             |
| Prefer **parameterized** helpers / `test.each` over copy-pasted suites                                                                             | Shared fixture for “schedule stale AI apply after action X”                                                                   |

Optional: `useGameIdentityReset` takes `invalidate` and calls it so identity paths cannot skip the bump; mode-switch and manual-reset still need component tests.

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
- **Shogi layout:** 1024px and 1280px viewports — no horizontal overflow; hands + board usable; side panel present (stacked at 1024, side-by-side at 1280) — §5.1.1.
- AI-side select: visible in AI mode with stable label; **disabled after Start** until reset (sample at least Chess + one non-chess).
- Optional jungle smoke if cheap.
- Assert `SidebarAIConfig` (or mobile AI toggle) on a non-chess game page at desktop width.

### 9.4 Manual smoke

Each game: start AI game, switch provider in rail, change AI side in panel, logout / identity switch resets board, capture ring color matches page accent bar.

## 10. Success criteria

1. All four game islands use `GamePlayLayout` + board column chrome + `BoardSidePanel`.
2. All four `*.astro` game pages use `GamePageLayout` (including Jungle).
3. `SidebarAIConfig` on all game routes; no game page mounts `AISettingsDialog`.
4. Shared hooks used by all four games; no remaining copy-pasted identity-reset / debug-win / Shift+D blocks.
5. Capture rings **and** capture-legend swatches use correct variant accents (§7); player-tint borders unchanged.
6. AI-side selects disabled while game active; stable `{variant}-ai-side` ids/labels (§5.3.1).
7. Shogi usable at 1024 and 1280 without horizontal overflow (§5.1.1).
8. `AISettingsDialog`, `GameScaffold`, `GameModeToggle` deleted; comments updated.
9. Hook barrel exports include new hooks + `useAIConfigHydration`; migrated games import consistently.
10. E2E suites that targeted `⚙️ AI Settings` are rewritten for `BoardSidePanel` + `SidebarAIConfig` and pass (§9.2).
11. Chess identity-reset / stale-AI component tests preserved; all variants cover identity **and** mode-switch/new-game invalidation (§9.1b).
12. Unit + relevant E2E green; no intentional changes to rules, AI adapters, or play-history save semantics beyond where config UI lives.

## 11. Out of scope

- Tier 2 engine/board primitives (`Position`, `GridBoard`, chess shallow `copyBoard`, duplicate `algebraicToPosition`) — HPA-154
- Tier 3 AI adapter / rule-guardian dedup — HPA-156
- Generic AI-turn runner or near-generic `GameSession`
- Changing Jungle red/blue player color tokens that intentionally reuse xiangqi/shogi palettes
- Puzzles, profile, play-history page redesign
- New product features (multiplayer, new variants, etc.)

## 12. Risks

| Risk                                                   | Mitigation                                                                                                                  |
| ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| Auth identity reset omits gen invalidation             | Hook contract + optional hook-owned `invalidate`; **component-level** tests for identity, mode-switch, and new-game (§9.1b) |
| Mode-switch / reset forgets gen bump after refactor    | §4.6 checklist; late-callback tests after mode change and New Game                                                          |
| Debug globals break E2E                                | Keep `__…_TRIGGER_WIN__` via the shared hook; leave `_STATE__` / `_TRIGGER_PROMOTION__` in game components                  |
| Name collision `GameLayout` / `GamePageLayout`         | New island shell is **`GamePlayLayout`**; page wrapper stays `GamePageLayout` (§3.2)                                        |
| `setGameState` type / draw overwrites player           | `setOutcome` with optional `currentPlayer`; draw omits player (§4.3)                                                        |
| Shogi overflow at `lg`                                 | `sideBySideFrom="xl"` + hands stacking rules + 1024/1280 tests (§5.1.1)                                                     |
| AI side changeable mid-game after always-visible panel | Disable select when game active; stable a11y ids (§5.3.1)                                                                   |
| E2E still clicks deleted dialog                        | Mandatory rewrite of xiangqi-ai / shogi-ai / critical-user-journeys (§9.2)                                                  |
| Accent “fixed” only on boards, legends still wrong     | Capture rings + legend swatches + `AIGameInstructions` variant prop (§7)                                                    |
| Duplicate provider UI mid-migration                    | Hard cutover rule §6.2                                                                                                      |
| Large PR review cost                                   | Stacked commits or PRs per migration step                                                                                   |

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
- `apps/web/src/components/game/AIGameInstructions.tsx` — variant/swatch prop for capture legend
- `apps/web/src/components/AppShell.tsx`
- `apps/web/src/pages/jungle.astro` (use `GamePageLayout`)
- `apps/web/e2e/xiangqi-ai.spec.ts` — remove `⚙️ AI Settings` / dialog flows; BoardSidePanel + SidebarAIConfig
- `apps/web/e2e/shogi-ai.spec.ts` — same + 1024/1280 layout assertions (§5.1.1)
- `apps/web/e2e/critical-user-journeys.spec.ts` — same for non-chess AI settings steps
- `apps/web/e2e/chess-layout.spec.ts` and/or new layout assertions for xiangqi/shogi as needed
- `apps/web/src/components/ChessGame.test.tsx` — preserve identity-reset / stale-AI coverage through hook adoption
- New or extended `*Game` tests for all variants: identity, mode-switch, new-game invalidation (§9.1b)

**Unchanged (layer remains)**

- `apps/web/src/components/GamePageLayout.tsx` — still the page accent wrapper

**Deleted**

- `apps/web/src/components/ai/AISettingsDialog.tsx`
- `apps/web/src/components/game/GameScaffold.tsx`
- `apps/web/src/components/game/GameModeToggle.tsx`
