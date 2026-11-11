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
| Event feed becomes empty on reload | The hook initializes `eventFeed` to `[]` and explicitly clears it on `resume()`; saved actions omit the complete presentation/feed object. | Persist a **bounded last 50 committed feed entries** alongside the existing active snapshot, and restore them as static history without replaying animations, audio, chatter or rules. |
| Mute resets on reload | `AeroplaneGame.tsx` reads the preference after hydration; `sound.ts` writes `procyon.aeroplane.muted` to localStorage. Playwright already tests mute/unmute across reload. | Verify on the deployed site and retain current behavior if green. No new settings store. |
| Roll die appears enabled in AI turns | `AeroplaneBoard.tsx` correctly passes `disabled` except for human `awaiting-roll`, while the shared `Button` remains gold at reduced opacity. `executeRoll` independently guards the actor. | Give this specific control a clearly inactive visual and keep the existing native disabled/engine guard. |
| Conflicting status / stale Red die | Board and status render separate turn text. `rollPresentation` deliberately retains the previous committed face while a paced AI turn begins. | Present one consistent authoritative turn message, and label a previous player's die as **last roll**, not the current player's roll. No turn-engine or animation rewrite. |
| Aeroplane intro text truncated | The reported phrase is the introduction in `AeroplaneGame.tsx`, not `AeroplaneSetup.tsx`; the current text has no explicit truncation class. | Reproduce at the reported viewport and narrow/mobile widths. Fix actual clipping/wrapping only if it remains. |
| Homepage says four games | `index.astro` literally says “Four games” and omits Aeroplane; five cards are available. | Say **five** and describe the different Aeroplane AI model accurately; update the pinned homepage test. |
| Standard Chess Start looks broken while loading | `ChessGame.tsx` disables Start until `rivalSetup.resolved` / unblocked, but overrides the `GameControls` loading label with “▶️ Start”. | While resolving, show an explicit “Preparing opponent…” label/status. For a persistent block, expose the existing `startBlockedReason`; never enable Start prematurely. |
| /login has no visible sign-in control | `LoginForm` mounts `GoogleSignInButton`; the actual button is injected by the external GIS script loaded in `Layout.astro`. `env.ts` **throws during production import** when `PUBLIC_GOOGLE_CLIENT_ID` is missing, potentially preventing the island from hydrating at all. GIS failure only surfaces after polling. | Check production client-ID/build config and GIS loading. Never render a silent empty control: show a visible error/retry state when unavailable and render the real GIS control when configured. Keep the existing Google-credential flow. |

## Product behavior / acceptance contract

1. **Game continuity:** A live Standard/Classic (and Sky Tycoon) game that has made moves reloads into the same config, planes, active player, phase/pending die, RNG states, and action history; no extra roll or AI move is synthesized by hydration. AI scheduling may then continue from the restored authoritative phase. Reset and new match still begin fresh, and terminal history submission remains exactly once.
2. **Recent history:** Up to the last **50** committed, user-visible feed entries survive reload in the same persisted active-match envelope. Display the saved entries immediately, in original order, without re-running animation/audio/AI or replaying past rules. Trimming older feed entries **never trims authoritative action records**. A fresh match clears the feed.
3. **Sound:** Mute survives refresh both ways; first-paint default may remain unmuted until hydration, but sound playback must honor the stored preference. Storage/browser audio errors are non-fatal.
4. **Turn clarity:** During AI turns “Roll die” is visibly disabled and cannot commit a human roll. Board/status messaging agrees on current player and phase. The face may remain visible through the existing delay, but is clearly identified as the **previous/last** roll when the actor has changed. Human awaiting-choice and no-legal-move explanations from HPA-761 remain intact.
5. **Login:** Signed-out `/login` shows a real Google sign-in control after GIS initialization on a correctly configured deployment. Missing client ID, missing/blocked GIS script, or initialization failure instead shows a legible diagnosis and reload/retry path; no blank card or misleading fake login button. No new OAuth provider or credential storage.
6. **Copy/responsive:** Homepage accurately describes five games including Aeroplane. Aeroplane introduction renders complete text without horizontal clipping on desktop and mobile. Standard Chess Start reveals why it is temporarily disabled and remains locked until its existing readiness checks succeed.

## Data/ownership and minimal change boundaries

- `useAeroplaneMatch` remains the sole owner of authoritative match commits and the single active-match localStorage envelope. Add one small **presentation-only**, bounded recent-feed field to the current envelope; build feed records at the same commit boundary so a fast reload cannot save a move without its visible log. Make it readable by the existing `AeroplaneEventFeed`, not a second persistent store.
- `presentationQueue`, die tumble, banner timers and audio cues stay ephemeral. A restored log is never submitted as newly committed events. Prefer reusing existing `AeroplaneFeedEntry` typing/formatting rather than introducing a generalized event-sourcing or replay layer. Only validate what is needed to reject malformed feed records; never invalidate an otherwise sound match solely because optional presentation data is bad.
- The engine in `game.ts` and `rules.ts`, HPA-761 no-move/capture behavior, seeded dice, and current AI pacing remain unchanged.
- The Google Identity Services widget and `signInWithGoogle` callback stay in place. The public Google client ID is deployment configuration, not a secret to commit. Missing configuration should fail visibly at the widget boundary instead of throwing during module import.
- Constrain visual fixes to Aeroplane status/board, one shared turn-copy source if necessary, homepage, Chess Start label/status, and login. No global button redesign, new UI framework, additional authentication route, new art/SFX, telemetry platform, database or storage migration.

## Risk and verification questions

- **Deployment drift:** A 2026-11-04 production failure can coexist with working 2026-11-08 source. Compare the deployed build/config with the tested commit; if already fixed, record verified behavior rather than write redundant code.
- **Storage timing:** Commit state + recent feed atomically in the existing envelope. The unanimated feed on reload must not duplicate when AI play resumes. Keep the latest 50 *display* entries; do not cap saved `actions`.
- **Login dependency:** A blocked GIS script cannot yield a functional Google login; the product should explain the failure, while actual sign-in requires a correctly configured client ID and reachable GIS script.
- **Layout:** The reported truncation is not evident from the current class names; require a reproducible browser viewport before modifying layout.

## Non-goals

No gameplay mechanics overhaul, auth-provider replacement, data migration pipeline, full historical feed reconstruction from action logs, background synchronization, multi-tab arbitration, global CSS overhaul, or speculative fixes to issues not reproduced on the tested revision. **Implement and verify all work in this same PR after design review.**
