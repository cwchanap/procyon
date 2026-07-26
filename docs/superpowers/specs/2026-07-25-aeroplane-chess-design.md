# Aeroplane Chess Game Design

**Date:** 2026-07-25  
**Repository:** `cwchanap/procyon`  
**Status:** Approved and self-reviewed  
**Target:** First complete Aeroplane Chess release

## 1. Summary

Add a faithful but approachable Aeroplane Chess mode to Procyon. Each match has one human player and three local heuristic AI opponents. The game supports launches, colour-square jumps, long flight shortcuts, captures, home lanes, optional stacking and blockades, and both four-plane and quick two-plane victories.

The experience should be cheerful and low-pressure. Gameplay is always local and instant; no API key or LLM is required. When the player has configured an AI provider, optional LLM reactions may add personality, but they never select moves, validate rules, delay a completed action, or affect match recovery.

Aeroplane Chess uses a dedicated path-based engine. It reuses Procyon's shared shell, design system, authentication, provider configuration, and play-history presentation where appropriate, but it does not enter the chess-oriented board, piece, move, or LLM-adapter abstractions.

## 2. Goals

- Provide a complete one-human, three-AI Aeroplane Chess match.
- Require a human choice only when more than one legal plane can move.
- Offer authentic and relaxed rules without overwhelming setup.
- Make dice, AI tie-breaking, saves, and debug replays deterministic from seeds and actions.
- Recover an interrupted local match after reload or browser restart.
- Record signed-in match results without changing competitive ratings.
- Give the three AI opponents distinct, readable personalities.
- Use a colourful board within Procyon's existing dark interface.
- Remain fully playable without an AI provider.

## 3. Non-goals

The first release does not include:

- Online multiplayer.
- Local hot-seat multiplayer.
- Ranked Aeroplane Chess or ELO changes.
- Spectating or server-authoritative turn storage.
- Cosmetics, currencies, unlocks, achievements, or progression.
- Custom or multiple board layouts.
- A generic Ludo, Pachisi, or race-board framework.
- An LLM that selects moves or validates rules.
- A three-consecutive-six penalty.

A generic race-game framework should be extracted only after a second game demonstrates stable shared concepts.

## 4. Architectural direction

### 4.1 Dedicated engine

Create:

```text
apps/web/src/lib/aeroplane/
  types.ts          Domain types and match configuration
  topology.ts       Logical paths, jumps, shortcuts, and render anchors
  rules.ts          Legal move generation and movement resolution
  game.ts           Turn transitions and victory checks
  dice.ts           Fair and Relaxed seeded dice policies
  ai.ts             Personality scoring and move selection
  persistence.ts    Save versioning, validation, and restoration
  replay.ts         Action-log replay and deterministic diagnostics
  *.test.ts         Unit and scenario tests
```

The engine operates only on logical positions. SVG or CSS coordinates are render data and must never determine legal movement.

### 4.2 Identity types

Separate navigation and history identity from chess-like strategy-engine identity:

```ts
export type StrategyGameVariant =
  | 'chess'
  | 'xiangqi'
  | 'shogi'
  | 'jungle';

export type GameId = StrategyGameVariant | 'aeroplane';
export type GameAccent = GameId | 'brass';
```

AI move services, strategy state maps, piece unions, and rectangular board configuration use `StrategyGameVariant`. Navigation, game cards, accents, and play history use `GameId`.

The current `GameVariant` export may temporarily remain as a deprecated alias of `StrategyGameVariant` to keep migration incremental.

## 5. Match configuration

```ts
interface AeroplaneMatchConfig {
  rulePreset: 'classic' | 'relaxed';
  victoryMode: 'all-four' | 'first-two';
  diceMode: 'fair' | 'relaxed';
  stackingEnabled: boolean;
  blockadesEnabled: boolean;
  humanColor: AeroplaneColor;
  chatterEnabled: boolean;
}
```

### 5.1 Rule presets

**Classic rules**

- A plane launches from its hangar only on 6.
- Rolling 6 grants another turn unless the match has ended.
- A plane must roll the exact remaining distance to finish.
- A move that overshoots the finish is illegal.

