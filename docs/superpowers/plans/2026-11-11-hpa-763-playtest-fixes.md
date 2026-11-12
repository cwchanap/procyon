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
- [ ] Check signed-out `/login`: inspect browser console, GIS script loading, React hydration, and which **real vs test** public Google client ID was embedded in the deployed build. Verify `https://procyon.cwchanap.dev` is listed in that client's Google Authorized JavaScript origins. The existing `env.ts` guard fails builds with no ID; do not weaken it. Distinguish a bad ID/origin, blocked script, failed GIS initialization and OAuth rejection.
- [ ] Reproduce the Aeroplane intro clipping at desktop/mobile widths. Do not modify CSS unless measurable clipping remains.

**Exit:** Note which 2026-11-04 findings reproduce on the tested commit. Prioritize the verified login entry-point blocker, then remaining UI gaps.

## Step 1 — Reconstruct Aeroplane feed from saved actions

**Targets:** `apps/web/src/lib/aeroplane/replay.ts`, `apps/web/src/hooks/useAeroplaneMatch.ts`, their existing tests; leave `types.ts`, `persistence.ts`, the v2 envelope and synchronous save order unchanged.

- [ ] Extend the existing deterministic `replayMatch` diagnostic to return ordered **display-only** steps for committed moves and **only** rolls with no legal move: recorded action, effective resolved move (or `null`), and post-action state/turn/result needed by the formatter. A roll with legal moves must **not** emit a separate feed step; its subsequent move produces the one visible entry. Do not add a feed field, change match validation, or replay a saved match as authoritative game state.
- [ ] Extract the existing move/no-move feed entry construction (including deterministic `getChatterLine` selection, terminal win/loss copy and the HPA-761 capture/Customs semantics) into one small pure builder reused by live play and restoration. A legal roll followed by a move must yield one move entry, not an extra roll entry. Preserve production behavior and DEV fixture `skipAnimationsRef` suppression of live presentations.
- [ ] On initial mount and explicit `resume()`, derive `eventFeed` **once** from the stored actions when deterministic replay succeeds; seed `presentationIdRef.current` to the **maximum restored ID** (or the restored entry count for sequential IDs) **before new entries can append**. Reset/new match still clears the feed. Do **not** enqueue restored entries into `presentationQueue`, replay audio, fire moments/banners, or trigger AI moves from reconstruction.
- [ ] If replay is invalid or mismatches, retain the valid authoritative match and show an empty feed; add a DEV-only `console.warn` with the mismatch reason for diagnosis. Do not throw, clear the saved match, or block existing AI resume scheduling. No arbitrary 50-entry cap: match the full live feed count.
- [ ] Add a focused non-skipping round-trip hook/unit test: play a roll with legal moves plus its move (one feed entry) and a no-move roll (one feed entry), reload or call `resume()`, deep-compare feed entries excluding regenerated IDs, verify state/turn/RNG unchanged, restored IDs remain unique and later entries append once. Extend the existing awaiting-choice reload Playwright test with a feed-count assertion; avoid extra full E2E fixtures unless needed.

## Step 2 — Fix the existing Google sign-in widget's blank state

**Targets:** `apps/web/src/components/GoogleSignInButton.tsx` and its tests; keep `lib/env.ts` production build-time guard, `LoginForm.tsx`, and `Layout.astro` GIS integration unless triage shows an additional reproducible defect.

- [ ] **Retain** the existing `PUBLIC_GOOGLE_CLIENT_ID` production build failure and the component's existing missing-ID and bounded missing-GIS error handling. Check the deployed ID/origin (Step 0), not a new runtime configuration architecture.
- [ ] Show an accessible pending message (`role="status"`, e.g. “Loading Google Sign-In…”) while the existing bounded GIS polling waits for the script, and reserve approximately the button's minimum height to avoid layout shift. Remove the pending message on success/failure. Wrap `google.accounts.id.initialize` and `renderButton` in `try/catch`; a thrown initialization/render error must show the existing error UI rather than leave the card blank. Keep polling cleanup on unmount.
- [ ] Add a simple **Reload** button to the existing GIS error state. Keep the real Google `renderButton` and existing `signInWithGoogle` callback; do not create a fake login button or another auth flow.
- [ ] Add focused component tests with a stubbed `window.google.accounts.id` and fake timers: accessible pending status with reserved space, normal render clearing the pending state, missing script timeout, and a thrown `renderButton`/`initialize` error. No real Google OAuth calls; no redundant missing-client-ID test for production. Confirm the correctly configured deployed `/login` can expose the actual sign-in control.

## Step 3 — Aeroplane turn and die UI

**Targets:** `apps/web/src/components/aeroplane/AeroplaneBoard.tsx` and `AeroplaneStatus.tsx`; **no new shared helper file**.

