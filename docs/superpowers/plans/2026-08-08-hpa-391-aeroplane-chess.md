# HPA-391 Aeroplane Chess Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a complete deterministic Aeroplane Chess mode with one human, three local personality AIs, reload recovery, unrated history, and responsive accessible gameplay.

**Architecture:** Keep Chess/Xiangqi/Shogi/Jungle inside the existing rectangular `GameVariant`/AI abstractions. Aeroplane uses a dedicated logical path engine under `apps/web/src/lib/aeroplane/`, while a new `GameId` type handles app/history identity and the existing `opponentEngineId` history path records `aeroplane-trio-v1` as unrated.

**Tech Stack:** TypeScript 5.9, Bun 1.3.6, Astro 4, React 18, Tailwind CSS, Bun test, Hono, Zod 4, Drizzle ORM/SQLite/D1, Playwright.

## Global Constraints

- HPA-391 is the normative product requirement; this plan follows `docs/superpowers/specs/2026-08-08-hpa-391-aeroplane-chess-design.md` for clarified implementation choices.
- Do not add Aeroplane to `GAME_CONFIGS`, `GameStateMap`, LLM move adapters, rule guardians, or `@procyon/game-core`.
- Do not add a generic race-game/Ludo framework.
- Gameplay, dice, AI choice, replay, and recovery must work without sign-in, provider configuration, or network access.
- Use separate serializable RNG streams for gameplay dice and AI choice. UI timing/chatter consumes neither stream.
- Rules operate only on logical positions; render coordinates never determine legality.
- Apply each move to authoritative state exactly once before animation/chatter/history presentation.
- Classic: launch on 6, extra turn on 6, exact finish, target 4, Fair Dice, stacking/blockades off.
- Quick & Chill: launch on 5/6, extra turn on 6, bounce finish, target 2, Relaxed Dice, stacking/blockades off.
- Enabling blockades forces stacking on; disabling stacking forces blockades off.
- Provider-generated chatter is not part of this implementation; local personality lines are sufficient for HPA-391.
- Existing rated LLM strategy games and unrated Stockfish games must remain behaviorally unchanged.

---

## File map

### New web domain files

```text
apps/web/src/lib/game-id.ts
apps/web/src/lib/play-history.ts
apps/web/src/lib/aeroplane/
  types.ts
  topology.ts
  rules.ts
  rng.ts
  dice.ts
  game.ts
  ai.ts
  checksum.ts
  persistence.ts
  replay.ts
  chatter.ts
  layout.ts
  topology.test.ts
  rules.test.ts
  dice.test.ts
  game.test.ts
  ai.test.ts
  persistence.test.ts
  replay.test.ts
```

### New web UI files

```text
apps/web/src/pages/aeroplane.astro
apps/web/src/components/AeroplaneGame.tsx
apps/web/src/components/aeroplane/AeroplaneSetup.tsx
apps/web/src/components/aeroplane/AeroplaneBoard.tsx
apps/web/src/components/aeroplane/AeroplaneStatus.tsx
apps/web/src/components/aeroplane/AeroplaneEventFeed.tsx
apps/web/src/components/aeroplane/AeroplaneBoardPreview.tsx
apps/web/src/components/aeroplane/AeroplaneGame.test.tsx
apps/web/src/hooks/useAeroplaneMatch.ts
apps/web/src/hooks/useAeroplaneMatch.test.ts
apps/web/e2e/aeroplane.spec.ts
```

### Existing files changed

```text
apps/web/src/lib/ai/game-variant-types.ts
apps/web/src/lib/ai/opponent.ts
apps/web/src/hooks/usePlayHistory.ts
apps/web/src/hooks/usePlayHistory.test.ts
apps/web/src/components/ChessGameSelector.tsx
apps/web/src/components/ChessGameCard.tsx -> apps/web/src/components/GameCard.tsx
apps/web/src/components/GamePageLayout.tsx
apps/web/src/components/PageHeader.tsx
apps/web/src/components/ui/Panel.tsx
apps/web/src/components/PlayHistoryPage.tsx
apps/web/src/components/PlayHistoryPage.test.tsx
apps/web/tailwind.config.mjs
apps/api/src/constants/game.ts
apps/api/src/constants/game.test.ts
apps/api/src/db/schema.ts
apps/api/src/db/schema.test.ts
apps/api/src/routes/play-history.ts
apps/api/src/routes/play-history.test.ts
apps/api/src/routes/play-history.pvp-security.test.ts
```

### Generated database files

Generate the next migration with an explicit name:

```bash
cd apps/api
bunx drizzle-kit generate --config=drizzle.config.dev.ts --name hpa391_aeroplane_history
```

The expected next migration is `apps/api/drizzle/0011_hpa391_aeroplane_history.sql`; Drizzle also updates `apps/api/drizzle/meta/_journal.json` and creates the matching `0011_snapshot.json`.

---

## Task 1: Separate general game identity from strategy-engine identity

**Files:**
- Create: `apps/web/src/lib/game-id.ts`
- Modify: `apps/web/src/lib/ai/game-variant-types.ts`
- Rename/Modify: `apps/web/src/components/ChessGameCard.tsx` → `apps/web/src/components/GameCard.tsx`
- Modify: `apps/web/src/components/ChessGameSelector.tsx`
- Create: `apps/web/src/components/ChessGameSelector.test.tsx`
- Create: `apps/web/src/components/aeroplane/AeroplaneBoardPreview.tsx`
- Modify: `apps/web/src/components/GamePageLayout.tsx`
- Modify: `apps/web/src/components/PageHeader.tsx`
- Modify: `apps/web/src/components/ui/Panel.tsx`
- Modify: `apps/web/tailwind.config.mjs`
- Create: `apps/web/src/pages/aeroplane.astro`

**Interfaces:**
- Produces: `GameId = GameVariant | 'aeroplane'` and `Accent = GameId | 'brass'`.
- Preserves: `GameVariant = 'chess' | 'xiangqi' | 'shogi' | 'jungle'` as the only key accepted by `GAME_CONFIGS` and strategy AI types.
- Produces selector models with explicit `href`; display titles never determine navigation.

- [ ] **Step 1: Write the identity/selector tests first**

