# HPA-362 — Aeroplane rewards/skins implementation plan

**Date:** 2026-10-28  
**Issue:** https://linear.app/cwchanap/issue/HPA-362  
**Design:** [2026-10-28-hpa-362-aeroplane-rewards-design.md](../specs/2026-10-28-hpa-362-aeroplane-rewards-design.md)

This is a **single PR**: these planning docs are the first commits; all implementation and verification stay on this branch. No work on HPA-437 asset generation in this PR.

## 0. Preserve the known behavior

Before editing runtime code, run existing Aeroplane controller, board and API play-history tests. Reuse existing fixture helpers and test mocks. In particular, retain the successful terminal save's one-POST behavior, its 401 retry budget, its snapshot clearing guard, and all Standard/Tycoon deterministic rule outcomes.

Suggested baseline checks:

```sh
bun test apps/web/src/hooks/useAeroplaneMatch.test.ts
bun test apps/web/src/components/aeroplane/AeroplaneGame.test.tsx
bun test apps/api/src/routes/play-history.test.ts
```

## 1. Add deterministic reward math and catalog

**Files**
- New: `apps/web/src/lib/aeroplane/rewards.ts`
- New: `apps/web/src/lib/aeroplane/rewards.test.ts`
- Reuse types in `apps/web/src/lib/play-history.ts`; do not edit the API contract.

**Work**
- Define small, explicit `StarBreakdown` and reward input types. Implement the win/captures/finished/net-Tycoon-coins formula specified in the design (with both caps).
- Define the five stable skin IDs with thresholds, a pure `getUnlockedSkins(stars)` helper, and an exhaustive list for selector rendering.
- Map server rows (`gameId`/`opponentEngineId`/`status`/`details`) through a narrow runtime check to reward inputs. Allow missing legacy `mode` as Standard; skip invalid records.
- Ensure a current terminal state can project the *same* input shape without going through or mutating the submission pipeline.

**Tests:** table-driven exact star totals, caps, mode/legacy/invalid filtering, other games ignored, thresholds at below/exactly/above boundaries; no calendar or RNG dependencies.

## 2. Read authenticated history and recognize a saved match

**Files**
- New: `apps/web/src/hooks/useAeroplaneProgress.ts` (+ tests) OR keep equivalent minimal state in `AeroplaneGame.tsx` if smaller.
- Modify: `apps/web/src/hooks/useAeroplaneMatch.ts` (+ existing tests).

**Work**
- Add `historySavedRevision: number` to `UseAeroplaneMatchResult`. Increment in the already-existing `useTerminalHistorySave.onSuccess` after its active terminal identity guard. Keep every existing storage cleanup and save/retry path.
- Read `useAuth` identity and use one abortable credentialed `GET /play-history` on authenticated mount, identity changes, and revision changes. Distinguish loading, loaded, and failed; show a Retry control after failure.
- Sum only **server-returned** qualifying records. Do not optimistically add local terminal stars to lifetime totals.
- Read/write selected skin from user-scoped localStorage with guarded access. Use `classic` whenever unauthenticated, loading/failed, or the stored selection is not currently unlocked. Switching users resets immediately; do not fetch when signed out.
- Do not change `GET /play-history` or add pagination/aggregation infrastructure in this hobby-project iteration: the current response returns all rows. Revisit only if this becomes a measured bottleneck.

**Tests:** no unauthenticated GET, older valid history counted, POST success triggers one reload, POST failure never claims an unlock, identity switch aborts stale responses and loses old selections, localStorage error fallback, and duplicate terminal renders do not double count.

## 3. Result celebration and transient combo banner

**Files**
- New: `apps/web/src/components/aeroplane/AeroplaneRewards.tsx` (+ component tests).
- Modify: `apps/web/src/components/AeroplaneGame.tsx` (+ existing component tests).

**Work**
- Calculate the reward preview from terminal `activeMatch` and show a prominent panel with winner, count-up, human captures/finished stats, star breakdown and next unlock. On guests, show per-match reward only.
- Use an animation effect that keys to match identity (e.g., `startedAt` + `rootSeed`), lasts about 700 ms, and cancels on reset/unmount. Missing rAF or reduced-motion renders the exact final number immediately. Only final text is in the live region.
- For latest human `eventFeed` entry, show "Double capture!"/"Triple capture!" if that single resolved move captured >= 2; otherwise show a coin-swing banner when a Tycoon action causes net >= 5 coins change for the human. Remove after a short, cancelable timer or on newer event/reset. The feed is not authoritative for final rewards.
- Use existing Panel/Button components and typography, no modal and no new animation scheduler.

**Tests:** both win and loss summaries, no counts on unfinished matches, reduced-motion/fallback, genuine multi-capture vs accumulated captures, Sky Tycoon effect case, timer cleanup/reset and accessible output.

## 4. Skin picker and all board glyph paths

**Files**
- Modify: `apps/web/src/components/aeroplane/AeroplaneSetup.tsx`
- Modify: `apps/web/src/components/aeroplane/AeroplaneBoard.tsx`
- Modify: `apps/web/src/components/AeroplaneGame.tsx`
- Update: existing Setup/Board/Game tests.

**Work**
- Present selected/locked placeholder skins and star thresholds in setup only for signed-in users. Keep default skin for guests. Selection does not alter match setup, `rulePreset`, game config, or snapshots.
- Pass the selected skin ID as a render-only board prop. Thread the prop through committed planes, mover, capture ghost and parked victims. Only customize a plane if `plane.color === state.config.humanColor`.
- Add small SVG accent/stripe/ring marks in the central `PlaneGlyph` path while preserving team-colour fill. Keep `PLANE_SPRITE_HREFS` untouched for HPA-437; avoid a new asset catalog or generated art.
- Include a small visual skin preview that reuses the same selected look as practical (do not create an independent glyph renderer).

**Tests:** locked options disabled; threshold unlocks selectable; restored selection; non-human planes untouched; committed/animated/captured representations consistent; existing board selection, stacking and hover still work.

## 5. Integration and acceptance

- Extend signed-in terminal flow tests with a mocked/recorded successful POST followed by GET; confirm lifetime value includes the committed match exactly once.
- Test guest completion and malformed/failed history response, and seeded Standard/Sky Tycoon fixtures.
- Run unit tests, TypeScript typecheck, ESLint, build and Aeroplane Playwright E2E. Confirm terminal save/request counts, existing board interactions and snapshot/replay tests still pass.
- Verify keyboard skin picker, screen-reader result, and prefers-reduced-motion behavior.
- Update this PR summary with exact commands/results after implementation; don't mark coding complete while it is docs-only.

## Out of scope

No extra PR for this issue; no backend migration, separate currency ledger, historical reward writes, cloud-synced selected skin, gameplay balance change, auto-generated art, or new sound pack. HPA-437 is independent asset work.