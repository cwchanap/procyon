# HPA-429 — Sky Tycoon implementation plan

Design: [Sky Tycoon design](../specs/2026-10-23-hpa-429-sky-tycoon-design.md)  
Issue: https://linear.app/cwchanap/issue/HPA-429/aeroplane-sky-tycoon-mode-monopoly-style-tiles-coins-airports  
Branch: `docs/hpa-429-sky-tycoon-design-plan`  
Baseline: `main@6b1b220`, reviewed 2026-10-24 after HPA-428 motion landed.

## Delivery

**Exactly one PR for HPA-429.** The design/plan docs are the first commits; implementation, tests and responses to review go in this **same draft PR**, in reviewable commits. Keep art/SFX generation in HPA-437 and stars/skins in HPA-362. No new game engine, event bus, Redux/store, database migration or general-purpose tile framework.

## Reuse-first inventory

- `apps/web/src/lib/aeroplane/{types,game,rules,topology,rng,ai,checksum,persistence,replay,presentation}.ts`: one move engine and pure path/projector, two existing persistent seeded RNG streams, canonical whole-state checksums and replay. `finalSharedOccupancy` and `finalHomeOccupancy` currently live in `rules.ts`; export/reuse just what the effect resolver needs.
- `apps/web/src/hooks/useAeroplaneMatch.ts`: frozen setup, sync save, AI scheduling, `applyMove`→`enqueuePresentation(move,action)`, event feed and dev fixture.
- `apps/web/src/components/AeroplaneGame.tsx` and `components/aeroplane/{AeroplaneSetup,AeroplaneBoard,AeroplaneStatus,AeroplaneEventFeed}.tsx`: SVG node layout, HPA-428 tween/die/cue, user controls and readable move history.
- `apps/api/src/routes/play-history.ts`, `apps/api/src/types/play-history.ts`, `apps/api/src/routes/play-history.test.ts`: server-side Zod history parsing and JSON details. The API strips unrecognized detail keys; update it with the client.
- `apps/web/e2e/aeroplane.spec.ts`: injected fixtures and `nearVictoryFixture`, preferred over long uncontrolled games.

## Step 0 — pin Standard outcomes BEFORE changing rules

Add one small deterministic, **four-seat** baseline test, using a fixed root seed and explicit test-only AI decision policy for the nominal human seat. Run both `CLASSIC_CONFIG` and `QUICK_CONFIG` to termination using the existing `rollTurn`, `chooseAiMove` and `playResolvedMove`. Record and assert literal values for **winner, turnNumber, every plane's progress and complete stats**. Keep the run bounded, use a known finishing seed, and record the chosen seed/policy in the test.

This test **must land as the first implementation commit**, before modifying rule behavior. Do **not** pin action-checksum hexes: current tests compute correct checksums dynamically and only hardcode intentionally invalid tamper values. Future `config.mode`/v2 schema edits may change serialized bytes without changing gameplay outcomes.

## Step 1 — small pure Tycoon model, tile map and shield legality

1. In `types.ts`, add independent `config.mode`, `state.tycoon` and typed `TycoonEffectEvent`. Keep `AeroplaneEvent` positional; add a distinct `warp` event for a direct off-track relocation. `ResolvedMove.events` stays positional, while action events may contain either movement or effect information.
2. In `game.ts`, initialize Tycoon only when mode is selected. Add an initial ten-card Fisher–Yates shuffle from a distinct salted effects seed derived from `rootSeed` (extend `deriveRngStreams` or use a small local helper). **Discard the temporary effects seed** once `chanceOrder` is initialized; draws are `chanceOrder[chanceCursor % 10]`. Keep existing diceRng and aiRng unchanged. No `effectRng` parameter/field in active match, fixture, save or replay.
3. Add only `lib/aeroplane/tycoon.ts`: one static global-index table shared by rule resolution and board, exact values and paired airports as in the design, ten card definitions, immutable transfers and one-shot `resolveLanding` helper. Preserve **all** named tile kinds, including exactly two Crash placements. Deliberately accept the documented asymmetry across 13-square starts; no balancing engine.
4. In `rules.ts`, reuse/export `finalSharedOccupancy` and relevant occupancy/path checks. An enemy destination containing **any** shielded defender is illegal (same logic as a blockade); multiple friendly defenders cannot be partially captured. Expire the shield when its plane next moves; never implement attacker knockback. This automatically updates preview, threat detection and AI's legal capture scoring.

