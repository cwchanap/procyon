# HPA-391 — Aeroplane Chess Design

**Status:** Product-approved design, reconciled with current `main`
**PR state:** Draft, pending repository review
**Date:** 2026-08-08
**Linear:** [HPA-391 — Add Aeroplane Chess with one human and three personality AIs](https://linear.app/cwchanap/issue/HPA-391/add-aeroplane-chess-with-one-human-and-three-personality-ais)

## Summary

Add a complete Aeroplane Chess mode to Procyon at `/aeroplane`: one human player and three local deterministic heuristic opponents. The mode supports the two HPA-391 presets, launches, clockwise movement, colour jumps, long flights, captures, private home lanes, optional stacking/blockades, deterministic Fair/Relaxed dice, reload recovery, replay diagnostics, and unrated signed-in play history.

Aeroplane Chess is intentionally **not** another rectangular strategy variant. It gets a dedicated path engine under `apps/web/src/lib/aeroplane/`; existing `GameVariant`, `GAME_CONFIGS`, `@procyon/game-core`, LLM move adapters, and rule guardians remain scoped to Chess/Xiangqi/Shogi/Jungle.

Two parts of the original HPA-391 architecture sketch are adjusted to match code that landed after the ticket was written:

1. Procyon already has `opponentEngineId` and an unrated local-engine path for Stockfish. Aeroplane reuses that opponent kind with a new server-owned id, `aeroplane-trio-v1`; it does **not** add `opponentLocalId` or a fourth opponent column.
2. The existing `GameVariant` name remains strategy-only instead of being mass-renamed. A new `GameId = GameVariant | 'aeroplane'` carries navigation, visual-accent, and play-history identity.

The first delivery includes local personality chatter only. Provider-generated chatter is deliberately deferred: HPA-391 describes it as optional, the current provider transport is coupled to move-oriented `UniversalAIService`, and no core acceptance criterion requires remote generation.

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
8. Animation, chatter, storage, and history failures cannot roll back or re-apply an already resolved move.
9. Signed-in results are stored as unrated `aeroplane-trio-v1` games and never create rating rows.
10. The feature integrates with selector/navigation/history without broadening strategy AI abstractions.

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

Keep `ChessVariantId` as the existing four-value type used by rating tables/services. Because separate enums should not be coupled with an unsafe type predicate, use an explicit conversion:

```ts
export function getRatedVariantId(gameId: GameId): ChessVariantId | null {
  switch (gameId) {
    case GameId.Chess: return ChessVariantId.Chess;
    case GameId.Xiangqi: return ChessVariantId.Xiangqi;
    case GameId.Shogi: return ChessVariantId.Shogi;
    case GameId.Jungle: return ChessVariantId.Jungle;
    case GameId.Aeroplane: return null;
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

## Play-history details

Add nullable JSON `details` to `play_history`. Existing strategy rows use `null`; Aeroplane requires:

```ts
interface AeroplaneHistoryDetails {
  rulePreset: 'classic' | 'quick-chill' | 'custom';
  victoryTarget: 2 | 4;
  diceMode: 'fair' | 'relaxed';
  launchRule: 'six' | 'five-or-six';
  finishRule: 'exact' | 'bounce';
  stacking: boolean;
  blockades: boolean;
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

The API validates non-negative finite numbers, exactly three AI players, unique AI colours, and one of each personality. History UI displays game/result/opponent/unrated state only; structured details are retained for diagnostics without adding a details screen.

## Canonical engine model

### Colours and progress

```ts
type AeroplaneColor = 'red' | 'yellow' | 'blue' | 'green';
const TURN_ORDER = ['red', 'yellow', 'blue', 'green'] as const;

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

### Jump and flight topology

Normal matching-colour jumps repeat every four shared steps. The long-flight entrance is logical progress `18` for every colour and exits at `30`.

Resolution order:

1. calculate base endpoint;
2. if it is a normal matching-colour jump square, +4;
3. if the current endpoint is flight entrance `18`, +12 to `30`;
4. resolve captures at final shared endpoint;
5. derive stack/blockade occupancy;
6. check finish/victory.

The flight entrance is a dedicated special square rather than a normal +4 square. Thus direct `18` and jump `14 → 18` both fly to `30`. No extra jump occurs after flight. Jumps/flights never run in private home lanes.

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

function resolveLegalMove(state: AeroplaneState, planeId: string, roll: number): ResolvedMove | null;
function getLegalMoves(state: AeroplaneState, roll: number): ResolvedMove[];
function applyResolvedMove(state: AeroplaneState, move: ResolvedMove): AeroplaneTransition;
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

1. `rollTurn` consumes dice RNG.
2. derive legal moves.
3. zero moves: record skip and complete turn automatically.
4. one move: controller briefly highlights then applies automatically.
5. multiple moves: human chooses or AI scores them.
6. apply `ResolvedMove` atomically.
7. check victory.
8. six keeps same player; otherwise advance clockwise.

A six still grants another turn after a no-move roll.

## Finishing

- Exact: `progress + roll > 56` is illegal.
- Bounce: overflow reflects inside the private end sequence: `56 - (progress + roll - 56)`.
- Finished progress `56` never moves again.
- Quick target is two finished planes; Classic target is four.

## Deterministic RNG and Relaxed Dice

Use a serializable xorshift32 state. A root `uint32` seed derives fixed, separate dice and AI streams. No animation/chatter/timing consumes either.

Fair Dice consumes one sample per roll.

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

## Persistence and replay

Storage key:

```text
procyon:aeroplane:active-match:v1
```

Persist schema version/timestamp, normalized config, authoritative state, root seed, both RNG states, balance counters/stats, and deterministic action history. Never persist derived legal moves, animation state, timers, provider config, or chatter work.

Manual runtime validation is sufficient; do not add Zod to the web package solely for saves. Corrupt/unknown payloads are copied to session-scoped diagnostics, removed from the active key, and replaced only when the player starts cleanly.

Action log:

```ts
type AeroplaneAction =
  | { kind: 'roll'; player: AeroplaneColor; roll: number; checksum: string }
  | { kind: 'move'; actor: 'human' | 'ai'; player: AeroplaneColor; planeId: string; checksum: string };
```

A zero-move roll action represents the post-skip state. Replay starts from config/root seed and re-executes real dice/rules/AI. Each action must reproduce its value/choice and FNV-1a checksum over canonical authoritative state.

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

`useAeroplaneMatch` owns setup snapshot, restore/new match, timers, AI scheduling, presentation queue, persistence, and one-shot history submission. Rules/dice/AI remain pure.

`layout.ts` contains render-only SVG anchors for track, launch, hangars, homes, flights, and stack offsets. Domain modules never import it.

Interaction:

- zero moves skip automatically;
- one legal move auto-applies after a brief highlight;
- multiple legal human planes pulse;
- hover/focus previews full resolved route;
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

## Chatter

Ship local personality lines for capture/flight/finish/win/loss. Line selection uses a presentation-only stable index/hash, not gameplay RNG. Generate/enqueue only after authoritative action completion. Chatter failure is ignored.

Do not register Aeroplane in `UniversalAIService`, the LLM move factory, or rule guardian. Provider-generated reactions can be revisited when Procyon has a provider-agnostic text-generation boundary.

## Play-history client boundary

Do not extend `usePlayHistory` to Aeroplane phases. Extract only the network POST into `apps/web/src/lib/play-history.ts`. Existing strategy hook keeps its snapshot/retry semantics and calls the helper; `useAeroplaneMatch` calls the same helper once at human win/loss.

Aeroplane history failure is non-blocking. As with current behavior, ambiguous network/5xx failures are not blindly retried because the endpoint is non-idempotent.

## Error handling

- Illegal action: resolver returns `null`; UI cannot submit it.
- Storage unavailable/corrupt: current in-memory play continues; corrupt restore offers clean restart.
- Animation error: clear presentation and render authoritative final state.
- AI invariant failure: development diagnostic + deterministic first-legal fallback; tests should make this unreachable.
- History failure: optional non-blocking “result not saved” notice.
- Chatter failure: ignore/fall back locally.
- Missing provider/API key: irrelevant to gameplay.

## Test strategy

- **Engine:** four-colour routes/wraparound, launch, exact/bounce, direct flight, jump→flight, captures, private occupancy, stacks, blockade path/landing/splitting, extra-six, zero/one/many moves, Quick/Classic victory.
- **RNG/AI:** exact seeds, Fair consumption, Relaxed activation/two-sample/reset, restore continuation, personality scenarios, legal-only selection under advanced rules.
- **Persistence/replay:** full round-trip, pending-choice restore, invalid versions/invariants, exact next RNG, checksum reproduction and tamper detection.
- **Components:** presets/normalization, resume/new match, auto move, human choice, keyboard/touch, route preview, animation skip idempotence, stale timer cancellation, chatter isolation.
- **API/history:** `gameId` rename, details validation, opponent pairing, Aeroplane unrated insertion/no rating rows, existing LLM rating and Stockfish behavior unchanged.
- **E2E:** deterministic seeds/fixtures for four human colours, all AI turns, jump/flight/capture, stacking/blockades, reload awaiting choice, Quick victory, exactly one history submission, no provider configured.

## Implementation order

1. `GameId`, selector/card navigation, page accent.
2. Logical types/topology/rules.
3. Turn state + seeded dice + Relaxed counters.
4. Personality AI.
5. Persistence + replay.
6. Match controller + setup/board/status/feed/animations.
7. General play-history identity/details + `aeroplane-trio-v1` unrated recording.
8. Local chatter + final component/API/E2E coverage.

## Acceptance mapping

- Local visitor play → dedicated rules/dice/AI, no provider call.
- Exact presets/advanced rules → normalized config + one move resolver.
- No unnecessary human choice → legal-move-count controller branch.
- Distinct deterministic AI → fixed score tables + separate AI stream.
- Exact reload → authoritative save + both RNG states + replay checksum.
- Responsive accessible play → SVG board + pointer/touch/keyboard controls.
- Unrated signed-in history → existing engine opponent kind + explicit rated game conversion.
- Failure isolation → rule state commits before animation/chatter/history side effects.

## Rule references

HPA-391 is normative when public variants disagree. These were used only to sanity-check board conventions such as 52 shared cells, colour offsets, and +4/+12 movement structure:

- HKU CCCH9051 Aeroplane Chess collection: https://learning.hku.hk/ccch9051/group-53/items/show/18
- Example Flight Chess topology implementation: https://www.cnblogs.com/xanderChou/p/17791941.html
