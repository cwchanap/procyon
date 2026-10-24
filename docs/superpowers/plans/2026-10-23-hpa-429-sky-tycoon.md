# HPA-429 — Sky Tycoon implementation plan

Design: [Sky Tycoon design](../specs/2026-10-23-hpa-429-sky-tycoon-design.md)  
Issue: https://linear.app/cwchanap/issue/HPA-429/aeroplane-sky-tycoon-mode-monopoly-style-tiles-coins-airports  
Branch: docs/hpa-429-sky-tycoon-design-plan  
Baseline: main inspected 2026-10-23. The motion/rendering changes from HPA-428 are already on main.

## Delivery and scope policy

**One ticket = one PR.** This draft PR begins with only the design and implementation plan. Implement and test HPA-429 on this very branch, then mark this PR ready; do not create a second implementation PR. Keep asset generation HPA-437 and progression HPA-362 outside this PR. Use existing game/runtime primitives; no generic tile engine, event bus, new React state manager or backend schema.

## Step 0 — existing reuse survey and invariants

Read the implementation and relevant tests before modifying these paths:

- apps/web/src/lib/aeroplane/{types,game,rules,topology,rng,ai,checksum,persistence,replay}.ts
- apps/web/src/hooks/useAeroplaneMatch.ts
- apps/web/src/components/{AeroplaneGame.tsx,aeroplane/AeroplaneSetup.tsx,aeroplane/AeroplaneBoard.tsx,aeroplane/AeroplaneStatus.tsx,aeroplane/AeroplaneEventFeed.tsx}
- apps/web/e2e/aeroplane.spec.ts; existing aeroplane *.test.ts and controller/component tests.

Reuse rule ownership in game.ts and rules.ts, 52-node topology, three RNG streams, action checksums, frozen setup, synchronous save, AI timers, and disposable presentation. Do not transplant any of these into tycoon.ts. The latter should contain only the static map, card list, and pure single-trigger economic/effect resolution.

## Step 1 — mode, static content and typed pure effects

- In types.ts add independent mode, TycoonState and typed informational events. Keep original positional move/jump/flight events and ResolvedMove semantics; explicitly distinguish them from tile events for the motion renderer.
- In game.ts initialize tycoon state only when mode is enabled; preserve Classic and Quick defaults and config normalizer. In rng.ts derive a third effectRng from the same seed with a distinct salt.
- Add lib/aeroplane/tycoon.ts with tile definitions keyed by global track index (eight paired airports, fixed boon/trap/Chance locations), a ten-card shuffled deck, immutable coin transfers and one-shot tile resolution. Reuse toGlobalTrackIndex and TURN_ORDER. The static map must be the only location source for rules and SVG.
- Keep constants simple and explicit in this module: starting coins 10, departure +3, airport price 5, toll 2/double-pair 4, Customs 3 and Tax 2. No configuration UI for rates.

Tests: creation and config-preservation, seeded deck permutation/re-shuffle, every tile/card, coin caps, airport ownership/toll, deterministic richest-opponent tie, duplicate shield pickup, wormhole exit eligibility and forced movement/collision safeguards.

## Step 2 — integrate effects at authoritative game boundary

- In rules.ts keep original legal move enumeration unaware of randomness; factor/shared-use the existing final occupancy/capture logic where needed instead of copying it into tycoon.ts.
- In game.ts, after validating the selected move, apply shield-sensitive capture handling and a single tile/card effect; include positional events only for actual movement, append typed effect events to the committed action, and return updated effectRng. Re-evaluate finish and decide exactly one bonus turn for six or Tailwind. In Standard mode the original results must remain identical.
- Handle skipNextRoll in rollTurn: visibly consume the die, clear skip, advance regardless of a six, append missed-roll event and return no legal moves. Avoid a new action kind and avoid clock/timer changes.
- Award departure only for a launch-pad-to-track move, including a subsequent relaunch, never when launching from the hangar.

Tests: full transition sequences including shield before capture, forced movement landing on protected/occupied squares, Chance no-chain, Tailwind/skip/roll-six ordering, home/finish and post-effect victory; do not modify caller input. Standard-mode snapshot assertions before/after.

## Step 3 — persistence, deterministic replay and controller