**Relaxed rules**

- A plane launches on 5 or 6.
- Rolling 6 grants another turn unless the match has ended.
- A plane that overshoots the finish bounces backward through its home lane by the excess distance.
- A finished plane never leaves the finished state.

### 5.2 Victory modes

- `all-four`: first player to finish all four planes.
- `first-two`: first player to finish any two planes.

### 5.3 Advanced rules

- Stacking and blockades are optional.
- Enabling blockades automatically enables stacking.
- Disabling stacking automatically disables blockades.
- The default experience remains streamlined: jumps, flights, and captures are active, while stacking and blockades are off.

### 5.4 Setup presets

**Classic Match — default**

- Classic rules.
- All-four victory.
- Fair Dice.
- Stacking off.
- Blockades off.

**Quick & Chill**

- Relaxed rules.
- First-two victory.
- Relaxed Dice.
- Stacking off.
- Blockades off.

The setup panel permits individual options to be changed after selecting a preset.

## 6. Board topology

The standard board definition contains:

- Four colours: red, yellow, blue, and green.
- Four hangars with four planes each.
- One private launch pad per colour.
- A 52-node shared track.
- A colour-specific entry and exit on that track.
- A six-node private home lane per colour, ending at finish.
- Explicit matching-colour jump edges.
- One explicit long flight shortcut per colour.

Only the owning colour can enter its launch pad or home lane. Shared-track squares are capturable unless protected by an enabled blockade.

`topology.ts` must explicitly list each colour's complete route and every jump or flight edge. Rules must not infer topology from board artwork.

### 6.1 Plane locations

```ts
type PlaneLocation =
  | { zone: 'hangar' }
  | { zone: 'launch-pad' }
  | { zone: 'shared-track'; index: number }
  | { zone: 'home-lane'; index: number }
  | { zone: 'finished' };

interface AeroplanePlane {
  id: string;
  ownerId: string;
  color: AeroplaneColor;
  location: PlaneLocation;
}
```

A successful launch moves a plane from its hangar to its private launch pad. A later roll advances it from the launch pad onto the first node of its colour route and then continues by the rolled distance defined by the topology.

## 7. Authoritative game state

```ts
interface AeroplaneGameState {
  schemaVersion: 1;
  matchId: string;
  players: AeroplanePlayer[];
  planes: AeroplanePlane[];
  currentPlayerIndex: number;
  phase: 'awaiting-roll' | 'awaiting-move' | 'finished';
  pendingRoll: number | null;
  winnerId: string | null;
  turnNumber: number;
  roundNumber: number;
  config: AeroplaneMatchConfig;
  gameplayRngState: SeededRngState;
  aiRngState: SeededRngState;
  balanceState: RelaxedDiceBalanceState;
  history: AeroplaneTurnRecord[];
}
```

Legal moves are derived from state and `pendingRoll`; persisted legal-move arrays are never trusted. Animation state belongs to the React controller, not the engine, so an animation failure cannot corrupt gameplay.

### 7.1 Player order and counters

Clockwise colour order is:

```ts
['red', 'yellow', 'blue', 'green']
```

Starting with the colour immediately clockwise from the human, assign Cautious, Aggressive, then Unpredictable to the remaining colours.

The starting player is selected uniformly from all four players using the gameplay RNG. No separate roll-off is shown.

- `turnNumber` increments whenever a player enters `awaiting-roll`, including an extra turn after 6.
- `roundNumber` increments after four player-advancing turns. Extra turns do not advance the round counter.

## 8. Actions and turn flow

```ts
type AeroplaneAction =
  | { type: 'roll'; playerId: string }
  | { type: 'move'; playerId: string; planeId: string }
  | { type: 'abandon'; playerId: string };
```

Turn flow:

1. Current player rolls.
2. Engine stores the roll and derives legal moves.
3. No legal moves: emit a skipped-turn event and end the move phase automatically.
4. One legal move: the controller applies it automatically.
5. Multiple legal moves: the human selects a plane or the AI evaluates the options.
6. Engine resolves the complete movement chain atomically and emits events.
7. Engine checks victory.
8. A roll of 6 grants the same player another turn when the match remains active.
9. Otherwise control advances clockwise.

