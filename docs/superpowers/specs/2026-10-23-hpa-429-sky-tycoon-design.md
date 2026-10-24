# HPA-429 — Aeroplane Sky Tycoon: design

Issue: https://linear.app/cwchanap/issue/HPA-429/aeroplane-sky-tycoon-mode-monopoly-style-tiles-coins-airports  
Related: HPA-362 (rewards; blocked by this ticket), HPA-437 (art/SFX; independent).  
Baseline: Procyon main, inspected 2026-10-23, after the HPA-428 motion work. This PR starts with documentation and will contain implementation and tests **in the same PR**.

## Goal and product boundary

Add a playful, deterministic coin-and-tile layer to local Aeroplane Chess without changing Standard games. One human still plays three existing personality AIs; planes still win by reaching the existing victory target. Sky Tycoon has no manual purchase dialogs, trading, elimination, real art, new database tables, or star/unlock system.

### Explicit adaptation: “Pass GO” on a non-lapping track

The existing logical route goes from launch progress 0 through shared progress 1–50 and home progress 51–56. It does **not** make recurring laps past the player's own launch point. Therefore +3 coins is a **Departure / Pass GO bonus whenever a plane successfully leaves its launch pad for the shared track (progress 0 to 1+)**, including relaunch after capture. Merely placing a plane on its launch pad does not pay. This is a deliberate interpretation of the issue, not a fictitious full-lap trigger. Label it “Departure +3” in the event feed.

## Reuse first — current ownership boundaries

- game.ts owns match creation, immutable config, rollTurn, advanceAfterTurn and playResolvedMove. rules.ts owns resolveLegalMove/applyResolvedMove and normal jump, flight, capture, finish.
- topology.ts owns the single 52-node track mapping (toGlobalTrackIndex) and player-relative progress; reuse it for shared, fixed tile locations. Do not duplicate board geometry in a second engine.
- rng.ts already derives separate dice and AI streams from one seed. Add an independent effects stream, not Math.random() or chance consumption from dice/AI.
- useAeroplaneMatch.ts owns authoritative commit, synchronous save, AI timing and the disposable presentation queue. Keep those ownership rules.
- persistence.ts, replay.ts and checksum.ts already validate, serialize and replay rolls/moves and detect divergence. Extend these paths rather than adding an independent event log.
- AeroplaneSetup/Board/Status/EventFeed and AeroplaneGame already own the UI. The HPA-428 board motion queue accepts movement events; tile notifications must not be mistaken for geometric motion.

## Mode and state contract

Add config.mode: 'standard' | 'sky-tycoon' (default 'standard'), independent of the existing rulePreset: 'classic' | 'quick-chill' | 'custom'. Switching the base rule preset must retain the selected game mode; editing a house rule must not silently disable Sky Tycoon. New matches freeze both.

Add state.tycoon: SkyTycoonState | null; null for Standard. Tycoon state has:
- coins: per-colour integer balances (10 initially; never negative);
- airports: fixed track-global-index to owner-colour map (unowned by absence);
- shields: plane IDs with a one-use shield (per plane, no stacking);
- skipNextRoll: per-colour boolean flags;
- chanceOrder: a permutation of ten card IDs and chanceCursor: number.

Extend the match envelope with effectRng. Use the existing rootSeed to derive it independently, including the initial seeded Fisher–Yates deck shuffle. Store its continuation alongside diceRng and aiRng. A depleted deck is reshuffled using only effectRng. There is no need for a deck service or global store.

**Persistence breaking change:** use a v2 envelope/storage key and update all call sites, tests and developer fixtures in this single PR. Do not write a v1 migration or compatibility branch; old in-progress saves are intentionally not resumable. Extend structural validation, action-event validation, final RNG comparison and action checksums.

## Tile map and simple economic constants

Create one static tile map in a small tycoon.ts module keyed by global track indices 0–51, reused by resolver and SVG board. Placement is deterministic, fixed across colours, with non-overlapping entries: 8 airports (four explicit pairs), 2 each of Boost, Tailwind, Shield, Wormhole, Storm, Customs, Tax, Crash, and 4 Chance tiles. Other cells are ordinary; tiles only trigger on final shared-track landing, never on home, hangar, launch or finish. Ordinary jump/flight resolution happens first.

