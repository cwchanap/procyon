# HPA-763 — Single-PR implementation plan

**Status:** Proposed; no implementation changes in this documentation revision
**Date:** 2026-11-11
**Linear:** [HPA-763](https://linear.app/cwchanap/issue/HPA-763/match-reload-loses-the-aeroplane-chess-match-mute-doesnt-persist-login)
**Design:** [Playtest UX design spec](../specs/2026-11-11-hpa-763-playtest-fixes-design.md)
**PR policy:** **One PR for this ticket** — this draft starts with the two planning docs; append eventual fixes and tests to **this same PR**, not a second implementation PR.
**Reviewed baseline:** `f17dbf19f519703678b755381e4c42c069179229`

## Step 0 — Triage against live deployment and existing tests

- [ ] Record the exact commit/build deployed to `https://procyon.cwchanap.dev/` (if available) and the commit under test. Test in an anonymous browser without a dev fixture.
- [ ] Start a Standard/Classic/Red match, make several committed moves, record piece positions, phase, active color, action count, and recent feed, reload, then continue the match. Repeat the focused awaiting-choice scenario and an AI-turn reload. Check Sky Tycoon as an existing regression.
- [ ] Verify mute on/off through a reload in the production build. Compare against existing `e2e/aeroplane.spec.ts` tests (`reloads an awaiting-choice match`, `restores mode, coins and deck`, `persists the sound mute toggle`). **If match state and mute are already correct on current code, do not reimplement them.**
- [ ] Check signed-out `/login`: browser console errors, response for `https://accounts.google.com/gsi/client`, whether the Google client ID was available at build time, and whether the React island hydrated. Differentiate configuration error from blocked external script and OAuth rejection.
- [ ] Reproduce the Aeroplane intro clipping at desktop/mobile widths. Do not modify CSS unless measurable clipping remains.

**Exit:** Note which 2026-11-04 findings reproduce on the tested commit. Prioritize the verified login entry-point blocker, then remaining UI gaps.

## Step 1 — Persist only the recent Aeroplane display feed

**Targets:** `apps/web/src/lib/aeroplane/types.ts`, `persistence.ts`, `apps/web/src/hooks/useAeroplaneMatch.ts`; use existing `AeroplaneEventFeed.tsx` without changing copy if possible.

- [ ] Reuse the v2 active-match envelope. Add a small, optionally present `recentFeed` collection for up to **50** committed `AeroplaneFeedEntry`-compatible items. Keep authority in `state`, RNGs and `actions`; the feed is presentation only.
- [ ] Arrange move/roll-only entry construction so the active match and its associated new feed entry are saved together at the existing synchronous `commit` boundary, before board animation. Keep the existing `skipAnimationsRef` test-fixture semantics and HPA-761 no-move/capture copy. Avoid an independent second localStorage key or a second rules pass.
- [ ] Restore saved entries into the hook's feed on initial mount and `resume()`; reset/new match clears them. Assign nonconflicting IDs for newly committed entries after a restore. Do **not** push restored entries to `presentationQueue`, replay audio or recompute past `chatter`.
- [ ] Bound the serialized feed to 50 records without touching `actions`. Discard malformed optional feed data while keeping a valid authoritative match recoverable. Keep the shape validation proportional to this trusted same-origin UI cache.
- [ ] Add a focused hook/persistence test and one Playwright scenario that makes a real move, reloads, checks the exact original feed text/count and unchanged board/turn/RNG, and continues with no duplicate log entry. Reuse the existing `installFixtureOnce` helper only where deterministic randomness is necessary.

## Step 2 — Make Google sign-in discoverable and diagnosable

**Targets:** `apps/web/src/lib/env.ts`, `apps/web/src/components/GoogleSignInButton.tsx`, possibly `LoginForm.tsx`; existing GIS script in `Layout.astro`.

- [ ] Prevent a missing `PUBLIC_GOOGLE_CLIENT_ID` from throwing while importing `env.ts` in production and silently blanking the login island; show a visible configuration error at the sign-in component instead. Preserve the public build-time configuration contract and check the deployment setting without committing values.
- [ ] Keep GIS `initialize` / `renderButton` / existing `signInWithGoogle` callback. Show an accessible loading state until the widget renders; on absent/blocked GIS or failed initialization, show a bounded error and a clear retry/reload affordance. Cancel polling on unmount; no new OAuth integration or fake credential button.
- [ ] Write one deterministic component or Playwright test with a stub GIS `renderButton` for the healthy case; cover unavailable-library and missing-client-ID behavior without making real Google sign-in requests. Confirm `/login` is usable in the correctly configured deployed build.

## Step 3 — Aeroplane turn and die UI

**Targets:** `apps/web/src/components/aeroplane/AeroplaneBoard.tsx`, `AeroplaneStatus.tsx`, and the smallest shared turn-copy helper if required.

- [ ] Keep `disabled={!isHumanTurn || state.phase !== 'awaiting-roll'}` and hook actor guard. Apply scoped disabled classes to the Roll control so AI turns are visually inactive, not brass/gold. Do not alter the global button palette.
- [ ] Avoid competing board-vs-status wording: use the authoritative `state.phase` and `state.currentPlayer` in one small shared copy decision, or remove the redundant board status line. Preserve the HPA-761 live-region no-move explanation.
- [ ] If the latest `rollPresentation.color` differs from `state.currentPlayer`, label the visible die as “Last roll by …” while preserving the already committed face and the 650 ms AI pacing. Clear/settle on new roll, reset and resume. Do not infer turn ownership from the die.
- [ ] Add focused Board/Status component assertions for AI awaiting-roll/awaiting-choice, human ready/choice, pending roll from a prior seat, and the disabled button's appearance/semantics. Playwright-smoke a handoff with repeated AI turns and no accidental human rolls.

## Step 4 — Copy and Chess Start readiness

**Targets:** `apps/web/src/pages/index.astro`, `apps/web/e2e/homepage.spec.ts`, `apps/web/src/components/ChessGame.tsx`, `apps/web/src/components/game/GameControls.tsx`, and only if reproduced `AeroplaneGame.tsx` / surrounding layout.

- [ ] Replace the stale “Four games” tagline with truthful five-game copy, distinguish Aeroplane's local heuristic opponents from the other adaptive-AI variants; update the existing homepage assertion.
- [ ] For `!rivalSetup.resolved` show a visible “Preparing opponent…” Start label/status. For a blocked but resolved state expose the existing `rivalSetup.startBlockedReason` near the control; while the engine is starting retain the existing loading message. Do not bypass any `startDisabled` gates.
- [ ] Use an existing chess-rival test to simulate delayed preference/engine setup: Start remains disabled **with visible reason**, then becomes actionable when resolved. Avoid a new generic loading state machine.
- [ ] If browser reproduction confirms clipping of “race three local opponents home”, apply the smallest responsive/wrapping fix, then assert the entire sentence remains visible at the failing width. Otherwise document “not reproduced on tested SHA” and leave the intro alone.

## Step 5 — Verification and handoff

- [ ] Run from `apps/web`: `bun test src`, `bun run typecheck`, `bun run lint`, `bun run build`.
- [ ] Run the focused Playwright suite: `bunx playwright test e2e/aeroplane.spec.ts e2e/homepage.spec.ts e2e/auth.spec.ts e2e/chess-rival.spec.ts` (or narrower existing tests if full suite is costly). No live Google OAuth in CI.
- [ ] Manual smoke on desktop and mobile: signed-out login control, valid GSI configuration, visible failure state with GIS blocked, a multi-turn reload, recent feed continuity, stored mute, AI-turn disabled roll, die/turn wording, Chess Start loading reason, and full homepage/intro copy.
- [ ] Compare outcomes with the eight original findings in HPA-763, record the tested SHA and deployment status in this PR, and mark any already-fixed findings as **verified rather than re-implemented**.
- [ ] Keep this PR in draft during implementation and review. After code and checks pass, update these docs with actual results and mark the existing PR ready. **Do not create a separate implementation PR.**

## Explicit exclusions

No change to Aeroplane rules, dice/AI scheduling, HPA-761 capture/feed logic, database schema, other game variants beyond Chess Start readability, alternate authentication, full event-sourcing, art or audio production, and no new persistence service. Correct the reports with the fewest maintainable, testable changes.