- [ ] Keep `disabled={!isHumanTurn || state.phase !== 'awaiting-roll'}` and hook actor guard. Apply scoped disabled classes to the Roll control so AI turns are visually inactive, not brass/gold. Do not alter the global button palette.
- [ ] Export the existing `statusCopy` from `AeroplaneStatus.tsx` and call it from `AeroplaneBoard.tsx` with the same authoritative `state`, `legalMoves`, and `isHumanTurn`. Keep the board's keyboard hint (`Enter / Space`) only as a suffix when a human is choosing. Preserve the HPA-761 live-region no-move explanation.
- [ ] If the latest `rollPresentation.color` differs from `state.currentPlayer`, change the existing die label to “Last roll by …”; otherwise retain “Rolled by …”. Preserve the committed face, screen-reader wording, and 650 ms AI pacing. Reset/resume behavior stays as-is; never infer turn ownership from the die.
- [ ] Add focused Board/Status component assertions for AI awaiting-roll/awaiting-choice, human ready/choice, pending roll from a prior seat, and the disabled button's appearance/semantics. Playwright-smoke a handoff with repeated AI turns and no accidental human rolls.

## Step 4 — Copy and Chess Start readiness

**Targets:** `apps/web/src/pages/index.astro`, `apps/web/e2e/homepage.spec.ts`, `apps/web/src/components/ChessGame.tsx`, `apps/web/src/components/game/GameControls.tsx`, and only if reproduced `AeroplaneGame.tsx` / surrounding layout.

- [ ] Replace the stale “Four games” tagline with truthful five-game copy, distinguish Aeroplane's local heuristic opponents from the other adaptive-AI variants; update the existing homepage assertion.
- [ ] For `!rivalSetup.resolved` show a visible “Preparing opponent…” Start label/status. For a blocked but resolved state expose the existing `rivalSetup.startBlockedReason` near the control; while the engine is starting retain the existing loading message. Do not bypass any `startDisabled` gates.
- [ ] Use an existing chess-rival test to simulate delayed preference/engine setup: Start remains disabled **with visible reason**, then becomes actionable when resolved. Avoid a new generic loading state machine.
- [ ] If browser reproduction confirms clipping of “race three local opponents home”, apply the smallest responsive/wrapping fix, then assert the entire sentence remains visible at the failing width. Otherwise document “not reproduced on tested SHA” and leave the intro alone.

## Step 5 — Verification and handoff

- [ ] Run from `apps/web`: `bun test src`, `bun run typecheck`, `bun run lint`, `bun run build`.
- [ ] Run focused Playwright tests from `apps/web`, including the existing Aeroplane awaiting-choice reload and homepage assertions plus auth/chess-rival tests that exist in the repo; avoid guessing test filenames (`bunx playwright test e2e/aeroplane.spec.ts e2e/homepage.spec.ts` plus discovered relevant files). No live Google OAuth in CI.
- [ ] Manual smoke on desktop and mobile: signed-out login control, valid GSI ID/authorized origin, visible failure state with GIS blocked, a multi-turn reload and complete reconstructed feed, stored mute, AI-turn disabled roll, die/turn wording, Chess Start loading reason, and full homepage/intro copy.
- [ ] Compare outcomes with the eight original findings in HPA-763, record the tested SHA and deployment status in this PR, and mark any already-fixed findings as **verified rather than re-implemented**.
- [ ] Keep this PR in draft during implementation and review. After code and checks pass, update these docs with actual results and mark the existing PR ready. **Do not create a separate implementation PR.**

## Explicit exclusions

No change to Aeroplane rules, dice/AI scheduling, persisted v2 schema or save ordering, HPA-761 capture/feed semantics, database schema, other game variants beyond Chess Start readability, alternate authentication, full event-sourcing, art or audio production, and no new persistence service. Correct the reports with the fewest maintainable, testable changes.

## Outcome (2026-11-12, Step 5 verification)

**Tested SHA `91debba8` (this branch's tip, tasks 1–4). Branch not pushed/deployed; production still serves the pre-branch app baseline (exact deployed SHA unavailable — fingerprint-consistent with `f17dbf1` per triage).** All new-UI evidence below is from a local production build served by `astro preview`; full detail in the SDD scratch reports (`.superpowers/sdd/2026-11-11-hpa-763-playtest-fixes/task-5-report.md`, gitignored).

Checks (from `apps/web`): `bun test src` 2158 pass / 0 fail · typecheck clean · lint 0 errors + 61 pre-existing warnings (files untouched by this branch) · production build OK with the dummy client ID already committed in `playwright.config.ts` (guard intact: build without the ID still fails) · focused Playwright `e2e/{aeroplane,homepage,auth-basic,auth,chess-rival}.spec.ts` **42/42 pass** (no live OAuth).

Findings: **fixed + verified on the production build** — feed reconstructed across reload (9→9 / 8→8 entries, identical content), GIS pending → error + Reload flow, AI-turn Roll disabled in ink-600 (not brass) at 1280×900 and 390×844, "Last roll by …" wording, five-game homepage copy, "⏳ Preparing opponent…" → enabled Start; **verified, not reimplemented** — match/mute persistence (findings 1/3), intro not clipped (finding 6). Unknowns preserved: Google Authorized JavaScript origins, client-ID validity, OAuth success (no credentials, no real OAuth; button render is not authorization evidence), exact deployed SHA, API/Worker SHA. Pre-existing React #418/#425 hydration errors on stored-match loads (fresh loads clean) remain an unconfirmed triage hypothesis. PR ready-marking and push are handled by the controller.