Focused tests: tile-index uniqueness and reachable pairs, coin caps/autobuy/tolls, each named tile and ten cards, deterministic shuffled deck/cycling, shield pickup/protected stacks/expire-on-move, invalid occupancy, no chained effects. Prove input state immutability.

## Step 2 — authoritative effective move and presentation

1. `playResolvedMove` validates the original **selected** `ResolvedMove` against `getLegalMoves`, as today, then applies normal motion/captures and exactly one tile/card resolution. Extend its returned `transition.move` to an **effective** `ResolvedMove`: original `start` and route plus actual appended relocation events, committed `finalEndpoint` and real `capturedPlaneIds`. Never count rejected/reversed captures. Call `updateStats` with the **effective** move.
2. Keep `move | jump | flight` for ordinary path segments. Add `warp` positional events for Wormhole, Storm, Crash: extend `presentation.ts` so `warp` is rendered as **one direct segment** without `moveWaypoints`/finish-bounce logic; Boost adds an ordinary forward `move` with correct blockade/path and home occupancy checks. Since Boost triggers only on progress 1–50, it reaches at most 53; no effect-based finish/overshoot branches.
3. In `useAeroplaneMatch.applyMove`, pass **`transition.move`**, not the selected move, to `enqueuePresentation` (one-line ownership fix). The board/timeline, move destination feed, cues and chatter now consume the actual effective result. Keep informational `TycoonEffectEvent` in `action.events` alongside positional events; the motion projector never reads the mixed action list and requires **no positional type guard**.
4. In `rollTurn`, a Customs skip shows and consumes the real die then forces turn handoff (even on six), but **does not increment `noMoveStreak`**, which influences relaxed dice; include a typed informational skip in the roll action. Tailwind and six grant **one**, not two, bonus rolls. Existing AI timer remains the sole scheduler.
5. Reuse `resolveLanding` for forced placement legality. If a Boost/warp destination or path is blocked by occupancy/blockade, keep the original legal tile landing and consume the effect. Forced relocations never cascade through another tile.

Focused tests: selected-versus-effective move, actual capture/stat accounting, no shields falsely reported captured, terminal cue on actual endpoint, Storm `warp` never going via progress 56, home occupancy when Boost starts at 48–50, blocked path, Tailwind/six, Customs skip streak/extra-turn, no tile recursion. Run the pinned Step 0 Standard test unchanged.

## Step 3 — v2 persistence, replay, controller and API history

- Upgrade `PersistedAeroplaneMatchV1` → v2 type/key (rename its references and fixtures together). v1 restores fail loudly with no migration. Validate `mode`, `state.tycoon`, Chance order/cursor and the discriminated `AeroplaneActionRecord.events: (AeroplaneEvent | TycoonEffectEvent)[]`; movement events must still have `from`/`to` and `warp` is positional.
- Existing `checksumState` hashes all state; no custom checksum work. `replay.ts` regenerates the same shuffled deck from root seed, replays cyclic cards and compares action events/checksums plus the existing **two** dice/AI RNG continuations.
- `useAeroplaneMatch.ts` synchronously commits the effective authoritative state/action and exposes actual resulting move for presentation. Reuse current `AeroplaneE2EFixture`, roll presentation and AI timing; never add `effectRng`. Extend the feed's current entry model minimally so a committed Customs skip roll is displayed **without fabricating a move**.
- `buildAeroplaneHistoryPayload` submits `mode` and `coins`. **Also update the API**: `apps/api/src/routes/play-history.ts` `aeroplaneHistoryDetailsSchema` and `apps/api/src/types/play-history.ts` `AeroplaneHistoryDetails` accept both; coins are optional for Standard and a validated four-colour nonnegative integer balance for Tycoon. Keep the current JSON column; no SQL migration.
- Add an **API POST→GET route integration test** in `apps/api/src/routes/play-history.test.ts` proving Sky Tycoon mode and coins survive Zod parsing, database write and read. A client payload-shape test alone is insufficient.

