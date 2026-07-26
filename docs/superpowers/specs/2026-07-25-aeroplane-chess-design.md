# Aeroplane Chess Game Design

**Date:** 2026-07-25  
**Repository:** `cwchanap/procyon`  
**Status:** Approved design  
**Target:** First complete Aeroplane Chess release

## 1. Summary

Add a faithful but approachable Aeroplane Chess game to Procyon. A match has one human player and three local heuristic AI opponents. It supports traditional movement, launches, colour jumps, flight shortcuts, captures, home lanes, and four-plane victory, while also offering optional relaxed rules and a shorter two-plane victory mode.

The game must feel cheerful and low-pressure. Gameplay decisions are local and instant; an LLM is never required. When the player has configured an AI provider, optional LLM-generated reactions may add personality without affecting rules, move choice, match recovery, or turn timing.

Aeroplane Chess is implemented as a dedicated path-based engine. It reuses Procyon's shared page shell, design system, authentication, provider configuration, and play-history UI where appropriate, but it does not enter the chess-oriented board, move, or AI-adapter abstractions.

## 2. Goals

- Provide a faithful Aeroplane Chess ruleset for one human and three AI opponents.
- Keep each human turn simple: roll, then choose a plane only when more than one legal move exists.
- Support both authentic and relaxed match presets.
- Make all gameplay deterministic from recorded actions and seeded random state.
- Recover an interrupted local match after reload or browser restart.
- Integrate completed signed-in matches into play history without changing ratings.
- Give the three AI opponents distinct, readable personalities.
- Present a colourful board inside Procyon's existing darker interface.
- Keep gameplay functional when no AI provider or API key is configured.

## 3. Non-goals

The first release does not include:

- Online multiplayer.
- Local hot-seat multiplayer.
- Ranked Aeroplane Chess or ELO changes.
- Spectating.
- Server-authoritative turn storage.
- Cosmetics, currencies, unlocks, achievements, or progression.
- Custom board layouts or a board editor.
- Multiple Aeroplane Chess rule traditions beyond the defined options.
- A generic Ludo, Pachisi, or race-board framework.
- An LLM that selects moves or validates rules.
- A three-consecutive-six penalty.

A reusable race-game framework should be extracted only after a second race game demonstrates stable shared concepts.

## 4. Architectural direction

### 4.1 Dedicated engine

Create a game-specific engine under:

```text
apps/web/src/lib/aeroplane/
```

Recommended modules:

```text
types.ts          Domain types and configuration
topology.ts       Logical board paths, jumps, shortcuts, and render anchors
rules.ts          Legal move generation and movement resolution
game.ts           Turn transitions and victory checks
dice.ts           Fair and Relaxed seeded dice policies
ai.ts             Personality scoring and move selection
persistence.ts    Save versioning, validation, and restoration
replay.ts         Action-log replay and deterministic diagnostics
*.test.ts         Unit and scenario tests
```

The engine operates on logical path positions, never pixels or React components. `topology.ts` maps logical positions to board anchors used by the renderer.

### 4.2 Why the existing strategy-game model is not reused

Procyon's current strategy variants use rectangular boards, coordinate-to-coordinate moves, two-player-style state, and LLM move adapters. Aeroplane Chess instead needs:

- Four players.
- Dice actions.
- Hangars and launch pads.
- A shared circular track plus colour-specific home lanes.
- Multiple planes on one location.
- Automatic chained movement effects.
- Local personality AI rather than LLM move generation.

Forcing these concepts into the current generic game state would broaden every existing variant and create avoidable regression risk.

### 4.3 Shared identity types

Separate navigation and history identity from chess-like engine identity:

```ts
export type StrategyGameVariant =
  | 'chess'
  | 'xiangqi'
  | 'shogi'
  | 'jungle';

export type GameId = StrategyGameVariant | 'aeroplane';

export type GameAccent = GameId | 'brass';
```

AI move services, generic piece maps, and strategy board configuration use `StrategyGameVariant`. Navigation, game cards, theme accents, and play history use `GameId`.