- Airport: price 5 from bank; landing on unowned property auto-buys when affordable. Otherwise it remains unowned. Landing on an opponent's property transfers up to 2 coins (4 if the owner holds the other property in its designated pair); pay only available coins. Owner landing has no fee.
- Boost: move the landing plane forward 3 logical steps, respecting exact/bounce finish. If exact finish would overshoot, keep the pre-boost landing.
- Tailwind: one extra roll after this move; it does not stack with a rolled six.
- Shield: give the landing plane one-use capture protection; repeated pickups do not stack.
- Wormhole: move to the next wormhole farther ahead on this plane's remaining player-relative shared path. If none exists, stay put. No backwards warp or wrap-around.
- Storm: retreat 3 logical progress steps, stopping at the launch pad if necessary.
- Customs: if coins >= 3, pay 3 to bank immediately; otherwise mark the player to miss their next roll opportunity. No manual prompt.
- Tax: pay up to 2 coins to bank.
- Crash: send the landing plane to its hangar (two Crash locations, max).
- Chance: draw the next seeded card. Ten fixed cards: +4, +2, -2 coins; steal up to 3 from the richest opponent (ties broken by TURN_ORDER); Boost; Tailwind; Shield; Storm; Customs; Crash. Each card applies its named effect once.

Forced relocations from a tile/card do not trigger another tile, jump, flight or card (no effect chains). Reuse collision/capture resolution at any resulting shared-track endpoint. A shielded defending plane consumes its shield and sends the would-be captor to hangar, avoiding opposing pieces sharing a square; shield does not prevent Storm/Crash. If forced relocation is blocked by friendly occupancy under current stacking/blockade rules, leave the plane at its prior legal endpoint and still consume the triggering tile/card. Test these contracts explicitly.

## Pure authoritative transition order

1. rollTurn remains the only dice owner. When skipNextRoll applies, consume the actual die result for a visible roll, clear that player's skip flag, force handoff even on a six, and issue a typed missed-turn event in the **roll** action. Never call a hidden second timer or roll RNG from effects.
2. resolveLegalMove remains the legal-move authority; do not apply tile effects or consume chance RNG during legal move preview or move enumeration.
3. playResolvedMove validates the selected original move, applies normal motion/captures with shields accounted for, awards Departure bonus if eligible, then resolves a single landing tile/card through a pure helper using effectRng and returns state, effects RNG continuation, movement events and descriptive tile events.
4. Evaluate victory on final post-effect plane progress. Otherwise advance the same turn owner on six or Tailwind; for both, only one additional turn results. Preserve Standard mode behaviour byte-for-byte as far as gameplay outcomes.
5. Record effect events and resulting checksum in the existing action history. Replay regenerates tile effects and shuffled cards from seed and checks every event/checksum and final effectRng. Save/reload at awaiting-choice must not consume a chance card before selection.

Use a tagged informational event (e.g. 'tile-effect' with a typed kind, amount/actor/target metadata) within AeroplaneEvent alongside existing move/jump/flight, not an unstructured UI-only log. Keep motion events in ResolvedMove.events; apply the authoritative post-effect route to the presentation queue only when movement occurred. Filter out informational events before the board's motion timeline; the event feed renders readable coin/property/effect messages.

## AI and interface

- Keep the existing three AI personalities and the scoreAiMove path. Add a small expected tile-utility term (coins, airport buy/toll, safety/penalty, finish), without simulating draws or consuming effectRng. Cautious favours shields/avoids Crash; aggressive values property and opponent payment; unpredictable keeps its existing seeded jitter. No tree search or economy optimizer.
- Setup: explicit Standard / Sky Tycoon selector independent of rulePreset; one explanatory sentence describing automatic purchases and win condition.
- Status: coin balances for four seats, optional skip/shield indicators. Board: placeholder ASCII/SVG glyphs for tile kind, subtle airport ownership tint, preserving clickable plane hit targets and HPA-428 animation.
- Feed: authoritative, understandable effect messages (purchase, toll payer/receiver, launch bonus, shield, chance card, forced move, missed roll). Screen-reader labels describe tile and ownership. If reduced-motion / Skip animations is enabled, outcomes still show immediately.
- Match completion: put mode and final coin balances in existing play-history details so HPA-362 can later convert coins to bonus stars; do not compute or display stars in HPA-429. Signed-out matches remain playable.

## Testing and acceptance

- Standard regression: seeded rolls/moves, finish, extra six, AI and saved/replayed games unchanged except intentional v2 schema.
- Tycoon pure unit tests: each tile and ten cards, ownership pair/tolls/insufficient funds, repeat Departure bonus after relaunch, double effects prevented, shield/collision, capture→launch, two Crash placements, no-negative-coins, Tailwind vs six, Customs skip despite six, finish after Boost, stuck exact finish, no chaining and deterministic ties.
- Two independent seeded simulations should match action events, state checksums, deck order and three RNG continuations. Replay catches an edited coin balance, ownership, event or effectRng. Restore mid-game and awaiting-choice gives identical future draws.
- Component/E2E: mode/preset independence, human vs 3 AI completion, all balances and tile glyphs, accessible feed and reduced-motion/Skip, reload continuity.

## Explicitly out of scope

Actual sprite/icon/music/SFX generation and theme asset integration belong to HPA-437. Stars, skin unlocks, end-screen celebrations and progression belong to HPA-362 (which HPA-429 unblocks). No migrations, new packages, new tables, network game, real estate upgrades, trading or modal buy choices.
