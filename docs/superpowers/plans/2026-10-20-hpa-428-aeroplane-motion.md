# HPA-428 — Aeroplane board motion: implementation plan

Design: [2026-10-20-hpa-428-aeroplane-motion-design.md](../specs/2026-10-20-hpa-428-aeroplane-motion-design.md)  
Issue: https://linear.app/cwchanap/issue/HPA-428/aeroplane-board-motion-polish-with-sprite-slots-and-mute-toggle  
Baseline: `main@300485674522d2e763de6d9db224050010c47f1c`

## Delivery policy

**Exactly one PR for HPA-428.** This draft PR initially contains the two planning documents; commit implementation and tests onto the **same branch/PR** after review. Do not split the ticket into sequential PRs. Keep all work presentation-only; never change rules or persistence contracts. No backward compatibility layer is necessary for the new local mute preference.

## Relevant existing modules

- `apps/web/src/lib/aeroplane/types.ts`: existing event types, resolved move, captures, and authoritative state.
- `apps/web/src/lib/aeroplane/topology.ts`, `layout.ts`: existing progress logic and SVG anchors/flight curve.
- `apps/web/src/hooks/useAeroplaneMatch.ts`: authoritative commit, presentation queue, roll, skip/reset/resume and AI timers.
- `apps/web/src/components/aeroplane/AeroplaneBoard.tsx`: current SVG board, route previews, legal-move controls.
- `apps/web/src/components/AeroplaneGame.tsx`: hook/board/status/event-feed wiring.
- `apps/web/src/components/aeroplane/AeroplaneEventFeed.tsx`: existing Skip animations button; retain its public contract.
- `apps/web/src/hooks/useAeroplaneMatch.test.ts` and `apps/web/src/components/aeroplane/AeroplaneGame.test.tsx`: test harnesses.

## Step 1 — pure path/timing projection with unit tests

Create `apps/web/src/lib/aeroplane/presentation.ts` and `presentation.test.ts`.

- Reuse `toPosition` and `layout.ts` anchors; do not copy the 52-node map or generate a second topology table.
- Export a small, explicit builder for a `ResolvedMove` plus committed state. Output ordered non-React segments: hop endpoints, jump endpoints, flight quadratic control point, captured victims' hangar return targets, and bounded durations.
- For a base `move` use each logical progress step, not straight interpolation from `from` to `to`. Handle launch/null progress separately. For bounce, reflect progress beyond 56 before calling `toPosition`. A move from 54 with roll 5 follows 55→56→55→54→53.
- For `jump` preserve event boundaries/ordering, and make a brief arched hop. For `flight` reuse the specific `FLIGHT_GUIDES[color]` quadratic from the SVG.
- After route arrival, derive captured victim paths from `capturedPlaneIds` and committed `state.planes`, using the destination at `move.finalEndpoint` as start and `HANGAR_SLOTS` as return end. No new capture event type.
- Allocate weighted durations with total `<= 600` ms, including optional capture; normal hops must remain individually visible. Zero-motion mode skips timing entirely.

**Focused tests:** launch, simple 1/6-step move, track wrap, home transition, exact/bounce finish, jump→flight event order, flight control point, single/multiple victims, colour-specific hangar slot, and total-duration bound. Assert input move/state are not mutated.

## Step 2 — controller signals and cancellation contracts

Update `apps/web/src/hooks/useAeroplaneMatch.ts` only for transient UI signals.

- Emit a monotonically increasing `rollPresentation` ID and rolled face on each `executeRoll` (both actors, even zero legal moves). Do not reconstruct it from the latest action because auto-select may append a move immediately after a roll.
- Emit `presentationEpoch`; bump it when calling Skip animations, new match/reset, or resume; retain existing `presentationQueue` and `eventFeed` shape.
- Ensure Skip clears queued visuals but **not** feed entries, does not change active state, and does not permanently disable later animations.
- Keep the existing 650 ms presentation cleanup and AI timing; the renderer's 600 ms visual budget must fit inside it.
- Preserve injected `presentationMs` test override and test/development fixture behavior.

**Focused tests:** two identical roll faces produce distinct IDs; an AI roll and no-legal-move roll are each signaled; Skip increments epoch and leaves history/feed/authoritative state alone; reset/resume increment epoch; a new move after Skip can enqueue again. Existing timer tests should still pass.

## Step 3 — board playback (no rule changes)

Add `apps/web/src/components/aeroplane/presentationTheme.ts` with the current palette and optional per-colour plane sprite/board background paths (no actual new art), and update `AeroplaneBoard.tsx`.