During migration, the existing `GameVariant` export may remain as a deprecated alias of `StrategyGameVariant` to keep the change incremental. New code must use the more specific type.

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

**Classic**

- A plane launches from its hangar only on a roll of 6.
- Rolling 6 grants another turn unless the match has ended.
- A plane must roll the exact remaining distance to finish.
- A move that would overshoot the finish is illegal.

**Relaxed**

- A plane launches on a roll of 5 or 6.
- Rolling 6 grants another turn unless the match has ended.
- A plane that overshoots the finish bounces backward through its home lane by the excess distance.
- A finished plane never leaves the finished state.

### 5.2 Victory modes

- `all-four`: the first player to finish all four planes wins.
- `first-two`: the first player to finish any two planes wins.

### 5.3 Advanced rules

- Stacking and blockades are independent options.
- Enabling blockades implicitly enables stacking because a blockade requires a stack.
- Disabling stacking also disables blockades in normalized configuration.

### 5.4 Setup presets

**Classic Match**

- Classic rules.
- All-four victory.
- Fair Dice.
- Stacking enabled.
- Blockades enabled.

**Quick & Chill**

- Relaxed rules.
- First-two victory.
- Relaxed Dice.
- Stacking enabled.
- Blockades disabled.

The setup panel allows individual options to be changed after choosing a preset.

## 6. Board topology

### 6.1 Logical board

The board definition contains:

- Four colours: red, yellow, blue, and green.
- Four hangars, each containing four planes.
- One private launch pad per colour.
- A 52-node shared track.
- A colour-specific entry point onto the shared track.
- A colour-specific exit from the shared track.
- A six-node home lane per colour, ending at the finish.
- Matching-colour jump edges.
- One long flight shortcut per colour.
- Safe or private positions where opponents cannot land, when present in the selected standard layout.

The board definition must explicitly list each colour's complete movement path and shortcut edges. Rules must not derive movement from SVG geometry.

### 6.2 Plane locations

```ts
type PlaneLocation =
  | { zone: 'hangar' }
  | { zone: 'launch-pad' }
  | { zone: 'shared-track'; index: number }
  | { zone: 'home-lane'; index: number }
  | { zone: 'finished' };
```

Each plane has a stable ID, owner colour, and location:

```ts
interface AeroplanePlane {
  id: string;
  ownerId: string;
  color: AeroplaneColor;
  location: PlaneLocation;
}
```

A launch moves a plane from `hangar` to its private `launch-pad`. A later move advances it from the launch pad to the first position on its colour's path.

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

Legal moves are derived from the state and pending roll; they are not trusted when loading a save. Animation state is owned by the React controller rather than the engine. This ensures an animation error cannot corrupt authoritative gameplay.

### 7.1 Player order and match start

The fixed clockwise order is:

```ts
['red', 'yellow', 'blue', 'green']
```

The human may choose any colour. The three personalities are assigned in clockwise order among the remaining colours:

1. Cautious.
2. Aggressive.
3. Unpredictable.

The starting player is selected uniformly using the gameplay RNG. There is no separate roll-off sequence.

## 8. Actions and turn flow

Supported engine actions:

```ts
type AeroplaneAction =
  | { type: 'roll'; playerId: string }
  | { type: 'move'; playerId: string; planeId: string }
  | { type: 'abandon'; playerId: string };
```

Turn flow:

1. The current player rolls.
2. The engine stores the roll and generates legal moves.
3. If no legal move exists, the move phase ends automatically.
4. If exactly one legal move exists, the controller applies it automatically.
5. If multiple moves exist, the human selects a legal plane or the AI evaluates the choices.
6. The engine resolves the complete movement chain and emits events.
7. Victory is checked.
8. If the roll was 6 and the match has not ended, the same player receives another turn.
9. Otherwise, the current player advances clockwise.

A roll of 6 grants the extra turn even when no legal plane can move. No penalty applies for consecutive sixes.

## 9. Move generation and resolution

