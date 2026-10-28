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
- Extend `apps/web/src/lib/play-history.ts` with exported `ServerPlayHistory` (moved from `PlayHistoryPage.tsx`) and shared `fetchPlayHistory(signal)`; do not edit the API contract.

**Work**
- Define small, explicit `StarBreakdown` and reward input types. Implement the win/captures/finished/net-Tycoon-coins formula specified in the design (with both caps).
- Define `type SkinId = 'classic' | 'contrail' | 'racer' | 'starlight' | 'ace'` and a small ordered `SKIN_CATALOG` typed against `SkinId`, with thresholds and a pure `getUnlockedSkins(stars)` helper. Use typed `SkinId` across picker, local selection parser, board prop and glyph. Test all catalog members; do not create a registry.
- Implement pure `scoreMatch({ status, details })` on one history-compatible input type (return `null` for invalid rows). Parse `ServerPlayHistory` via a narrow runtime check of `gameId`/`opponentEngineId`/`status`/`details`; allow missing legacy `mode` as Standard and skip invalid records.
- **Reuse** the existing `buildAeroplaneHistoryPayload(activeMatch)` in `useAeroplaneMatch.ts`, exported in step 2. The terminal panel calls `scoreMatch(buildAeroplaneHistoryPayload(activeMatch))`; lifetime aggregation passes the fetched row through that same scorer. Never create a second terminal-state projection.
- Add pure `deriveHumanMoment(prevState, transition, humanColor)` returning an optional notable moment: capture count >= 2 **only when the mover is human**, or positive human Tycoon coin delta >= `TYCOON_AIRPORT_PRICE` from the authoritative before/after states. Evaluate every move (including an AI move paying the human) but ignore negative deltas, especially automatic airport buys. Prefer capture if both qualify. Provide display labels for 2, 3, 4, and >=5 captures.

**Tests:** table-driven exact star totals and caps, legacy/invalid histories, other games ignored, thresholds at boundaries, plus shared scorer parity for a terminal payload and its saved row; pure moment tests for multi-capture vs accumulated captures, automatic airport purchase (-5) ignored, positive gains across exported threshold, incoming AI-to-human transfer, and labels for 4+. No calendar or RNG dependencies.

## 2. Read authenticated history and recognize a saved match

**Files**
- New: `apps/web/src/hooks/useAeroplaneProgress.ts` (+ tests); keep `AeroplaneGame.tsx` focused on composing views.
- Modify: `apps/web/src/hooks/useTerminalHistorySave.ts` (+ its tests), `apps/web/src/hooks/useAeroplaneMatch.ts` (+ existing tests), `apps/web/src/components/PlayHistoryPage.tsx` (+ existing tests), and `apps/web/src/lib/play-history.ts`.

**Work**
- Add optional `onSaved?: () => void` to `useTerminalHistorySave` and call it on **every successful** POST response while mounted, before the existing `if (generation === generationRef.current) onSuccess?.()` check. Do not alter existing snapshot ownership guards, 401 retry behavior, submission policy or other hook callers. In `useAeroplaneMatch`, increase `historySavedRevision` from `onSaved`, *not* guarded `onSuccess`, and export the existing `buildAeroplaneHistoryPayload`.
- Move `ServerPlayHistory` and the credentialed, abortable GET implementation out of `PlayHistoryPage.tsx` into `lib/play-history.ts` as `fetchPlayHistory(signal)`. Have both the page and new progression hook import the shared type/transport rather than duplicate the request. Preserve existing JSON/error handling and abort semantics.
- Reuse `useAuth` `{ loading, revalidated, isAuthenticated, user }`; fetch only after `!loading && revalidated && isAuthenticated && user?.id` (an independent auth hook can expose an unconfirmed shared-user snapshot). Read history on verified-auth mount, identity changes and `historySavedRevision` changes; distinguish waiting-for-auth/loading/loaded/failed. Show **Retry** on failed GET only; no loaded-state Refresh button. Never expose previous-user progress while auth is unverified.
- Sum only **server-returned** qualifying records. Do not optimistically add local terminal stars to lifetime totals.
- Read/write selected skin from user-scoped localStorage with guarded access and a key patterned after `usePuzzle` (`<prefix>_<userId>`). Parse stored values against `SKIN_CATALOG` before treating them as `SkinId`. Use `classic` whenever unauthenticated, unverified, loading/failed, or the stored selection is not currently unlocked. Switching users resets immediately; do not fetch when signed out.
- When a POST resolves successfully **after reset**, `onSaved` bumps revision and refreshes the server-sourced total while `onSuccess` stays suppressed; a remount fetches again normally. No polling, new POST or manual loaded-state refresh is necessary. Keep the existing success snapshot cleanup identity guard in Aeroplane unchanged.
- Do not change `GET /play-history` or add pagination/aggregation infrastructure in this hobby-project iteration: the current response returns all rows. Revisit only if this becomes a measured bottleneck.

