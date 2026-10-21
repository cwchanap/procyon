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
- Die: briefly tumbles when **any** roll is recorded, even when no plane can move; ends showing the actual authoritative face. Purely visual frames must not consume the dice RNG.
- Sound: roll, hop, capture, finish, win cue points. A clearly labelled mute control persists on this browser. First implementation may synthesize understated placeholder tones; final recorded/generated art and SFX live in HPA-437.
- `prefers-reduced-motion: reduce` and Skip animations immediately show the authoritative positions/face without tweening; sound mute is independent of reduced-motion.

## Current code and reuse

- `apps/web/src/hooks/useAeroplaneMatch.ts` commits and synchronously saves authoritative transitions **before** calling `enqueuePresentation`. The hook emits `presentationQueue` and separately retains `eventFeed`. `AEROPLANE_PRESENTATION_MS` is 650 ms and `skipAnimations()` currently clears route presentation only.
- `apps/web/src/components/aeroplane/AeroplaneBoard.tsx` already maps position kinds to normalized 100×100 SVG coordinates. It renders authoritative plane glyphs immediately and draws static dashed routes for the queue.
- `apps/web/src/lib/aeroplane/layout.ts` contains `TRACK_ANCHORS`, `HOME_PATHS`, `HANGAR_SLOTS`, `LAUNCH_PADS`, `FLIGHT_GUIDES`, and `STACK_OFFSETS`. `topology.ts` has `toPosition` and `FINISH_PROGRESS`.
- `ResolvedMove.events` supports `move | jump | flight`; captures are `capturedPlaneIds`, **not** separate events. `move.distance` is the rolled step count, including possible bounce in the final home lane.
- `AeroplaneGame.tsx` already passes presentation entries into the board, and `AeroplaneEventFeed.tsx` already owns the Skip animations button.
- No installed animation package or existing Web Audio wrapper is needed. Use browser SVG + `requestAnimationFrame` and a small local sound helper.

## Core decisions

### 1. Keep animation disposable and never authoritative

`state`, action history, seeded RNG, checksum/replay, saved match, AI decisions, and game rules are **unchanged**. Render a temporary moving SVG glyph over the committed board, masking the matching committed glyph while it moves. For a capture, temporarily mask the committed hangar glyph and show a returning ghost. Keep all animation layers `pointerEvents="none"`; existing accessible legal-move buttons remain interactive.

The board observes the **latest previously unseen** queue `id` (rather than replaying every entry on rerender). Newer queue items replace an unfinished visual, so AI or player actions never wait for animation. If a presentation is canceled, reset, skipped, superseded, or unmounted, dispose its frame loop and show the latest committed state. Presentation expiry does not cause a rules transition.

### 2. One small pure timeline projector

Add `apps/web/src/lib/aeroplane/presentation.ts` with an Aeroplane-specific pure `buildMoveTimeline(move, state)` (or equivalently small helpers) returning ordered normalized SVG points/segments, segment kinds, capture return paths, and durations. No generic animation engine or React-specific state machine.

For `move`, expand logical progress one step at a time using `toPosition` and existing layout anchors, including the **bounce** rule: if a rolled step advances beyond progress 56, reflect it back toward 56. Do not simply tween from start to final endpoint, which cuts across the circular board or erases the bounce. A hangar-to-launch move uses its two endpoints. `jump` gets a visually lifted hop (without executing extra rules); `flight` follows the colour's quadratic flight guide. Respect the exact event order, including jump-then-flight. Final capture ghosts use the committed victims' IDs/colours and their fixed hangar slots.

Bound each presentation's complete visual timeline to **at most 600 ms**, with segment duration weights scaled to that budget (ordinary hops approximately 60–90 ms, flight visibly slower than one hop, capture return at the end). This intentionally fits the hook's existing 650 ms queue lifetime. No new waiting gate, serialized AI processing, or match clock.

### 3. Minimal presentation lifecycle signals

Keep `presentationQueue` as the source for route presentations. Add two **ephemeral, non-persisted** fields from `useAeroplaneMatch`:

- `rollPresentation: { id, face } | null`: updated inside `executeRoll` for human **and AI** rolls, independent of legal-move count. The board initially records the seen ID and never tumbles old saved action history on load.
- `presentationEpoch: number`: incremented on Skip animations, new match/reset, and resume so board/die frame loops cancel even if an old queue item is still in local component state.

The existing Skip animations control still clears the active queue without erasing `eventFeed`. An epoch change cancels active frame loops. Subsequent new moves can animate normally; Skip is not a persistent disable preference. Reduced-motion uses `matchMedia` with proper change-listener cleanup and makes animation duration zero.

### 4. Asset substitution with one simple theme object

Add `apps/web/src/components/aeroplane/presentationTheme.ts` containing `DEFAULT_AEROPLANE_THEME`: existing board and plane palette plus optional `boardBackgroundUrl` and per-colour `planeSpriteUrl` slots. Absence of an asset keeps the current SVG circles/plane silhouettes. Theme is **render-only**; no theme ID in match config, persistence, or API. HPA-437 can later fill those paths and SFX assets without changing the renderer contract. No skin store, generic plugin registry, asset pipeline, or style editor in HPA-428.

### 5. Tiny sound helper with local preference

A single browser-only cue helper defines `roll | hop | capture | finish | win`; it no-ops when muted, unsupported, or blocked by browser autoplay rules. Initialize/resume `AudioContext` lazily after a user gesture. Use simple short oscillator notes as temporary cues instead of generating/committing finished art/SFX. Keep any audio URL hooks optional and future-facing; no dependency or new backend service.

A simple `Muted` toggle on the Aeroplane game screen is kept in component-level state, loaded safely after hydration, and written to one localStorage key (proposed: `procyon.aeroplane.muted`, values `1`/`0`). Default unmuted, but no audio plays before browser permission/interaction permits it. Catch storage and audio failures; sound must never block a game action.

## Rejected alternatives

- Animate the authoritative game state step by step: breaks deterministic replay, saves, and input timing.
- Hold AI turns until prior animation completes: unrelated to game logic, slows matches, and creates cancellation races.
- Add Framer Motion / a generic timeline or new package: extra surface area for one SVG board.
- Generate plane illustrations or finalized sound files here: belongs in HPA-437.
- Put mute into `AeroplaneConfig` or DB history: it is a local presentation preference, not a game rule.
- Add skin selection/unlocks now: belongs in HPA-362.

## Acceptance checks

1. Ordinary moves traverse intermediate anchors, including a home-lane bounce, with no teleports/cross-board shortcuts.
2. Jump and flight use distinguishable motion, with the long flight following the existing quadratic guide.
3. Capture briefly returns victim(s) to the correct hangar; the committed board remains correct throughout.
4. Dice tumbles on both actors' rolls, including no-legal-move rolls, and displays the actual result.
5. Skip, reduced-motion, superseding moves, reset/resume, and unmount cancel visual work without stale overlays or sound errors.
6. Mute persists after remount/reload; browsers lacking audio/storage work silently; no account or API key needed.
7. Current Aeroplane setup, rules, AI, history, and replay tests remain green; accessibility of plane controls is preserved.

## Scope boundary

One ticket, one PR (planning docs first; implementation added to **this same PR**). HPA-437 owns original plane/board/tile art and SFX production; HPA-429 owns Sky Tycoon rules; HPA-362 owns star rewards and unlockable skins. No additional ticket or infrastructure is required to implement the present placeholders.