Create `ChessGameSelector.test.tsx` using `happy-dom` + Testing Library and assert that an Aeroplane card exists with `/aeroplane`, while the existing four links stay unchanged:

```ts
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { cleanup, render, screen } from '@testing-library/react';
import { Window } from 'happy-dom';
import ChessGameSelector from './ChessGameSelector';

beforeEach(() => {
  const window = new Window();
  Object.assign(globalThis, {
    window,
    document: window.document,
    navigator: window.navigator,
  });
});

afterEach(() => cleanup());

describe('ChessGameSelector', () => {
  test('uses explicit links for every game including Aeroplane Chess', () => {
    render(<ChessGameSelector />);
    expect(screen.getByRole('link', { name: /play standard chess/i }).getAttribute('href')).toBe('/chess');
    expect(screen.getByRole('link', { name: /play chinese chess/i }).getAttribute('href')).toBe('/xiangqi');
    expect(screen.getByRole('link', { name: /play japanese chess/i }).getAttribute('href')).toBe('/shogi');
    expect(screen.getByRole('link', { name: /play jungle chess/i }).getAttribute('href')).toBe('/jungle');
    expect(screen.getByRole('link', { name: /play aeroplane chess/i }).getAttribute('href')).toBe('/aeroplane');
  });
});
```

- [ ] **Step 2: Run the focused test and verify it fails**

```bash
cd apps/web
bun test src/components/ChessGameSelector.test.tsx
```

Expected: FAIL because the selector still has title-based button navigation and no Aeroplane card.

- [ ] **Step 3: Add `GameId` without widening `GameVariant`**

Create `apps/web/src/lib/game-id.ts`:

```ts
import type { GameVariant } from './ai/game-variant-types';

export type GameId = GameVariant | 'aeroplane';
export type Accent = GameId | 'brass';
```

Remove only the `Accent` declaration from `game-variant-types.ts`; do not change `GameVariant`, `GAME_CONFIGS`, piece maps, move maps, or board config types. Update `Panel`/`PageHeader` imports to use `../lib/game-id` or `../../lib/game-id` as appropriate.

- [ ] **Step 4: Generalize the selector card and navigation**

Rename with Git:

```bash
git mv apps/web/src/components/ChessGameCard.tsx apps/web/src/components/GameCard.tsx
```

Give `GameCard` this contract:

```ts
interface GameCardProps {
  title: string;
  description: string;
  gameId: GameId;
  href: string;
  preview: React.ReactNode;
}
```

Render the action as an anchor with the existing Button styling rather than a callback that assigns `window.location.href`. In `ChessGameSelector`, use a typed array with explicit `href`, and render `ChessBoardPreview` for the four strategy variants plus `AeroplaneBoardPreview` for `aeroplane`.

- [ ] **Step 5: Add the page/accent plumbing**

Broaden only page/UI accent consumers from `GameVariant` to `GameId`. Add a Tailwind `aeroplane` accent token (use `#4F8FD8`) and an `aeroplane` case to `Panel`/`GamePageLayout` accent maps.

Create `apps/web/src/pages/aeroplane.astro`:

```astro
---
import Layout from '../layouts/Layout.astro';
import GamePageLayout from '../components/GamePageLayout.tsx';
import AeroplaneGame from '../components/AeroplaneGame.tsx';
---

<Layout title='Aeroplane Chess'>
  <GamePageLayout variant='aeroplane' showBackButton client:load>
    <AeroplaneGame client:load />
  </GamePageLayout>
</Layout>
```

For this task, create a minimal `AeroplaneGame.tsx` shell that renders “Aeroplane Chess” and is replaced in Task 6. This is route scaffolding attached to the selector deliverable, not a separate architecture layer.

- [ ] **Step 6: Verify selector/type checks**

```bash
cd apps/web
bun test src/components/ChessGameSelector.test.tsx
bun run typecheck
```

Expected: PASS. TypeScript should still reject `GAME_CONFIGS.aeroplane` because `GameVariant` was not widened.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/lib/game-id.ts apps/web/src/lib/ai/game-variant-types.ts apps/web/src/components apps/web/src/pages/aeroplane.astro apps/web/tailwind.config.mjs
git commit -m "feat(aeroplane): add game identity and route"
```

---

## Task 2: Build the logical topology and one authoritative move resolver

**Files:**
- Create: `apps/web/src/lib/aeroplane/types.ts`
- Create: `apps/web/src/lib/aeroplane/topology.ts`
- Create: `apps/web/src/lib/aeroplane/rules.ts`
- Create: `apps/web/src/lib/aeroplane/topology.test.ts`
- Create: `apps/web/src/lib/aeroplane/rules.test.ts`

**Interfaces:**
- Produces: `AeroplaneConfig`, `AeroplaneState`, `PlaneState`, `AeroplaneEvent`, `ResolvedMove`.
- Produces: `toGlobalTrackIndex`, `toPosition`, `resolveLegalMove`, `getLegalMoves`, `applyResolvedMove`.
- Rule functions are pure and import no React/render-coordinate module.

- [ ] **Step 1: Define the domain types and failing topology tests**

Use these core types in `types.ts`:

```ts
export type AeroplaneColor = 'red' | 'yellow' | 'blue' | 'green';
export type Personality = 'cautious' | 'aggressive' | 'unpredictable';
export type DiceMode = 'fair' | 'relaxed';
export type LaunchRule = 'six' | 'five-or-six';
export type FinishRule = 'exact' | 'bounce';
export type AeroplanePhase = 'awaiting-roll' | 'awaiting-choice' | 'finished';

export interface PlaneState {
  id: string;
  color: AeroplaneColor;
  progress: number | null;
}

export type AeroplanePosition =
  | { kind: 'hangar'; color: AeroplaneColor }
  | { kind: 'launch'; color: AeroplaneColor }
  | { kind: 'track'; color: AeroplaneColor; progress: number; trackIndex: number }
  | { kind: 'home'; color: AeroplaneColor; progress: number; homeIndex: number }
  | { kind: 'finished'; color: AeroplaneColor };
