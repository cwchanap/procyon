# HPA-428 — Aeroplane board motion: implementation plan

Design: [2026-10-20-hpa-428-aeroplane-motion-design.md](../specs/2026-10-20-hpa-428-aeroplane-motion-design.md)  
Issue: https://linear.app/cwchanap/issue/HPA-428/aeroplane-board-motion-polish-with-sprite-slots-and-mute-toggle  
Baseline: `main@300485674522d2e763de6d9db224050010c47f1c`

## Delivery policy

**Exactly one PR for HPA-428.** This draft PR initially contains the two planning documents; commit implementation and tests onto the **same branch/PR** after review. Do not split the ticket into sequential PRs. Keep all work presentation-only; never change rules or persistence contracts. No backward compatibility layer is necessary for the new local mute preference.

## Relevant existing modules

- `apps/web/src/lib/aeroplane/types.ts`: existing event types, resolved move, captures, and authoritative state.
- `apps/web/src/lib/aeroplane/topology.ts`, `layout.ts`: progress logic and SVG anchors/flight curve; correct the red home-lane anchor order (`27,31,35,39,43,50`) in Step 1. `lib/theme.ts` illustrates SSR/browser localStorage guard patterns (add try/catch for failure).
- `apps/web/src/hooks/useAeroplaneMatch.ts`: authoritative commit, presentation queue, roll, skip/reset/resume and AI timers.
- `apps/web/src/components/aeroplane/AeroplaneBoard.tsx`: current SVG board, route previews, legal-move controls.
- `apps/web/src/components/AeroplaneGame.tsx`: hook/board/status/event-feed wiring and the single shared reduced-motion listener.
- `apps/web/src/components/aeroplane/AeroplaneStatus.tsx`: **existing** live-region Die readout based on `state.pendingRoll`; animate this rather than adding a second die.
- `apps/web/src/components/aeroplane/AeroplaneEventFeed.tsx`: existing Skip animations button; retain its public contract.
- `apps/web/src/hooks/useAeroplaneMatch.test.ts` and `apps/web/src/components/aeroplane/AeroplaneGame.test.tsx`: test harnesses.

## Step 1 — pure path/timing projection with unit tests

Create `apps/web/src/lib/aeroplane/presentation.ts` and `presentation.test.ts`.

- Reuse `toPosition` and `layout.ts` anchors; do not copy the 52-node map or generate a second topology table.
- **Consolidate** the existing `positionAnchor`, `eventAnchor`, and `routePath` from `AeroplaneBoard.tsx` into this pure projection module (or export equivalent shared helpers). Preserve the existing preview-path rendering contract. Both dashed previews/presentation routes and timed movement must use the same event→anchor logic. Use `positionAnchor(toPosition(plane.color, plane.progress), plane.id)` for committed plane anchors, not another progress-to-coordinate implementation.
- Export a small, explicit builder for a `ResolvedMove` plus committed state. Output ordered non-React segments: hop endpoints, jump endpoints, flight quadratic control point, captured victims' hangar return targets, and bounded durations.
- For a base `move` use each logical progress step, not straight interpolation from `from` to `to`. Handle launch/null progress separately. For bounce, reflect progress beyond 56 before calling `toPosition`. A move from 54 with roll 5 follows 55→56→55→54→53.
- **Fix a pre-existing render-only geometry bug:** reverse the first five entries of `RED_HOME_PATH` in `apps/web/src/lib/aeroplane/layout.ts` to y = `27,31,35,39,43` (finished anchor stays `(50,50)`). All other colours are rotations of red. Add an assertion that the Euclidean centre distance **strictly decreases** at each logical progress 50→51→52→53→54→55→56, so the lane visually approaches the finish.
- For `jump` preserve event boundaries/ordering, and make a brief arched hop. For `flight` reuse the specific `FLIGHT_GUIDES[color]` quadratic from the SVG.
- After route arrival, derive captured victim paths from `capturedPlaneIds` and committed `state.planes`, starting at `move.finalEndpoint` and returning to `positionAnchor(toPosition(victim.color, null), victim.id)` for the victim's assigned hangar. Do not add a new capture event type. Board playback ends at the actual committed glyph position including `STACK_OFFSETS`, not the unoffset target anchor.
- Export `AEROPLANE_VISUAL_MAX_MS = 600` from the pure projector; allocate weighted durations with total `<= 600` ms, including optional capture. Normal hops remain individually visible when the budget permits. Zero-motion mode skips timing entirely. In `presentation.test.ts`, import the hook's `AEROPLANE_AI_DELAY_MS` and `AEROPLANE_PRESENTATION_MS` **only from tests** (not from the pure projector) and assert the cap is strictly below both production defaults.

