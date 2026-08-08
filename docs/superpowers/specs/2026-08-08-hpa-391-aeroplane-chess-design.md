# HPA-391 — Aeroplane Chess Design

**Status:** Product-approved design, reconciled with current `main`
**PR state:** Draft, pending repository review
**Date:** 2026-08-08
**Linear:** [HPA-391 — Add Aeroplane Chess with one human and three personality AIs](https://linear.app/cwchanap/issue/HPA-391/add-aeroplane-chess-with-one-human-and-three-personality-ais)

## Summary

Add a complete Aeroplane Chess mode to Procyon at `/aeroplane`: one human player and three local deterministic heuristic opponents. The mode supports the two HPA-391 presets, launches, clockwise movement, colour jumps, long flights, captures, private home lanes, optional stacking/blockades, deterministic Fair/Relaxed dice, reload recovery, replay diagnostics, and unrated signed-in play history.

The implementation is intentionally **not** another rectangular strategy variant. Aeroplane Chess gets a dedicated path engine under `apps/web/src/lib/aeroplane/`; existing `GameVariant`, `GAME_CONFIGS`, `@procyon/game-core`, LLM move adapters, and rule guardians remain scoped to Chess/Xiangqi/Shogi/Jungle.

Two parts of the original HPA-391 architecture sketch are adjusted to match code that landed after the ticket was written:

1. Procyon already has `opponentEngineId` and an unrated local-engine path for Stockfish. Aeroplane uses the same opponent kind with a new server-owned id, `aeroplane-trio-v1`; it does **not** add `opponentLocalId` or a fourth opponent column.
2. The existing `GameVariant` name remains strategy-only instead of being mass-renamed to `StrategyGameVariant`. A new `GameId = GameVariant | 'aeroplane'` carries navigation, visual-accent, and play-history identity. This gets the architectural separation HPA-391 needs without a repository-wide rename.

The first delivery includes local personality chatter only. Provider-generated chatter is deliberately deferred: HPA-391 describes it as optional, the current provider transport is coupled to move-oriented `UniversalAIService`, and no core acceptance criterion requires remote generation. This keeps gameplay entirely local and avoids an unrelated AI-service refactor.

## Current repository state

The design is based on `main` as of 2026-08-08.

- `apps/web/src/lib/ai/game-variant-types.ts` defines `GameVariant = 'chess' | 'xiangqi' | 'shogi' | 'jungle'` and owns rectangular board/piece/move maps.
- `packages/game-core/` explicitly shares grid-game scaffolding while keeping variant-specific rules local.
- `ChessGameSelector` routes by comparing display titles instead of storing explicit links.
- `GamePageLayout`, `Panel`, and related visual components use the strategy-game accent union.
- `POST /play-history` already supports `opponentEngineId` and skips the rating service for engine games.
- `OpponentEngineId` currently contains only `stockfish` on both API and web sides.
- `play_history` still names its game column/field `chess_id` / `chessId`, although it already stores Xiangqi, Shogi, and Jungle.
- `usePlayHistory` is strategy-game lifecycle code: it assumes the existing `GameStatus`, an `aiPlayer` side, and terminal chess-like statuses. Aeroplane should not be forced into those assumptions.

## Goals

1. A visitor can start and finish one human-vs-three-local-AI Aeroplane match without sign-in, an API key, or network gameplay calls.
2. Classic Match is the default; Quick & Chill and individual rule overrides behave exactly as HPA-391 specifies.
3. All rule decisions are pure logical-path calculations independent of SVG/CSS coordinates.
4. Human choice is required only when more than one legal plane can move.
5. Cautious, Aggressive, and Unpredictable always choose legal moves, differ visibly in representative scenarios, and are deterministic for identical state plus seed.
6. Dice and AI use separate serializable RNG streams; presentation timing consumes neither stream.
7. Reload recovery restores the exact authoritative match state and next RNG outcomes.
8. Animation, chatter, storage, and history failures never roll back or re-apply an already resolved move.
9. Signed-in Aeroplane results are stored as unrated `aeroplane-trio-v1` games and never create rating rows.
10. The feature integrates with selector/navigation/history without broadening the strategy AI abstractions.

## Non-goals

- Online multiplayer or local hot-seat multiplayer.
- Ranked Aeroplane Chess or rating calibration.
- Server-authoritative turns, spectating, clocks, takebacks, or unfinished-game cloud sync.
- A generic Ludo/Pachisi/cross-and-circle engine.
- Adding Aeroplane to `GAME_CONFIGS`, `GameStateMap`, LLM move adapters, rule guardians, or `@procyon/game-core`.
- New dependencies for rules, RNG, persistence validation, or state management.
- Provider-generated opponent chatter in this first delivery.
- Cosmetics, progression, currencies, unlocks, multiple board layouts, or house-rule expansion beyond HPA-391.
- A three-consecutive-six penalty.

## Architecture approaches

### Approach A — Dedicated path engine plus thin shared identity/history extensions (selected)

Build Aeroplane rules in `apps/web/src/lib/aeroplane/`, create a small `GameId` layer for app identity, generalize play-history naming, and reuse the existing local-engine opponent type.

Advantages:

- matches the domain instead of pretending it is a rectangular piece game;
- minimizes changes to proven Chess/Xiangqi/Shogi/Jungle code;
- keeps rules independently testable and replayable;
- reuses current unrated local-opponent infrastructure;
- provides clean boundaries for UI, persistence, and diagnostics;
- avoids speculative framework work.

### Approach B — Treat Aeroplane as a fifth `GameVariant` (rejected)

Adding `aeroplane` to `GameVariant` would force path-game concepts into rectangular `GamePosition`, `AnyGamePiece`, `GameStateMap`, `GAME_CONFIGS`, board dimensions, notation adapters, and LLM rule guardians. Most required values would be fake or special-cased. That increases blast radius without yielding useful reuse.

### Approach C — Build a generic race-game framework first (rejected)

A general graph/race-game package could model Aeroplane, Ludo, and future games, but Procyon has only one such game planned. Designing extension points before a second consumer exists would slow HPA-391 and create abstractions whose correct shape is unknown.

## Identity boundaries

### Web

Keep the existing strategy type unchanged:

```ts
export type GameVariant = 'chess' | 'xiangqi' | 'shogi' | 'jungle';
```

Add `apps/web/src/lib/game-id.ts`:

```ts
import type { GameVariant } from './ai/game-variant-types';

export type GameId = GameVariant | 'aeroplane';
export type Accent = GameId | 'brass';
```

`GameId` is used by navigation, selector cards, page-level accents, and history. `GameVariant` remains the key type for grid engines, AI adapters, piece maps, board capture accents, and ratings-oriented strategy code.

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

Keep `ChessVariantId` as the four-value rated-strategy subset for rating tables/services. Add `isRatedGameId(gameId): gameId is ChessVariantId` so the **server owns rating eligibility**.

Because the project has no backward-compatibility requirement, clean up the generic play-history contract now:

- rename `play_history.chess_id` → `game_id`;
- rename API/client payload `chessId` → `gameId`;
- leave `rating_history.variant_id`, `player_ratings.variant_id`, and `ChessVariantId` unchanged.

This is a narrow breaking change limited to play history and removes a misleading name before a clearly non-chess game is stored there.

## Opponent and rating model

Extend the existing engine id rather than creating a parallel local-opponent representation:

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

`POST /play-history` keeps the existing exactly-one-opponent invariant across user, LLM, and engine ids.

Rating eligibility becomes:

```ts
const shouldRate = kind === 'llm' && isRatedGameId(body.gameId);
```

For Aeroplane:

- `gameId` must be `aeroplane`;
- opponent must be `{ kind: 'engine', id: 'aeroplane-trio-v1' }`;
- the result is `win` or `loss` from the human perspective;
- `ratingUpdate` is always `null`;
- no `player_ratings` or `rating_history` row is created or modified.

The API rejects `aeroplane + LLM`, `aeroplane + stockfish`, and `aeroplane-trio-v1 + non-aeroplane` combinations. This makes the server-owned identity meaningful instead of trusting the client to pair fields correctly.

## Play-history details

Add nullable JSON `details` to `play_history`. Existing strategy rows use `null`; Aeroplane requires a validated object:

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

The API validates finite/non-negative numeric values, exactly three AI players with unique colours, and no duplicate personalities for the three fixed opponents. The current history screen only needs to display the game label, result, opponent label, and unrated badge; the structured details are retained for future diagnostics without adding a new details UI now.

## Canonical engine model

### Colours and turn order

```ts
type AeroplaneColor = 'red' | 'yellow' | 'blue' | 'green';
const TURN_ORDER = ['red', 'yellow', 'blue', 'green'] as const;
```

The human may choose any colour. The other three colours receive the three personalities exactly once. Seat/personality assignment is deterministic from the setup; it does not consume AI RNG.

### Plane progress

Store each plane in player-relative logical progress rather than screen coordinates:

```ts
interface PlaneState {
  id: string;
  color: AeroplaneColor;
  progress: number | null;
}
```

Meaning:

- `null` — hangar;
- `0` — private launch pad;
- `1..50` — shared clockwise track;
- `51..55` — private home-lane cells;
- `56` — final home/finished cell.

The board still has 52 physical shared-track nodes. Player-relative shared progress maps to a global node with a colour start offset:

```ts
const START_OFFSET = { red: 0, yellow: 13, blue: 26, green: 39 } as const;
const globalIndex = (START_OFFSET[color] + progress - 1) % 52;
```

This keeps every rule colour-symmetric and makes wraparound a topology concern rather than four hand-written routes.

### Jump and flight topology

For each colour, matching-colour jump locations repeat every four shared steps. The long-flight entrance is logical progress `18` for every colour; the flight exits at progress `30`.

Resolution is exactly HPA-391’s order:

1. calculate the base endpoint;
2. if it is a normal matching-colour jump square, advance +4;
3. if the current endpoint is the colour’s flight entrance, advance +12;
4. resolve capture at the final shared endpoint;
5. update friendly stack/blockade state implicitly from occupancy;
6. check finishing and victory.

The flight entrance is treated as a dedicated special square rather than a normal +4 jump square. Therefore both a direct base landing on progress `18` and a +4 jump from progress `14` reach the flight and end at progress `30`. No second jump occurs after a flight in the same move.

Jumps/flights are disabled once the plane enters its private home lane.

### Launch pad and private-lane occupancy

- The private launch pad holds at most one plane, regardless of stacking setting.
- A hangar plane can launch only if the configured launch roll is satisfied **and** its launch pad is empty.
- Home-lane cells hold at most one friendly plane.
- Launch pads and home lanes are never capturable.
- Stacking applies only to shared-track nodes.

These constraints match the ticket’s wording that stacking is a shared-track rule and prevent ambiguous private-lane stacks.

## Rules API

Use one analyzer as the source of truth for preview, legality, AI scoring, and application:

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
  roll: number,
): ResolvedMove | null;