A 6 grants an extra turn even when it produced no legal move. Consecutive sixes have no penalty.

## 9. Legal movement and resolution

### 9.1 Legal move generation

For every plane owned by the current player, determine whether the pending roll can:

- Launch it.
- Leave its launch pad.
- Advance around the shared track.
- Enter or advance through its home lane.
- Finish under exact-roll or bounce-back rules.

A move is illegal when:

- The phase or player is wrong.
- The plane is finished.
- Classic finishing would overshoot.
- Its base route or any automatic jump or flight crosses or lands on an enemy blockade.
- Stacking is off and its final shared-track destination contains a friendly plane.

### 9.2 Resolution order

Resolve a legal move in this exact order:

1. Apply the base movement along the owning colour's complete logical route. This step may enter the home lane, bounce within it, or finish.
2. When the base endpoint is a shared-track matching-colour jump square, apply that jump.
3. When the resulting shared-track endpoint is the colour's flight entrance, apply the long flight shortcut.
4. At the final shared-track endpoint, resolve enemy captures.
5. At the final shared-track endpoint, form or update any friendly stack or blockade.
6. Check whether a plane finished during base movement.
7. Check the configured victory condition.
8. Emit an extra-turn event when the roll was 6 and the match remains active.

Jumps and flights are automatic and never occur inside a private home lane.

### 9.3 Captures

- Landing on a capturable enemy-occupied shared-track square returns every enemy plane there to its hangar.
- Launch pads and home lanes cannot be captured.
- With stacking on and blockades off, an entire enemy stack can be captured.
- With blockades on, an enemy stack of two or more planes is a blockade and cannot be crossed, landed on, or captured.

### 9.4 Stacking and blockades

- With stacking on, friendly planes may share a shared-track square.
- Planes in a stack still move individually.
- With stacking off, ending on a friendly occupied shared-track square is illegal.
- A blockade is two or more friendly planes on one shared-track square.
- A blockade blocks ordinary movement, jumps, and flights whose traversed route or destination intersects it.
- The owner may break a blockade by moving any constituent plane.

## 10. Engine events

A successful action returns a new immutable state plus structured events:

```ts
type AeroplaneEvent =
  | { type: 'dice-rolled'; playerId: string; value: number }
  | { type: 'plane-launched'; playerId: string; planeId: string }
  | {
      type: 'plane-moved';
      playerId: string;
      planeId: string;
      from: PlaneLocation;
      to: PlaneLocation;
      traversed: PlaneLocation[];
    }
  | { type: 'jump-taken'; playerId: string; planeId: string }
  | { type: 'flight-taken'; playerId: string; planeId: string }
  | {
      type: 'planes-captured';
      playerId: string;
      planeId: string;
      capturedPlaneIds: string[];
    }
  | { type: 'stack-created'; playerId: string; planeIds: string[] }
  | { type: 'blockade-created'; playerId: string; planeIds: string[] }
  | { type: 'plane-finished'; playerId: string; planeId: string }
  | { type: 'turn-skipped'; playerId: string; reason: 'no-legal-move' }
  | { type: 'extra-turn'; playerId: string }
  | { type: 'match-won'; playerId: string };
```

The UI consumes these events for animation, sound, status messages, local dialogue, optional LLM chatter, and the event feed. UI code must not recalculate movement or captures.

## 11. Dice and deterministic randomness

Use separate seeded streams:

- `gameplayRngState`: starting-player selection and dice.
- `aiRngState`: personality variance and tie-breaking.
- Cosmetic timing consumes neither gameplay stream.

Production seeds use browser cryptographic randomness where available. Tests and debug fixtures supply fixed seeds.

### 11.1 Fair Dice

Consume exactly one gameplay RNG sample per roll and map uniformly to 1 through 6.

### 11.2 Relaxed Dice

Relaxed Dice provides bounded, reproducible protection:

- Track consecutive player turns that ended with no legal move.
- Track complete rounds that a player remained last by progress score.
- Protection activates after three consecutive no-move turns or three complete rounds in last place.
- When active, generate two seeded candidate rolls.
- Prefer a candidate that creates at least one legal move; if both or neither do, use the first.
- Consume both samples whenever protection is active.
- Reset the no-move counter after a legal move.
- Reset the trailing-round counter when the player is no longer last.

Progress score is deterministic:

- Finished plane: full route length.
- Active shared-track or home-lane plane: one plus completed route distance.
- Launch-pad plane: one.
- Hangar plane: zero.

Relaxed Dice does not inspect future samples, select a plane, force a capture, or guarantee a launch or victory.

## 12. AI opponents

The local AI receives only public state, pending roll, and legal moves. For each move it derives features such as:

```ts
interface AeroplaneMoveFeatures {
  launchesPlane: boolean;
  finishesPlane: boolean;
  capturesCount: number;
  takesJump: boolean;
  takesFlightShortcut: boolean;
  entersHomeLane: boolean;
  advancesDistance: number;
  captureRiskAfterMove: number;
  breaksOwnBlockade: boolean;
  createsStack: boolean;
  createsBlockade: boolean;
}
```

**Cautious** strongly values finishing, home-lane entry, low capture risk, stacks, and blockades. It captures when the resulting position is reasonably safe.

**Aggressive** strongly values captures, jumps, flights, and immediate advancement. It accepts greater capture risk, but still chooses a guaranteed finish over a minor capture.

**Unpredictable** uses balanced weights plus the largest bounded seeded variance. It may favour a fresh launch, risky capture, or shortcut when scores are close, but it never selects an illegal move or passes a legal turn.

AI decisions are computed immediately. The UI waits 500–900 ms before presenting the choice so turns remain readable. The delay is skippable and not persisted.

## 13. Optional opponent chatter

Gameplay never depends on an LLM. Provide personality-specific local lines for notable events.

When chatter is enabled and a provider is configured, an isolated `AeroplaneChatterService` may request one short reaction after:

- Capturing or being captured.
- Taking a flight shortcut.
- Finishing a plane.
- Winning or losing.

Requirements:

- Complete gameplay before requesting dialogue.
- Limit output to one sentence.
- Rate-limit to one generated line per opponent every two complete rounds.
- Fall back to a local line on timeout, malformed output, provider failure, or missing configuration.
- Never add Aeroplane Chess to the LLM move-adapter factory.
- Never include provider secrets or RNG state in prompts.

Chatter defaults off for a new player and can be enabled in setup or match settings.

## 14. UI and Procyon integration

### 14.1 Files

```text
apps/web/src/pages/aeroplane.astro
apps/web/src/components/AeroplaneGame.tsx
apps/web/src/components/aeroplane/AeroplaneSetup.tsx
apps/web/src/components/aeroplane/AeroplaneBoard.tsx
apps/web/src/components/aeroplane/AeroplanePlane.tsx
apps/web/src/components/aeroplane/AeroplaneDice.tsx
apps/web/src/components/aeroplane/AeroplanePlayerPanel.tsx
apps/web/src/components/aeroplane/AeroplaneEventFeed.tsx
apps/web/src/components/aeroplane/AeroplaneMatchResult.tsx
```

### 14.2 Game selector

Add an Aeroplane Chess card with a colourful four-player preview and route `/aeroplane`.

Replace title-based routing with data-driven card definitions:

```ts
interface GameCardDefinition {
  title: string;
  description: string;
  gameId: GameId;
  href: string;
}
```

Add a `GameBoardPreview` dispatcher: strategy IDs continue to use `ChessBoardPreview`; `aeroplane` uses an Aeroplane-specific preview. Display-title changes must not affect routing.

### 14.3 Setup

Show:

- Classic Match and Quick & Chill presets.
- Rule preset.
- Victory mode.
- Dice mode.
- Stacking.
- Blockades.
- Human colour.
- Opponent chatter.

When a valid active save exists, offer Resume Match and Start New Match. Starting a new match asks for lightweight confirmation because it replaces the active save.

### 14.4 Match layout

Desktop:

- Large square board in the primary area.
- Four compact player panels around or beside it.
- Dice and current-turn controls below the board.
- Compact recent-event feed.