**Focused tests:** launch, simple 1/6-step move, track wrap, corrected inward home lane (monotonic decreasing radius across 50–56 for all colours), exact/bounce finish, jump→flight event order, flight control point, single/multiple victims, colour-specific hangar slot, stacked landing target with offset, and total-duration cap below both production timer defaults. Assert input move/state are not mutated.

## Step 2 — controller signals and cancellation contracts

Update `apps/web/src/hooks/useAeroplaneMatch.ts` only for transient UI signals; do not add a second cancellation epoch.

- Emit `rollPresentation: { id, face, color, animate: boolean } | null`. Give every `executeRoll` a new monotonically increasing ID with authoritative face and roller colour for human/AI, including zero-legal-move rolls; use `animate: !skipAnimationsRef.current` so seeded E2E fixture rolls settle immediately. Do not derive roll from the latest action because auto-select can append a move immediately.
- Reuse the **existing** `presentationQueue`: movement rAF playback is canceled when its active presentation ID disappears from the queue, including expiry, Skip, reset/new match, and resume. Do not expose `generationRef` or create `presentationEpoch`.
- On an AI `awaiting-roll` effect, **schedule** `executeRoll('ai')` with the existing `aiTimerRef` and existing generation guard using `aiDelayRef.current` (650 ms production), just as `scheduleAiDecision` does for AI move choices. Share the timer slot, do not add a second timer framework or wait on playback completion. Preserve the existing **immediate** AI roll path when `skipAnimationsRef.current` is true, to keep deterministic fixture/E2E speed and timing. Reset/unmount generation invalidation still cancels pending roll timers.
- Skip clears queued routes but **not** feed entries, leaves authoritative match unchanged, and changes the current roll presentation to `{ ...current, animate: false }` (if non-null); the die stops tumbling and retains the face even with no queued move. Subsequent rolls can animate. Reset/new match/resume clear `rollPresentation` to `null`.
- Keep the existing 650 ms presentation cleanup and AI timing; the renderer's 600 ms visual budget must fit inside it.
- Preserve injected `presentationMs` test override and test/development fixture behavior.

**Focused tests:** two identical roll faces produce distinct IDs; correct colour is preserved across player advancement; an AI roll and no-legal-move roll are signaled; after a human no-move or auto-select roll, the next AI roll **does not execute before** the fixed delay, then fires once; consecutive AI no-move rolls are likewise paced. Verify the `skipAnimationsRef` fixture keeps immediate AI execution, and reset/unmount invalidates pending roll timers. Skip cancels route queue **and** no-route die tumble, preserves history/feed/authoritative state, and retains the correct face; reset/resume clear it; later rolls animate again.

## Step 3 — board playback (no rule changes)

Update `AeroplaneBoard.tsx`, reusing its existing palette; **do not add `presentationTheme.ts`**. Supply only an optional per-colour sprite `href` on the extracted glyph helper and optional board background `<image>` URL near the board rendering (no actual new art).

- Extract existing plane glyph rendering into a small render-only helper so real sprites can replace placeholders without changing move logic. Remove the board-local anchor/route projectors moved to `presentation.ts` in Step 1. Import the shared projection for committed glyph anchors, dashed previews, and animated paths; retain `STACK_OFFSETS` for purely visual overlap.
- Keep the authoritative `state.planes` SVG layer and existing legal-move buttons. When a new presentation arrives, cover/hide only affected committed glyph(s) and draw a `pointerEvents="none"` moving overlay (including captured ghosts) driven by `requestAnimationFrame`. If `requestAnimationFrame` is not globally available (SSR or Bun test env), use the same zero-duration fallback as reduced motion and display the committed state immediately; never throw a `ReferenceError`.
- Animate each projected hop in order, interpolate flight on the matching quadratic curve, and return captured glyphs toward their proper hangar. Resolve final overlay position against `planeNodes`' committed anchor **plus `STACK_OFFSETS`** to avoid a 1.8-unit jump when the overlay is removed on a friendly stack. Current logical state and user input remain live.
- Track the most recent processed `id` to avoid rerunning a presentation on ordinary rerenders. On a newer presentation, drop/cancel the old visual and play the latest (never queue-block gameplay).
- On **active ID disappearing from `presentationQueue`**, reduced-motion switch, supersession, and unmount, cancel frames and reveal committed glyphs. Queue removal already handles expiry, Skip, reset/new match, and resume. Prefer a single frame-loop owner/ref with effect cleanup; no generic scheduler.
- Add one optional `onCue?(cue)` callback to `AeroplaneBoard` and emit hop/flight/capture/finish/win cues as **the existing board frame loop crosses each timeline segment boundary**. Avoid a parallel setTimeout-based audio scheduler in `AeroplaneGame`. When playback is canceled, emit no late cues; with reduced-motion or missing rAF, emit only the appropriate terminal cue once (independent of motion preference). Retain hover/touch/keyboard selection and preview path behaviour; overlays must not intercept pointer events.

