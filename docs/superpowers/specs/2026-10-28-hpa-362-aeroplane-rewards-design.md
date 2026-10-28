# HPA-362 — Aeroplane match rewards and skin unlocks: design

**Date:** 2026-10-28  
**Issue:** https://linear.app/cwchanap/issue/HPA-362  
**Status:** Design proposal; implementation belongs in this same PR.

## Goal

Make a finished Aeroplane match rewarding and let signed-in players earn a small, understandable set of plane looks over repeated matches. Keep the rules, recovery, replay, AI, and rating behavior unchanged.

This is one coding ticket and **one PR**, starting with this spec and the accompanying implementation plan. HPA-437 independently owns new artwork/SFX; it does not block functional placeholder skins.

## Existing integration points

- `useAeroplaneMatch.ts` already owns terminal state, human-perspective statistics, Sky Tycoon coin balances and the existing `useTerminalHistorySave` POST lifecycle.
- `lib/play-history.ts` produces Aeroplane `details` with `capturesMade`, `planesFinished`, `humanColor`, `mode` and, for Sky Tycoon, final `coins`. The API validates these fields and stores them as JSON in `play_history.details`.
- Authenticated `GET /play-history` returns the current user's entire history, including `details` and `status`; it currently has no pagination/limit. Reuse it for now instead of introducing an endpoint or a table.
- `AeroplaneGame.tsx` composes setup, status, board and feed; `AeroplaneBoard.tsx` already centralizes committed/animated glyph rendering and has unused image slots intended for HPA-437.
- The controller has the committed `ResolvedMove.capturedPlaneIds` and Tycoon effect events **before** visual presentation. Importantly, `enqueuePresentation` returns early when Skip animations is active, suppressing `eventFeed` too; combo banners must not rely on that feed alone. Visual queue expiration is independent of the authoritative state.

## Experience

1. Play as usual. When a human move captures **two or more planes in one move**, show a brief "Double capture!" (or "Triple capture!") banner. In Sky Tycoon, also show a brief "Big coin swing!" banner if the human gains/loses at least 5 coins in a single resolved action; prefer capture text when both qualify. Banners are nonblocking, not saved, and do not affect the action/presentation timers.
2. When the match enters `finished`, show a dedicated result panel with winner, earned star total, breakdown, and stat highlights. Count the displayed number upward once over roughly 700 ms; honor reduced-motion with an immediate result. The final total is announced once via accessible text, not on every count-up frame.
3. Signed-in players see lifetime stars, the next unlock threshold, and a compact skin selector in setup. Locked options show required stars and cannot be selected. After the terminal history POST succeeds, reload history and reveal newly unlocked options. Signed-out players still see per-match stars, but no lifetime progress or persistent skin selection.
4. The selected look affects **only the human player's planes**, including committed, moving, returning and stacked glyphs. The colour identifying each player remains clear; skins change accent/outline/marking rather than replacing the owning colour. No generated assets or new sprite URLs in this ticket.

### Explicit star formula (human perspective)

Use a single pure calculation for both a live terminal match and past history rows. The formula is deliberately fixed and bounded:

| Source | Stars |
| --- | ---: |
| Human win | 10 (else 0) |
| Captures | 2 × min(capturesMade, 10) |
| Finished human planes | 3 × planesFinished |
| Sky Tycoon bonus | min(10, floor(max(0, final human coins - 10) / 5)) |
| Standard coin bonus | 0 |

Numbers must be finite nonnegative integers; a corrupt/partial historical record is skipped for lifetime calculation rather than breaking the page. `planesFinished` is within 0–4. Sky Tycoon starts with 10 coins, so the bonus rewards *net* end-of-match surplus, not the initial allotment. Show each component plainly, including that captures and Tycoon bonuses are capped.

The formula is shared and evaluated from pre-existing data, **not** stored as a new mutable wallet or a duplicate `starsEarned` field. It applies to older compatible Aeroplane history rows as well (missing pre-Tycoon `mode` means Standard). A later change to the formula would deliberately recalculate past totals; rule changes would need a separate product decision.

### Skin catalog and unlocks

Keep a tiny hard-coded catalog in the rewards module:

| ID | Lifetime stars needed | Placeholder look |
| --- | ---: | --- |
| `classic` | 0 | Existing glyph |
| `contrail` | 20 | Pale tip/contrail detail |
| `racer` | 60 | Dual racing stripes |
| `starlight` | 140 | Brass star accent |
| `ace` | 300 | Brass ring/crown accent |

Declare the IDs as a closed TypeScript union, `type SkinId = 'classic' | 'contrail' | 'racer' | 'starlight' | 'ace'`, and type an ordered `SKIN_CATALOG` against that union. Use `SkinId` (not arbitrary `string`) across stored selection parsing, setup choices, board props and glyph rendering. Keep the catalog hard-coded, not a registry; tests verify all five IDs are represented. These are visual variants of the existing SVG glyph, not five generated sprite sets. Reuse stable IDs when HPA-437 produces art. In this PR the chosen ID lives in small browser-local storage **scoped by signed-in user ID**; unlock eligibility always comes from that user's server history. A remembered locked or invalid ID reverts to `classic`. Cross-device selection syncing, database settings, and guest unlocks are out of scope.

