# HPA-428 — Aeroplane board motion and asset slots: design

Issue: https://linear.app/cwchanap/issue/HPA-428/aeroplane-board-motion-polish-with-sprite-slots-and-mute-toggle

Baseline: `cwchanap/procyon` `main` at `300485674522d2e763de6d9db224050010c47f1c` (2026-09-11). This is a **planning-only initial commit**. Continue the same draft PR with code and tests; do not open a second implementation PR.

## Product goal

Give Aeroplane Chess legible, enjoyable motion: stepwise hops, a visible curved long flight, a captured plane returning to its hangar, and a dice tumble. Ship with current SVG placeholders, a persisted sound mute control, and stable presentation asset slots for HPA-437. Gameplay and rule outcomes must remain completely independent of presentation.

### User experience

- Normal move: the moving plane travels along each intermediate track/home anchor in order; launch and finish are short direct moves.
- Colour jump: a faster, visibly raised hop from event start to end, using the same position projection. Normal and jump events are played in the exact `ResolvedMove.events` order.
- Long flight: interpolate the matching `FLIGHT_GUIDES` quadratic curve, not a direct chord, for `flight` events.
- Capture: after arrival, a transient victim icon travels from the resolved final endpoint back to its assigned `HANGAR_SLOTS` position. Multiple captured victims are supported.
- Die: tumble the **existing** `AeroplaneStatus` Die readout for every roll, including no-legal-move and single-move auto-select rolls; end showing the actual authoritative face and **roller colour** even if `state.currentPlayer` has already advanced. Do not create a second die. Decorative intermediate frames do not consume dice RNG or enter the live-region text.
- Sound: roll, hop, capture, finish, win cue points. A clearly labelled mute control persists on this browser. First implementation may synthesize understated placeholder tones; final recorded/generated art and SFX live in HPA-437.
- `prefers-reduced-motion: reduce` and Skip animations immediately show the authoritative positions/face without tweening; sound mute is independent of reduced-motion.

## Current code and reuse

- `apps/web/src/hooks/useAeroplaneMatch.ts` commits and synchronously saves authoritative transitions **before** calling `enqueuePresentation`. The hook emits `presentationQueue` and separately retains `eventFeed`. `AEROPLANE_PRESENTATION_MS` is 650 ms and `skipAnimations()` currently clears route presentation only.
- `apps/web/src/components/aeroplane/AeroplaneBoard.tsx` already contains `positionAnchor`, `eventAnchor`, `routePath`, and `planeAnchor` helpers for normalized 100×100 SVG coordinates. Consolidate these into the pure presentation projector rather than maintaining two route→anchor mappings. The board already renders authoritative glyphs and dashed route previews.
- `apps/web/src/lib/aeroplane/layout.ts` contains `TRACK_ANCHORS`, `HOME_PATHS`, `HANGAR_SLOTS`, `LAUNCH_PADS`, `FLIGHT_GUIDES`, and `STACK_OFFSETS`. **Existing bug:** red `RED_HOME_PATH` progresses from centre-near `(50,43)` outward to `(50,27)` before snapping to `(50,50)` at finish. Reverse the first five home anchors in implementation Step 1 (y = `27,31,35,39,43`), preserving finish `(50,50)` and four-colour rotation. `topology.ts` provides `toPosition` and `FINISH_PROGRESS`.
- `ResolvedMove.events` supports `move | jump | flight`; captures are `capturedPlaneIds`, **not** separate events. `move.distance` is the rolled step count, including possible bounce in the final home lane.
- `AeroplaneGame.tsx` already passes presentation entries into the board; `AeroplaneStatus.tsx` **already renders a `Die` value** from `state.pendingRoll` in an `aria-live="polite"` region. Reuse it rather than adding a second readout. `AeroplaneEventFeed.tsx` owns Skip animations and provides the existing matchMedia add/remove-listener pattern for a single reduced-motion subscription in `AeroplaneGame.tsx` shared by board and die.
- No installed animation package or existing Web Audio wrapper is needed. Use browser SVG + `requestAnimationFrame` and a small local sound helper. For mute persistence, follow the existing browser/SSR boundary pattern in `apps/web/src/lib/theme.ts`, adding `try/catch` for unavailable storage.

## Core decisions

### 1. Keep animation disposable and never authoritative

`state`, action history, seeded RNG, checksum/replay, saved match, AI decisions, and game rules are **unchanged**. Render a temporary moving SVG glyph over the committed board, masking the matching committed glyph while it moves. For a capture, temporarily mask the committed hangar glyph and show a returning ghost. Keep all animation layers `pointerEvents="none"`; existing accessible legal-move buttons remain interactive.

