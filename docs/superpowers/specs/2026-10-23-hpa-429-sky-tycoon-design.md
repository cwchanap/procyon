# HPA-429 — Aeroplane Sky Tycoon: design

Issue: https://linear.app/cwchanap/issue/HPA-429/aeroplane-sky-tycoon-mode-monopoly-style-tiles-coins-airports  
Related: HPA-362 (rewards; blocked by this ticket), HPA-437 (art/SFX; independent).  
Baseline: Procyon `main@6b1b220`, reviewed 2026-10-24. This is a docs-first **single PR**, with implementation and tests added to the same branch after review.

## Goal and boundaries

Add a playful coin, airport and tile layer to local Aeroplane Chess. One human plays the existing three personality AIs. Victory still requires finishing planes. Standard gameplay outcomes must not change. No network mode, database migration, purchase dialogs, trading, skins, rewards, generated art/SFX or generic tile framework.

Select `config.mode: 'standard' | 'sky-tycoon'` independently of `rulePreset: 'classic' | 'quick-chill' | 'custom'`. Switching a rule preset retains the mode; editing house rules does not disable Tycoon. The match freezes both configuration choices.

### Departure bonus and economy

The existing route runs from launch progress 0 across track progress 1–50 and home progress 51–56, **not** repeated laps. Adapt “Pass GO” to **Departure +3** only on a successful launch-pad-to-track transition (0 → 1+), including another departure after capture/relaunch. Hangar → launch alone pays nothing.

Each player begins with 10 coins. Balances never go negative; the bank is unlimited and the economy is intentionally **non-zero-sum**. Departure/positive Chance cards mint coins; airport purchases, Customs and Tax burn them; tolls/steals transfer available balances. Capture or Crash sends a plane to hangar and may indirectly lead to another Departure +3 on a *later* relaunch; Storm does likewise **only** if it retreats to the launch pad. There is **no immediate refund** on any punishment. This is intentional mild rubber-banding.

## Reuse survey and authority

- `game.ts` owns `createAeroplaneMatch`, `rollTurn`, `advanceAfterTurn`, `playResolvedMove`, victory and stats. `rules.ts` owns `resolveLegalMove`, `applyResolvedMove`, `finalSharedOccupancy`, captures and blockades. Export/reuse occupancy logic instead of duplicating it.
- `topology.ts` owns `toGlobalTrackIndex` and the 52-node track. One fixed `tycoon.ts` tile map is shared by board and resolver; no new topology engine.
- `rng.ts` already derives dice and AI RNG streams from `rootSeed`. Derive a **temporary** third salted seed only for the initial Chance deck shuffle, then discard it. No effect RNG in state, fixtures or persistence.
- `checksum.ts` already hashes full authoritative state; `replay.ts` rebuilds from root seed. `persistence.ts` validates authoritative saves. Extend current paths; do not build a second log or checksum algorithm.
- `useAeroplaneMatch.ts` commits and synchronously persists authoritative transitions before transient presentation. `AeroplaneBoard` and `presentation.ts` animate `ResolvedMove`, not arbitrary action events; `AeroplaneEventFeed` also reads the `move` field. Keep that contract, but supply the **effective** move.
- API history also has an explicit Zod `aeroplaneHistoryDetailsSchema` in `apps/api/src/routes/play-history.ts`. Updating only the client would silently strip new mode/coin fields.

## State and persistence

Add `state.tycoon: SkyTycoonState | null`, null in Standard mode:

- `coins`: nonnegative integer per colour; initially 10;
- `airports`: tile global-index → owner-colour map; absent means unowned;
- `shields`: set/list of plane IDs protected **until those planes next move**;
- `skipNextRoll`: boolean per colour;
- `chanceOrder`: shuffled permutation of ten unique card IDs;
- `chanceCursor`: nonnegative integer, incremented on each draw.

For each match, shuffle the ten-card deck once via seeded Fisher–Yates; cycle drawn cards to the bottom with `chanceOrder[chanceCursor % 10]`. No reshuffle or mutable RNG continuation after setup. The order/cursor are authoritative state, covered by the existing checksum. Dice and AI RNG streams remain independent.