## Data flow and boundaries

- `lib/aeroplane/rewards.ts`: plain TypeScript star breakdown, catalog/threshold helper, and a small parser to map the authenticated history response into scoreable rows. Only Aeroplane rows with expected local trio opponent and valid `win`/`loss` + stats count; ignore other variants, invalid details and draws.
- `useAeroplaneMatch`: expose a monotonically increasing **historySavedRevision** that advances in its existing `onSuccess`, **only if the terminal match is still active**. Keep its existing snapshot-clear, 401 retry and non-idempotent failure policy intact. Do not submit rewards independently. This is an active-match UI invalidation signal, not proof that every historical submission was observed by the current view.
- Implement `apps/web/src/hooks/useAeroplaneProgress.ts` (do not inline fetch, parsing, selection and retries into `AeroplaneGame.tsx`). Use `useAuth`'s `{ loading, revalidated, isAuthenticated, user }`: **only start** a credentialed `GET /play-history` when `!loading && revalidated && isAuthenticated && user?.id` (the independent `useAuth` instance may briefly expose an unconfirmed shared-user snapshot). Fetch on verified-auth mount, user switch, and `historySavedRevision` change; reuse the abortable fetch pattern in `PlayHistoryPage.tsx`. Use a user-specific localStorage key matching the simple `usePuzzle` pattern. Use an AbortController for superseded requests. Clear identity-scoped totals/selection immediately on logout, account switch, or loss of verified auth. Failure/unknown auth leaves the default skin and no claimed progress. Expose a small **Refresh progress** action for manual re-fetch from either the loaded or failed state; avoid an automatic polling/sync system.
- Compute the result panel directly from the **terminal** `activeMatch` (not the visual feed, which can be skipped). After a successful POST and subsequent GET **while the same terminal match remains active**, lifetime stars include that game exactly once because the server history is the sole source. Never add the pending live reward to a fetched history total.
- Display end-panel highlights from terminal stats. A "Double capture!" highlight must reflect an actual single move observed during this mounted match (when available), never be inferred from aggregate captures or promised after a reload.
- Expose a tiny ephemeral `recentHumanMoment` signal from `useAeroplaneMatch` when the human's resolved transition commits, **before** the optional presentation enqueue. Include a monotonic ID and capture count or net coin change, and clear on reset/new match/resume. Derive the banner from that signal, so Skip animations and reduced motion still show correct moments. Prefer a single short-lived banner timer in the React view; reset on unmount/new moment. It must not block AI, dice, movement animations, or persistence.
- Pass the selected `skinId` into `AeroplaneBoard` and down the **one existing `PlaneGlyph` path** for committed/moving/ghost/parked planes. Ensure memoized committed plane rendering tracks the new prop. Do not change authoritative `AeroplaneConfig`, action records, checksums, snapshots or Tycoon rules.

## Failure, accessibility and scope

- Signed out: result stars visible, progression hidden, default classic appearance; no new unauthenticated GET.
- History POST failure / offline: result still reflects local match, but no *claimed persistent unlock*. Existing save-failure policy stays unchanged. Failed history GET: show unavailable progress with retry; do not silently make up zero lifetime stars as an authoritative value.
- **Accepted eventual-consistency window:** if a terminal history POST is in flight when the player resets/starts a new match, `useTerminalHistorySave` deliberately suppresses that stale generation's `onSuccess`; the server can still commit it, but `historySavedRevision` will not advance. The loaded lifetime tally may remain stale until **Refresh progress**, remount, account change, or another observed successful save. This is acceptable for a hobby game; do not weaken the generation guard or add a second submission/automatic polling system to hide it. A manual refresh always re-reads the server and resolves the displayed gap once the POST completes.
- User switch: abort old GET and discard previous account's selection/progress. Storage access exceptions fall back to `classic`; no requirement for sophisticated offline reconciliation.
- Reduced motion: immediately display full stars and show combo content without animation. Assistive text includes reward breakdown, locked threshold and selected skin state. All selectors must be keyboard accessible.
- No new DB table, API write field, replay version, reward economy service, global state store, settings sync, art generation, SFX generation or anti-farming system.
- HPA-437 remains a standalone *asset-generation* task, not a second PR for this coding ticket.

## Acceptance checks

1. Star math is deterministic for wins/losses, zero captures, 2/4-plane victories, Standard and Sky Tycoon; correct net-coin bonus and both caps.
2. Old valid Aeroplane histories contribute, non-Aeroplane/corrupt histories do not, and the lifetime tally never double counts an unacknowledged POST.
3. Signed-in unlock thresholds, persistence across reload, logout/account switch, verified-auth gating, HTTP success refresh, manual refresh after the reset/late-POST window, failure/retry and guest restrictions work.
4. End panel and combo banner show accurate events without blocking or depending on presentation playback; reset and reduced-motion paths work.
5. All visual representations of human planes use the selected look while team colour and other players' planes remain intact; no rules/seed/replay/history-save regression.