```

Write topology tests that assert:

```ts
expect(toGlobalTrackIndex('red', 1)).toBe(0);
expect(toGlobalTrackIndex('yellow', 1)).toBe(13);
expect(toGlobalTrackIndex('blue', 1)).toBe(26);
expect(toGlobalTrackIndex('green', 1)).toBe(39);
expect(toGlobalTrackIndex('green', 14)).toBe(0);
expect(isFlightEntrance(18)).toBe(true);
expect(isNormalJumpSquare(14)).toBe(true);
expect(isNormalJumpSquare(18)).toBe(false);
expect(toPosition('red', 51)).toEqual({ kind: 'home', color: 'red', progress: 51, homeIndex: 0 });
expect(toPosition('red', 56)).toEqual({ kind: 'finished', color: 'red' });
```

- [ ] **Step 2: Run topology tests and verify failure**

```bash
cd apps/web
bun test src/lib/aeroplane/topology.test.ts
```

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement colour-symmetric topology**

`topology.ts` owns these constants/functions:

```ts
export const TURN_ORDER = ['red', 'yellow', 'blue', 'green'] as const;
export const START_OFFSET: Record<AeroplaneColor, number> = {
  red: 0,
  yellow: 13,
  blue: 26,
  green: 39,
};
export const SHARED_PROGRESS_MAX = 50;
export const FINISH_PROGRESS = 56;
export const FLIGHT_ENTRANCE_PROGRESS = 18;
export const FLIGHT_EXIT_PROGRESS = 30;
```

Normal jump squares are shared progress values with `progress % 4 === 2`, `progress + 4 <= 50`, excluding `18`. A direct landing on `18` flies to `30`; a jump `14 → 18` also flies to `30`.

- [ ] **Step 4: Write failing rule scenarios before implementation**

In `rules.test.ts`, build small explicit states and cover at minimum:

```ts
test('launch requires an allowed roll and an empty launch pad', () => {
  const state = stateWithPlane('red-0', null);
  expect(resolveLegalMove(state, 'red-0', 5)).toBeNull();
  expect(resolveLegalMove(state, 'red-0', 6)?.finalEndpoint).toEqual({ kind: 'launch', color: 'red' });
});

test('normal jump can feed the long flight', () => {
  const state = stateWithPlane('red-0', 12);
  const move = resolveLegalMove(state, 'red-0', 2);
  expect(move?.baseEndpoint).toMatchObject({ kind: 'track', progress: 14 });
  expect(move?.finalEndpoint).toMatchObject({ kind: 'track', progress: 30 });
  expect(move?.events.map(event => event.type)).toEqual(['move', 'jump', 'flight']);
});

test('direct flight entrance also takes the long flight', () => {
  const state = stateWithPlane('red-0', 16);
  expect(resolveLegalMove(state, 'red-0', 2)?.finalEndpoint).toMatchObject({ kind: 'track', progress: 30 });
});

test('exact finish rejects overshoot and bounce reflects it', () => {
  expect(resolveLegalMove(stateWithPlane('red-0', 54, { finishRule: 'exact' }), 'red-0', 3)).toBeNull();
  expect(resolveLegalMove(stateWithPlane('red-0', 54, { finishRule: 'bounce' }), 'red-0', 3)?.finalEndpoint)
    .toMatchObject({ kind: 'home', progress: 55 });
});
```

Also add table tests for: four-colour wraparound, shared friendly collision with stacking off, stack creation, multi-plane capture, launch/home non-capture, blockade origin split, blockade path crossing, blockade landing, +4 jump crossing, long-flight exit blockade, and private home-lane collision.

- [ ] **Step 5: Implement `resolveLegalMove` as the single analyzer**

Implement in this order:

1. reject wrong-colour/finished plane;
2. handle hangar → launch-pad move;
3. compute base progress (exact or bounce);
4. validate base movement blockade traversal;
5. apply normal +4 jump and validate its ring segment;
6. apply +12 flight when endpoint is `18`, validating the exit but not skipped ring nodes;
7. validate private/shared final occupancy;
8. derive captured ids and structured events;
9. return `ResolvedMove` without mutating input.

`getLegalMoves` calls `resolveLegalMove` for each current-player plane. `applyResolvedMove` copies only the affected plane/captured planes/stats and returns a new state plus the already-computed events.

- [ ] **Step 6: Run engine tests**

```bash
cd apps/web
bun test src/lib/aeroplane/topology.test.ts src/lib/aeroplane/rules.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/lib/aeroplane/types.ts apps/web/src/lib/aeroplane/topology.ts apps/web/src/lib/aeroplane/rules.ts apps/web/src/lib/aeroplane/topology.test.ts apps/web/src/lib/aeroplane/rules.test.ts
git commit -m "feat(aeroplane): add path rules engine"
```

---

## Task 3: Add deterministic dice and turn-state transitions

**Files:**
- Create: `apps/web/src/lib/aeroplane/rng.ts`
- Create: `apps/web/src/lib/aeroplane/dice.ts`
- Create: `apps/web/src/lib/aeroplane/game.ts`
- Create: `apps/web/src/lib/aeroplane/dice.test.ts`
- Create: `apps/web/src/lib/aeroplane/game.test.ts`
- Modify: `apps/web/src/lib/aeroplane/types.ts`

**Interfaces:**
- Produces: `RngState`, `nextUint32`, `nextDie`, `deriveRngStreams`.
- Produces: `CLASSIC_CONFIG`, `QUICK_CONFIG`, `normalizeConfig`, `createAeroplaneMatch`, `rollTurn`, `playResolvedMove`, `skipTurn`.
- `rollTurn` returns state + updated dice RNG + the selected roll; it never makes an AI choice.

- [ ] **Step 1: Write seeded RNG/dice tests**

Use a fixed seed fixture and assert exact reproducibility rather than statistical properties:

```ts
test('same seed produces the same Fair Dice sequence', () => {
  const a = takeFairRolls({ value: 0x12345678 }, 8);
  const b = takeFairRolls({ value: 0x12345678 }, 8);
  expect(a).toEqual(b);
  expect(a.every(roll => roll >= 1 && roll <= 6)).toBe(true);
});