function getLegalMoves(
  state: AeroplaneState,
  roll: number,
): ResolvedMove[];

function applyResolvedMove(
  state: AeroplaneState,
  move: ResolvedMove,
): AeroplaneTransition;
```

`resolveLegalMove` rejects launch/home collisions, overrun under Exact rules, and blockade crossings. `applyResolvedMove` receives only an analyzer-produced move and performs an immutable state transition. The controller never calculates movement itself.

## Stacking and blockades

### Stacking off

A final shared-track endpoint containing any friendly plane is illegal.

### Stacking on, blockades off

Friendly planes may share a shared-track endpoint and continue to move independently. An enemy landing on that endpoint captures all enemy planes present there.

### Blockades on

Enabling blockades normalizes `stacking = true`. Two or more friendly planes on one shared node form a blockade.

- a plane may move out of its own blockade; the origin is ignored for path blocking;
- no plane may land on an existing blockade;
- no base-movement or +4 jump segment may pass through a blockade;
- a long flight crosses the centre rather than traversing skipped ring nodes, so only its entrance/exit occupancy is checked;
- enemy blockades cannot be captured because landing on them is illegal;
- with blockade rules on, an existing two-plane stack cannot receive a third plane.

Disabling stacking normalizes `blockades = false`.

## Match state and turn flow

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

Pure turn functions own phase transitions; the React controller only schedules them:

1. `rollTurn` consumes the dice stream and stores `pendingRoll`.
2. `getLegalMoves` derives legal choices; legal moves are never persisted.
3. zero choices → emit skip event and call `completeTurn`;
4. one choice → controller briefly highlights then applies it automatically;
5. multiple choices → human selects or AI chooses;
6. `applyResolvedMove` commits the whole move atomically and emits structured events;
7. if victory target is reached, set `phase = 'finished'` immediately;
8. otherwise roll `6` keeps the same player; any other roll advances clockwise.

A six still grants another turn when the roll had no legal move.

## Exact and bounce finishing

- Exact mode: a move with base progress beyond `56` is illegal.
- Bounce mode: if `progress + roll > 56`, reflect the overflow: `56 - (progress + roll - 56)`.
- Bounce occurs only within the private end sequence; it never returns a finished plane to the shared track.
- Progress `56` counts as finished and can never move again.

## Deterministic RNG

Use a tiny in-repository serializable PRNG such as xorshift32:

```ts
interface RngState { value: number }
function nextUint32(state: RngState): [number, RngState];
function nextDie(state: RngState): [1 | 2 | 3 | 4 | 5 | 6, RngState];
```

A new match chooses one root `uint32` seed, then derives two fixed streams with stable salts:

- gameplay dice RNG;
- AI tie-break/personality-jitter RNG.

No animation duration, chatter choice, DOM timing, or audio may consume either stream.

### Fair Dice

Consume exactly one gameplay RNG sample per roll and map uniformly to 1–6.

### Relaxed Dice

Track two reproducible protection signals for the current player:

- `noMoveStreak >= 3`;
- `lastPlaceRounds >= 3`.

When neither signal is active, consume one die sample.

When either signal is active, consume **exactly two** die samples. If the first has any legal move, use it. Otherwise use the second when it has a legal move; if neither does, use the first. Both samples are consumed regardless of which is selected.

`noMoveStreak` resets after a turn with at least one legal move. `lastPlaceRounds` is evaluated only when a clockwise round completes; a colour increments when its deterministic progress score equals the minimum and at least one player is ahead, otherwise it resets.

Progress score is intentionally simple:

```ts
finishedPlanes * 1000 + sum(activePlaneProgress)
```

Hangar planes contribute zero. The score is only a balance signal, never an AI evaluation or victory rule.

## Personality AI

AI receives only current public state, pending roll, legal moves, and its own AI RNG state.

Each legal `ResolvedMove` is converted into features:

- finishes a plane;
- enters home lane;
- capture count;
- jump used;
- flight used;
- fresh launch;
- blockade formed;
- logical progress gained;
- immediate capture exposure after the move.

Immediate exposure is computed deterministically by checking whether an opponent could legally capture the final shared endpoint with any die result 1–6 from the resulting public position. It does not inspect future RNG.

Use fixed score tables:

| Feature | Cautious | Aggressive | Unpredictable |
| --- | ---: | ---: | ---: |
| Finish plane | 10000 | 10000 | 10000 |
| Enter home lane | 220 | 80 | 130 |
| Capture / plane | 80 | 260 | 150 |
| Jump | 35 | 100 | 90 |
| Long flight | 45 | 160 | 130 |
| Fresh launch | 45 | 35 | 90 |
| Form blockade | 140 | 25 | 70 |
| Progress / step | 2 | 4 | 3 |
| Capture exposure / threat | -150 | -35 | -75 |

Unpredictable additionally gets bounded seeded jitter in `[-120, 120]`. Cautious and Aggressive use only a tiny seeded tie-break among equal scores. Finishing dominates every other feature, so no personality sacrifices a guaranteed finish for a minor tactical event.

## Persistence

Use local storage key:

```text
procyon:aeroplane:active-match:v1
```

Persist after every authoritative action boundary, including a completed roll that leaves `phase = 'awaiting-choice'`.

Persist:

- schema version and timestamp;
- normalized config;
- authoritative `AeroplaneState`;
- gameplay and AI RNG states;
- balance counters and match stats;
- initial root seed;
- deterministic action history.

Do not persist:

- derived legal moves;
- animation step/index;
- hover/focus/preview state;
- timers;
- provider keys/configuration;
- chatter requests or responses.

Do not add Zod to the web package solely for saves. `persistence.ts` performs explicit version/type/range/invariant checks and returns a tagged result:

```ts
type RestoreResult =
  | { kind: 'empty' }
  | { kind: 'ok'; match: PersistedAeroplaneMatch }
  | { kind: 'corrupt'; reason: string };