Bump the local recovery envelope/storage key to **v2**, rejecting v1 without migration or compatibility logic. Validate Tycoon state/event discriminants and preserve the two existing end-of-replay RNG comparisons. The added `config.mode` changes serialized state, but **do not regenerate fictional hardcoded Standard checksum baselines**: existing checksum literals are intentional tamper fixtures. Instead add real pinned Standard gameplay regression tests before modifying rules.

## Fixed tile map (global indices 0–51)

Use the following **exact, non-overlapping** global track indices in `tycoon.ts`, not a new configurable layout or inferred quarter placement. This preserves all named tile types and only two Crash tiles from HPA-429.

| Tile | Global indices |
| --- | --- |
| Airport matching pairs | (0, 26), (6, 32), (13, 39), (19, 45) |
| Chance | 3, 16, 29, 42 |
| Boost | 2, 28 |
| Tailwind | 5, 31 |
| Shield | 8, 34 |
| Wormhole | 11, 37 |
| Storm | 15, 41 |
| Customs | 18, 44 |
| Tax | 21, 47 |
| Crash | 24, 50 |

Airport/Chance counts repeat at each 13-square player-start offset, while the other kinds form opposite 26-node pairs. **Perfect four-colour symmetry is not claimed**: two copies of a kind cannot repeat every 13 indices. We accept that simple asymmetry for this casual mode rather than silently removing the ticket's tile types or introducing a balance engine. Test all index sets, pairing, reachability and basic seeded playability.

A tile triggers once after the **selected move's normal final shared-track landing**, including its ordinary jump/flight; it never triggers from launch, hangar, private home lane or finish. A forced relocation does **not** trigger another tile, flight, jump or card.

### Effects and constants

- **Airport:** price 5 from bank; auto-buy if unowned and affordable. Other colours pay the owner toll 2 or 4 if they own the matched pair, capped by payer's coins. Owner pays nothing.
- **Boost:** advance three logical progress squares. Since the trigger endpoint is at most progress 50, Boost can reach at most home progress **53**, never finish (56) or overshoot. Reuse blockade/path and friendly occupancy rules; on a blocked path or occupied home cell, remain on the original tile and consume the effect.
- **Tailwind:** grant one more roll after this move; it does not stack with a natural six.
- **Shield:** the shielded plane's shared-track square is **illegal for opponents to land on**, using the existing blockade/occupancy check. The shield expires when that plane next moves; repeated pickups do not stack. This is the intentionally simplified implementation of “blocks next capture” rather than knockback/consume-on-attack. If multiple friendly defenders share a square and any is shielded, opposing landing is illegal. AI and threat previews automatically respect the same legal-move authority. Storm/Crash can still relocate a shielded plane.
- **Wormhole:** warp to the next wormhole further along the plane's remaining player-relative shared route; no wrap or backwards warp. If none, stay put.
- **Storm:** retreat up to 3 progress steps, stopping at the launch pad.
- **Customs:** auto-pay 3 to bank if affordable; otherwise mark the player to skip their next roll opportunity (no prompt).
- **Tax:** pay up to 2 coins to bank.
- **Crash:** return the mover to hangar (two Crash tiles, no third).
- **Chance:** draw a cyclic seeded card. Exactly ten cards: +4, +2, -2 coins; steal up to 3 from the richest opponent (ties broken by `TURN_ORDER`); Boost, Tailwind, Shield, Storm, Customs, Crash. Resolve exactly once; never chain to the card's destination tile.

Reuse `finalSharedOccupancy`, `finalHomeOccupancy` and blockade/path checks for forced destinations. A forced relocation blocked by occupants or blockades leaves the plane at its original legal tile endpoint, with the effect consumed. No mixed-colour stacks.

## Authoritative moves, events, animation and stats