test('dice and AI streams are independent', () => {
  const streams = deriveRngStreams(0x12345678);
  expect(streams.dice.value).not.toBe(streams.ai.value);
});
```

For Relaxed Dice, inject a candidate sampler in the unit-level policy or use a known RNG state that yields known candidates. Assert inactive mode consumes one sample and active mode consumes two even when candidate one is selected.

- [ ] **Step 2: Verify dice tests fail**

```bash
cd apps/web
bun test src/lib/aeroplane/dice.test.ts
```

Expected: FAIL because RNG/dice modules are absent.

- [ ] **Step 3: Implement xorshift32 and dice policies**

Use a non-zero normalized 32-bit state:

```ts
export interface RngState { value: number }

export function nextUint32(state: RngState): [number, RngState] {
  let x = state.value >>> 0;
  if (x === 0) x = 0x6d2b79f5;
  x ^= x << 13;
  x ^= x >>> 17;
  x ^= x << 5;
  const value = x >>> 0;
  return [value, { value }];
}

export function uint32ToDie(value: number): 1 | 2 | 3 | 4 | 5 | 6 {
  return ((value % 6) + 1) as 1 | 2 | 3 | 4 | 5 | 6;
}
```

Derive dice/AI states by mixing the root seed with two fixed non-zero salts before normalization. Do not use `Math.random()` after root-seed creation.

- [ ] **Step 4: Write turn-flow tests before `game.ts`**

Cover these exact cases:

```ts
test('six keeps the same player even after a no-move turn', () => {
  const rolled = stateAwaitingRoll('red');
  const skipped = skipTurn({ ...rolled, pendingRoll: 6, phase: 'awaiting-choice' });
  expect(skipped.currentPlayer).toBe('red');
  expect(skipped.phase).toBe('awaiting-roll');
});

test('non-six advances clockwise', () => {
  const state = stateAwaitingChoice('green', 3);
  expect(skipTurn(state).currentPlayer).toBe('red');
});

test('quick victory ends immediately after second finished plane', () => {
  const transition = finishSecondPlaneForRed(QUICK_CONFIG);
  expect(transition.state.phase).toBe('finished');
  expect(transition.state.winner).toBe('red');
});
```

Also test config normalization, one/no/multiple legal move phase behavior, no-move streak reset/increment, and last-place round counters at green→red round boundaries.

- [ ] **Step 5: Implement presets and pure turn transitions**

`normalizeConfig` enforces only:

```ts
if (config.blockades) config.stacking = true;
if (!config.stacking) config.blockades = false;
```

Any manual field change sets `rulePreset: 'custom'` in the setup helper, not in lower-level rule functions.

`rollTurn` consumes the selected dice policy, sets `pendingRoll`, derives legal moves, and:

- zero legal moves: completes the skipped turn immediately and returns a `turn-skipped` event;
- one or more legal moves: returns `phase = 'awaiting-choice'` so the controller can auto-play one or wait/ask AI when multiple.

Update `noMoveStreak` from the legal-move count. Evaluate `lastPlaceRounds` only when a turn advances from green to red.

- [ ] **Step 6: Run focused tests**

```bash
cd apps/web
bun test src/lib/aeroplane/dice.test.ts src/lib/aeroplane/game.test.ts src/lib/aeroplane/rules.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/lib/aeroplane/rng.ts apps/web/src/lib/aeroplane/dice.ts apps/web/src/lib/aeroplane/game.ts apps/web/src/lib/aeroplane/dice.test.ts apps/web/src/lib/aeroplane/game.test.ts apps/web/src/lib/aeroplane/types.ts
git commit -m "feat(aeroplane): add deterministic turns and dice"
```

---

## Task 4: Add the three deterministic personality AIs

**Files:**
- Create: `apps/web/src/lib/aeroplane/ai.ts`
- Create: `apps/web/src/lib/aeroplane/ai.test.ts`
- Modify: `apps/web/src/lib/aeroplane/types.ts`

**Interfaces:**
- Consumes: `ResolvedMove[]`, public `AeroplaneState`, pending roll, `RngState`.
- Produces: `chooseAiMove(state, legalMoves, personality, rng): { move; rng }`.
- Produces: deterministic feature extraction and immediate-capture exposure calculation.

- [ ] **Step 1: Write personality scenario tests**

Build compact fixtures with two legal moves where expected preferences are unambiguous:

```ts
test('cautious prefers entering home over an exposed minor capture', () => {
  const result = chooseAiMove(cautiousFixture.state, cautiousFixture.moves, 'cautious', { value: 7 });
  expect(result.move.planeId).toBe('red-home-runner');
});

test('aggressive prefers a multi-plane capture over quiet progress', () => {
  const result = chooseAiMove(aggressiveFixture.state, aggressiveFixture.moves, 'aggressive', { value: 7 });
  expect(result.move.planeId).toBe('red-capturer');
});

test('every personality takes a guaranteed finish', () => {
  for (const personality of ['cautious', 'aggressive', 'unpredictable'] as const) {
    const result = chooseAiMove(finishFixture.state, finishFixture.moves, personality, { value: 7 });
    expect(result.move.planeId).toBe('red-finisher');
  }
});
```

Add deterministic identical-state/seed tests and iterate advanced config fixtures to assert the chosen `planeId` is always one of `legalMoves`.

- [ ] **Step 2: Verify tests fail**

```bash
cd apps/web
bun test src/lib/aeroplane/ai.test.ts
```

Expected: FAIL because `ai.ts` is absent.

- [ ] **Step 3: Implement feature extraction and fixed weights**

Use the design-spec weight table verbatim. Calculate exposure from the **resulting public position** by checking all opponent colours, their movable planes, and die values 1–6 with the real `resolveLegalMove`; count threats whose `capturedPlaneIds` include the moved plane.

For Cautious/Aggressive, consume one AI RNG sample only when the top score is tied. For Unpredictable, consume one sample per legal move to generate bounded jitter `[-120, 120]`, then one additional sample only if the final score remains tied. Document/test this consumption rule so replay can verify it.

- [ ] **Step 4: Run AI plus rules tests**

```bash
cd apps/web
bun test src/lib/aeroplane/ai.test.ts src/lib/aeroplane/rules.test.ts
```

Expected: PASS with identical decisions for repeated seed/state fixtures.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/aeroplane/ai.ts apps/web/src/lib/aeroplane/ai.test.ts apps/web/src/lib/aeroplane/types.ts
git commit -m "feat(aeroplane): add personality opponents"
```