### 9.1 Legal move generation

For each plane owned by the current player, the engine determines whether the pending roll can:

- Launch it from the hangar.
- Move it from the launch pad onto its path.
- Advance it around the shared track.
- Enter or advance through its home lane.
- Finish it under the active exact-roll or bounce-back rule.

A move is excluded when:

- It violates the current phase or player turn.
- Its ordinary path crosses an enemy blockade.
- Its final chained path crosses or lands on an enemy blockade.
- Stacking is disabled and it would end on a friendly occupied shared-track position.
- Classic finishing would overshoot.
- The plane is already finished.

### 9.2 Resolution order

A legal move resolves in this exact order:

1. Move or launch the selected plane.
2. Apply a matching-colour square jump when the landing location defines one.
3. Apply the long flight shortcut when the resulting landing location defines one.
4. Resolve captures at the final shared-track location.
5. Form or update a friendly stack.
6. Enter or advance through the home lane when the path reaches the colour exit.
7. Mark a plane finished when it reaches the terminal home position.
8. Check the configured victory condition.
9. Emit an extra-turn event when the roll was 6 and the game remains active.

Jumps and flights are automatic. A player does not confirm each link in a chained move.

### 9.3 Captures

- Landing on an enemy-occupied capturable shared-track location returns all enemy planes at that location to their hangars.
- Private launch pads and home lanes cannot be captured by opponents.
- If stacking is enabled but blockades are disabled, an entire enemy stack can be captured.
- If blockades are enabled, an enemy stack of two or more planes is a blockade and cannot be crossed, landed on, or captured.

### 9.4 Stacking and blockades

- With stacking enabled, friendly planes may share a shared-track location.
- A player may move one plane out of a stack; stacks do not move as one unit.
- With stacking disabled, a move ending on a friendly occupied shared-track location is illegal.
- A blockade is two or more friendly planes on one shared-track location.
- A blockade blocks ordinary movement, matching-colour jumps, and flight shortcuts whose traversed path or destination intersects it.
- The owning player may break a blockade by moving any constituent plane.

## 10. Engine events

Every successful action returns a new immutable state and structured events:

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

The UI uses these events for animations, sound, status text, local reactions, optional LLM chatter, and the event feed. UI code must not recalculate captures or chained movement.

## 11. Dice and deterministic randomness

### 11.1 RNG streams

Use independent seeded streams:

- `gameplayRngState`: dice and starting-player selection.
- `aiRngState`: AI tie-breaking and Unpredictable personality variance.
- Cosmetic animation timing does not consume either gameplay stream.

Production match seeds use cryptographically strong browser randomness where available. Tests and debug fixtures supply fixed seeds.

### 11.2 Fair Dice

Fair Dice consumes exactly one gameplay RNG sample per roll and maps it uniformly to 1 through 6. Every roll is independent apart from the deterministic seeded sequence.

### 11.3 Relaxed Dice

Relaxed Dice uses transparent, bounded protection rather than changing plane choices:

- Track consecutive turns in which a player had no legal move after rolling.
- Track how many complete rounds a player has remained last by progress score.
- Protection activates when either:
  - the player has had three consecutive no-move turns; or
  - the player has remained last for three complete rounds.
- When protection is active, generate two seeded candidate rolls.
- Prefer a candidate that creates at least one legal move; if both or neither do, keep the first candidate.
- Consume both samples whenever protection is active so replay remains stable.
- Reset the no-move counter after a legal move.
- Reset the trailing-round counter when the player is no longer last.

Progress score is deterministic:

- Finished plane: full path length plus home-lane length.
- Active plane: completed logical path distance.
- Launch-pad plane: zero.
- Hangar plane: zero.

Relaxed Dice does not inspect future RNG values, choose a plane, force a capture, or guarantee a launch or victory.

## 12. AI opponents

### 12.1 Local heuristic selection

The AI receives only the current public game state, pending roll, and legal moves. For each legal move it derives:

