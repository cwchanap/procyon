# HPA-763 — Aeroplane continuity and Procyon playtest UX fixes

**Status:** Proposed design; implementation not started
**Date:** 2026-11-11
**Linear:** [HPA-763](https://linear.app/cwchanap/issue/HPA-763/match-reload-loses-the-aeroplane-chess-match-mute-doesnt-persist-login)
**Plan:** [Single-PR implementation plan](../plans/2026-11-11-hpa-763-playtest-fixes.md)
**Baseline reviewed:** `main` at `f17dbf19f519703678b755381e4c42c069179229` (2026-11-08)

## Goal

A casual player can reload Aeroplane Chess without losing the match or its recent visible history, recognize whose turn it is, control sound reliably, and sign in through a visible Google control. Correct the playtest's misleading/obsolete site copy and disabled Start/Roll states. **Keep gameplay rules, existing storage, authentication provider, and shared UI architecture.**

This ticket combines eight findings from the 2026-11-04 live-site playtests. Those observations are valid reports about the **then-deployed site**, not proof that the same bugs still exist on the reviewed `main` revision. Confirm the live deployment before changing working code.

## Evidence and triage

| Report | Source-of-truth findings on reviewed `main` | Design decision |
| --- | --- | --- |
| Aeroplane reload loses match | `useAeroplaneMatch.ts` already reads/writes a v2 authoritative localStorage snapshot synchronously; `persistence.ts` restores state, seats, both RNG streams and actions. Playwright covers an awaiting-choice reload and Sky Tycoon reload. | First verify an ordinary, unseeded live game and deployed revision. **Do not rewrite persistence** if state/turn/RNG already survive. |
| Event feed becomes empty on reload | The hook initializes `eventFeed` to `[]` and clears it on `resume()`, but the persisted v2 snapshot already contains the full `actions` list. `replayMatch` deterministically reconstructs rolls, effective moves, and results. | **Derive display-only feed entries from saved actions on restore** using replay steps. Keep the existing save format/commit order and never replay UI animations, sounds, or gameplay authority. |
| Mute resets on reload | `AeroplaneGame.tsx` reads the preference after hydration; `sound.ts` writes `procyon.aeroplane.muted` to localStorage. Playwright already tests mute/unmute across reload. | Verify on the deployed site and retain current behavior if green. No new settings store. |
| Roll die appears enabled in AI turns | `AeroplaneBoard.tsx` correctly passes `disabled` except for human `awaiting-roll`, while the shared `Button` remains gold at reduced opacity. `executeRoll` independently guards the actor. | Give this specific control a clearly inactive visual and keep the existing native disabled/engine guard. |
| Conflicting status / stale Red die | The board duplicates the existing `statusCopy` logic in `AeroplaneStatus.tsx`. `rollPresentation` deliberately retains the previous committed face while the next seat begins. | Export and reuse `statusCopy` in the board, retaining its keyboard hint as a suffix where needed. Label the previous player's die as **last roll** when the owner differs. No turn-engine or pacing change. |
| Aeroplane intro text truncated | The reported phrase is the introduction in `AeroplaneGame.tsx`, not `AeroplaneSetup.tsx`; the current text has no explicit truncation class. | Reproduce at the reported viewport and narrow/mobile widths. Fix actual clipping/wrapping only if it remains. |
| Homepage says four games | `index.astro` literally says “Four games” and omits Aeroplane; five cards are available. | Say **five** and describe the different Aeroplane AI model accurately; update the pinned homepage test. |
| Standard Chess Start looks broken while loading | `ChessGame.tsx` disables Start until `rivalSetup.resolved` / unblocked, but overrides the `GameControls` loading label with “▶️ Start”. | While resolving, show an explicit “Preparing opponent…” label/status. For a persistent block, expose the existing `startBlockedReason`; never enable Start prematurely. |
| /login has no visible sign-in control | `LoginForm` mounts `GoogleSignInButton`, whose actual button comes from Google's external GIS script. **The existing `env.ts` guard rejects a production build without `PUBLIC_GOOGLE_CLIENT_ID`**; keep it. The component already polls for GIS with a bounded error and cancels on unmount, but shows nothing while waiting and does not catch `initialize`/`renderButton` exceptions. | Verify the deployed ID is real, its Google Authorized JavaScript origins include the site, and GIS loads. Add visible waiting feedback, catch GIS initialization/render errors, and offer reload on existing errors. Do not replace authentication or weaken the build guard. |

## Product behavior / acceptance contract

1. **Game continuity:** A live Standard/Classic (and Sky Tycoon) game that has made moves reloads into the same config, planes, active player, phase/pending die, RNG states, and action history; no extra roll or AI move is synthesized by hydration. AI scheduling may then continue from the restored authoritative phase. Reset and new match still begin fresh, and terminal history submission remains exactly once.
2. **Event-feed continuity:** All committed, user-visible move and no-legal-move roll entries are reconstructed in original order from the existing persisted `actions` list after reload (no new saved field or arbitrary 50-entry cap). This is a **read-only derivation** using deterministic replay steps; it never changes the restored authoritative match, reschedules old moves, emits audio/animations, or replays chatter side effects. A fresh match clears the feed. On replay mismatch, retain the valid match, show an empty feed, and warn with the mismatch reason in DEV.
3. **Sound:** Mute survives refresh both ways; first-paint default may remain unmuted until hydration, but sound playback must honor the stored preference. Storage/browser audio errors are non-fatal.
4. **Turn clarity:** During AI turns “Roll die” is visibly disabled and cannot commit a human roll. Board/status messaging agrees on current player and phase. The face may remain visible through the existing delay, but is clearly identified as the **previous/last** roll when the actor has changed. Human awaiting-choice and no-legal-move explanations from HPA-761 remain intact.
5. **Login:** Signed-out `/login` shows a real Google sign-in control after GIS initialization on a correctly configured deployment. A missing client ID still **fails the production build**, as today. If the script is absent/blocked or GIS initialization/rendering throws, show visible loading first, then an explanatory error and reload affordance; never leave an unexplained blank card or insert a fake login button. No new OAuth provider or credential storage.
6. **Copy/responsive:** Homepage accurately describes five games including Aeroplane. Aeroplane introduction renders complete text without horizontal clipping on desktop and mobile. Standard Chess Start reveals why it is temporarily disabled and remains locked until its existing readiness checks succeed.

## Data/ownership and minimal change boundaries

- `useAeroplaneMatch` remains the owner of authoritative match commits and the existing v2 localStorage envelope. Keep the save schema, synchronous `commit`, action history, and validation **unchanged**. Extend `replayMatch` with per-step read-only data (`action`, resolved move or null, post-action turn/result) and reuse a pure feed-entry builder for both live presentation and restoration. Persist **no additional feed field**; `AeroplaneEventFeed` continues to render the hook's `eventFeed`.
- On initial restore and explicit `resume()`, derive feed entries only after authoritative restoration and initialize future presentation IDs beyond restored IDs. Do not enqueue historical entries into `presentationQueue` or rerun audio, banners, AI or chatter effects. A replay invalid/mismatch result must **not** invalidate a valid saved match; use an empty feed and a DEV-only warning containing the reason. Keep DEV fixture `skipAnimationsRef` behavior as-is; round-trip tests should use ordinary non-skipping play.
- The engine in `game.ts` and `rules.ts`, HPA-761 no-move/capture behavior, seeded dice, and current AI pacing remain unchanged.
- The Google Identity Services widget and `signInWithGoogle` callback stay in place. **Preserve** `env.ts` production build-time `PUBLIC_GOOGLE_CLIENT_ID` validation. Confirm the deployed ID and its Authorized JavaScript origins, then improve only the existing widget's pending/error experience and exception handling; do not commit client IDs or create another auth flow.
- Constrain visual fixes to Aeroplane status/board (export `statusCopy` from the existing status component), homepage, Chess Start label/status, and login. No global button redesign, new UI framework, additional authentication route, new art/SFX, telemetry platform, database or storage migration.

## Risk and verification questions

- **Deployment drift:** A 2026-11-04 production failure can coexist with working 2026-11-08 source. Compare the deployed build/config with the tested commit; if already fixed, record verified behavior rather than write redundant code.
- **Replay mismatch/performance:** Deriving the feed on restore can fail if replay detects a mismatch or can cost time in a long match. Keep the saved match authoritative even on mismatch, surface a DEV-only reason, never duplicate entries when AI resumes, and test a realistic multi-turn history. Do not run replay on every render or introduce an arbitrary display-count cap.
- **Login dependency:** A missing client ID already stops the static production build. A deployed but incorrect/test ID, unauthorized site origin, or blocked GIS script can still leave login unusable; verify configuration and show an actionable UI error for missing/failed GIS.
- **Layout:** The reported truncation is not evident from the current class names; require a reproducible browser viewport before modifying layout.

## Non-goals

No gameplay mechanics overhaul, auth-provider replacement, new feed persistence schema, data migration pipeline, gameplay-state replay on resume, background synchronization, multi-tab arbitration, global CSS overhaul, or speculative fixes to issues not reproduced on the tested revision. **Implement and verify all work in this same PR after design review.**
