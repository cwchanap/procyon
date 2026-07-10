# Tier 1 — Hook Adoption & Bug Fixes (Design Spec)

**Status:** Approved (pending spec review)
**Date:** 2026-07-08
**Project:** [procyon](https://linear.app/cwchanap/project/procyon-b82f2cc99230)
**Related:** HPA-154 (Tier 2), HPA-155 (Tier 4), HPA-156 (Tier 3)

## 1. Goal

Make the existing-but-bypassed AI-config store (`lib/ai/ai-config-store.ts`) and play-history hook (`hooks/usePlayHistory.ts`) the single canonical mechanisms across all four game components (chess, xiangqi, shogi, jungle). Centralize the diverged `opponentLlmId` mapping. Fix the drift bugs that live in this layer. Delete the inline copies and the now-redundant `useGameAI` hook.

**Guiding principle (approved):** _Normalize to one behavior._ Where the shared abstraction and a game's current inline code disagree, pick the best version and apply it everywhere — rather than preserving each game's quirks.

## 2. Background & root cause

A codebase survey found that shared abstractions already exist but are bypassed:

- `hooks/useGameAI.ts` (253 lines) — implements provider-change handling, but **no game component imports it**. Each component inlines its own `handleProviderChange` (Xiangqi's is ~97 lines and lacks the AbortController/request-token race protection the hook has).
- `hooks/usePlayHistory.ts` (145 lines) — implements auto-save-on-game-end, but **no game component imports it**. Each component inlines a ~60-line save effect.
- `lib/ai/storage.ts` — exposes `fetchAIConfigList` / `fetchFullAIConfig` / `loadAIConfigWithProviders`. The components and `useGameAI` re-implement these fetches inline instead of calling them.
- `lib/ai/ai-config-store.ts` — a mature `useSyncExternalStore`-based store with generation-token staleness protection, sanitized localStorage persistence, and `availableProviders`/`hydrated`/`hydrateError` state. **Only ChessGame uses it.**

Three competing config mechanisms coexist: (1) the store, (2) `useGameAI`, (3) inline local state. Duplicated copies have already silently diverged into bugs.

## 3. Approach

**Approach A (approved): Generalize the store, adopt everywhere.**

The store is the most robust mechanism and already battle-tested in ChessGame. Make it the single source of truth. Delete `useGameAI` (subsumed). Fix `usePlayHistory` to delegate to shared helpers and adopt it in all four games.

## 4. Architecture: config-only store

### 4.1 Store ownership

The store owns **config only** (provider / model / apiKey / enabled / gameVariant). The chess-specific slices move out:

- **`aiPlayer` (side/color):** moves to **per-component local state**. Color names differ per variant (`white|black`, `red|black`, `sente|gote`, `red|blue`), so the store must not model colors. ChessGame currently reads `aiPlayer` from the store via `useAIPlayer()`; it will read it from local state like the other three games.
- **`gameActive`:** moves to **per-component local state**. It was a chess convenience for disabling the sidebar AI-player select mid-game. Each component owns its own "game in progress" flag.

### 4.2 Store API after generalization

Exported from `lib/ai/ai-config-store.ts`:

- State: `useAIConfig()` → `{ config, availableProviders, hydrated, hydrateError }`
- Actions: `hydrate()`, `rehydrate()`, `setProvider(provider)`, `setModel(model)`, `setConfig(patch)`, `resetAIConfigStore()`
- Internal: `subscribeConfig` / `getConfigSlice` (for `useSyncExternalStore`)

**Removed** (moved to components): `useAIPlayer`, `getAIPlayer`, `setAIPlayer`, `subscribeAIPlayer`, `useGameActive`, `getGameActive`, `setGameActive`, `subscribeGameActive`, the `aiPlayer`/`gameActive` module state, and their emitters. The `resetAIConfigStore` no longer touches `aiPlayer`/`gameActive`.

`defaultAIConfig.gameVariant` keeps `'chess'` as the literal default but is overwritten by hydrate from the active backend config.

### 4.3 Hydration ownership & component adoption

**Hydration is app-wide, owned by `AppShell` — not per-component.** `AppShell.tsx` calls `hydrate()` once on mount for authenticated users on any game page (`/chess`, `/xiangqi`, `/shogi`, `/jungle`). `/ai-config/:id/full` returns the user's raw provider API key, so hydration is gated on auth + game-page to avoid 401s and unnecessary key fetches on non-game pages. No game component calls `hydrate()` itself; this guarantees hydration occurs exactly once and all components reading `useAIConfig()` see the hydrated store. (The plan doc §"XiangqiGame adoption" and the `AppShell.tsx` implementation already reflect this; this section is reconciled to match.)

All four game components:

1. Read `const { config: aiConfig, hydrated, hydrateError } = useAIConfig()` — relying on `AppShell`'s app-wide `hydrate()` (no per-component hydrate call).
2. Call `setProvider(provider)` on provider change (returns a user-facing error string or `null`) and `setModel(model)` on model change — replacing inline `handleProviderChange` / `loadAIConfig()` effects.
3. Hold `aiPlayer` and `gameActive` as local `useState`.

XiangqiGame, ShogiGame, JungleGame drop their inline `loadAIConfig()` effects (~13 lines × 3) and inline `handleProviderChange` flows. ChessGame drops its `useAIPlayer()`/`useGameActive()` reads in favor of local state.

## 5. Play-history unification

Adopt `hooks/usePlayHistory.ts` in all four games, with these fixes folded in:

1. **Real `env`:** replace the inline divergent `const env = { PUBLIC_API_URL: import.meta.env.PUBLIC_API_URL || 'http://localhost:3501' }` with `import { env } from '../lib/env'`. (The inline version lacks the `/api` suffix and the production localhost-guard that `lib/env.ts` applies.)
2. **Shared `resolveOpponentLlmId`:** replace the internal `getOpponentLlmId` (the divergent copy missing the `gemini` branch) with the centralized helper (§6).
3. **Debug-save-counter support:** add an opt-in `debugVariantKey?: string` option. When set, the hook bumps `window.__PROCYON_DEBUG_<KEY>_SAVE_COUNT__` before the fetch — preserving the debug affordance all four games currently have, from one implementation.
4. **Standard guards:** the auto-save effect requires `gameMode === 'ai' && gameStarted` (ChessGame was missing this guard — bug fix §7.3).

Each game passes `{ gameVariant, gameStatus, aiPlayer, aiConfig, moveCount, getWinnerColor, debugVariantKey }` and deletes its ~60-line inline effect.

## 6. `resolveOpponentLlmId` centralization

New pure helper in `lib/ai/opponent-llm.ts`:

```ts
export type OpponentLlmId = 'gpt-4o' | 'gemini-2.5-flash';
export function resolveOpponentLlmId(
  provider: string,
  model: string
): OpponentLlmId;
```

Mapping rule (preserving existing component behavior): `gpt-4o` family → `'gpt-4o'`; **all other providers** (gemini, anthropic, openrouter, chutes, …) → `'gemini-2.5-flash'`. This is an opponent-rating bucketing helper with a fixed 2-value codomain; semantic accuracy of the bucket label is out of scope — this tier only consolidates the 5 diverged copies into one. Consumed by `usePlayHistory`. Deleted: the 5 inline copies (4 game components + the hook's internal `getOpponentLlmId`) and the mirrored copy in `usePlayHistory.test.ts` (which will import the real function instead).

## 7. Bug fixes in scope

| #   | Bug                                                                                                       | Fix                                                                                                                              |
| --- | --------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| 7.1 | `getOpponentLlmId` returns wrong default (5 diverged copies; hook version missing `gemini` branch)        | §6 single source                                                                                                                 |
| 7.2 | Shogi `isGameOver` missing `stalemate` check                                                              | Unified via `usePlayHistory`'s `isGameOver` (covers checkmate/stalemate/draw; harmless for shogi which never produces stalemate) |
| 7.3 | ChessGame play-history effect lacks `gameMode==='ai' && gameStarted` guard (would fire in human-vs-human) | `usePlayHistory` standard guard                                                                                                  |

## 8. Deferred bugs (tracked in other tiers)

The following surveyed bugs are engine/board-layer, not hook-layer, and are tracked under their respective tiers:

| Bug                                                                                | Location                                           | Tracking ticket  |
| ---------------------------------------------------------------------------------- | -------------------------------------------------- | ---------------- |
| Chess `copyBoard` is shallow (mutates original pieces)                             | `chess/board.ts:85-89`                             | HPA-154 (Tier 2) |
| Duplicate `algebraicToPosition` shadows board's version (different error behavior) | `chess/game.ts:233-245` vs `chess/board.ts:96-113` | HPA-154 (Tier 2) |
| `border-xiangqi` accent class hardcoded in Chess/Shogi/Jungle board components     | all 4 board `.tsx`                                 | HPA-155 (Tier 4) |

## 9. Deletions (estimated)

| Item                                                 | ~Lines                                                 |
| ---------------------------------------------------- | ------------------------------------------------------ |
| Inline `handleProviderChange` (Xiangqi ~97 + others) | ~130                                                   |
| Inline play-history effects × 4                      | ~240                                                   |
| Inline config-load effects × 3                       | ~40                                                    |
| `hooks/useGameAI.ts` + `hooks/useGameAI.test.ts`     | ~253 + test                                            |
| Inline `getOpponentLlmId` × 5 + mirrored test copy   | ~45                                                    |
| ChessGame `useAIPlayer`/`useGameActive` store reads  | ~10                                                    |
| **Total removed**                                    | **~700**                                               |
| Net new logic                                        | `opponent-llm.ts` (~15) + store generalization surgery |

Update `hooks/index.ts` to drop the `useGameAI` export.

## 10. Out of scope

- Extracting React lifecycle/layout hooks (`useGameLifecycle`, `GameLayout`, `BoardGrid`) — Tier 4 (HPA-155).
- Shared game-core primitives (`Position`, `GridBoard`, move-gen) — Tier 2 (HPA-154).
- AI adapter / rule-guardian dedup — Tier 3 (HPA-156).
- Engine-layer bug fixes (§8).
- Any change to genuinely variant-specific rules.

## 11. Testing

- **Unit:** add tests for `resolveOpponentLlmId`; update `usePlayHistory.test.ts` to import it; update `ai-config-store` tests for the removed `aiPlayer`/`gameActive` slices.
- **Existing safety net:** per-variant `*.test.ts` suites and the mocked-AI E2E specs (`chess-ai`, `xiangqi-ai`, `shogi-ai`, `critical-user-journeys`, `rating-system`) must stay green.
- **Verify:** `cd apps/web && bun test` and `bun run test:e2e` for the affected specs.

## 12. Rollout

Land as a single PR (all four games converge on the same mechanisms). If the change feels large, an acceptable intermediate is to migrate one game at a time behind the existing tests, but the end state is all four on the store + `usePlayHistory` with `useGameAI` deleted.