```ts
interface AeroplaneMoveFeatures {
  launchesPlane: boolean;
  finishesPlane: boolean;
  capturesCount: number;
  takesJump: boolean;
  takesFlightShortcut: boolean;
  entersHomeLane: boolean;
  advancesDistance: number;
  exposesToCapture: boolean;
  leavesSafePosition: boolean;
  breaksOwnBlockade: boolean;
  createsStack: boolean;
  createsBlockade: boolean;
}
```

Each personality applies explicit weights, then uses the AI RNG only to break close scores or add bounded personality variance.

### 12.2 Personalities

**Cautious**

- Strongly values finishing and entering the home lane.
- Prefers safe locations, stacks, and blockades.
- Penalizes exposing an advanced plane.
- Takes captures when the resulting position is reasonably safe.

**Aggressive**

- Strongly values captures, jumps, and flight shortcuts.
- Accepts greater exposure for immediate tactical gain.
- Breaks defensive stacks more readily.
- Still prioritizes a guaranteed finish over a minor capture.

**Unpredictable**

- Uses balanced base weights.
- Adds the largest bounded seeded variance.
- May favour a new launch, risky capture, or shortcut when scores are close.
- Never selects an illegal move or deliberately passes a legal turn.

### 12.3 Timing

AI decisions are calculated immediately. The UI waits 500 to 900 milliseconds before presenting the selected move so turns remain readable. This delay is skippable and is not part of game state.

## 13. Optional opponent chatter

Gameplay never depends on an LLM.

Provide personality-specific local lines for notable events. When chatter is enabled and a provider is configured, an `AeroplaneChatterService` may request a single short reaction after:

- Capturing or being captured.
- Taking a flight shortcut.
- Finishing a plane.
- Winning or losing.

Requirements:

- Apply the gameplay action before requesting dialogue.
- Do not send the complete hidden RNG state or provider secrets in prompts.
- Limit output to one sentence.
- Rate-limit to one generated line per opponent every two complete rounds.
- Fall back to local lines on timeout, malformed output, provider failure, or missing configuration.
- Do not add Aeroplane Chess to the LLM move-adapter factory.
- Persist only whether chatter is enabled, not generated lines, unless they are already represented in the local event feed.

Chatter defaults to off for a new user and may be enabled from setup or match settings.

## 14. React components and page flow

Recommended files:

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

### 14.1 Game selector

Add an Aeroplane Chess card with a colourful board preview and route `/aeroplane`.

Replace title-based routing in `ChessGameSelector` with data-driven routes:

```ts
interface GameCardDefinition {
  title: string;
  description: string;
  accent: GameAccent;
  href: string;
}
```

The card component receives `href` or an explicit navigation callback. Display title changes must not affect routing.

### 14.2 Setup flow

Before a new match, show:

- Classic Match and Quick & Chill preset buttons.
- Rule preset.
- Victory mode.
- Dice mode.
- Stacking.
- Blockades.
- Human colour.
- Opponent chatter.

If a recoverable save exists, show Resume Match and Start New Match. Starting a new match requires a lightweight confirmation because it replaces the active save.

### 14.3 Match layout

Desktop:

- Large square board in the primary area.
- Four player panels around or beside it.
- Current turn and dice control below the board.
- Compact event feed.

Mobile:

- Board fills available width.
- Current player and dice remain directly below it.
- Other players appear in a horizontally scrollable status strip.
- Event feed is collapsible.

The board uses bright red, yellow, green, and blue gameplay elements within Procyon's dark shared shell.

### 14.4 Human interaction

- The Roll Dice button is enabled only during the human `awaiting-roll` phase.
- No legal moves: show a brief message and advance automatically.
- One legal move: highlight it briefly and apply automatically.
- Multiple legal moves: pulse only legal planes.
- Hover, focus, or first tap previews the complete resolved path.
- Selecting a legal plane applies the move without a separate confirmation.
- Input remains disabled while event animations are playing.
- Skip Animations completes the current event queue and renders the already-produced engine state exactly once.

