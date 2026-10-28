# HPA-362 — Aeroplane match rewards and skin unlocks: design

**Date:** 2026-10-28  
**Issue:** https://linear.app/cwchanap/issue/HPA-362  
**Status:** Design proposal; implementation belongs in this same PR.

## Goal

Make a finished Aeroplane match rewarding and let signed-in players earn a small, understandable set of plane looks over repeated matches. Keep the rules, recovery, replay, AI, and rating behavior unchanged.

This is one coding ticket and **one PR**, starting with this spec and the accompanying implementation plan. HPA-437 independently owns new artwork/SFX; it does not block functional placeholder skins.

## Existing integration points

- `useAeroplaneMatch.ts` already owns terminal state, human-perspective statistics, Sky Tycoon coin balances and the existing `useTerminalHistorySave` POST lifecycle.
- `lib/play-history.ts` defines the Aeroplane `details` contract (`capturesMade`, `planesFinished`, `humanColor`, `mode` and Sky Tycoon final `coins`) and the existing POST transport. The API validates these fields and stores them as JSON in `play_history.details`. Extract `PlayHistoryPage.tsx`'s existing GET/row type into this transport module for reuse; do not copy the request.
- Authenticated `GET /play-history` returns the current user's entire history, including `details` and `status`; it currently has no pagination/limit. Reuse it for now instead of introducing an endpoint or a table.
- `AeroplaneGame.tsx` composes setup, status, board and feed; `AeroplaneBoard.tsx` already centralizes committed/animated glyph rendering and has unused image slots intended for HPA-437.
- The controller has the committed `ResolvedMove.capturedPlaneIds` and Tycoon effect events **before** visual presentation. Importantly, `enqueuePresentation` returns early when Skip animations is active, suppressing `eventFeed` too; combo banners must not rely on that feed alone. Visual queue expiration is independent of the authoritative state.

## Experience

1. Play as usual. A human move capturing **two or more planes in one resolved move** earns a brief banner: "Double capture!", "Triple capture!", "Quadruple capture!", or "Multi-capture (N)!" for five or more. Sky Tycoon shows "Big coin gain!" for a **positive increase** of at least `TYCOON_AIRPORT_PRICE` (the existing 5-coin constant) in the human's balance during a single resolved action. This may include an AI move paying a toll **to** the human, if it reaches the threshold; routine airport **purchases are negative** and never qualify. When capture and gain both qualify, show capture text. Banners are nonblocking, transient, and do not affect any authoritative game data or timers.
2. When the match enters `finished`, show a dedicated result panel with winner, earned star total, breakdown, and stat highlights. Count the displayed number upward once over roughly 700 ms; honor reduced-motion with an immediate result. The final total is announced once via accessible text, not on every count-up frame.
3. Signed-in players see lifetime stars, the next unlock threshold, and a compact skin selector in setup. Locked options show required stars and cannot be selected. After the terminal history POST succeeds, reload history and reveal newly unlocked options. Signed-out players still see per-match stars, but no lifetime progress or persistent skin selection.
4. The selected look affects **only the human player's planes**, including committed, moving, returning and stacked glyphs. The colour identifying each player remains clear; skins change accent/outline/marking rather than replacing the owning colour. No generated assets or new sprite URLs in this ticket.

### Explicit star formula (human perspective)

Use a single pure `scoreMatch({status, details})` calculation for **both** a live terminal match and saved history rows. Reuse the existing `buildAeroplaneHistoryPayload(activeMatch)` projection for the terminal panel (export this existing builder from `useAeroplaneMatch.ts`), and feed its `status/details` into `scoreMatch`, just as history rows do. Do **not** create a second terminal-state-to-reward projection; this guarantees that a preview's stars match the stars derived from the saved row. The formula is deliberately fixed and bounded:

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