1. `rollTurn` is the only dice authority. A Customs skip still consumes/shows a real die result, clears the flag and advances to the next player **even on six**. Emit an informational event in the committed roll action, but **do not increment `noMoveStreak`**: the player was forced to skip, not unable to move. That counter influences relaxed dice.
2. `resolveLegalMove` stays random-free and authoritative. Shielded enemy destinations are illegal in `finalSharedOccupancy`, so previews, threat probes, AI, gameplay and replay agree.
3. `playResolvedMove` validates the **selected** move, applies normal rules, Departure and one Tycoon effect, and returns `transition.move` as the **effective** `ResolvedMove` (same existing type). Preserve the selected `start` and original positional events; append any real post-landing positional relocation event, update `finalEndpoint` to the committed destination, and populate `capturedPlaneIds` with **actual**, not hypothetical, captures. `updateStats` uses this effective move.
4. Keep `AeroplaneEvent` positional with required `from`/`to` and kinds `move | jump | flight | warp`. `warp` is a direct segment, **never** processed by `moveWaypoints` or mistaken for a finish bounce. Use `move` for Boost's ordinary forward steps; use `warp` for Storm/Wormhole/Crash. No extra capture/knockback branch for Shield.
5. Keep `ResolvedMove.events: AeroplaneEvent[]`. Introduce a separate coordinate-free discriminant `TycoonEffectEvent` for money, ownership, cards, shields, skip, etc. Persist all movement plus informational events on `AeroplaneActionRecord.events: (AeroplaneEvent | TycoonEffectEvent)[]`. Validate and compare that union in replay; never invent positional coordinates for coin changes.
6. In `useAeroplaneMatch.applyMove`, pass **`transition.move`** (not the selected move) to `enqueuePresentation`, which feeds `buildMoveTimeline`, destination/capture copy, chatter and terminal sound cues. The projector receives the effective move's **positional-only** `events` and therefore needs no filter. The feed separately consumes committed informational `action.events`. It must also show a skipped-roll informational action without fabricating a movement entry; reuse the current feed/controller, not a second authoritative log.
7. Ordinary rules are the only path to finish: Tycoon tile/card moves cannot reach progress 56. Keep normal victory evaluation and exactly one bonus turn for six or Tailwind (no stacking). Preserve existing Standard outcomes.

## History integration and UX

The client `buildAeroplaneHistoryPayload` must include `mode` and terminal four-colour `coins` for Sky Tycoon. Extend **both** `apps/api/src/routes/play-history.ts`'s `aeroplaneHistoryDetailsSchema` and `apps/api/src/types/play-history.ts`'s `AeroplaneHistoryDetails`. Coins are optional for Standard history and validated as four nonnegative integer colour balances when present; Tycoon submissions must supply them. The existing `details` JSON column needs **no migration**. Test authenticated POST then GET to prove the fields survive parsing and storage for HPA-362.

- Setup: independent mode selector, description of auto-purchases and planes-first victory.
- Board: placeholder accessible tile glyphs and airport ownership tint, preserving HPA-428 sprite slots/controls/motion.
- Status: coin balances and relevant skip/shield indicators.
- Feed: actual effective move destination/captures, readable economic/Chance messages and roll-only Customs skips. Honor reduced-motion and Skip animations.
- AI: small per-personality utility weight on the existing `scoreAiMove`; no chance simulation, search, new AI engine or RNG side effect.
- Store final coins only; **do not** add HPA-362 stars/skins or HPA-437 art/SFX.

## Tests and acceptance

- **First, before rule edits:** one seeded deterministic four-seat Standard simulation each for Classic and Quick, using a documented test-only choice policy for the nominal human seat. Pin literal `winner`, `turnNumber`, every plane's progress and complete `stats`. Do not pin checksum hexes.
- Pure tests: exact tile map/airport pairings, ten cards/cyclic deck, amounts, blocked/unaffordable payments, shielded stacked defenders and expire-on-move, Storm warp never visiting finish 56, Boost blocked by shared blockade or occupied home progress 51–53, skip vs relaxed no-move streak, no chain, valid collision/turn outcomes.
- Determinism/replay: independent seeded runs match state, action events, Chance order/cursor, checksum and **two** RNG continuations; invalid v2 payloads and tampered effects are detected; awaiting-choice resume does not advance deck.
- UI/E2E: one or more injected near-airport/Chance fixtures and existing `nearVictoryFixture` pattern for short terminal coverage; test reload, feedback, visible balances and reduced-motion. Do **not** require a long full game against three AIs to finish in E2E.
- API: POST→GET authenticated history route preserves `mode` and `coins`, with Standard mode supported.

## Explicit exclusions

No second PR for HPA-429, no v1 migrations, no third saved RNG, no knockback shield, no finish-after-Boost edge case, no tile chains, new tables, general-purpose economic engine or real asset generation. HPA-437 remains art/SFX only; HPA-362 remains progression/rewards only.