**Tests:** `useTerminalHistorySave` calls `onSaved` but not `onSuccess` when a successful POST resolves after reset, neither callback on failed POST, and no late callback after unmount. Verify no GET during loading/unverified auth, old valid history count, success-triggered reload including the after-reset case, no optimistic unlock on failed POST, identity switch/stale-fetch abort, localStorage error fallback and no double-count on duplicate terminal renders. Verify existing `PlayHistoryPage` history/error/abort rendering using the extracted transport.

## 3. Result celebration and transient combo banner

**Files**
- New: `apps/web/src/components/aeroplane/AeroplaneRewards.tsx` (+ component tests).
- Modify: `apps/web/src/components/AeroplaneGame.tsx` (+ existing component tests).

**Work**
- Show a prominent terminal panel with winner, count-up, human captures/finished stats, star breakdown and next unlock. Calculate preview from `scoreMatch(buildAeroplaneHistoryPayload(activeMatch))`, using the same projection and scoring path as persisted history. On guests show per-match reward only. Show best notable `humanMoments` entry, or aggregate highlights when none exists.
- Use an animation effect that keys to match identity (e.g., `startedAt` + `rootSeed`), lasts about 700 ms, and cancels on reset/unmount. Missing rAF or reduced-motion renders the exact final number immediately. Only final text is in the live region.
- In `useAeroplaneMatch.applyMove`, call `deriveHumanMoment(prevState, transition, humanColor)` on every committed transition and append any qualifying entry with a monotonic ID to the single ephemeral `humanMoments: HumanMoment[]` list **before** `enqueuePresentation`. Store only notable moments, clear on reset/new match/resume, and never persist them. In `AeroplaneGame`, the **last** entry triggers a short cancelable banner; the end panel chooses the **best** entry (highest multi-capture count, else largest positive coin gain, latest tie-break). Labels: Double/Triple/Quadruple/Multi-capture (N), or "Big coin gain!". Skip animations suppresses feed presentation but must not suppress the moment list.
- Use existing Panel/Button components and typography, no modal and no new animation scheduler.

**Tests:** win/loss summaries and scorer parity, unfinished-match suppression, reduced-motion/fallback, actual multi-capture and 4+ labels, best-moment selection, banners even when Skip animations suppresses feed, positive Tycoon gain vs routine airport purchase, timer cleanup/reset and accessible output.

## 4. Skin picker and all board glyph paths

**Files**
- Modify: `apps/web/src/components/aeroplane/AeroplaneSetup.tsx`
- Modify: `apps/web/src/components/aeroplane/AeroplaneBoard.tsx`
- Modify: `apps/web/src/components/AeroplaneGame.tsx`
- Update: existing Setup/Board/Game tests.

**Work**
- Present selected/locked placeholder skins and star thresholds in setup only for signed-in users. Keep default skin for guests. Selection does not alter match setup, `rulePreset`, game config, or snapshots.
- Pass the selected skin ID as a render-only board prop. Thread the prop through committed planes, mover, capture ghost and parked victims. Only customize a plane if `plane.color === state.config.humanColor`.
- Export the existing `PlaneGlyph` from `AeroplaneBoard.tsx` and extend it with `skinId` while preserving team-colour fill. Feed the selected skin through committed, mover, capture ghost and parked render paths; keep `PLANE_SPRITE_HREFS` untouched for HPA-437.
- In the setup picker render **each option** inside a small `<svg>` using the exported `PlaneGlyph` with the selected human colour; no second glyph renderer, new skin assets or registry.

**Tests:** locked options disabled; threshold unlocks selectable; restored selection; non-human planes untouched; committed/animated/captured representations consistent; existing board selection, stacking and hover still work.

## 5. Integration and acceptance

- **Extend** the existing signed-in near-victory Playwright E2E in `apps/web/e2e/aeroplane.spec.ts` (currently asserts one POST). In its existing `page.route('**/api/play-history')` handler, mock GET to return the just-submitted row (the mocked POST itself does not persist to the DB). Assert the terminal star breakdown, POST→revision→GET refresh, and an unlocked skin; ensure the lifetime count includes this row once.
- Test guest completion and malformed/failed history response, and seeded Standard/Sky Tycoon fixtures.
- Run unit tests, TypeScript typecheck, ESLint, build and Aeroplane Playwright E2E. Confirm terminal save/request counts, existing board interactions and snapshot/replay tests still pass.
- Verify keyboard skin picker, screen-reader result, and prefers-reduced-motion behavior.
- Keep the tree runnable and run focused tests with each of steps 1–4, particularly `useTerminalHistorySave` generation/onSaved invariants alongside step 2. Update this PR summary with exact commands/results after implementation; don't mark coding complete while it is docs-only.

## Out of scope

No extra PR for this issue; no backend migration, separate currency ledger, historical reward writes, cloud-synced selected skin, gameplay balance change, auto-generated art, or new sound pack. HPA-437 is independent asset work.