The board observes the **latest previously unseen** queue `id` (rather than replaying every entry on rerender). Newer queue items replace an unfinished visual, so AI or player actions never wait for animation. Cancel an active movement overlay as soon as its `id` disappears from `presentationQueue`: expiry, Skip, reset, new match, and resume already remove queue entries. Also cancel on supersession, reduced-motion, or unmount. The board reveals the latest committed state; presentation expiry does not cause a rules transition.

### 2. One small pure timeline projector

Add `apps/web/src/lib/aeroplane/presentation.ts` with an Aeroplane-specific pure `buildMoveTimeline(move, state)` (or equivalently small helpers) returning ordered normalized SVG points/segments, segment kinds, capture return paths, and durations. **Move and reuse** the current board-local `positionAnchor`, `eventAnchor`, and `routePath` projection logic here: both existing dashed preview/queue paths and the timed renderer must consume this one projection. `planeAnchor` should delegate via `positionAnchor(toPosition(plane.color, plane.progress), plane.id)` rather than duplicate progress→coordinate math. No generic animation engine or React-specific state machine.

For `move`, expand logical progress one step at a time using `toPosition` and existing layout anchors, including the **bounce** rule: if a rolled step advances beyond progress 56, reflect it back toward 56. Do not simply tween from start to final endpoint, which cuts across the circular board or erases the bounce. Fix `RED_HOME_PATH` to progress inward before projecting home-lane hops, and test decreasing centre distance from progress 50 through 56. A hangar-to-launch move uses its two endpoints. `jump` gets a visually lifted hop (without executing extra rules); `flight` follows the colour's quadratic flight guide. Respect exact event order, including jump-then-flight. Final capture ghosts use `capturedPlaneIds` and the shared `positionAnchor(toPosition(victim.color, null), victim.id)` to reach each specific hangar slot. The moving overlay finishes at the **committed glyph's anchor plus `STACK_OFFSETS`** (as computed from board `planeNodes`), not the bare tile anchor, so stacked landings do not snap upon reveal.

Export a production `AEROPLANE_VISUAL_MAX_MS = 600` cap from `presentation.ts`. Bound each complete timeline, including capture return, to this limit, with segment durations scaled to fit (ordinary hops about 60–90 ms when practical; flight longer than one hop). Assert in a focused test that the cap is strictly below **both** existing `AEROPLANE_PRESENTATION_MS = 650` and `AEROPLANE_AI_DELAY_MS = 650`, so a later default change flags visual truncation. Test-only injected shorter delays may cancel overlays early. A **fixed delayed AI roll** is scheduled by the existing controller timer; there is still no await-for-animation completion gate, serialized animation scheduler, or additional match clock.

### 3. Minimal presentation lifecycle signals

Keep `presentationQueue` as the source of route playback and cancellation: if the active route `id` is no longer present, cancel its frame loop. **Do not add `presentationEpoch`** or expose the controller's internal `generationRef`.

Add one **ephemeral, non-persisted** `rollPresentation: { id, face, color, animate: boolean } | null` field from `useAeroplaneMatch`. `executeRoll` emits `{ id: nextId, face: actualRoll, color: roller, animate: !skipAnimationsRef.current }` for human **and AI** rolls, independent of legal-move count (single-legal-move auto-select appends a move immediately). The existing `AeroplaneStatus` die displays `rollPresentation?.face ?? state.pendingRoll` with a roller-colour label; only the actual settled face is available to the existing live-region text. Temporary tumbling frames are `aria-hidden`, not spoken. No saved roll history is replayed on load.

**Pace AI rolls** on an `awaiting-roll` turn with the existing `aiTimerRef` and generation guard, using `AEROPLANE_AI_DELAY_MS` (650 ms) rather than immediately calling `executeRoll('ai')` inside the effect. AI choices already have this fixed delay; use one timer slot, not a new scheduler. Preserve the current fast fixture path when `skipAnimationsRef.current` is true (no new wait). This keeps a human/AI no-move roll or human auto-select roll visible before the next AI's face replaces it. It is a fixed turn-pacing delay, **not** waiting for the rAF to finish or delaying the authoritative move commit.

Skip animations clears route presentations without erasing `eventFeed` and changes the current `rollPresentation` to `{ ...rollPresentation, animate: false }` if present. That stops the die tumble **even for a roll with no route in the queue**, while retaining the real face. Reset/new match/resume set it to `null`, clearing the previous match's die. Subsequent rolls get fresh IDs and can animate normally; Skip is not a persisted disable preference. Read `prefers-reduced-motion` once in `AeroplaneGame.tsx`, using the existing `AeroplaneEventFeed.tsx` listener cleanup pattern, and pass the result to the board and status die. If `requestAnimationFrame` is absent (SSR/Bun), take the immediate/zero-motion path rather than throwing.