- Extract existing plane glyph rendering into a small render-only helper so real sprites can replace placeholders without changing move logic.
- Keep the authoritative `state.planes` SVG layer and existing legal-move buttons. When a new presentation arrives, cover/hide only the affected committed glyph(s) and draw a separate `pointerEvents="none"` moving overlay (including captured ghosts) driven by `requestAnimationFrame`.
- Animate each projected hop in order, interpolate flight on the matching quadratic curve, and return captured glyphs toward their proper hangar. Current logical state and user input remain live.
- Track the most recent processed `id` to avoid rerunning a presentation on ordinary rerenders. On a newer presentation, drop/cancel the old visual and play the latest (never queue-block gameplay).
- On presentation expiry, `presentationEpoch` change, reduced-motion switch, and unmount, cancel frames and reveal committed glyphs. Prefer a single frame-loop owner/ref with effect cleanup; no generic scheduler.
- Retain hover/touch/keyboard selection and preview path behaviour; overlays must not intercept pointer events.

**Focused tests:** inspect intermediate SVG coordinates/segment progression under controlled clocks; flight has a midpoint off the straight chord; capture ghost returns to correct hangar; input remains usable; overlapping event IDs show only newest; Skip/reset/unmount/reduced-motion leave no stale overlay. Confirm ARIA-labelled native plane buttons and preview interactions survive.

## Step 4 — roll feedback, cues, and persisted mute

- Add a compact six-face die indicator near the existing Roll die button, driven by `rollPresentation`. Show the true final face, including turns where the controller already advanced into the next action. Intermediate tumble frames are presentation-only, not random rolls.
- Add `apps/web/src/lib/aeroplane/sound.ts`: five cue names (`roll`, `hop`, `capture`, `finish`, `win`), lazily initialized Web Audio placeholder tones, best-effort/no-throw behavior when unavailable. Direct user Roll action may prime/unlock audio. Do not embed or generate new recorded SFX.
- Compose sound actions and the mute toggle in `AeroplaneGame.tsx` (or a tiny local hook only if needed). Store `procyon.aeroplane.muted` as a browser preference, read after mount for SSR hydration safety, and write on user toggle. Avoid touching `AeroplaneConfig` and persisted match snapshots.
- Trigger roll once per roll ID, hop/flight cues during playback, capture after landing, and finish/win at the completed route. Mute must suppress all cues immediately, not retroactively affect action state.
- Honour reduced-motion for dice and routes; mute controls sound separately.

**Focused tests:** actual die face wins over decorative tumble frames; consecutive equal-face rolls still animate; mute localStorage round-trip; unavailable/blocked Web Audio and storage errors never interrupt play; no duplicated cue on rerender; reduced-motion immediately skips movement.

## Step 5 — integration and regression verification

- Wire `AeroplaneGame.tsx` props between hook, board, event feed, and sound controller. Avoid changing `AeroplaneStatus` unless its current presentation indicator is inconsistent.
- Expand `AeroplaneGame.test.tsx` for a complete human roll → move → presentation → capture flow using existing fixtures. Confirm unchanged state/checksum and the original event-feed output. Add a rapid AI/presentation-supersession case.
- Keep fixture-enabled Playwright smoke for desktop/mobile to manually verify hop, flight, capture, die, Skip, and mute. Add a focused E2E regression only if unit/component tests cannot prove the wiring; do not build a test framework.
- Test with default motion, reduced motion, audio unavailable, and stored mute. Verify a completed match and one reset/new match work without animation artifacts.

### Commands for the implementation commit(s)

From `apps/web`:

```bash
bun test src/lib/aeroplane/presentation.test.ts src/components/aeroplane/AeroplaneGame.test.tsx src/hooks/useAeroplaneMatch.test.ts
bun run typecheck
bun run lint
bun run test
```

From repository root:

```bash
bun run format:check
```

Use pinned Bun 1.3.6 when comparing local results with CI. Record real results in the PR after implementation. This **docs-only draft does not claim runtime tests have run**.

## Review checkpoints / definition of done

1. Pure path projection proves wrap and bounce correctly and never changes game rules.
2. A controller roll signal is independent of auto-select, and skip/reset tokens cancel stale playback.
3. Rendering overlays cannot affect current turn, legal moves, roll RNG, saved snapshots, AI turns, or keyboard controls.
4. Long flight visibly bends; captures return victims; the finished board matches committed state.
5. Sound and art slots remain placeholders; the authored asset pack stays in separate HPA-437.
6. Regression tests, lint, typecheck, and manual accessibility/reduced-motion checks are completed **on this same PR**.

## Explicitly deferred

HPA-429 Sky Tycoon tile effects/economy; HPA-362 match stars and skins; HPA-437 generated plane/board/icon art and production SFX. No extra APIs, audio dependencies, DB migrations, theme registry, analytics, or new game-rule events.