---

## Task 5: Add checksums, replay, and versioned local recovery

**Files:**
- Create: `apps/web/src/lib/aeroplane/checksum.ts`
- Create: `apps/web/src/lib/aeroplane/replay.ts`
- Create: `apps/web/src/lib/aeroplane/persistence.ts`
- Create: `apps/web/src/lib/aeroplane/replay.test.ts`
- Create: `apps/web/src/lib/aeroplane/persistence.test.ts`
- Modify: `apps/web/src/lib/aeroplane/types.ts`

**Interfaces:**
- Produces: `checksumState(state): string` using canonical serialization + FNV-1a.
- Produces: `replayMatch(persisted): ReplayResult` that re-executes dice/rules/AI decisions.
- Produces: `saveActiveMatch`, `restoreActiveMatch`, `clearActiveMatch`.
- Storage key is exactly `procyon:aeroplane:active-match:v1`.

- [ ] **Step 1: Write replay tests from a deterministic mini-match**

Construct a short fixture with root seed + config + recorded roll/move actions. Assert successful replay and detection of each tampering class:

```ts
test('replay reproduces every checksum', () => {
  const result = replayMatch(recordedMatch);
  expect(result).toEqual({ kind: 'ok', finalChecksum: recordedMatch.actions.at(-1)!.checksum });
});

test('replay rejects a changed roll', () => {
  const changed = structuredClone(recordedMatch);
  changed.actions[0] = { ...changed.actions[0], roll: 1 };
  expect(replayMatch(changed).kind).toBe('mismatch');
});

test('replay rejects a changed AI choice', () => {
  const changed = structuredClone(recordedMatch);
  const aiMoveIndex = changed.actions.findIndex(action => action.kind === 'move' && action.actor === 'ai');
  changed.actions[aiMoveIndex] = { ...changed.actions[aiMoveIndex], planeId: 'red-0' };
  expect(replayMatch(changed).kind).toBe('mismatch');
});
```

- [ ] **Step 2: Implement stable checksum + replay**

Canonical serialization must sort record keys and planes by id; do not checksum timestamps or presentation state. Replay starts from config/root seed and uses the same `rollTurn`/`chooseAiMove`/`playResolvedMove` functions. For a zero-legal-move roll, the roll action represents the post-skip state; no separate unlogged mutation is allowed.

- [ ] **Step 3: Write persistence decode/invariant tests**

Cover empty storage, valid round trip, `awaiting-choice` round trip, unknown version, invalid player count, duplicate plane ids, out-of-range progress, impossible winner/phase combination, invalid RNG state, blocked `localStorage` calls, and continued exact next die after restore.

Use a tiny in-test storage adapter instead of a real browser where possible:

```ts
const storage = new MapStorage();
saveActiveMatch(storage, persistedMatch);
const restored = restoreActiveMatch(storage, sessionStorageStub);
expect(restored.kind).toBe('ok');
```

- [ ] **Step 4: Implement manual runtime validation**

`restoreActiveMatch` must validate:

- `schemaVersion === 1`;
- four colours × four unique planes;
- progress is `null` or integer 0–56;
- valid phase/current player/pending-roll relationships;
- `winner !== null` iff phase is finished;
- blockades imply stacking;
- legal personality assignment for the three AI seats;
- both RNG states are finite unsigned 32-bit integers;
- action/checksum shapes are valid.

On corrupt payload: copy raw text to `sessionStorage['procyon:aeroplane:corrupt-save']`, remove the active key, and return `{ kind: 'corrupt', reason }`. Catch storage exceptions and return a non-fatal result.

- [ ] **Step 5: Run replay/persistence tests**

```bash
cd apps/web
bun test src/lib/aeroplane/replay.test.ts src/lib/aeroplane/persistence.test.ts src/lib/aeroplane/dice.test.ts src/lib/aeroplane/ai.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/lib/aeroplane/checksum.ts apps/web/src/lib/aeroplane/replay.ts apps/web/src/lib/aeroplane/persistence.ts apps/web/src/lib/aeroplane/replay.test.ts apps/web/src/lib/aeroplane/persistence.test.ts apps/web/src/lib/aeroplane/types.ts
git commit -m "feat(aeroplane): add recovery and replay"
```

---

## Task 6: Build the match controller and accessible board experience

**Files:**
- Create: `apps/web/src/lib/aeroplane/layout.ts`
- Create: `apps/web/src/hooks/useAeroplaneMatch.ts`
- Create: `apps/web/src/hooks/useAeroplaneMatch.test.ts`
- Replace shell: `apps/web/src/components/AeroplaneGame.tsx`
- Create: `apps/web/src/components/aeroplane/AeroplaneSetup.tsx`
- Create: `apps/web/src/components/aeroplane/AeroplaneBoard.tsx`
- Create: `apps/web/src/components/aeroplane/AeroplaneStatus.tsx`
- Create: `apps/web/src/components/aeroplane/AeroplaneEventFeed.tsx`
- Create: `apps/web/src/components/aeroplane/AeroplaneGame.test.tsx`
- Modify: `apps/web/src/components/aeroplane/AeroplaneBoardPreview.tsx`

**Interfaces:**
- Controller exposes immutable authoritative state plus presentation state/actions.
- `AeroplaneBoard` receives logical state, legal moves, one previewed `ResolvedMove`, and callbacks; it does not import dice/AI/persistence.
- `layout.ts` is render-only and must not be imported by `rules.ts`, `game.ts`, `dice.ts`, or `ai.ts`.

- [ ] **Step 1: Write controller tests before the hook**

Use fake timers and injected storage/root seed. Cover:

```ts
test('auto-applies the only legal human move', async () => {
  const match = renderMatchWithSingleLegalMove();
  match.roll();
  await match.advancePresentation();
  expect(match.state().phase).toBe('awaiting-roll');
  expect(match.state().planes.find(plane => plane.id === 'red-0')?.progress).not.toBeNull();
});

test('waits for human selection when multiple legal planes exist', () => {
  const match = renderMatchWithMultipleLegalMoves();
  match.roll();
  expect(match.state().phase).toBe('awaiting-choice');
  expect(match.legalMoves()).toHaveLength(2);
});

test('AI delay never changes RNG before the choice is made', () => {
  const match = renderAiChoiceFixture();
  const before = match.aiRng();
  match.advanceTime(400);
  expect(match.aiRng()).toEqual(before);
});
```

Also test restore/new-match choice, cancelling stale AI timers on reset/unmount, persistence after roll awaiting choice, and `Skip Animations` applying no second rule transition.

- [ ] **Step 2: Implement render-only board anchors**

`layout.ts` exports normalized `{ x, y }` anchors for 52 track nodes, four launch pads, four 6-position home paths (last position is the finish), and hangar slots. Generate rotations from one 13-node quadrant or declare the normalized points explicitly; tests should assert counts and symmetry, not rule behavior.

No domain file may import `layout.ts`.

- [ ] **Step 3: Implement `useAeroplaneMatch` orchestration**

The hook owns:

- editable setup before Start;
- frozen active config/personality seats/root seed after Start;
- restore/new-match prompt state;
- calls to `rollTurn`, `getLegalMoves`, `chooseAiMove`, `playResolvedMove`;
- 650 ms skippable AI presentation delay;
- transient animation route/index;
- event feed queue;
- persistence after each authoritative action;
- timer generation token so reset/unmount invalidates stale callbacks.

Authoritative state is committed before animation starts. `skipAnimations()` clears timers/overlay and reveals the existing final state only.

- [ ] **Step 4: Write component interaction tests**

Use Testing Library to assert:

- Classic is the default;
- Quick & Chill sets the exact six config fields;
- enabling blockades turns stacking on;
- turning stacking off turns blockades off;
- changing an individual rule shows Custom;
- exactly one legal plane is auto-highlighted then moved without click;
- multiple legal planes expose only legal plane buttons as actionable;
- keyboard Enter/Space activates a legal selection;
- touch first-selection preview can be represented with the same selected-plane state and requires a second activation to apply;
- event feed collapses on mobile control;
- Skip Animations leaves the final plane location unchanged after repeated presses.

- [ ] **Step 5: Build setup, board, status, and event feed**

`AeroplaneSetup` contains presets, victory target, dice mode, launch/finish rules, stacking, blockades, human colour, and chatter toggle.

`AeroplaneBoard` renders SVG board nodes from `layout.ts`. Planes are `<button>`/focusable interactive elements layered over SVG anchors with accessible labels such as:

```text
Red plane 2, track position 14. Legal move: jump and long flight to position 30.
```

On hover/focus, render `ResolvedMove.route` as a path overlay. On coarse pointer, maintain `previewPlaneId`: first tap previews; second tap on the same legal plane calls `onChoosePlane`.

`AeroplaneStatus` keeps current turn/die directly below the board on desktop and becomes a compact sticky strip on narrow screens. `AeroplaneEventFeed` is compact and collapsible on narrow screens.

- [ ] **Step 6: Run controller/component tests and typecheck**

```bash
cd apps/web
bun test src/hooks/useAeroplaneMatch.test.ts src/components/aeroplane/AeroplaneGame.test.tsx
bun run typecheck
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/lib/aeroplane/layout.ts apps/web/src/hooks/useAeroplaneMatch.ts apps/web/src/hooks/useAeroplaneMatch.test.ts apps/web/src/components/AeroplaneGame.tsx apps/web/src/components/aeroplane
git commit -m "feat(aeroplane): add playable local match UI"
```

---

## Task 7: Generalize play history and record Aeroplane as an unrated engine game

**Files:**
- Create: `apps/web/src/lib/play-history.ts`
- Modify: `apps/web/src/lib/ai/opponent.ts`
- Modify: `apps/web/src/hooks/usePlayHistory.ts`
- Modify: `apps/web/src/hooks/usePlayHistory.test.ts`
- Modify: `apps/web/src/hooks/useAeroplaneMatch.ts`
- Modify: `apps/web/src/hooks/useAeroplaneMatch.test.ts`
- Modify: `apps/web/src/components/PlayHistoryPage.tsx`
- Modify: `apps/web/src/components/PlayHistoryPage.test.tsx`
- Modify: `apps/api/src/constants/game.ts`
- Modify: `apps/api/src/constants/game.test.ts`
- Modify: `apps/api/src/db/schema.ts`
- Modify: `apps/api/src/db/schema.test.ts`
- Modify: `apps/api/src/routes/play-history.ts`
- Modify: `apps/api/src/routes/play-history.test.ts`
- Modify: `apps/api/src/routes/play-history.pvp-security.test.ts`
- Generate: `apps/api/drizzle/0011_hpa391_aeroplane_history.sql`
- Generate: `apps/api/drizzle/meta/0011_snapshot.json`
- Modify: `apps/api/drizzle/meta/_journal.json`

**Interfaces:**
- API produces `GameId` with five values and retains `ChessVariantId` as the rated strategy subset.
- API `POST /play-history` accepts `gameId` instead of `chessId`.
- Web `submitPlayHistory` centralizes the request but leaves retry policy in callers.
- `OpponentEngineId` adds `aeroplane-trio-v1`.

- [ ] **Step 1: Write API tests for the desired contract first**

Add tests equivalent to:

```ts
test('Aeroplane trio result is inserted and never rated', async () => {
  const response = await postHistory({
    gameId: 'aeroplane',
    status: 'win',
    date: '2026-08-08T12:00:00.000Z',
    opponentEngineId: 'aeroplane-trio-v1',
    details: validAeroplaneDetails,
  });
  expect(response.status).toBe(201);
  expect((await response.json()).ratingUpdate).toBeNull();
  expect(await countRatingRows()).toBe(0);
});

test('Aeroplane rejects an LLM opponent', async () => {
  const response = await postHistory({
    gameId: 'aeroplane',
    status: 'win',
    date: '2026-08-08T12:00:00.000Z',
    opponentLlmId: 'gpt-4o',
    details: validAeroplaneDetails,
  });
  expect(response.status).toBe(400);
});

test('strategy LLM game remains rated', async () => {
  const response = await postHistory({
    gameId: 'chess',
    status: 'win',
    date: '2026-08-08T12:00:00.000Z',
    opponentLlmId: 'gpt-4o',
  });
  expect((await response.json()).ratingUpdate).not.toBeNull();
});
```