### 4. Two asset slots, no duplicate palette/theme registry

Reuse `PLANE_FILL`, `PLANE_STROKE`, and the existing board colours in `AeroplaneBoard.tsx` directly. Extract a small SVG glyph helper that accepts an **optional per-colour plane sprite `href`**; support an **optional board background `<image>`** using a local constant or prop next to the board. If either URL is absent, retain the current SVG silhouettes and background. These two render-only slots let HPA-437 supply real assets later without changing rules. Do **not** introduce `presentationTheme.ts`, duplicate palettes, a theme ID in config/persistence/API, or a generic asset registry.

### 5. Tiny sound helper with local preference

A single browser-only cue helper defines `roll | hop | capture | finish | win`; it no-ops when muted, unsupported, or blocked by browser autoplay rules. Initialize/resume `AudioContext` lazily after a user gesture. Use short oscillator notes as temporary cues instead of generating/committing finished art/SFX. **No audio URL hooks** until HPA-437 actually supplies files; no dependency or backend service.

The board owns motion cue timing: expose one optional `onCue(cue)` prop on `AeroplaneBoard`, firing at segment boundaries as the **existing** rAF playback crosses them (no independent audio timers in `AeroplaneGame`). On Skip, supersession, or unmount, canceled segments never fire late cues. For reduced-motion/unsupported-rAF zero-duration playback, emit the appropriate terminal cue (capture, finish, or win) **once** even though no hops tween; the audio preference remains independent of motion. Roll cues are keyed to the unique roll ID and routed via the same small sound helper, never per tumble frame.

A simple `Muted` toggle on the Aeroplane game screen is kept in component-level state, loaded safely after hydration, and written to one localStorage key (proposed: `procyon.aeroplane.muted`, values `1`/`0`). Default unmuted, but no audio plays before browser permission/interaction permits it. Catch storage and audio failures; sound must never block a game action.

## Rejected alternatives

- Animate the authoritative game state step by step: breaks deterministic replay, saves, and input timing.
- Hold AI turns **until an animation completion callback**: creates a cancellation gate and is unnecessary. A fixed 650 ms AI-roll timer reusing the controller's existing timer is acceptable to preserve visibility of the previous die face.
- Add Framer Motion / a generic timeline or new package: extra surface area for one SVG board.
- Add `presentationEpoch`: active route IDs are canceled by queue membership; the independent die tumble is canceled with `rollPresentation.animate`.
- Copy the board palette into `presentationTheme.ts`: the only needed extensibility is two optional asset URLs on existing SVG rendering.
- Generate plane illustrations or finalized sound files here: belongs in HPA-437.
- Put mute into `AeroplaneConfig` or DB history: it is a local presentation preference, not a game rule.
- Add skin selection/unlocks now: belongs in HPA-362.

## Acceptance checks

1. Ordinary moves traverse intermediate anchors, including a home-lane bounce, with no teleports/cross-board shortcuts. Home-lane radii shrink monotonically after progress 50; stacked plane landings have no final reveal snap.
2. Jump and flight use distinguishable motion, with the long flight following the existing quadratic guide.
3. Capture briefly returns victim(s) to the correct hangar; the committed board remains correct throughout.
4. The single **existing** status die tumbles on both actors' rolls, including no-legal-move/auto-select rolls, remains visible until the next paced AI roll, labels its roller correctly, and displays/announces only the authoritative result (not decorative tumble frames).
5. Skip, reduced-motion, superseding moves, reset/resume, and unmount cancel visual work without stale overlays or sound errors; importantly, Skip also stops a die tumble when a roll produced no legal move and thus no queued route.
6. Mute persists after remount/reload; browsers lacking audio/storage work silently; no account or API key needed.
7. Current Aeroplane setup, rules, AI, history, and replay tests remain green; accessibility of plane controls is preserved. Missing `requestAnimationFrame` falls back to immediate rendering without errors; sound cues share the board clock and never fire after cancellation.

## Scope boundary

One ticket, one PR (planning docs first; implementation added to **this same PR**). HPA-437 owns original plane/board/tile art and SFX production; HPA-429 owns Sky Tycoon rules; HPA-362 owns star rewards and unlockable skins. No additional ticket or infrastructure is required to implement the present placeholders.