```

Unknown versions or invariant failures copy the raw payload to session-scoped diagnostics, remove it from the active-match key, and let the UI offer a clean restart. A storage exception is non-fatal; the current in-memory match continues.

## Replay diagnostics

Every authoritative action appends a compact log entry with a checksum after the action:

```ts
type AeroplaneAction =
  | { kind: 'roll'; player: AeroplaneColor; roll: number; checksum: string }
  | { kind: 'move'; player: AeroplaneColor; planeId: string; checksum: string };
```

Replay starts from config + root seed and re-executes the real dice/rules/AI functions:

- a roll action must match the next deterministic dice result;
- an AI move must match the next deterministic personality decision;
- a human move uses the recorded plane id but must still be legal;
- each resulting checksum must match the recorded checksum.

Use a stable FNV-1a checksum over a canonical serialization of authoritative state. It is a debug consistency check, not a security signature.

## React/UI architecture

### Route and selector

Create `apps/web/src/pages/aeroplane.astro` following the existing page pattern.

Replace title-based selector routing with explicit data:

```ts
interface GameCardModel {
  gameId: GameId;
  title: string;
  description: string;
  href: string;
}
```

Generalize `ChessGameCard` to `GameCard`. The card receives its preview as a child/render prop: existing four games keep `ChessBoardPreview`; Aeroplane uses a lightweight `AeroplaneBoardPreview`. Do not add Aeroplane to `ChessBoardPreview` or `GAME_CONFIGS`.

### Components

Keep UI decomposition focused:

```text
apps/web/src/components/AeroplaneGame.tsx
apps/web/src/components/aeroplane/
  AeroplaneSetup.tsx
  AeroplaneBoard.tsx
  AeroplaneStatus.tsx
  AeroplaneEventFeed.tsx
  AeroplaneBoardPreview.tsx