Mobile:

- Board fills available width.
- Current player and dice stay directly below it.
- Other players use a horizontally scrollable status strip.
- Event feed is collapsible.

The board uses bright red, yellow, green, and blue gameplay elements inside Procyon's dark shell.

### 14.5 Interaction

- Roll is enabled only for the human during `awaiting-roll`.
- No legal moves: show a short message and advance automatically.
- One legal move: highlight briefly and apply automatically.
- Multiple legal moves: pulse only legal planes.
- Hover, focus, or first tap previews the full resolved route.
- Selecting a legal plane applies it immediately without confirmation.
- Disable input while event animations play.
- Skip Animations drains the event queue and renders the already-produced final engine state exactly once.
- Legal planes have keyboard focus, visible focus styling, and accessible destination/effect labels.

### 14.6 Animation boundaries

Animation consumes engine events and never mutates rules:

- Step movement for ordinary travel.
- Short hop for colour jumps.
- Curved path for long flights.
- Return-to-hangar animation for captures.
- Small celebration for a finished plane.
- Dismissible celebration for victory.

Sound is optional and cannot block event completion.

## 15. Local persistence and replay

Save after each completed action resolution, including a roll that leaves the game in `awaiting-move`.

Use a versioned key:

```text
procyon:aeroplane:active-match:v1
```

Persist authoritative game state, match configuration, both RNG states, balance counters, turn history, schema version, and save timestamp.

Do not persist derived legal moves, animation state, pending LLM requests, or provider keys.

Restore flow:

- Parse with a runtime schema.
- Reject unknown versions.
- Verify player, plane, phase, and topology invariants.
- Recompute legal moves.
- Resume without replaying completed animations.
- Preserve a corrupt payload in a session diagnostic key and offer a clean restart.

Turn history records action, roll, chosen plane, emitted events, and resulting state checksum. Given the initial seeds and action history, a debug replay must reproduce the same checksums.

Abandoning or finishing clears the active-match key. If a signed-in history submission fails, store its payload separately under a versioned pending-history key until retry succeeds or the player dismisses it.

## 16. Play history and ratings

The existing endpoint accepts user or LLM opponents and updates ratings for AI matches. Aeroplane Chess needs an unrated local-AI path.

### 16.1 Game and opponent identity

- Use `GameId` for play-history game identity, including `aeroplane`.
- Keep rating tables and services restricted to `StrategyGameVariant`.
- Define a server-owned rated set containing only Chess, Xiangqi, Shogi, and Jungle.
- Keep the existing request field `chessId` and physical `chess_id` database column for compatibility in this feature; normalize their value internally to `GameId`. A broad API or column rename is separate work.

Add:

```ts
export enum LocalOpponentId {
  AeroplaneTrioV1 = 'aeroplane-trio-v1',
}
```

Add nullable `opponentLocalId` to `play_history`. The route requires exactly one of:

- `opponentUserId`.
- `opponentLlmId`.
- `opponentLocalId`.

Aeroplane results submit `opponentLocalId: 'aeroplane-trio-v1'`.

### 16.2 Unrated server path

When the normalized game ID is not in the server-owned rated set:

- Insert the play-history record.
- Do not call `updatePlayerRating`.
- Return `ratingUpdate: null`.
- Create no `player_ratings` or `rating_history` rows.

The server, never the client, decides whether a game is rated.

### 16.3 Match details

Add a nullable JSON-encoded details column and validate game-specific details at the route boundary:

```ts
interface AeroplaneHistoryDetails {
  rulePreset: 'classic' | 'relaxed';
  victoryMode: 'all-four' | 'first-two';
  diceMode: 'fair' | 'relaxed';
  durationSeconds: number;
  planesFinished: number;
  capturesMade: number;
  capturesSuffered: number;
  aiPersonalities: ['cautious', 'aggressive', 'unpredictable'];
}
```

History failure never changes the local result or active UI state.

## 17. Error handling