- In persistence.ts and types.ts make the saved envelope v2 (update storage key/fixture contract in the same change), validate all TycoonState fields and event discriminants. Explicitly reject unsupported v1 without migration.
- In replay.ts use the same effect resolver, seeded card order and effectRng, compare post-effect events/checksums per action, and verify final effectRng as well as diceRng and aiRng.
- In useAeroplaneMatch.ts carry effectRng in ActiveAeroplaneMatch, restore/fresh creation, candidate E2E fixture, synchronous committed state and action records; use transition's final movement route for presentation, not uncommitted preview effects. Integrate skip with the existing scheduled AI roll/decision effect, without a second scheduler.
- In buildAeroplaneHistoryPayload add mode and the terminal coin balances/details consumed later by HPA-362; no star math yet.

Tests: reload at awaiting-choice and after Chance, mismatched altered events/checksum/RNG, deterministic replay of consecutive AI turns, invalid v2 content, Standard persistence and authenticated history payload shape. Simulate missing localStorage gracefully through existing helpers.

## Step 4 — UI, AI heuristic and accessible feedback

- AeroplaneSetup.tsx: separate Standard/Sky Tycoon choice from Classic/Quick/Custom rules. Change mergeSetup in hook so switching preset does not unset mode; changes remain frozen once match begins.
- AeroplaneStatus.tsx: add four colour coin balances with labels; display skips/shields when relevant. AeroplaneBoard.tsx: project tile map onto existing TRACK_ANCHORS, add simple accessible glyph labels and ownership rings/tint, preserving existing plane hit targets, sprites, and HPA-428 route playback. No new assets in this task.
- AeroplaneEventFeed.tsx/AeroplaneGame.tsx: consume typed effect events from committed action; readable buy/toll/bonus/Chance/impound text. Keep Skip/reduced-motion semantics.
- ai.ts: use current scoreAiMove with small per-personality expected tile value; no hidden RNG draws, card look-ahead or search expansion.

Tests: setup state transitions, standard board untouched, Tycoon tiles and status, event wording and ARIA labels, reduced-motion and skip, deterministic AI choices.

## Step 5 — end-to-end and quality gate

- Extend apps/web/e2e/aeroplane.spec.ts with seeded Tycoon scenario including AI turns, property purchases/tolls, Chance, save/reload and completion. Keep existing Standard journey.
- Focused unit tests first: bun test src/lib/aeroplane src/hooks/useAeroplaneMatch.test.ts, from apps/web. Then run in apps/web: bun run test, bun run typecheck, bun run lint, bun run test:e2e -- e2e/aeroplane.spec.ts (adjust Playwright CLI arguments to existing script conventions).
- At repository root run bun run format:check; run broader bun run test / build before marking ready when environment/dependencies permit.
- If the runtime dependencies or e2e browser are unavailable, report which checks could not run rather than claiming success.

## Acceptance checklist

- [ ] Sky Tycoon is selectable, independent of base rule preset, and playable through victory with one human and three current AIs.
- [ ] Each specified boon, trap, property mechanic and 10-card deck has deterministic pure tests; no negative coins, recursive tile chains, invalid collisions or extra AI RNG consumption.
- [ ] Replay, checksum and reload validate full game/effects state and independent RNG streams; v1 handling is explicitly unsupported.
- [ ] Standard gameplay, dice, route animation, controls and history remain unaffected by Tycoon.
- [ ] UI conveys balances, property owners and effect results with keyboard/reader-friendly labels; placeholder visuals are sufficient.
- [ ] History stores final coins for HPA-362; no star/skin changes and no actual artwork or SFX generation.
- [ ] Code and tests are committed to this original HPA-429 PR; no additional implementation PR.

## Design risks to review before coding

1. **Departure vs recurring Pass GO:** finite topology has no full circuit; one bonus per departure/redeparture is the implementable rule.
2. **Forced relocation and shields:** settle deterministic collisions in the pure resolver before changing UI. Specifically test own occupied destinations, shield cancellation and changed final endpoints.
3. **Informational vs motion events:** keep the existing HPA-428 animation projector fed only positional events; any Tycoon feedback is committed authoritative data, not a timer.
4. **Snapshot v2:** consciously discard active v1 saves, with no migration or compatibility scaffolding.