Also test `aeroplane + stockfish`, `chess + aeroplane-trio-v1`, missing Aeroplane details, invalid details, duplicate AI colour/personality, and Aeroplane draw rejection.

- [ ] **Step 2: Verify API tests fail**

```bash
cd apps/api
bun test src/routes/play-history.test.ts src/constants/game.test.ts src/db/schema.test.ts
```

Expected: FAIL because `gameId`, Aeroplane, details, and the trio id do not exist.

- [ ] **Step 3: Add server game/opponent ids and rated subset guard**

In `constants/game.ts` add `GameId`, `OpponentEngineId.AeroplaneTrioV1`, and:

```ts
export function isRatedGameId(gameId: GameId): gameId is ChessVariantId {
  return (
    gameId === GameId.Chess ||
    gameId === GameId.Xiangqi ||
    gameId === GameId.Shogi ||
    gameId === GameId.Jungle
  );
}
```

Do not add Aeroplane to `ChessVariantId`.

- [ ] **Step 4: Rename play-history game identity and add JSON details**

Change the Drizzle property/column to:

```ts
gameId: text('game_id').$type<GameId>().notNull(),
details: text('details', { mode: 'json' }).$type<AeroplaneHistoryDetails | null>(),
```

Generate migration:

```bash
cd apps/api
bunx drizzle-kit generate --config=drizzle.config.dev.ts --name hpa391_aeroplane_history
```

Inspect `0011_hpa391_aeroplane_history.sql`; it must preserve existing rows, rename `chess_id` to `game_id`, and add nullable `details`. Do not hand-create a second D1 migration.

- [ ] **Step 5: Update `POST /play-history` validation and rating branch**

Create an `aeroplaneHistoryDetailsSchema` with exact enums/ranges from the design. Extend `superRefine` with pairing rules:

```ts
if (data.gameId === GameId.Aeroplane && data.opponentEngineId !== OpponentEngineId.AeroplaneTrioV1) {
  ctx.addIssue({ code: 'custom', path: ['opponentEngineId'], message: 'Aeroplane requires aeroplane-trio-v1' });
}
if (data.opponentEngineId === OpponentEngineId.AeroplaneTrioV1 && data.gameId !== GameId.Aeroplane) {
  ctx.addIssue({ code: 'custom', path: ['gameId'], message: 'aeroplane-trio-v1 is only valid for Aeroplane' });
}
if (data.gameId === GameId.Aeroplane && data.status === GameResultStatus.Draw) {
  ctx.addIssue({ code: 'custom', path: ['status'], message: 'Aeroplane does not record draws' });
}
```

Then derive:

```ts
const shouldRate = kind === 'llm' && isRatedGameId(body.gameId);
```

Call `updatePlayerRating` only inside that branch, with `variantId: body.gameId`. Engine games return `ratingUpdate: null` as today.

Update GET to select/return `gameId` and `details`.

- [ ] **Step 6: Extract the web request helper and preserve current strategy retry behavior**

Extend web `OpponentEngineId` to include `'aeroplane-trio-v1'`.

Create `apps/web/src/lib/play-history.ts`:

```ts
export interface PlayHistorySubmission {
  gameId: GameId;
  status: 'win' | 'loss' | 'draw';
  date: string;
  opponent: OpponentDescriptor;
  details?: AeroplaneHistoryDetails;
}

export async function submitPlayHistory(
  input: PlayHistorySubmission,
  signal: AbortSignal,
): Promise<Response> {
  return fetch(`${env.PUBLIC_API_URL}/play-history`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    signal,
    body: JSON.stringify({
      gameId: input.gameId,
      status: input.status,
      date: input.date,
      ...(input.opponent.kind === 'llm'
        ? { opponentLlmId: input.opponent.id }
        : { opponentEngineId: input.opponent.id }),
      ...(input.details ? { details: input.details } : {}),
    }),
  });
}
```

Change existing `usePlayHistory` to call this helper while keeping its snapshot, generation token, timeout, 401-only retry, and no-retry-on-ambiguous-error rules intact.

- [ ] **Step 7: Submit one Aeroplane result from the controller**

On first transition to `phase = 'finished'`, if the same auth snapshot says the user is authenticated, submit:

```ts
{
  gameId: 'aeroplane',
  status: state.winner === config.humanColor ? 'win' : 'loss',
  date: new Date().toISOString(),
  opponent: { kind: 'engine', id: 'aeroplane-trio-v1' },
  details: buildAeroplaneHistoryDetails(state, startedAt),
}
```

Guard with a per-match saved ref/generation so rerenders and animation completion cannot double-submit. Do not retry 5xx/network failures.

- [ ] **Step 8: Update history UI**

`PlayHistoryPage` uses `gameId`, adds `aeroplane: 'Aeroplane Chess'`, and labels `aeroplane-trio-v1` as `Three local rivals`. Both engine ids remain visibly `Unrated` because rating fields are null.

Do not build a metadata details panel in this task.

- [ ] **Step 9: Run API/web history tests**

```bash
cd apps/api
bun test src/routes/play-history.test.ts src/routes/play-history.pvp-security.test.ts src/constants/game.test.ts src/db/schema.test.ts
bun run typecheck

cd ../web
bun test src/hooks/usePlayHistory.test.ts src/hooks/useAeroplaneMatch.test.ts src/components/PlayHistoryPage.test.tsx
bun run typecheck
```

Expected: PASS; existing LLM rating expectations and Stockfish unrated expectations remain unchanged.

- [ ] **Step 10: Commit**

```bash
git add apps/api apps/web/src/lib/play-history.ts apps/web/src/lib/ai/opponent.ts apps/web/src/hooks/usePlayHistory.ts apps/web/src/hooks/usePlayHistory.test.ts apps/web/src/hooks/useAeroplaneMatch.ts apps/web/src/hooks/useAeroplaneMatch.test.ts apps/web/src/components/PlayHistoryPage.tsx apps/web/src/components/PlayHistoryPage.test.tsx
git commit -m "feat(aeroplane): record unrated match history"
```