All interactions must be keyboard accessible. Legal planes expose clear focus styling and accessible labels describing their destination or effect.

## 15. Animation and sound boundaries

Animation consumes the engine's event list and never mutates rules.

- Ordinary movement animates individual logical steps.
- Jumps use a short hop.
- Long flights use a curved flight path.
- Captured planes return to the hangar with a brief reverse-flight animation.
- Finished planes receive a small celebration.
- Match victory receives a larger but dismissible celebration.

Sound is optional, respects the existing user preference system when present, and can fail without blocking event completion.

## 16. Local persistence and replay

### 16.1 Save policy

Save after each completed action resolution and before handing control to the next player. Store under a versioned key such as:

```text
procyon:aeroplane:active-match:v1
```

Persist:

- Authoritative game state.
- Match configuration.
- Both RNG states.
- Relaxed Dice balance counters.
- Turn history.
- Save schema version and timestamp.

Do not persist:

- Derived legal moves.
- React animation state.
- Pending LLM requests.
- Provider keys.

### 16.2 Restore policy

- Parse and validate the saved payload with a runtime schema.
- Reject an unknown schema version.
- Recompute legal moves from authoritative state.
- Verify player, plane, and topology invariants.
- Resume at the saved engine phase without replaying completed animations.
- On corruption, preserve the invalid payload in a diagnostic backup key for the current session and offer a clean restart.

### 16.3 Replay diagnostics

Turn history records the action, roll, selected plane, emitted events, and resulting state checksum. Given the initial seed and action history, a debug replay must reproduce the same checksums. This supports deterministic bug reports without storing every full intermediate state.

## 17. Play-history and rating integration

The current play-history API models opponents as either a user or an LLM and updates a rating for every accepted AI match. Aeroplane Chess requires a third, unrated local-AI path.

### 17.1 Identity split

- Extend play-history game identity to `GameId`, including `aeroplane`.
- Keep rating tables and rating services restricted to `StrategyGameVariant`.
- Define a server-owned `RATED_GAME_IDS` set containing only Chess, Xiangqi, Shogi, and Jungle.

### 17.2 Local opponent type

Add:

```ts
export enum LocalOpponentId {
  AeroplaneTrioV1 = 'aeroplane-trio-v1',
}
```

Add nullable `opponentLocalId` to `play_history`. The create schema requires exactly one of:

- `opponentUserId`.
- `opponentLlmId`.
- `opponentLocalId`.

Aeroplane submissions use `opponentLocalId: 'aeroplane-trio-v1'`.

### 17.3 Unrated path

When `gameId` is not in `RATED_GAME_IDS`:

- Insert the play-history record.
- Do not call `updatePlayerRating`.
- Return `ratingUpdate: null`.
- Do not create `player_ratings` or `rating_history` rows.

The server, not the client, decides whether a game is rated.

### 17.4 Match details

Add a nullable JSON-encoded details column to play history. Validate game-specific details at the route boundary.

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

The existing physical `chess_id` column may remain for migration compatibility, but TypeScript and API naming should use `gameId` for new code. A broad database-column rename is not required for this feature.

History submission failure never changes or discards the local match result.

## 18. Error handling

Normal invalid actions return typed failures:

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

Reliability requirements:

- Ignore stale double-clicks while an action is being consumed.
- Disable rolling and plane selection outside the correct phase.
- Never partially apply a movement chain.
- Validate engine invariants in development and tests.
- Treat animation, sound, chatter, local save, and history submission as side effects around a completed engine transition.
- If local saving fails, keep the live match and show a non-blocking warning.
- If optional chatter fails, use a local line or omit the reaction.
- If history submission fails, provide a retry action without replaying the match.

## 19. Testing strategy

### 19.1 Topology tests

- Every colour path reaches its own home lane and finish.
- Shared-track paths have the expected length and rotation.
- Jump and flight edges reference valid nodes.
- Render anchors exist for every logical location.
- No private home-lane node is reachable by another colour.

### 19.2 Rule-engine tests