Focused tests: tampered serialized event/state/card cursor, two RNG continuations, v1 reject/v2 restore, awaiting-choice reload before Chance, restored next draw, API history save/read, and Standard game baseline.

## Step 4 — UI and simple AI heuristics

- `AeroplaneSetup.tsx` and `mergeSetup`: Standard/Sky Tycoon control independent of Classic/Quick/Custom. Display simple automatic-purchase/finish rules.
- `AeroplaneBoard.tsx`: show tile markers using the same `tycoon.ts` map and `TRACK_ANCHORS`, subtle ownership tint and accessible labels. Preserve legal-move buttons, HPA-428 animations, reduced-motion/Skip, and sprite slots.
- `AeroplaneStatus.tsx`: display per-colour coin balances and shield/skip indicators.
- `AeroplaneEventFeed.tsx`: render **effective** move destinations/captures and typed committed economic events; add an entry for skipped-roll actions. `AeroplaneGame.tsx` wires these through the existing controller.
- `ai.ts`: add small tile expectation weights to current personality score calculation; never simulate cards or add RNG draws/search.

Tests: independent mode/preset controls, actual effective route/arrival and audio cue, economic feed and roll-only skip, board labels, AI choices, reduced-motion/Skip, no effect on Standard UI.

## Step 5 — scoped test and review gate

- Extend `apps/web/e2e/aeroplane.spec.ts` with **injected** near-airport/Chance fixtures, reload continuity and a short terminal route using existing `nearVictoryFixture`. Do not run a full seeded three-AI match to completion in browser E2E: slow and fragile.
- In `apps/web`, run focused `bun test src/lib/aeroplane src/hooks/useAeroplaneMatch.test.ts`, then `bun run test`, `bun run typecheck`, `bun run lint`, and `bun run test:e2e e2e/aeroplane.spec.ts` (**no `--`**; the package script directly invokes Playwright).
- In `apps/api`, run the changed play-history route test and the API suite. At repository root run `bun run format:check`, `bun run test` and `bun run build` as dependencies/environment permit; report any unavailable verification honestly.
- Commit in coherent steps, preserving the baseline test evidence. Review each commit in the **same PR**; no mandate to change repo merge strategy.

## Acceptance

- [ ] Pinned Standard Classic and Quick gameplay outcomes stay identical after Tycoon implementation.
- [ ] Tycoon is selectable and deterministic; explicit 52-track map retains eight airports, four Chance and all named special tiles; no effects chain.
- [ ] Shield makes defended endpoints illegal until owner moves, with valid mixed-stack and AI threat handling; no attacker knockback.
- [ ] Boost/warp effect changes appear in **effective move** animation, feed, captures/stats and sounds; Storm timeline never treats backward movement as finish bounce.
- [ ] Customs skip does not mutate relaxed-dice no-move streak; no duplicate bonus turns or negative coins.
- [ ] Seeded cyclic deck, v2 recovery, replay/action events and **two** RNG continuations pass determinism checks; no saved effects stream or v1 compatibility path.
- [ ] API POST→GET round trip preserves `mode` and terminal `coins` in JSON details for HPA-362.
- [ ] Existing placeholders used; no HPA-437 art/SFX or HPA-362 reward implementation.
- [ ] Implementation and tests land on this same PR; CI and targeted E2E results are documented.

## Review decisions

Round 1: separate positional vs informational events; clarify non-zero-sum bank; keep Standard *gameplay* invariants, not byte-identical v1 saves; fix Playwright CLI.

Round 2: accept effective move as presentation/stats authority, cyclic Chance deck, shared-legal-move shield, API schema/test, pinned Standard baseline, impossible finish-test removal, and Customs streak semantics. **Tile placement choice:** use the explicit global indices in the design and consciously accept limited asymmetry rather than reduce the original ticket's named tile kinds. Keep the solution lightweight and one PR.