**Focused tests:** baseline `AeroplaneGame.test.tsx` mounts `presentationQueue` **without any global rAF** and must still pass via immediate fallback; new motion tests opt into controllable `requestAnimationFrame`/`cancelAnimationFrame` stubs with frame timestamps (Bun fake timers alone do not advance rAF). Verify curved flight midpoint, capture return, stacked landing no snap, ongoing interaction, newest-ID supersession, queue removal on Skip/expiry/reset/unmount, reduced-motion cancellation, cue emission at each segment boundary, no cue after cancellation, and a terminal cue exactly once under zero-duration fallback. Preserve ARIA-labelled native plane buttons and previews.

## Step 4 — roll feedback, cues, and persisted mute

- **Extend the existing `AeroplaneStatus.tsx` Die readout**, not a second indicator near the Roll button. Accept `rollPresentation` and display its `face` (fallback to `state.pendingRoll`) with a small `color` / roller label, since `state.currentPlayer` can already be the next seat after a no-move roll. A tiny rAF-based decorative tumble uses the same `rollPresentation.id` but never alters the true displayed outcome. The status panel's `role="status" aria-live="polite" aria-atomic="true" must announce **only the settled result**; wrap decorative intermediate frames with `aria-hidden`. Cancel die frames on `animate === false` (Skip), `null` (reset/resume), reduced motion, missing rAF, or unmount, retaining the actual face on Skip.
- Add `apps/web/src/lib/aeroplane/sound.ts`: five cue names (`roll`, `hop`, `capture`, `finish`, `win`), lazily initialized Web Audio placeholder tones, best-effort/no-throw behavior when unavailable. Direct user Roll action may prime/unlock audio. Do not embed or generate new recorded SFX or future-facing audio URL hooks (HPA-437 can later add a URL map inside `sound.ts`).
- Compose sound actions and the mute toggle in `AeroplaneGame.tsx` (or a tiny local hook only if needed). Store `procyon.aeroplane.muted` as a browser preference, read after mount for SSR hydration safety following the window guard pattern in `lib/theme.ts`, with `try/catch` for storage failures; write on user toggle. Avoid touching `AeroplaneConfig` and persisted match snapshots.
- Wire the board's single `onCue` to the sound helper in `AeroplaneGame.tsx` so its **existing rAF** is the only timer for route-synchronized hop/capture/finish/win cues. Trigger a roll cue once per `rollPresentation.id`, not on every tumble frame; Skip/unmount/supersession must prevent late route cues. Zero-duration reduced-motion playback can still send its one terminal cue. Mute suppresses cues immediately without affecting the authoritative action.
- Read `prefers-reduced-motion` once in `AeroplaneGame.tsx` using the add/remove listener pattern already present in `AeroplaneEventFeed.tsx`, and pass the resulting boolean to board and status die. No duplicate media listeners or general-purpose animation hook.

**Focused tests:** one Status Die (no duplicate), correct roller colour after player advancement, actual die face and ARIA settled text never reflect decorative frames, consecutive equal-face rolls use distinct IDs, Skip during a no-route roll stops the tumble and preserves face, mute localStorage round-trip, unsupported/blocked Web Audio and storage errors never interrupt play, no duplicated cue on rerender, and reduced-motion/missing rAF immediately settle both move and die without an exception.

## Step 5 — integration and regression verification

- Wire `AeroplaneGame.tsx` props between hook, board (including `onCue`), **existing** AeroplaneStatus Die, event feed, sound controller and shared reduced-motion boolean. Do not introduce a second dice component or media-query listener.
- Expand `AeroplaneGame.test.tsx` for human no-move roll → visible face → paced AI roll and human auto-select roll → visible face → paced AI roll, plus a complete move/capture flow. Confirm unchanged state/checksum and original event-feed output. Include AI no-move cascades, rapid presentation supersession, status/live-region behaviour, and fixture skip path.
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
2. The existing status die remains visible after auto-select/no-move; the next AI roll is paced via the current timer, while queue membership cancels route playback and `rollPresentation.animate`/`null` cancel dice without another epoch.
3. Rendering overlays cannot affect current turn, legal moves, roll RNG, saved snapshots, AI turns, or keyboard controls.
4. Long flight visibly bends; captures return victims; home-lane anchors converge inward and stacked landings resolve to their offset target; the finished board matches committed state.
5. Sound and art slots remain placeholders; route cues share the board's rAF clock and the authored asset pack stays in separate HPA-437.
6. Regression tests, lint, typecheck, and manual accessibility/reduced-motion checks are completed **on this same PR**.

## Explicitly deferred

HPA-429 Sky Tycoon tile effects/economy; HPA-362 match stars and skins; HPA-437 generated plane/board/icon art and production SFX. No extra APIs, audio dependencies, DB migrations, theme registry, analytics, or new game-rule events.