---

## Task 8: Add local personality chatter and deterministic end-to-end coverage

**Files:**
- Create: `apps/web/src/lib/aeroplane/chatter.ts`
- Create: `apps/web/src/lib/aeroplane/chatter.test.ts`
- Modify: `apps/web/src/hooks/useAeroplaneMatch.ts`
- Modify: `apps/web/src/hooks/useAeroplaneMatch.test.ts`
- Modify: `apps/web/src/components/aeroplane/AeroplaneEventFeed.tsx`
- Create: `apps/web/e2e/aeroplane.spec.ts`

**Interfaces:**
- Produces: `getLocalChatter(personality, event, stableIndex): string | null`.
- Chatter reads already-emitted engine events and never changes state, legal moves, RNG, history, or persistence.
- E2E can start deterministic fixtures through a DEV/test-only query seed and fixture initializer that is excluded from production behavior unless `import.meta.env.DEV` is true.

- [ ] **Step 1: Test chatter isolation**

```ts
test('local chatter does not consume either gameplay RNG stream', () => {
  const before = structuredClone(rngStreams);
  const line = getLocalChatter('aggressive', { type: 'capture', count: 2 }, 4);
  expect(line).toBeString();
  expect(rngStreams).toEqual(before);
});

test('disabled chatter produces no line', () => {
  expect(buildChatterEvent(false, personality, event, 0)).toBeNull();
});
```

Add at least three lines per personality across capture/flight/finish/win/loss events. Select via stable event index/hash, not game RNG.

- [ ] **Step 2: Integrate chatter after authoritative transitions**

Only enqueue a line after `playResolvedMove` returns and state has been committed. If chatter rendering throws, catch/ignore it and leave the event feed/gameplay intact. Do not import `UniversalAIService` or any provider adapter.

- [ ] **Step 3: Add deterministic Playwright tests**

`apps/web/e2e/aeroplane.spec.ts` should cover the high-value flow without reproducing every unit scenario:

```ts
test('Quick & Chill completes locally and survives reload', async ({ page }) => {
  await page.goto('/aeroplane?e2eSeed=39101');
  await page.getByRole('button', { name: /quick & chill/i }).click();
  await page.getByRole('button', { name: /^start match$/i }).click();

  await expect(page.getByText(/current turn/i)).toBeVisible();
  await page.getByRole('button', { name: /roll dice/i }).click();
  await expect(page.getByTestId('aeroplane-event-feed')).toContainText(/rolled/i);

  await page.reload();
  await page.getByRole('button', { name: /resume match/i }).click();
  await expect(page.getByTestId('aeroplane-board')).toBeVisible();
});
```

Add separate deterministic fixture tests for:

- human colour red/yellow/blue/green startup;
- all three AI personalities taking one turn;
- launch → jump → flight → capture chain;
- stacking/blockade rejection fixture;
- reload while `awaiting-choice` and exact continuation;
- two-plane Quick victory;
- no provider configuration required;
- authenticated route interception asserts exactly one history POST with `gameId: 'aeroplane'` and `opponentEngineId: 'aeroplane-trio-v1'`.

- [ ] **Step 4: Run all Aeroplane tests, then repository quality gates**

```bash
cd apps/web
bun test src/lib/aeroplane src/hooks/useAeroplaneMatch.test.ts src/components/aeroplane/AeroplaneGame.test.tsx src/components/ChessGameSelector.test.tsx
bun run typecheck
bun run lint
bun run test:e2e -- e2e/aeroplane.spec.ts

cd ../api
bun test src/routes/play-history.test.ts src/routes/play-history.pvp-security.test.ts src/constants/game.test.ts src/db/schema.test.ts
bun run typecheck
bun run lint

cd ../..
bun run test
bun run typecheck
bun run lint
bun run build
```

Expected: all commands PASS. If the full repository exposes unrelated pre-existing failures, record the exact failing command/output in the PR instead of weakening Aeroplane tests.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/aeroplane/chatter.ts apps/web/src/lib/aeroplane/chatter.test.ts apps/web/src/hooks/useAeroplaneMatch.ts apps/web/src/hooks/useAeroplaneMatch.test.ts apps/web/src/components/aeroplane/AeroplaneEventFeed.tsx apps/web/e2e/aeroplane.spec.ts
git commit -m "test(aeroplane): finish local match coverage"
```

---

## Final implementation review checklist

Before marking HPA-391 implemented:

- [ ] `GameVariant` still contains only Chess/Xiangqi/Shogi/Jungle.
- [ ] No Aeroplane import appears in `apps/web/src/lib/ai/factory.ts`, move adapters, or rule guardian.
- [ ] `@procyon/game-core` has no Aeroplane-specific primitive.
- [ ] Every move preview, AI score, and applied move comes from `resolveLegalMove`/`ResolvedMove`.
- [ ] Classic and Quick & Chill values exactly match the spec.
- [ ] Six grants another turn after a no-move roll.
- [ ] Exact/bounce finishes and both victory targets are covered by tests.
- [ ] Direct long-flight landing and jump-into-flight behavior are both covered.
- [ ] Blockade origin splitting, ring crossing, jump crossing, and flight exit behavior are covered.
- [ ] Same root seed reproduces dice + AI choices across reload and replay.
- [ ] Relaxed protection consumes two dice samples whenever active.
- [ ] AI/presentation timing never consumes gameplay RNG.
- [ ] Reload while awaiting a human choice restores the exact pending roll and choices.
- [ ] `Skip Animations` cannot apply a move twice.
- [ ] Signed-out/no-provider play completes normally.
- [ ] `aeroplane-trio-v1` is stored through `opponentEngineId`, not a new local-opponent column.
- [ ] Aeroplane history returns `ratingUpdate: null` and creates no rating row.
- [ ] Existing LLM strategy rating tests and Stockfish unrated tests remain green.
- [ ] Play history uses `gameId`, while rating tables remain typed to the four strategy variants.
- [ ] Local chatter cannot block or mutate gameplay.