apps/web/src/hooks/useAeroplaneMatch.ts
```

`useAeroplaneMatch` owns orchestration only: setup snapshot, restore/new-match, timers, AI scheduling, animation queue, persistence calls, and one-shot history submission. Rules/dice/AI remain pure modules.

### Board rendering

Render the board as SVG with normalized logical anchors. `layout.ts` contains render-only coordinates for:

- 52 track nodes;
- four launch pads;
- four hangars;
- private home lanes;
- flight guide lines;
- plane stacking offsets.

No rule module imports `layout.ts`.

The board uses Procyon’s dark surfaces but makes the four player colours unmistakable. Add one page/card accent token for Aeroplane; plane/square colours remain domain colours rather than overloading the app accent.

### Choice interaction

- zero legal planes: show a brief skipped event and advance automatically;
- one legal plane: highlight it briefly and apply automatically;
- multiple legal planes on the human turn: pulse only those planes;
- hover/focus previews the complete `ResolvedMove.route`;
- on coarse pointer/touch, first tap selects/previews and second tap on the same legal plane applies it;
- keyboard: legal planes are buttons with accessible labels; Enter/Space selects/applies according to the same interaction state.

### Animation model

Rules commit the final authoritative state exactly once before presentation starts. The UI animates a transient plane overlay using `ResolvedMove.route` and structured events; it never advances the rules state one square at a time.

`Skip Animations` cancels presentation timers, clears the transient overlay/event delay queue, and renders the already-committed final state. It must never call `applyResolvedMove` again.

AI “thinking” delay is a fixed/skippable presentation delay chosen from a non-RNG UI sequence (for example 650 ms). It does not consume gameplay or AI randomness.

## Setup model

Presets are plain config factories followed by one normalizer:

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

Classic:

- launch on 6;
- exact finish;
- target 4;
- Fair Dice;
- stacking/blockades off.

Quick & Chill:

- launch on 5 or 6;
- bounce finish;
- target 2;
- Relaxed Dice;
- stacking/blockades off.

Changing any individual rule marks `rulePreset = 'custom'`. `normalizeConfig` applies only the stacking/blockade invariant; it never silently changes other controls.

## Chatter

Implement local event-driven lines in `chatter.ts` for capture, flight, finish, win, and loss. The selected line is deterministic from event type plus a presentation-only stable counter/hash and consumes no gameplay RNG.

Chatter is read-only output after the authoritative action has completed. Failure to produce/display a line is ignored.

Provider-generated chatter is deferred until Procyon has a provider-agnostic text-generation boundary that is not coupled to move adapters. Aeroplane must never be registered in `createGameAI`, `UniversalAIService` move parsing, or the rule guardian.

## Play-history client boundary

Do not teach `usePlayHistory` about Aeroplane phases or four-player winners. Extract only its network write into `apps/web/src/lib/play-history.ts`:

```ts
async function createPlayHistory(input: CreatePlayHistoryInput): Promise<void>;
```

Existing `usePlayHistory` keeps its current snapshot/retry lifecycle but calls the helper with `gameId`. `useAeroplaneMatch` calls the same helper once after a terminal human result when authenticated.

Aeroplane history failure is non-blocking and never changes match state. As with the current strategy hook, do not blindly retry ambiguous network/5xx failures because the endpoint is not idempotent.

## Error handling

- Invalid action/illegal plane: pure engine returns no resolution; UI cannot submit it.
- Persistence unavailable/corrupt: continue in memory and offer restart for corrupt restore.
- Animation exception: clear presentation state and show authoritative final state.
- AI selection invariant failure: log a development diagnostic, choose the first legal move deterministically as a last-resort guard, and continue; unit tests make this path unreachable for supported rules.
- History failure: show at most a non-blocking “result not saved” notice to signed-in users.
- Chatter failure: silently fall back to no line/local line; never delay turn progression.
- No provider/API key: irrelevant to gameplay and local chatter.

## Test strategy

### Pure engine

Cover route symmetry, wraparound, launch, exact/bounce finish, jump → flight chains, direct flight, captures, private occupancy, stack creation/splitting, blockade crossing/landing, extra-six turns, zero/one/multiple legal moves, and both victory targets.

### RNG and AI

Assert exact seed sequences, Fair one-sample consumption, Relaxed two-sample activation/reset, restore continuation, personality scenario choices, deterministic ties/jitter, and legal-only selection across advanced rule combinations.

### Persistence/replay

Round-trip every authoritative field, recompute legal moves, reject bad versions/invariants, restore a pending choice, continue exact next die/AI result, and reproduce every checksum from a recorded fixture.

### Components

Test preset normalization, resume/new-match prompt, one-move auto-application, multiple-move human selection, keyboard/touch semantics, route preview, animation skip idempotence, AI delay cancellation, and chatter isolation.

### API/history

Test `gameId` rename, Aeroplane detail validation, legal opponent pairing, `aeroplane-trio-v1` unrated insert, no rating rows, existing LLM rating path unchanged, Stockfish path unchanged, and history rendering of Aeroplane as unrated.

### End to end

Use deterministic test seeds/fixtures rather than waiting for naturally convenient rolls. Cover:

1. start Quick & Chill as each human colour;
2. complete human plus all three AI turns;
3. exercise launch/jump/flight/capture;
4. enable stacking/blockades in a fixture and verify restrictions;
5. reload while awaiting a human choice and resume;
6. complete a deterministic two-plane victory;
7. verify exactly one unrated history POST when authenticated;
8. complete a match with no configured AI provider.

## Implementation order

1. Introduce `GameId`, selector/card navigation, and Aeroplane page accent without changing strategy-game maps.
2. Build logical types/topology and pure move analyzer/application with exhaustive tests.
3. Add turn state, seeded dice, Relaxed counters, and deterministic replay primitives.
4. Add three personality scorers on top of legal `ResolvedMove` data.
5. Add persistence and the `useAeroplaneMatch` orchestration boundary.
6. Build setup/board/status/feed interaction and atomic presentation animations.
7. Generalize play-history identity, add Aeroplane details, and reuse `opponentEngineId` for `aeroplane-trio-v1`.
8. Add local chatter and final component/API/E2E coverage.

## Acceptance mapping

HPA-391 remains the normative product requirement. This design changes implementation shape, not gameplay intent.

- Fully local visitor play: dedicated engine + local AIs; no provider call.
- Presets and advanced rules: normalized config + pure resolver.
- No unnecessary human choice: controller branches on derived legal move count.
- Distinct deterministic AIs: fixed personality score tables + separate seeded stream.
- Exact reload: authoritative persisted state + both RNG states + replay checksums.
- Responsive/accessible interaction: SVG board + button semantics + pointer/touch/keyboard paths.
- Unrated history: existing engine opponent path + server-owned rated-game subset.
- Failure isolation: rules commit before animation/chatter/history side effects.
- Test coverage: pure engine first, then components/API, then deterministic E2E.

## Rule references

HPA-391 is normative when variants disagree. Public references were used only to sanity-check board topology conventions such as the 52-cell outer track, 13-cell colour offsets, and +4/+12 movement structure:

- HKU CCCH9051 Aeroplane Chess collection entry: https://learning.hku.hk/ccch9051/group-53/items/show/18
- Example Flight Chess implementation and topology constants: https://www.cnblogs.com/xanderChou/p/17791941.html
