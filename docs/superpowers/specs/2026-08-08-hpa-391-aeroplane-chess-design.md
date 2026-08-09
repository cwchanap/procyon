# HPA-391 — Aeroplane Chess Design

**Status:** Product-approved design, amended after two review passes  
**PR state:** Draft  
**Date:** 2026-08-08  
**Linear:** [HPA-391 — Add Aeroplane Chess with one human and three personality AIs](https://linear.app/cwchanap/issue/HPA-391/add-aeroplane-chess-with-one-human-and-three-personality-ais)

## Summary

Add a complete Aeroplane Chess mode to Procyon at `/aeroplane`: one human player and three local deterministic heuristic opponents. The mode supports Classic and Quick & Chill presets, launches, clockwise movement, matching-colour jumps, the long flight shortcut, captures, private home lanes, optional stacking/blockades, deterministic Fair/Relaxed dice, reload recovery, replay diagnostics, and unrated signed-in play history.

Aeroplane Chess is intentionally **not** another rectangular strategy variant. It gets a dedicated logical path engine under `apps/web/src/lib/aeroplane/`; existing `GameVariant`, `GAME_CONFIGS`, `@procyon/game-core`, LLM move adapters, rule guardians, and provider UI remain scoped to Chess/Xiangqi/Shogi/Jungle.

The current repository already has an unrated `opponentEngineId` path for Stockfish. Aeroplane reuses that opponent kind with `aeroplane-trio-v1`; it does not add `opponentLocalId` or a fourth opponent column.

Provider-generated chatter remains deferred. The first delivery uses local personality lines only and never registers Aeroplane with `UniversalAIService`.

## Review amendments

The design now incorporates both review passes while keeping HPA-391 normative where a suggested cut would remove an explicit ticket requirement.

### First review

- Replay/checksum remains because HPA-391 explicitly requires action history, state checksums, and replay diagnostics, but replay is **never a recovery gate**.
- Play-history metadata remains because HPA-391 explicitly requires rule preset, victory mode, dice mode, duration, planes finished, captures made/suffered, and AI personalities; duplicate rule knobs were removed.
- AI seating and first-player behavior are normative.
- Capture timing is final-endpoint-only.
- Aeroplane has only `win | loss` terminal history outcomes.
- History integration is split into reviewable slices.
- DEV/E2E seed and fixture behavior is explicit.

### Second review

- Homepage selector role changes are updated and E2E-gated in the same slice that changes `<button>` to `<a>`.
- `resolveLegalMove` is turn-agnostic: it resolves the plane named by `planeId`; turn ownership belongs to `game.ts`. This keeps opponent threat/exposure analysis functional.
- `Panel`, `PageHeader`, and `GamePageLayout` use exhaustive typed accent maps so adding an accent cannot silently render no styling.
- The non-idempotent history save policy is extracted into one shared `useTerminalHistorySave` hook; Aeroplane does not reimplement `savedRef`, generation, auth-switch, or 401-retry behavior.
- The `chess_id → game_id` migration has an explicit rename-only SQL gate and a data-survival test.
- History-detail validation stays structural. Cross-field seat uniqueness is not reimplemented on the server because `seatAIs()` is the sole producer; pairing and outcome validation remain server-owned.
- `GET /play-history` returns `details` even though the first history UI does not render a details panel.
- Progress `30` is explicitly path-sensitive under HPA-391’s ordered movement chain: a normal/base arrival can trigger its matching-colour jump, but the long flight terminates at `30` and does not run a second jump pass.
- `AppShell` explicitly excludes Aeroplane from the AI-provider rail and raw provider-key hydration path.
- Match orchestration and board/UI rendering are separate implementation slices.

## Current repository state

- `apps/web/src/lib/ai/game-variant-types.ts` defines the four rectangular strategy variants and rectangular state/piece/move maps.
- `packages/game-core/` explicitly shares grid-game scaffolding while keeping rules local to each strategy variant.
- `ChessGameSelector` routes by comparing display titles and renders Play actions as buttons.
- `critical-user-journeys.spec.ts` currently queries those actions by `role=button`.
- `GamePageLayout` uses an exhaustive `Record<GameVariant, string>` accent map, but `Panel` and `PageHeader` use untyped CVA variant literals.
- `AppShell` has a hardcoded four-route `isGamePage` check that controls `SidebarAIConfig` and `/ai-config/:id/full` raw-key hydration.
- `POST /play-history` already supports `opponentEngineId` and skips rating for engine games.
- `usePlayHistory` contains the non-idempotent save-once policy: frozen terminal snapshot, generation token, account-switch abandonment, 401-only bounded retry, and no retry for ambiguous 5xx/network failures.
- `play_history` still calls its general game field `chess_id` / `chessId`.
- `GET /play-history` uses an explicit select list.

## Goals

1. A visitor can complete one human-vs-three-local-AI match without sign-in, API key, provider configuration, or gameplay network calls.
2. Classic is the default; Quick & Chill and individual overrides behave exactly as HPA-391 specifies.
3. All rule decisions operate on logical path positions, never SVG/CSS coordinates.
4. Human choice is required only when more than one legal human plane can move.
5. Cautious, Aggressive, and Unpredictable always choose legal moves, differ in representative situations, and are deterministic for identical state plus seed.
6. Dice and AI choice use separate serializable immutable RNG streams; presentation consumes neither.
7. Reload recovery preserves exact authoritative state, AI seats, counters, and next RNG outcomes.
8. Replay diagnostics can reproduce recorded rolls/moves/events/checksums without becoming a recovery dependency.
9. Animation, chatter, storage, and history failures cannot roll back or re-apply an already resolved move.
10. Signed-in results are stored as unrated `aeroplane-trio-v1` games and never create rating rows.
11. Existing rated LLM strategy games and unrated Stockfish games retain their save/rating semantics.
12. Aeroplane integration does not broaden strategy AI/provider abstractions.

## Non-goals

- Online or local hot-seat multiplayer.
- Ranked Aeroplane play or rating calibration.
- Server-authoritative turns, spectating, clocks, takebacks, or cloud unfinished-game sync.
- A generic Ludo/Pachisi/race-game framework.
- Aeroplane support in `GAME_CONFIGS`, `GameStateMap`, LLM move adapters, rule guardians, or `@procyon/game-core`.
- AI-provider rail or provider-key hydration on `/aeroplane`.
- New dependencies for rules, RNG, persistence validation, or state management.
- Provider-generated chatter in the first delivery.
- Cosmetics, progression, currencies, unlocks, multiple layouts, or extra house rules.
- Three-consecutive-six penalties.
- Cryptographic save integrity or anti-tamper guarantees; replay checksums are diagnostics only.

## Architecture approaches

### A — Dedicated path engine + thin shared identity/history extensions (selected)

Build rules in `apps/web/src/lib/aeroplane/`, add a small app-level `GameId`/route layer, generalize play-history naming, share the existing terminal-save policy, and reuse the local-engine opponent path.

This keeps the new domain independently testable without pulling path-game concepts into grid-game infrastructure.

### B — Add Aeroplane to `GameVariant` (rejected)

This would force path-game concepts into rectangular `GamePosition`, `AnyGamePiece`, `GAME_CONFIGS`, dimensions, notation adapters, and LLM rule guardians. Most values would be fake or special-cased.

### C — Build a generic race-game framework first (rejected)

There is no second race-game consumer. Designing extension points before a second use case exists is YAGNI.

## Identity, routes, accents, and AppShell

### Web game identity

Keep the strategy-engine type unchanged:

```ts
export type GameVariant = 'chess' | 'xiangqi' | 'shogi' | 'jungle';
```

Add `apps/web/src/lib/game-id.ts`:

```ts
import type { GameVariant } from './ai/game-variant-types';

export type GameId = GameVariant | 'aeroplane';
export type Accent = GameId | 'brass';

export const GAME_ROUTES = {
  chess: '/chess',
  xiangqi: '/xiangqi',
  shogi: '/shogi',
  jungle: '/jungle',
  aeroplane: '/aeroplane',
} satisfies Record<GameId, string>;

export const STRATEGY_GAME_ROUTES = {
  chess: GAME_ROUTES.chess,
  xiangqi: GAME_ROUTES.xiangqi,
  shogi: GAME_ROUTES.shogi,
  jungle: GAME_ROUTES.jungle,
} satisfies Record<GameVariant, string>;

export function isAIConfigGamePath(path: string): boolean {
  return Object.values(STRATEGY_GAME_ROUTES).some(route => path.startsWith(route));
}
```

`GameId` is used for selector/navigation, page accents, and history. `GameVariant` remains the key for grid engines, AI adapters, piece maps, board capture accents, ratings, and provider-enabled strategy pages.

`ChessGameSelector` becomes a typed data array with explicit `href` values from `GAME_ROUTES`. `GameCard` renders an `<a>` styled with the existing `buttonVariants`; title text never controls routing.

The existing critical-user-journeys E2E queries must change from `role=button` to `role=link` in the same task. Task 1 runs that homepage E2E before any later feature work.

### Exhaustive accents

Do not rely on CVA silently accepting a missing value. Define typed maps first:

```ts
const PANEL_ACCENT_CLASSES = {
  chess: 'border-l-2 border-l-chess',
  xiangqi: 'border-l-2 border-l-xiangqi',
  shogi: 'border-l-2 border-l-shogi',
  jungle: 'border-l-2 border-l-jungle',
  aeroplane: 'border-l-2 border-l-aeroplane',
  brass: 'border-l-2 border-l-brass',
} satisfies Record<Accent, string>;
```

`PageHeader` uses the same pattern. `GamePageLayout` broadens its existing exhaustive map from `Record<GameVariant, string>` to `Record<GameId, string>` and adds `aeroplane`.

### AppShell provider boundary

Aeroplane is a game page for navigation, but **not** an AI-provider game page. `AppShell` replaces its private hardcoded `isGamePage` helper with `isAIConfigGamePath` from `game-id.ts`.

Consequences for `/aeroplane`:

- no desktop `SidebarAIConfig` rail;
- no mobile AI-config button/panel;
- no `hydrateAIConfig()` call;
- no `/ai-config/:id/full` raw provider-key fetch.

A unit test locks `isAIConfigGamePath('/aeroplane') === false` while all four strategy routes return true.

## API identity and rating boundary

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

Keep `ChessVariantId` as the four-value type used by rating tables/services. Use an explicit conversion:

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

General play-history naming changes from `play_history.chess_id` / `chessId` to `play_history.game_id` / `gameId`. Rating tables keep `variant_id` and `ChessVariantId` unchanged.

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

Only `shouldRate` calls `updatePlayerRating`. Aeroplane always returns `ratingUpdate: null` and creates no rating rows.

Aeroplane has no draw mechanic. A completed match is `win` or `loss` from the human perspective; `gameId: 'aeroplane'` with `status: 'draw'` is a `400` validation error.

## Play-history details

Add nullable JSON `details` to `play_history`. Existing strategy rows use `null`; Aeroplane requires the HPA-391 metadata plus human colour:

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

The API validates the JSON shape and primitive bounds: enum values, target `2 | 4`, non-negative integer counters, and exactly three `aiPlayers`. It deliberately does **not** duplicate domain-level cross-field validation for unique colours/personalities or `humanColor` exclusion; `seatAIs()` is the sole product producer and persistence validation already protects restored local state.

Opponent pairing and `win | loss` validation remain server-owned because they control rating/history semantics.

`GET /play-history` includes `details` in its explicit projection. The first history screen still renders game/result/opponent/unrated only, but stored metadata is reachable through the API for diagnostics/future UI.

This JSON is history metadata, not a recovery/replay format. A `custom` preset intentionally does not reconstruct every setup knob; the active-match snapshot owns exact recovery.

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

| Human | Cautious | Aggressive | Unpredictable |
| --- | --- | --- | --- |
| red | yellow | blue | green |
| yellow | blue | green | red |
| blue | green | red | yellow |
| green | red | yellow | blue |

**Red always starts.** Turn order is red → yellow → blue → green. If the human chooses another colour, earlier AI turns run automatically with the normal skippable presentation delay.

The resolved AI seats are persisted and restored rather than re-derived.

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

The board has 52 physical shared nodes. Player-relative progress maps to them with 13-node offsets:

```ts
const START_OFFSET = { red: 0, yellow: 13, blue: 26, green: 39 } as const;
const globalIndex = (START_OFFSET[color] + progress - 1) % 52;
```

### Jump, flight, and capture topology

Normal matching-colour jump squares repeat every four shared steps. The long-flight entrance is logical progress `18` and exits at `30` for every colour.

HPA-391 defines one ordered automatic chain:

1. calculate the base endpoint;
2. if that endpoint is a normal matching-colour jump square, apply one +4 jump;
3. if the resulting endpoint is flight entrance `18`, apply the +12 flight to `30`;
4. resolve capture on the final shared endpoint;
5. derive stack/blockade occupancy;
6. check finish/victory.

The flight entrance is a dedicated special square rather than a normal +4 square. Thus direct `18` and jump `14 → 18` both fly to `30`.

**Progress `30` is also a normal matching-colour jump square when reached as the base endpoint.** The behavior is intentionally arrival-path-sensitive because HPA-391 specifies a single jump pass before the flight pass:

- base arrival at `30` → normal +4 jump to `34`;
- long flight `18 → 30` → stop at `30`; do not run a second jump pass.

Tests lock both cases. No AI weight retuning is needed because this is the already-selected HPA-391 movement order made explicit.

**Capture is final-endpoint-only.** Intermediate base/jump/flight-entrance cells never capture. If no automatic shortcut occurs, the base endpoint is also the final endpoint and captures normally.

Jumps/flights never occur inside private home lanes.

### Private occupancy

- Launch pad capacity is one regardless of stacking.
- A hangar plane launches only on an allowed roll and only when its launch pad is empty.
- Home-lane cells hold at most one friendly plane.
- Launch pads and home lanes are never capturable.
- Stacking applies only to shared-track nodes.

## Rules API and turn ownership

One analyzer is the source of truth for preview, legality, AI scoring, and application:

```ts
function resolveLegalMove(
  state: AeroplaneState,
  planeId: string,
  roll: number
): ResolvedMove | null;

function getLegalMovesForColor(
  state: AeroplaneState,
  color: AeroplaneColor,
  roll: number
): ResolvedMove[];

function getLegalMoves(
  state: AeroplaneState,
  roll: number
): ResolvedMove[];

function applyResolvedMove(
  state: AeroplaneState,
  move: ResolvedMove
): AeroplaneTransition;
```

`resolveLegalMove` is **turn-agnostic**. It resolves the plane identified by `planeId` using that plane's colour and rejects only intrinsic illegality: missing/finished plane, launch/home occupancy, exact overshoot, blockade crossing/landing, and final friendly occupancy rules. It does not compare the plane colour with `state.currentPlayer`.

`getLegalMovesForColor` filters planes by the requested colour. `getLegalMoves` is the gameplay convenience wrapper that calls `getLegalMovesForColor(state, state.currentPlayer, roll)`.

`game.ts` owns turn legality and only applies a move drawn from the current player's derived legal-move set. This separation allows AI exposure/threat analysis to ask whether an opponent plane could capture with a hypothetical die value without mutating `currentPlayer` or bypassing the same rule resolver.

The UI/controller never reproduces movement math.

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
2. `getLegalMoves` derives current-player choices.
3. zero moves: record skip and complete turn automatically;
4. one move: controller briefly highlights then applies automatically;
5. multiple moves: human chooses or AI scores them;
6. `game.ts` verifies the chosen move is in the current legal set and applies it atomically;
7. check victory;
8. six keeps the same player; otherwise advance clockwise.

A six grants another turn even after a no-move roll.

## Finishing

- Exact: `progress + roll > 56` is illegal.
- Bounce: overflow reflects inside the private end sequence: `56 - (progress + roll - 56)`.
- Finished progress `56` never moves again.
- Quick target is two finished planes; Classic target is four.

## Deterministic RNG and Relaxed Dice

Use a serializable xorshift32 state. Every RNG function is immutable: it returns a new state object and never mutates its input.

A root `uint32` seed derives fixed separate dice and AI streams. Animation/chatter/timing consume neither.

Fair Dice consumes one sample per roll using `(sample % 6) + 1`. The tiny modulo bias is accepted; do not introduce variable-consumption rejection sampling because HPA-391 explicitly requires one sample per Fair roll.

Relaxed Dice activates for the current player when `noMoveStreak >= 3` or `lastPlaceRounds >= 3`. Active protection always consumes exactly two die samples. Prefer candidate one if it has a legal move; otherwise candidate two if it does; otherwise candidate one.

`noMoveStreak` resets after a turn with a legal move. `lastPlaceRounds` updates only when a clockwise round completes.

Progress score:

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

Unpredictable adds seeded jitter `[-120, 120]`; Cautious/Aggressive use seeded randomness only for top-score ties. Finish always dominates lesser tactics.

Exposure is calculated from the resulting public position by enumerating opponent planes and die values `1..6` through the **turn-agnostic** `resolveLegalMove`. Count a threat when `capturedPlaneIds` includes the moved plane. This consumes no RNG and never inspects future dice samples.

Tests include a fixture where the Cautious choice changes specifically because one candidate has an immediate capture threat. A resolver implementation that incorrectly rejects opponent-colour probes makes this test fail.

## Persistence and replay diagnostics

Storage key:

```text
procyon:aeroplane:active-match:v1
```

Persist version/timestamp, normalized config, authoritative state, resolved AI seats, root seed, both RNG states, counters/stats, and deterministic action history. Never persist derived legal moves, animation state, timers, provider config, or chatter work.

Manual runtime validation is sufficient; do not add Zod to the web package solely for saves. Corrupt/unknown payloads are copied to session diagnostics, removed from the active key, and replaced only when the player starts cleanly.

Action records contain roll/move identity, structured events, and resulting checksum. The checksum uses a small deterministic non-cryptographic function over canonical authoritative state.

`restoreActiveMatch` validates and returns the authoritative snapshot directly. It does **not** call replay and does not reject an otherwise-valid save because diagnostic history/checksums disagree.

`replayMatch` is an explicit DEV/test diagnostic that starts from config/root seed/seats and re-executes real dice/rules/AI. It reports the first mismatch; it is not used on the production recovery path.

## Match controller and UI boundaries

Implementation is split into two reviewable slices.

### Controller slice

`useAeroplaneMatch` owns:

- editable setup and frozen active config/seats/root seed;
- restore/new-match state;
- calls to pure game/dice/AI functions;
- timer generation token and skippable 650 ms AI presentation delay;
- action-history recording and local persistence;
- presentation queue/event-feed model;
- DEV/E2E fixture resolution.

It does not own SVG coordinates or history HTTP save policy.

Authoritative state commits before visual animation. `skipAnimations()` cancels presentation only and never applies a move.

### UI slice

`layout.ts` contains render-only anchors. `AeroplaneBoard` receives logical state, derived legal moves/resolved-route preview, and callbacks; it imports no dice/AI/storage code.

Components:

```text
apps/web/src/components/AeroplaneGame.tsx
apps/web/src/components/aeroplane/
  AeroplaneSetup.tsx
  AeroplaneBoard.tsx
  AeroplaneStatus.tsx
  AeroplaneEventFeed.tsx
  AeroplaneBoardPreview.tsx
```

Interaction:

- zero moves skip automatically;
- one legal move auto-applies after a brief highlight;
- multiple legal human planes pulse;
- hover/focus previews full resolved route;
- coarse pointer first activation previews and second activation applies;
- keyboard plane controls have visible focus and accessible move labels;
- mobile status strip stays compact and event feed is collapsible.

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

Classic: launch 6, exact finish, target 4, Fair Dice, stacking/blockades off.  
Quick & Chill: launch 5/6, bounce finish, target 2, Relaxed Dice, stacking/blockades off.

Manual edits mark Custom. Normalization changes only the stacking/blockade dependency.

## DEV/E2E fixture contract

Production behavior never reads test overrides. In `import.meta.env.DEV` only:

- `?e2eSeed=<uint32>` sets the root seed;
- `window.__PROCYON_AEROPLANE_FIXTURE__` may provide `seed`, normalized config, authoritative state, seats, RNG states, and `skipAnimations`;
- explicit window fixture seed wins over query seed;
- fixture state/seats/RNG pass the same invariant helpers as persistence;
- invalid fixtures are ignored with a DEV warning;
- when either fixture or query seed is active, animations default skipped unless explicitly overridden.

This follows the repository's existing test-injection direction without exposing production controls.

## Shared terminal history save policy

Do not duplicate `usePlayHistory`'s non-idempotent save semantics inside `useAeroplaneMatch`.

Extract:

```ts
interface UseTerminalHistorySaveOptions {
  enabled: boolean;
  isTerminal: boolean;
  isAuthenticated: boolean;
  userId: string | null | undefined;
  buildPayload: () => SubmitPlayHistoryInput | null;
  debugKey?: string;
  onFailure?: (reason: 'rejected' | 'network') => void;
}

function useTerminalHistorySave(options: UseTerminalHistorySaveOptions): void;
```

The shared hook owns:

- optimistic save-once ref;
- frozen first terminal payload/user snapshot;
- monotonic generation token across terminal → non-terminal reset;
- account-switch abandonment before first save and before 401 retry;
- maximum three delayed 401 retries;
- cancellation of stale retry timers;
- **no retry** on non-401 4xx, 5xx, network errors, or timeout because the POST is non-idempotent;
- unmount cleanup;
- optional one-time debug save counter.

`usePlayHistory` becomes strategy-specific terminal/result/opponent payload derivation and delegates policy to this hook. Existing save-policy tests move to `useTerminalHistorySave.test.ts`; strategy payload tests stay in `usePlayHistory.test.ts`.

`useAeroplaneMatch` delegates the same policy using its human-perspective `win | loss` payload and Aeroplane details. It does not add a second `savedRef`/generation/retry implementation.

A tiny `submitPlayHistory` transport helper may remain underneath the hook; sharing transport alone is not sufficient.

## Migration safety

The `chess_id → game_id` schema change must preserve existing rows.

`drizzle-kit generate` may ask whether the field was renamed or recreated. The implementation task must run generation interactively and choose the rename interpretation. The generated migration is accepted only if SQL inspection confirms:

```sql
ALTER TABLE `play_history` RENAME COLUMN `chess_id` TO `game_id`;
```

The gate rejects any generated `DROP COLUMN chess_id` / `ADD COLUMN game_id` sequence.

A Bun/SQLite migration-safety test creates a minimal legacy `play_history` row with `chess_id='chess'`, executes the generated `0011_*.sql`, and asserts the same row survives with `game_id='chess'`. This test runs before Aeroplane is accepted by the API.

## Chatter

Ship local personality lines for capture/flight/finish/win/loss. Line selection uses a presentation-only stable index/hash, not gameplay RNG. Generate/enqueue only after authoritative action completion. Chatter failure is ignored.

Do not register Aeroplane in `UniversalAIService`, the LLM move factory, or rule guardian.

## Error handling

- Illegal intrinsic plane move: resolver returns `null`.
- Wrong-turn selection: `game.ts` rejects because the move is not in the current legal set.
- Storage unavailable/corrupt: current in-memory play continues; corrupt restore offers clean restart.
- Animation error: clear presentation and render authoritative final state.
- AI invariant failure: DEV diagnostic + deterministic first-legal fallback; tests make this unreachable.
- History failure: shared terminal-save policy prevents unsafe duplicate retry; optional non-blocking notice.
- Chatter failure: ignore/fall back locally.
- Missing provider/API key: irrelevant to Aeroplane gameplay because AppShell does not hydrate provider state for this route.

## Test strategy

### Identity/UI integration

- five explicit selector links;
- exhaustive accent maps include Aeroplane;
- AppShell provider helper returns false for `/aeroplane` and true for all four strategy routes;
- existing homepage critical-journey E2E updated from Play buttons to Play links and run in Task 1.

### Engine

- four-colour routes/wraparound;
- launch and private occupancy;
- exact/bounce finishing;
- normal `30 → 34` jump on base arrival;
- direct flight and jump→flight stopping at `30`;
- final-endpoint-only capture;
- stacks/blockade crossing/landing/splitting/third-plane rejection;
- current-player `getLegalMoves` plus turn-agnostic resolver probes;
- extra-six and Quick/Classic victory.

### RNG/AI

- immutable RNG inputs;
- exact seeds;
- Fair one-sample consumption;
- Relaxed activation/two-sample/reset;
- restore continuation;
- personality scenarios;
- exposure-specific Cautious choice that fails if opponent-colour resolver probes return null;
- legal-only selection under advanced rules.

### Persistence/replay

- full snapshot round-trip;
- pending-choice restore;
- invalid versions/invariants;
- exact next RNG;
- diagnostic checksum reproduction/mismatch;
- valid snapshot restore succeeds independently of replay mismatch.

### Components/controller

- presets/normalization;
- resume/new match;
- auto move and human choice;
- stale timer cancellation;
- DEV fixture isolation;
- keyboard/touch/route preview;
- animation skip idempotence;
- mobile status/feed behavior.

### History/API

- rename migration preserves existing data;
- existing LLM rating and Stockfish unrated behavior remain green immediately after rename;
- shared terminal-save policy keeps frozen snapshot/account-switch/401/no-unsafe-retry semantics;
- Aeroplane pairing/details shape/win-loss validation;
- Aeroplane returns null rating and creates no rating rows;
- GET returns `details`;
- history UI shows Aeroplane/trio/unrated while leaving details unrendered.

### E2E

- deterministic seeds/fixtures for four human colours and all AI personalities;
- jump/flight/capture;
- stacking/blockades;
- reload awaiting choice;
- Quick victory;
- exactly one history submission;
- no provider configuration or AI-config rail on Aeroplane.

## Implementation order

1. Game identity/routes, exhaustive accents, selector link migration, AppShell provider exclusion, and homepage E2E gate.
2. Logical types/topology/turn-agnostic rules.
3. Seats, turn state, immutable seeded dice, and Relaxed counters.
4. Personality AI with exposure regression coverage.
5. Snapshot persistence + isolated replay diagnostics.
6. Match controller + DEV/E2E fixture contract.
7. Accessible board/setup/status/feed UI.
8. Generic history `gameId` rename + rename-only migration/data-survival/rating-regression gate.
9. Shared terminal history save policy extraction.
10. Aeroplane server history contract + details GET projection.
11. Aeroplane terminal save wiring + history UI label.
12. Local chatter + deterministic Aeroplane E2E coverage.

## Acceptance mapping

- Local visitor play → dedicated rules/dice/AI, no provider call or AppShell provider hydration.
- Exact presets/advanced rules → normalized config + one move resolver.
- No unnecessary human choice → current-player legal-move-count controller branch.
- Distinct deterministic AI → fixed score tables + separate AI stream + working turn-agnostic exposure probes.
- Exact reload → authoritative save + seats + both RNG states; replay diagnostics are independent.
- Responsive accessible play → SVG board + pointer/touch/keyboard controls.
- Unrated signed-in history → existing engine opponent kind + explicit rated game conversion.
- Safe history behavior → one shared terminal-save policy for strategy and Aeroplane callers.
- Failure isolation → rule state commits before animation/chatter/history side effects.
- Existing data safety → rename-only migration plus legacy-row survival test.

## Rule authority

HPA-391 is normative when public Aeroplane/Flight Chess house rules disagree. In particular, this design follows its explicit movement-resolution order: one normal jump pass, then one long-flight pass, then capture. Therefore a base arrival at logical progress `30` may jump to `34`, while a flight ending at `30` stops there.