```ts
type AeroplaneActionFailureReason =
  | 'wrong-phase'
  | 'not-current-player'
  | 'plane-not-movable'
  | 'blocked-path'
  | 'match-finished'
  | 'invalid-state';

type AeroplaneActionResult =
  | { ok: true; state: AeroplaneGameState; events: AeroplaneEvent[] }
  | { ok: false; reason: AeroplaneActionFailureReason };
```

Requirements:

- Ignore stale double-clicks while an action is consumed.
- Disable roll and selection outside their phases.
- Never partially apply a chained move.
- Validate engine invariants in development and tests.
- Treat animation, sound, chatter, saving, and history submission as side effects around a completed engine transition.
- Saving failure keeps the live match and shows a non-blocking warning.
- Chatter failure uses a local line or no reaction.
- History failure offers retry without replaying the match.

## 18. Testing strategy

### 18.1 Topology and engine

- Every colour route reaches only its own home lane and finish.
- Shared-track rotation, jumps, flights, and render anchors are complete.
- Classic and Relaxed launching.
- Extra turns after 6, including no-move turns.
- Exact finish and bounce-back finish.
- Shared-track wraparound and home-lane entry.
- Jumps and long flights.
- Single and multi-plane captures.
- Friendly collision with stacking off.
- Stack creation, splitting, and blockade restrictions.
- Quick and all-four victories.
- Chained event order and immutable transitions.

### 18.2 Dice and AI

- Same seed produces the same Fair Dice sequence.
- Relaxed protection activation, sample consumption, candidate selection, and reset.
- Restore continues the exact next roll.
- Cautious prefers a safe finish over an unsafe capture.
- Aggressive prefers a meaningful capture but not over guaranteed finishing.
- Unpredictable varies across seeds and is stable for the same seed.
- Every personality selects only legal moves under all advanced-rule combinations.

### 18.3 Persistence and React

- Save/restore preserves authoritative state and recomputes legal moves.
- Corrupt and unknown-version saves fail safely.
- Replay reproduces state checksums.
- Presets populate the correct options.
- Blockades imply stacking.
- Resume/new-match flows.
- Zero, one, and multiple legal move behaviour.
- Keyboard selection.
- Skip Animations applies the final state once.
- Chatter absence never affects a turn.

### 18.4 API and end-to-end

- `aeroplane` is accepted in play history.
- Exactly one opponent type is required.
- Local-AI history returns `ratingUpdate: null` and creates no rating rows.
- Existing strategy LLM matches continue to update ratings.
- Aeroplane detail validation rejects malformed statistics.
- Start Quick & Chill as each human colour.
- Complete human and all three AI turns.
- Launch, jump, fly, capture, stack, and block using fixed fixtures.
- Reload and resume.
- Complete a deterministic two-plane victory.
- Submit exactly one unrated history record.
- Complete a match with no provider configuration.

## 19. Implementation order

1. Split game identity types and define topology.
2. Implement pure rules, state transitions, dice, and deterministic tests.
3. Implement personality AI.
4. Implement setup, board renderer, and match controller.
5. Add animations and local recovery.
6. Add the selector card, preview, and `/aeroplane` route.
7. Add local-opponent play history and the unrated API path.
8. Add local lines and optional LLM chatter.
9. Complete component, API, and end-to-end coverage.

Do not refactor unrelated strategy engines. Change shared code only where Aeroplane Chess needs a genuinely general navigation, accent, shell, preview, or history concept.

## 20. Acceptance criteria

The feature is complete when:

- A visitor can play one human against three AI opponents without signing in or configuring an LLM.
- Classic Match is the default and both presets behave exactly as specified.
- Launches, movement, jumps, flights, captures, optional stacks/blockades, home lanes, and both victories are enforced by pure engine code.
- Human turns require no choice when zero or one legal move exists.
- Cautious, Aggressive, and Unpredictable make legal and visibly different decisions.
- Reloading resumes the exact match and RNG sequence.
- Desktop, mobile, pointer, touch, and keyboard interactions are usable.
- Signed-in results appear as local-AI Aeroplane games.
- Aeroplane matches never create or modify rating records.
- Provider, chatter, animation, sound, save, or history failures cannot invalidate or lose an applied move.
- Unit, component, API, and end-to-end tests cover the critical paths above.
