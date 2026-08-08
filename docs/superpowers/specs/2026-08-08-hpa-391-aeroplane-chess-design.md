# HPA-391 — Aeroplane Chess Design

**Status:** Product-approved design, amended after review
**PR state:** Draft
**Date:** 2026-08-08
**Linear:** [HPA-391 — Add Aeroplane Chess with one human and three personality AIs](https://linear.app/cwchanap/issue/HPA-391/add-aeroplane-chess-with-one-human-and-three-personality-ais)

## Summary

Add a complete Aeroplane Chess mode to Procyon at `/aeroplane`: one human player and three local deterministic heuristic opponents. The mode supports the two HPA-391 presets, launches, clockwise movement, colour jumps, long flights, captures, private home lanes, optional stacking/blockades, deterministic Fair/Relaxed dice, reload recovery, replay diagnostics, and unrated signed-in play history.

Aeroplane Chess is intentionally **not** another rectangular strategy variant. It gets a dedicated path engine under `apps/web/src/lib/aeroplane/`; existing `GameVariant`, `GAME_CONFIGS`, `@procyon/game-core`, LLM move adapters, and rule guardians remain scoped to Chess/Xiangqi/Shogi/Jungle.

Two parts of the original HPA-391 architecture sketch are adjusted to match code that landed after the ticket was written:

1. Procyon already has `opponentEngineId` and an unrated local-engine path for Stockfish. Aeroplane reuses that opponent kind with a new server-owned id, `aeroplane-trio-v1`; it does **not** add `opponentLocalId` or a fourth opponent column.
2. The existing `GameVariant` name remains strategy-only instead of being mass-renamed. A new `GameId = GameVariant | 'aeroplane'` carries navigation, visual-accent, and play-history identity.

The first delivery includes local personality chatter only. Provider-generated chatter is deliberately deferred: HPA-391 describes it as optional, the current provider transport is coupled to move-oriented `UniversalAIService`, and no core acceptance criterion requires remote generation.

## Review amendments

The external review was directionally correct but two proposed cuts conflict with HPA-391 itself. This revision applies the useful simplifications without dropping ticket requirements:

- **Replay stays, but it is not part of recovery.** HPA-391 explicitly requires persisted action history, state checksums, and replay diagnostics. Restore trusts a validated authoritative snapshot and exact RNG states; replay is an explicit developer diagnostic/test path only.
- **History metadata stays, but is slimmer.** HPA-391 explicitly requires rule preset, victory mode, dice mode, duration, planes finished, captures made/suffered, and AI personalities. The API stores those fields plus `humanColor`; it drops duplicate rule knobs that are not needed by history UI.
- AI seating and first-player behavior are now normative.
- Capture timing across jump/flight chains is now explicit.
- Aeroplane has only `win | loss` terminal results; `draw` is rejected by the history API.
- The history work is split into three reviewable implementation slices.
- DEV/E2E seed and fixture hooks have a concrete contract.

## Current repository state

- `apps/web/src/lib/ai/game-variant-types.ts` defines the four rectangular strategy variants and rectangular state/piece/move maps.
- `packages/game-core/` explicitly shares grid-game scaffolding while keeping rules local to each strategy variant.
- `ChessGameSelector` routes by comparing display titles rather than explicit links.
- `GamePageLayout`, `Panel`, and related components use the strategy-game accent union.
- `POST /play-history` already supports `opponentEngineId` and skips rating for engine games.
- `OpponentEngineId` currently contains only `stockfish` on API and web sides.
- `play_history` still calls its general game field `chess_id` / `chessId`.
- `usePlayHistory` assumes two-player strategy `GameStatus` and an `aiPlayer`; Aeroplane should not be forced into that lifecycle.

## Goals

1. A visitor can complete one human-vs-three-local-AI match without sign-in, API key, or network gameplay calls.
2. Classic is the default; Quick & Chill and individual overrides behave exactly as HPA-391 specifies.
3. All rule decisions operate on logical path positions, never SVG/CSS coordinates.
4. Human choice is required only when more than one legal plane can move.
5. Cautious, Aggressive, and Unpredictable always choose legal moves and are deterministic for identical state plus seed.
6. Dice and AI choice use separate serializable RNG streams; presentation consumes neither.
7. Reload recovery preserves exact authoritative state and next RNG outcomes.
8. Replay diagnostics can reproduce recorded rolls/moves/events/checksums without becoming a recovery dependency.
9. Animation, chatter, storage, and history failures cannot roll back or re-apply an already resolved move.
10. Signed-in results are stored as unrated `aeroplane-trio-v1` games and never create rating rows.
11. The feature integrates with selector/navigation/history without broadening strategy AI abstractions.

## Non-goals

- Online or local hot-seat multiplayer.
- Ranked Aeroplane play or rating calibration.
- Server-authoritative turns, spectating, clocks, takebacks, or cloud unfinished-game sync.
- A generic Ludo/Pachisi/race-game framework.
- Aeroplane support in `GAME_CONFIGS`, `GameStateMap`, LLM move adapters, rule guardians, or `@procyon/game-core`.
- New dependencies for rules, RNG, persistence validation, or state management.
- Provider-generated chatter in the first delivery.
- Cosmetics, progression, currencies, unlocks, multiple layouts, or extra house rules.
- Three-consecutive-six penalties.
- Cryptographic save integrity or anti-tamper guarantees; replay checksums are diagnostics only.

## Architecture approaches

### A — Dedicated path engine + thin shared identity/history extensions (selected)

Build rules in `apps/web/src/lib/aeroplane/`, add a small `GameId` layer, clean up play-history naming, and reuse the existing local-engine opponent path. This keeps rules independently testable and limits changes to proven strategy code.

### B — Add Aeroplane to `GameVariant` (rejected)

This would force path-game concepts into rectangular `GamePosition`, `AnyGamePiece`, `GAME_CONFIGS`, dimensions, notation adapters, and LLM rule guardians. Most values would be fake or special-cased.

### C — Build a generic race-game framework first (rejected)

There is no second race-game consumer. Designing extension points before that need exists is YAGNI and slows the feature.

## Identity boundaries

### Web

Keep:

```ts
export type GameVariant = 'chess' | 'xiangqi' | 'shogi' | 'jungle';
```

Add `apps/web/src/lib/game-id.ts`:

```ts
import type { GameVariant } from './ai/game-variant-types';

export type GameId = GameVariant | 'aeroplane';
export type Accent = GameId | 'brass';
```

`GameId` is used for navigation, selector cards, page accents, and history. `GameVariant` remains the key for grid engines, AI adapters, piece maps, capture accents, and strategy-specific code.

### API

Add:

```ts
export enum GameId {
  Chess = 'chess',
  Xiangqi = 'xiangqi',
  Shogi = 'shogi',
  Jungle = 'jungle',
  Aeroplane = 'aeroplane',
}
```

Keep `ChessVariantId` as the existing four-value type used by rating tables/services. Separate enums should not be coupled with an unsafe type predicate, so use an explicit conversion:

```ts
export function getRatedVariantId(gameId: GameId): ChessVariantId | null {
  switch (gameId) {
    case GameId.Chess:
      return ChessVariantId.Chess;
    case GameId.Xiangqi:
      return ChessVariantId.Xiangqi;
    case GameId.Shogi:
      return ChessVariantId.Shogi;
    case GameId.Jungle:
      return ChessVariantId.Jungle;
    case GameId.Aeroplane:
      return null;
  }
}
```

The server therefore owns the rated game set without adding Aeroplane to rating types.

Clean up generic play-history naming now:

- `play_history.chess_id` → `game_id`;
- API/client payload `chessId` → `gameId`;
- rating tables keep `variant_id` and `ChessVariantId` unchanged.

## Opponent and rating model

Extend the existing id:

```ts
export enum OpponentEngineId {
  Stockfish = 'stockfish',
  AeroplaneTrioV1 = 'aeroplane-trio-v1',
}
```

The web mirror becomes:

```ts
export type OpponentEngineId = 'stockfish' | 'aeroplane-trio-v1';
```

`POST /play-history` keeps exactly one opponent among user/LLM/engine. For Aeroplane, only `aeroplane-trio-v1` is accepted. The API rejects `aeroplane + LLM`, `aeroplane + stockfish`, and `aeroplane-trio-v1 + non-aeroplane`.

Rating eligibility is derived by the server:

```ts
const ratedVariantId = getRatedVariantId(body.gameId);
const shouldRate = kind === 'llm' && ratedVariantId !== null;
```

Only `shouldRate` calls `updatePlayerRating`, using `ratedVariantId`. Aeroplane always returns `ratingUpdate: null` and creates no rating rows.

Aeroplane has no draw mechanic. A completed Aeroplane match is `win` or `loss` from the human perspective; `gameId: 'aeroplane'` with `status: 'draw'` is a `400` validation error.

## Play-history details

Add nullable JSON `details` to `play_history`. Existing strategy rows use `null`; Aeroplane requires only the metadata explicitly useful for HPA-391 history/analytics:

```ts
interface AeroplaneHistoryDetails {
  rulePreset: 'classic' | 'quick-chill' | 'custom';
  victoryTarget: 2 | 4;
  diceMode: 'fair' | 'relaxed';
  humanColor: 'red' | 'yellow' | 'blue' | 'green';
  durationSeconds: number;
  planesFinished: number;
  capturesMade: number;
  capturesSuffered: number;
  aiPlayers: Array<{
    color: 'red' | 'yellow' | 'blue' | 'green';
    personality: 'cautious' | 'aggressive' | 'unpredictable';
  }>;
}
```

`planesFinished`, `capturesMade`, and `capturesSuffered` are from the human player's perspective. The API validates non-negative finite numbers, exactly three AI players, unique AI colours, one of each personality, and that `humanColor` is not one of the AI colours.

This JSON is **history metadata, not a recovery or replay format**. A `custom` rule preset intentionally does not reconstruct every setup knob; the versioned active-match snapshot owns exact recovery. The history UI displays game/result/opponent/unrated state only in this slice.

## Canonical engine model

### Colours, seats, and first player

```ts
export type AeroplaneColor = 'red' | 'yellow' | 'blue' | 'green';
export type Personality = 'cautious' | 'aggressive' | 'unpredictable';

export const TURN_ORDER = ['red', 'yellow', 'blue', 'green'] as const;
export const PERSONALITY_ORDER = [
  'cautious',
  'aggressive',
  'unpredictable',
] as const;

export interface AiSeat {
  color: AeroplaneColor;
  personality: Personality;
}
```

AI seats are assigned clockwise after the human in fixed personality order:

```ts
export function seatAIs(humanColor: AeroplaneColor): AiSeat[] {
  const humanIndex = TURN_ORDER.indexOf(humanColor);
  return PERSONALITY_ORDER.map((personality, index) => ({
    color: TURN_ORDER[(humanIndex + index + 1) % TURN_ORDER.length],
    personality,
  }));
}
```

Examples:

| Human | Cautious | Aggressive | Unpredictable |
| --- | --- | --- | --- |
| red | yellow | blue | green |
| yellow | blue | green | red |
| blue | green | red | yellow |
| green | red | yellow | blue |

**Red always starts a new match.** Turn order is always red → yellow → blue → green. If the human chooses another colour, any AI turns before the human's first turn run automatically with the normal skippable presentation delay. This keeps first-player and round-completion accounting independent of the selected human colour.

The three resolved AI seats are persisted in the save blob and history metadata. Restore uses the persisted seats rather than re-deriving them.

### Plane progress

```ts
interface PlaneState {
  id: string;
  color: AeroplaneColor;
  progress: number | null;
}
```

Progress:

- `null`: hangar;
- `0`: private launch pad;
- `1..50`: shared clockwise track;
- `51..55`: private home-lane cells;
- `56`: final home/finished cell.

The board has 52 physical shared nodes. Player-relative progress maps to them using 13-node colour offsets:

```ts
const START_OFFSET = { red: 0, yellow: 13, blue: 26, green: 39 } as const;
const globalIndex = (START_OFFSET[color] + progress - 1) % 52;
```

### Jump, flight, and capture topology

Normal matching-colour jumps repeat every four shared steps. The long-flight entrance is logical progress `18` for every colour and exits at `30`.

Resolution order:

1. calculate the base endpoint;
2. if it is a normal matching-colour jump square, +4;
3. if the current endpoint is flight entrance `18`, +12 to `30`;
4. resolve captures at the final shared endpoint;
5. derive stack/blockade occupancy;
6. check finish/victory.

The flight entrance is a dedicated special square rather than a normal +4 square. Thus direct `18` and jump `14 → 18` both fly to `30`. No extra jump occurs after flight. Jumps/flights never run in private home lanes.

**Capture is final-endpoint-only.** A move captures enemy planes only on the final shared-track endpoint after the entire automatic jump/flight chain resolves. Intermediate base endpoints, jump entrances, and the flight entrance do not capture. If no jump/flight occurs, the base endpoint is also the final endpoint and captures normally.

### Private occupancy

- Launch pad capacity is one, regardless of stacking.
- A hangar plane launches only on an allowed roll and only when its launch pad is empty.
- Home-lane cells hold at most one friendly plane.
- Launch pads/home lanes are never capturable.
- Stacking applies only on shared track.

## Rules API

One analyzer is the source of truth for preview, legality, AI scoring, and application:

```ts
interface ResolvedMove {
  planeId: string;
  roll: number;
  from: AeroplanePosition;
  baseEndpoint: AeroplanePosition;
  finalEndpoint: AeroplanePosition;
  route: AeroplanePosition[];
  events: AeroplaneEvent[];
  capturedPlaneIds: string[];
}

function resolveLegalMove(
  state: AeroplaneState,
  planeId: string,
  roll: number
): ResolvedMove | null;

function getLegalMoves(
  state: AeroplaneState,
  roll: number
): ResolvedMove[];

function applyResolvedMove(
  state: AeroplaneState,
  move: ResolvedMove
): AeroplaneTransition;
```

The controller never recalculates movement.

## Stacking and blockades

- **Stacking off:** friendly-occupied shared endpoints are illegal.
- **Stacking on / blockades off:** friendly shared stacks are allowed; enemy landing captures all planes in the stack.
- **Blockades on:** enabling blockades forces stacking on. Two or more friendly planes form a blockade. A plane may leave its own blockade, but no move may land on an existing blockade. Base movement and +4 jump segments cannot pass through one. Long flights cross the centre, so only entrance/exit occupancy is checked. Enemy blockades are not capturable. Existing two-plane blockades cannot receive a third plane.
- Disabling stacking forces blockades off.

## Match and turn flow

```ts
interface AeroplaneState {
  config: AeroplaneConfig;
  currentPlayer: AeroplaneColor;
  phase: 'awaiting-roll' | 'awaiting-choice' | 'finished';
  pendingRoll: number | null;
  planes: PlaneState[];
  winner: AeroplaneColor | null;
  turnNumber: number;
  noMoveStreak: Record<AeroplaneColor, number>;
  lastPlaceRounds: Record<AeroplaneColor, number>;
  roundNumber: number;
  stats: AeroplaneStats;
}
```

Flow:

1. `rollTurn` consumes the dice RNG.
2. Derive legal moves.
3. Zero moves: emit the skip event and complete the turn automatically.
4. One move: controller briefly highlights then applies automatically.
5. Multiple moves: human chooses or AI scores them.
6. Apply the `ResolvedMove` atomically.
7. Check victory.
8. A six keeps the same player; otherwise advance clockwise.

A six still grants another turn after a no-move roll. A complete round is counted when a non-extra turn advances green → red.

## Finishing and terminal result

- Exact: `progress + roll > 56` is illegal.
- Bounce: overflow reflects inside the private end sequence: `56 - (progress + roll - 56)`.
- Finished progress `56` never moves again.
- Quick target is two finished planes; Classic target is four.
- The engine has no draw state. It finishes only when one colour reaches the configured target.
- History maps `winner === humanColor` to `win`; every other winner maps to `loss`.

## Deterministic RNG and Relaxed Dice

Use a serializable immutable xorshift32 state. A root `uint32` seed derives fixed, separate dice and AI streams. `nextUint32` returns `{ value, rng }` and never mutates the input RNG object. No animation/chatter/timing consumes either gameplay stream.

Fair Dice consumes exactly one seeded sample per roll. Mapping a 32-bit integer to six faces has a negligible mathematical bias because `2^32` is not divisible by six; “Fair” here means no gameplay-aware weighting or protection. Do not add rejection sampling because it would violate HPA-391's one-sample-per-Fair-roll consumption contract.

Relaxed Dice activates for the current player when `noMoveStreak >= 3` or `lastPlaceRounds >= 3`. Active protection always consumes exactly two die samples. Prefer candidate one if it has a legal move; otherwise candidate two if it does; otherwise candidate one. No future samples are inspected.

`noMoveStreak` resets after a turn with a legal move. `lastPlaceRounds` updates only when a clockwise round completes. A player counts as last when its deterministic progress score equals the minimum and at least one player is ahead:

```ts
finishedPlanes * 1000 + sum(activePlaneProgress)
```

## Personality AI

AI sees public state, pending roll, legal moves, and its AI RNG only. Score each `ResolvedMove` using finish/home/capture/jump/flight/launch/blockade/progress/immediate-capture-exposure features.

| Feature | Cautious | Aggressive | Unpredictable |
| --- | ---: | ---: | ---: |
| Finish | 10000 | 10000 | 10000 |
| Enter home | 220 | 80 | 130 |
| Capture / plane | 80 | 260 | 150 |
| Jump | 35 | 100 | 90 |
| Flight | 45 | 160 | 130 |
| Launch | 45 | 35 | 90 |
| Form blockade | 140 | 25 | 70 |
| Progress / step | 2 | 4 | 3 |
| Capture exposure | -150 | -35 | -75 |

Unpredictable adds seeded jitter `[-120, 120]`; the other two use seeded randomness only for score ties. Finish always dominates lesser tactics.

Exposure is computed from the resulting public state by checking whether any opponent plane can legally capture the moved plane with a die 1–6; it never inspects future RNG.

## Persistence and replay diagnostics

Storage key:

```text
procyon:aeroplane:active-match:v1
```

Persist:

- schema version and timestamp;
- normalized config;
- authoritative state;
- resolved AI seats;
- root seed;
- dice RNG state;
- AI RNG state;
- balance counters/stats already contained by state;
- deterministic action history required by HPA-391.

Never persist derived legal moves, animation state, timers, provider config, or pending chatter work.

Manual runtime validation is sufficient; do not add Zod to the web package solely for saves. Corrupt/unknown authoritative snapshot data is copied to session-scoped diagnostics, removed from the active key, and replaced only when the player starts cleanly.

Action history is deliberately small:

```ts
type AeroplaneActionRecord =
  | {
      kind: 'roll';
      player: AeroplaneColor;
      roll: number;
      events: AeroplaneEvent[];
      checksum: string;
    }
  | {
      kind: 'move';
      actor: 'human' | 'ai';
      player: AeroplaneColor;
      roll: number;
      selectedPlaneId: string;
      events: AeroplaneEvent[];
      checksum: string;
    };
```

A zero-move roll stores the roll/skip events and checksum of the post-skip authoritative state. A move stores the emitted movement/capture/finish events and checksum after the move/turn transition.

`checksumState` uses canonical authoritative-state serialization plus a small deterministic 32-bit checksum such as FNV-1a. It is **not** a security or tamper-proofing feature.

`replayMatch` starts from config/root seed/seats and re-executes the real dice/rules/AI path. It verifies the recorded roll, selected plane, emitted events, and checksum at each step. A mismatch is a diagnostic result, not a save rejection.

**Restore does not replay the match.** `restoreActiveMatch` validates the authoritative snapshot/invariants and restores the persisted RNG/seats directly. This keeps reload fast and prevents replay implementation details from becoming a second recovery engine. Replay is invoked only by unit tests or explicit DEV diagnostics.

## UI architecture

Create:

```text
apps/web/src/pages/aeroplane.astro
apps/web/src/components/AeroplaneGame.tsx
apps/web/src/components/aeroplane/
  AeroplaneSetup.tsx
  AeroplaneBoard.tsx
  AeroplaneStatus.tsx
  AeroplaneEventFeed.tsx
  AeroplaneBoardPreview.tsx
apps/web/src/hooks/useAeroplaneMatch.ts
```

`useAeroplaneMatch` owns setup snapshot, resolved seats, restore/new match, timers, AI scheduling, presentation queue, persistence, and one-shot history submission. Rules/dice/AI remain pure.

`layout.ts` contains render-only SVG anchors for track, launch, hangars, homes, flights, and stack offsets. Domain modules never import it.

Interaction:

- zero moves skip automatically;
- one legal move auto-applies after a brief highlight;
- multiple legal human planes pulse;
- hover/focus previews the full resolved route;
- coarse pointer first tap previews, second tap applies;
- keyboard plane controls use visible focus and accessible move labels.

Rules commit final state once before animation. Animation uses a transient overlay from `ResolvedMove.route`. `Skip Animations` cancels presentation and shows the already-committed state; it never re-applies a move. AI delay is fixed/skippable presentation timing, not RNG.

## Setup

```ts
interface AeroplaneConfig {
  rulePreset: 'classic' | 'quick-chill' | 'custom';
  victoryTarget: 2 | 4;
  diceMode: 'fair' | 'relaxed';
  launchRule: 'six' | 'five-or-six';
  finishRule: 'exact' | 'bounce';
  stacking: boolean;
  blockades: boolean;
  humanColor: AeroplaneColor;
  chatter: boolean;
}
```

Classic: 6 launch, exact, target 4, Fair, stacking/blockades off.
Quick & Chill: 5/6 launch, bounce, target 2, Relaxed, stacking/blockades off.
Manual edits mark Custom. Normalization changes only stacking/blockade dependency.

## DEV/E2E deterministic fixture contract

Aeroplane needs deterministic hard-path fixtures for Playwright without adding production-only test branches throughout the controller.

`useAeroplaneMatch` reads these hooks **only when `import.meta.env.DEV` is true**. Production builds ignore them.

Simple seed override:

```text
/aeroplane?e2eSeed=39101
```

When present in DEV, `e2eSeed` is parsed as a uint32 root seed. Invalid values are ignored. If a full fixture supplies a seed, the fixture wins over the query parameter.

Hard-path injection uses the same window-injection pattern already used by Procyon tests:

```ts
interface AeroplaneE2EFixture {
  seed?: number;
  config?: AeroplaneConfig;
  state?: AeroplaneState;
  seats?: AiSeat[];
  diceRng?: RngState;
  aiRng?: RngState;
  skipAnimations?: boolean;
}

declare global {
  interface Window {
    __PROCYON_AEROPLANE_FIXTURE__?: AeroplaneE2EFixture;
  }
}
```

Playwright installs the fixture with `page.addInitScript()` before navigation. The fixture is validated with the same lightweight invariant helpers used by persistence before it is accepted. When either `e2eSeed` or a fixture is active, animation skipping defaults to true unless the fixture explicitly sets `skipAnimations: false`.

Use a fixture for jump/flight/capture/stack/blockade/near-victory scenarios instead of relying on long random play. The hook is test scaffolding only and must not change normal save format or gameplay semantics.

## Chatter

Ship local personality lines for capture/flight/finish/win/loss. Line selection uses a presentation-only stable index/hash, not gameplay RNG. Generate/enqueue only after authoritative action completion. Chatter failure is ignored.

Do not register Aeroplane in `UniversalAIService`, the LLM move factory, or rule guardian. Provider-generated reactions can be revisited when Procyon has a provider-agnostic text-generation boundary.

## Play-history client boundary

Do not extend `usePlayHistory` to Aeroplane phases. Extract only the network POST into `apps/web/src/lib/play-history.ts`. Existing strategy hook keeps its snapshot/retry semantics and calls the helper; `useAeroplaneMatch` calls the same helper once at human win/loss.

Aeroplane history failure is non-blocking. As with current behavior, ambiguous network/5xx failures are not blindly retried because the endpoint is non-idempotent.

## Error handling

- Illegal action: resolver returns `null`; UI cannot submit it.
- Storage unavailable/corrupt: current in-memory play continues; corrupt restore offers clean restart.
- Replay mismatch: DEV diagnostic only; it does not invalidate an otherwise valid restored snapshot.
- Animation error: clear presentation and render authoritative final state.
- AI invariant failure: development diagnostic + deterministic first-legal fallback; tests should make this unreachable.
- History failure: optional non-blocking “result not saved” notice.
- Chatter failure: ignore/fall back locally.
- Missing provider/API key: irrelevant to gameplay.

## Test strategy

- **Engine:** four-colour routes/wraparound, AI seat table, red-first initialization, launch, exact/bounce, direct flight, jump→flight, final-endpoint-only captures, private occupancy, stacks, blockade path/landing/splitting, extra-six, zero/one/many moves, Quick/Classic victory, no draw path.
- **RNG/AI:** immutable RNG transition, exact seeds, Fair one-sample consumption, Relaxed activation/two-sample/reset, restore continuation, personality scenarios, legal-only selection under advanced rules.
- **Persistence/replay:** full snapshot round-trip, persisted seats, pending-choice restore, invalid versions/invariants, exact next RNG, replay checksum/event reproduction, replay mismatch diagnostic, and proof that restore is not gated on replay.
- **Components:** presets/normalization, resume/new match, red-first auto-AI when needed, auto move, human choice, keyboard/touch, route preview, animation skip idempotence, stale timer cancellation, chatter isolation, DEV fixture validation.
- **API/history:** `gameId` rename, minimal HPA-required details validation, opponent pairing, Aeroplane win/loss-only validation, Aeroplane unrated insertion/no rating rows, existing LLM rating and Stockfish behavior unchanged.
- **E2E:** `e2eSeed` plus injected fixtures for four human colours, all AI personalities, jump/flight/capture, stacking/blockades, reload awaiting choice, Quick victory, exactly one history submission, no provider configured.

## Implementation order

1. `GameId`, selector/card navigation, page accent.
2. Logical types/topology/rules.
3. Match initialization/seats + turn state + seeded dice + Relaxed counters.
4. Personality AI.
5. Versioned snapshot recovery + isolated replay diagnostics.
6. Match controller + setup/board/status/feed/animations + DEV/E2E hook.
7. Generic play-history `gameId` rename + explicit rated conversion, preserving existing behavior.
8. Aeroplane API history contract: `aeroplane-trio-v1`, minimal details, pairing, win/loss-only.
9. Web Aeroplane history submission + history labels.
10. Local chatter + deterministic E2E coverage.

## Acceptance mapping

- Local visitor play → dedicated rules/dice/AI, no provider call.
- Exact presets/advanced rules → normalized config + one move resolver.
- No unnecessary human choice → legal-move-count controller branch.
- Distinct deterministic AI → fixed seat assignment + score tables + separate AI stream.
- Exact reload → validated authoritative save + seats + both RNG states; no replay dependency.
- Replay diagnostics → required action/events/checksums verified explicitly in DEV/tests.
- Responsive accessible play → SVG board + pointer/touch/keyboard controls.
- Unrated signed-in history → existing engine opponent kind + explicit rated game conversion + win/loss-only Aeroplane result.
- Failure isolation → rule state commits before animation/chatter/history side effects.

## Rule references

HPA-391 is normative when public variants disagree. These were used only to sanity-check board conventions such as 52 shared cells, colour offsets, and +4/+12 movement structure:

- HKU CCCH9051 Aeroplane Chess collection: https://learning.hku.hk/ccch9051/group-53/items/show/18
- Example Flight Chess topology implementation: https://www.cnblogs.com/xanderChou/p/17791941.html