- Classic and Relaxed launch rolls.
- Extra turns after 6, including no-legal-move turns.
- Exact finish and bounce-back finish.
- Shared-track wraparound and home-lane entry.
- Matching-colour jumps.
- Long flight shortcuts.
- Single and multi-plane captures.
- Friendly collision with stacking disabled.
- Stack creation and splitting.
- Blockade crossing, landing, jumping, and flight restrictions.
- Quick and Classic victory conditions.
- No legal move auto-advance.
- Chained event order.
- Immutable state transitions.

### 19.3 Dice tests

- Fair Dice distribution mapping from seeded values.
- Same seed produces the same sequence.
- Relaxed protection activation and reset.
- Relaxed candidate selection prefers a legal-move result.
- Relaxed mode consumes the specified number of RNG samples.
- Restore continues the exact next roll.

### 19.4 AI tests

- Cautious prefers a safe finish over an unsafe capture.
- Aggressive prefers a meaningful capture over modest advancement.
- Aggressive still chooses a guaranteed finish over a low-value capture.
- Unpredictable varies across seeds but is stable for the same seed.
- Every personality selects only legal moves.
- Personalities work under all stacking and blockade combinations.

### 19.5 Persistence tests

- Save and restore preserve authoritative state.
- Legal moves are reconstructed rather than trusted.
- Corrupt, incomplete, and unknown-version saves fail safely.
- State checksums reproduce through replay.
- Finished and abandoned matches clear the active recovery save.

### 19.6 React tests

- Setup presets populate correct options.
- Blockades enable stacking and stacking-off disables blockades.
- Resume and new-match flows.
- Roll button phase gating.
- Zero, one, and multiple legal move behaviour.
- Keyboard selection of legal planes.
- Skip Animations applies final state once.
- AI delay can be skipped.
- Chatter absence does not affect a turn.

### 19.7 API tests

- `aeroplane` is accepted as a play-history game ID.
- Exactly one opponent type is required.
- Local AI history creates a record with `ratingUpdate: null`.
- Local AI history creates no rating rows.
- Strategy LLM matches continue to update ratings.
- Aeroplane details validation rejects malformed statistics.

### 19.8 End-to-end tests

Use fixed debug seeds and fixtures to cover:

- Start Quick & Chill as each human colour.
- Complete a human turn and all three AI turns.
- Launch, jump, take a flight shortcut, and capture.
- Create and break a blockade.
- Reload and resume a match.
- Complete a deterministic two-plane victory.
- Submit exactly one unrated play-history record.
- Play successfully with no provider configuration.

## 20. Implementation boundaries

The implementation should proceed in dependency order:

1. Identity-type split and board topology.
2. Pure engine, dice, and deterministic tests.
3. Personality AI.
4. Board renderer and setup flow.
5. Match controller, animations, and recovery.
6. Game selector and route integration.
7. Local-AI play-history path and unrated API behaviour.
8. Optional local and LLM chatter.
9. Component and end-to-end coverage.

Do not refactor unrelated strategy-game engines. Shared components should change only where Aeroplane Chess needs a general navigation, accent, shell, or history concept.

## 21. Acceptance criteria

The feature is complete when:

- A visitor can start a one-human, three-AI match without signing in or configuring an LLM.
- Classic Match and Quick & Chill presets behave as defined.
- All launches, normal movement, jumps, flights, captures, stacks, blockades, home-lane movement, and victory conditions are enforced by pure engine code.
- Human turns require no choice when zero or one legal move exists.
- Cautious, Aggressive, and Unpredictable opponents make legal, visibly different choices.
- A reloaded page can resume the exact match and continue the same deterministic RNG sequence.
- The board is usable on desktop and mobile and supports keyboard interaction.
- Signed-in completed matches appear in play history as local-AI Aeroplane games.
- Aeroplane matches never create or modify rating records.
- Provider or chatter failures cannot delay, invalidate, or lose a move.
- Unit, component, API, and end-to-end tests cover the critical paths described above.