- `lib/aeroplane/rewards.ts`: plain TypeScript `scoreMatch({status, details})`, hard-coded typed skin catalog/threshold helper, a narrow parser over `ServerPlayHistory`, and pure `deriveHumanMoment(prevState, transition, humanColor)`. Only Aeroplane rows with the expected local trio opponent and valid `win`/`loss` + stats count; ignore other variants, invalid details and draws. The moment function returns an optional notable moment for **human captures >= 2** or a **positive human balance delta >= `TYCOON_AIRPORT_PRICE`**. It considers every resolved transition for incoming transfers, but only human moves can qualify as captures.
- `lib/play-history.ts`: export `ServerPlayHistory` (moved out of `PlayHistoryPage.tsx`) and `fetchPlayHistory(signal)`, retaining the page's credentialed GET, abort, HTTP/JSON error handling, and array response behavior. Both the history page and progression hook use the **same** transport.
- `useTerminalHistorySave`: add optional `onSaved?: () => void`, invoked **once for every successful POST response** while mounted, *before* `if (generation === generationRef.current) onSuccess?.()`. A late successful POST is still a real history change even when the user reset. Keep the existing generation check on `onSuccess` and the caller's snapshot-ownership guard unchanged; failed/ambiguous POSTs never call `onSaved`. `usePlayHistory` does not supply it.
- `useAeroplaneMatch`: expose monotonically increasing **historySavedRevision** bumped by `onSaved`, regardless of whether the old match remains active. Export the existing `buildAeroplaneHistoryPayload` for terminal scoring. Keep existing snapshot-clear, 401 retry and non-idempotent failure policy intact; do not submit rewards independently.
- Implement `apps/web/src/hooks/useAeroplaneProgress.ts` (do not inline fetch, parsing, selection and retries into `AeroplaneGame.tsx`). Use `useAuth`'s `{ loading, revalidated, isAuthenticated, user }`: only fetch when `!loading && revalidated && isAuthenticated && user?.id` (an independent `useAuth` instance may briefly expose an unconfirmed shared-user snapshot). Use shared `fetchPlayHistory(signal)` on verified-auth mount, user switch, and `historySavedRevision` change, aborting superseded requests. Use a user-specific localStorage key like `usePuzzle`. Clear identity-scoped totals/selection immediately on logout, account switch, or unverified auth. Failure/unknown auth leaves the classic skin and no claimed progress; **Retry** is shown only for a failed GET. No loaded-state Refresh button or polling system is needed.
- Compute the result panel from `scoreMatch(buildAeroplaneHistoryPayload(activeMatch))` when the match is terminal, not from animation/feed data. After a successful POST (including one resolving **after reset**) the `onSaved` revision triggers a GET, and the server history includes that match exactly once; never optimistically add the live reward to the fetched lifetime total.
- Display end-panel aggregate stats from the terminal payload, plus an optional **best moment from this mounted match**. The best moment is selected from `humanMoments` by priority: larger multi-capture count first, otherwise largest coin gain, with the latest as a tie-breaker. Never infer a multi-capture from aggregate captures or claim moment history survives a reload.
- Expose one **ephemeral per-match `humanMoments: HumanMoment[]`** list in `useAeroplaneMatch` containing *only notable moments*, not all turns. For each committed transition, call pure `deriveHumanMoment(previousState, transition, humanColor)` and append a moment with monotonic ID **before** `enqueuePresentation` (which Skip animations suppresses). Clear on reset/new match/resume; do not store in snapshots/actions/checksums. The banner shows the newest entry with a short cancelable timer; the end panel shows the best entry. Both still work with Skip animations and reduced motion.
- Export the existing `PlaneGlyph` from `AeroplaneBoard.tsx` for the setup picker; render each catalog option's preview inside a small `<svg>` using **that glyph**, not a clone. Pass the selected `skinId` into `AeroplaneBoard` and the same glyph for committed/moving/ghost/parked planes. Ensure memoized committed plane rendering tracks the new prop. Do not change authoritative `AeroplaneConfig`, action records, checksums, snapshots or Tycoon rules.

## Failure, accessibility and scope

- Signed out: result stars visible, progression hidden, default classic appearance; no new unauthenticated GET.
- History POST failure / offline: result still reflects local match, but no *claimed persistent unlock*. Existing save-failure policy stays unchanged. Failed history GET: show unavailable progress with retry; do not silently make up zero lifetime stars as an authoritative value.
- A successful terminal POST that finishes after reset still calls `onSaved` while mounted and reloads history. Only the **snapshot ownership cleanup** remains generation-guarded. On unmount, no callback runs; a subsequent mount fetches the latest history. Keep the existing non-idempotent save and 401 retry semantics.
- User switch: abort old GET and discard previous account's selection/progress. Storage access exceptions fall back to `classic`; no requirement for sophisticated offline reconciliation.
- Reduced motion: immediately display full stars and show combo content without animation. Assistive text includes reward breakdown, locked threshold and selected skin state. All selectors must be keyboard accessible.
- No new DB table, API write field, replay version, reward economy service, global state store, settings sync, art generation, SFX generation or anti-farming system.
- HPA-437 remains a standalone *asset-generation* task, not a second PR for this coding ticket.

## Acceptance checks

1. Star math is deterministic for wins/losses, zero captures, 2/4-plane victories, Standard and Sky Tycoon; correct net-coin bonus and both caps.
2. Old valid Aeroplane histories contribute, non-Aeroplane/corrupt histories do not, and the lifetime tally never double counts an unacknowledged POST.
3. Signed-in unlock thresholds, persistence across reload, logout/account switch, verified-auth gating, HTTP success refresh **even after reset**, failure/retry and guest restrictions work.
4. End panel and combo banner share a pure, unit-tested per-transition moment rule; only positive coin gains qualify, airport purchases do not, captured groups of 4+ have labels, and reset/Skip/reduced-motion paths work.
5. All visual representations of human planes use the selected look while team colour and other players' planes remain intact; no rules/seed/replay/history-save regression.