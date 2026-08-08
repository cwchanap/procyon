# HPA-391 Aeroplane Chess Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a complete deterministic Aeroplane Chess mode with one human, three local personality AIs, reload recovery, unrated history, and responsive accessible gameplay.

**Architecture:** Keep Chess/Xiangqi/Shogi/Jungle inside the existing rectangular `GameVariant`/AI abstractions. Aeroplane uses a dedicated logical path engine under `apps/web/src/lib/aeroplane/`; a new `GameId` handles app/history identity, and the existing `opponentEngineId` path records `aeroplane-trio-v1` as unrated.

**Tech Stack:** TypeScript 5.9, Bun 1.3.6, Astro 4, React 18, Tailwind CSS, Bun test, Hono, Zod 4, Drizzle ORM/SQLite/D1, Playwright.

## Global Constraints

- HPA-391 is normative; use `docs/superpowers/specs/2026-08-08-hpa-391-aeroplane-chess-design.md` for clarified implementation choices.
- Do not add Aeroplane to `GAME_CONFIGS`, strategy state/piece maps, LLM move adapters, rule guardians, or `@procyon/game-core`.
- Do not create a generic race-game/Ludo framework.
- Gameplay/dice/AI/recovery must work without sign-in, provider configuration, or network access.
- Use separate serializable RNG streams for dice and AI. UI timing/chatter consumes neither.
- Rules use logical positions only; render coordinates never determine legality.
- Apply each move to authoritative state exactly once before animation/chatter/history presentation.
- Classic: launch 6, extra turn 6, exact finish, target 4, Fair Dice, stacking/blockades off.
- Quick & Chill: launch 5/6, extra turn 6, bounce finish, target 2, Relaxed Dice, stacking/blockades off.
- Enabling blockades forces stacking on; disabling stacking forces blockades off.
- Provider-generated chatter is deferred; local personality lines satisfy this slice.
- Existing rated LLM strategy games and unrated Stockfish games must remain behaviorally unchanged.

---

## File map

### New web domain files

```text
apps/web/src/lib/game-id.ts
apps/web/src/lib/play-history.ts
apps/web/src/lib/aeroplane/types.ts
apps/web/src/lib/aeroplane/topology.ts
apps/web/src/lib/aeroplane/rules.ts
apps/web/src/lib/aeroplane/rng.ts
apps/web/src/lib/aeroplane/dice.ts
apps/web/src/lib/aeroplane/game.ts
apps/web/src/lib/aeroplane/ai.ts
apps/web/src/lib/aeroplane/checksum.ts
apps/web/src/lib/aeroplane/persistence.ts
apps/web/src/lib/aeroplane/replay.ts
apps/web/src/lib/aeroplane/chatter.ts
apps/web/src/lib/aeroplane/layout.ts
```

Each domain file gets a colocated `*.test.ts` where named in its task.

### New UI files

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

### Existing web files changed

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
```

### API files changed/created

```text
apps/api/src/constants/game.ts
apps/api/src/constants/game.test.ts
apps/api/src/types/play-history.ts
apps/api/src/db/schema.ts
apps/api/src/db/schema.test.ts
apps/api/src/routes/play-history.ts
apps/api/src/routes/play-history.test.ts
apps/api/src/routes/play-history.pvp-security.test.ts
```

Generate the next migration with:

```bash
cd apps/api
bunx drizzle-kit generate --config=drizzle.config.dev.ts --name hpa391_aeroplane_history
```

Because `0010_noisy_madame_web.sql` is current on `main`, the expected generated files are `apps/api/drizzle/0011_hpa391_aeroplane_history.sql`, `apps/api/drizzle/meta/0011_snapshot.json`, plus `_journal.json` changes.

---

## Task 1: Separate general app identity from strategy-engine identity

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
- Create shell: `apps/web/src/components/AeroplaneGame.tsx`

**Interfaces:**
- Produces `GameId = GameVariant | 'aeroplane'`, `Accent = GameId | 'brass'`.
- Preserves four-value `GameVariant` as the only key accepted by `GAME_CONFIGS` and strategy AI maps.
- Selector models own explicit `href`; display text never controls routing.

- [ ] **Step 1: Write the selector test first**

Use the repository DOM helper rather than custom globals:

```ts
import { describe, expect, test } from 'bun:test';
import { render } from '@testing-library/react';
import { setupReactDom } from '../test/reactSetup';
import ChessGameSelector from './ChessGameSelector';

setupReactDom();

describe('ChessGameSelector', () => {
  test('links all five games explicitly', () => {
    const { getByRole } = render(<ChessGameSelector />);
    expect(getByRole('link', { name: /play standard chess/i }).getAttribute('href')).toBe('/chess');
    expect(getByRole('link', { name: /play chinese chess/i }).getAttribute('href')).toBe('/xiangqi');
    expect(getByRole('link', { name: /play japanese chess/i }).getAttribute('href')).toBe('/shogi');
    expect(getByRole('link', { name: /play jungle chess/i }).getAttribute('href')).toBe('/jungle');
    expect(getByRole('link', { name: /play aeroplane chess/i }).getAttribute('href')).toBe('/aeroplane');
  });
});
```

- [ ] **Step 2: Verify the test fails**

```bash
cd apps/web
bun test src/components/ChessGameSelector.test.tsx
```

Expected: FAIL because Aeroplane and link-based routing do not exist.

- [ ] **Step 3: Add `GameId` without widening `GameVariant`**

Create:

```ts
// apps/web/src/lib/game-id.ts
import type { GameVariant } from './ai/game-variant-types';

export type GameId = GameVariant | 'aeroplane';
export type Accent = GameId | 'brass';
```

Remove only `Accent` from `game-variant-types.ts`. Update `Panel`/`PageHeader` to import the new `Accent`. Keep all strategy unions/maps unchanged.

- [ ] **Step 4: Generalize the card and selector**

```bash
git mv apps/web/src/components/ChessGameCard.tsx apps/web/src/components/GameCard.tsx
```

Use:

```ts
interface GameCardProps {
  title: string;
  description: string;
  gameId: GameId;
  href: string;
  preview: React.ReactNode;
}
```

Render an `<a>` using the already-exported `buttonVariants` classes from `ui/Button.tsx`; do **not** nest a `<button>` inside an anchor. `ChessGameSelector` becomes a typed five-entry data array. Existing four previews remain `ChessBoardPreview`; Aeroplane uses `AeroplaneBoardPreview`.

- [ ] **Step 5: Add page-level accent/route plumbing**

Broaden only page/UI accent consumers to `GameId`; add Tailwind token:

```js
aeroplane: { DEFAULT: '#4F8FD8' }
```

Create page:

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

The temporary `AeroplaneGame` shell only renders the title; Task 6 replaces it.

- [ ] **Step 6: Verify**

```bash
cd apps/web
bun test src/components/ChessGameSelector.test.tsx
bun run typecheck
```

Expected: PASS, while `GAME_CONFIGS.aeroplane` remains a TypeScript error.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/lib/game-id.ts apps/web/src/lib/ai/game-variant-types.ts apps/web/src/components apps/web/src/pages/aeroplane.astro apps/web/tailwind.config.mjs
git commit -m "feat(aeroplane): add game identity and route"
```

---

## Task 2: Build topology and the single authoritative move resolver

**Files:**
- Create: `apps/web/src/lib/aeroplane/types.ts`
- Create: `apps/web/src/lib/aeroplane/topology.ts`
- Create: `apps/web/src/lib/aeroplane/rules.ts`
- Create: `apps/web/src/lib/aeroplane/topology.test.ts`
- Create: `apps/web/src/lib/aeroplane/rules.test.ts`

**Interfaces:**
- Produces `AeroplaneConfig`, `AeroplaneState`, `PlaneState`, `AeroplanePosition`, `AeroplaneEvent`, `ResolvedMove`.
- Produces `toGlobalTrackIndex`, `toPosition`, `resolveLegalMove`, `getLegalMoves`, `applyResolvedMove`.
- Rule modules import no React or render-coordinate module.

- [ ] **Step 1: Define the base types and failing topology tests**

Core types:

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
```

Topology assertions:

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

- [ ] **Step 2: Run and see the expected failure**

```bash
cd apps/web
bun test src/lib/aeroplane/topology.test.ts
```

Expected: module/functions missing.

- [ ] **Step 3: Implement colour-symmetric topology**

```ts
export const TURN_ORDER = ['red', 'yellow', 'blue', 'green'] as const;
export const START_OFFSET = { red: 0, yellow: 13, blue: 26, green: 39 } as const;
export const SHARED_PROGRESS_MAX = 50;
export const FINISH_PROGRESS = 56;
export const FLIGHT_ENTRANCE_PROGRESS = 18;
export const FLIGHT_EXIT_PROGRESS = 30;
```

Normal jump square rule: shared progress where `progress % 4 === 2`, `progress + 4 <= 50`, excluding `18`.

- [ ] **Step 4: Write move-rule scenarios before implementation**

At minimum:

```ts
test('launch requires allowed roll and empty launch pad', () => {
  const state = stateWithPlane('red-0', null);
  expect(resolveLegalMove(state, 'red-0', 5)).toBeNull();
  expect(resolveLegalMove(state, 'red-0', 6)?.finalEndpoint).toEqual({ kind: 'launch', color: 'red' });
});

test('normal jump can feed the long flight', () => {
  const move = resolveLegalMove(stateWithPlane('red-0', 12), 'red-0', 2);
  expect(move?.baseEndpoint).toMatchObject({ kind: 'track', progress: 14 });
  expect(move?.finalEndpoint).toMatchObject({ kind: 'track', progress: 30 });
  expect(move?.events.map(event => event.type)).toEqual(['move', 'jump', 'flight']);
});

test('direct flight entrance also flies', () => {
  expect(resolveLegalMove(stateWithPlane('red-0', 16), 'red-0', 2)?.finalEndpoint)
    .toMatchObject({ kind: 'track', progress: 30 });
});

test('exact rejects overshoot and bounce reflects it', () => {
  expect(resolveLegalMove(stateWithPlane('red-0', 54, { finishRule: 'exact' }), 'red-0', 3)).toBeNull();
  expect(resolveLegalMove(stateWithPlane('red-0', 54, { finishRule: 'bounce' }), 'red-0', 3)?.finalEndpoint)
    .toMatchObject({ kind: 'home', progress: 55 });
});
```

Add tables for all colours/wraparound, friendly collision, stack create/split, multi-plane capture, launch/home non-capture, blockade crossing/landing, +4 jump crossing, long-flight exit blockade, and private-home collision.

- [ ] **Step 5: Implement one resolver**

`resolveLegalMove` performs in order: ownership/finished guard → launch case → exact/bounce base progress → base blockade traversal → +4 normal jump → flight at progress 18 → final occupancy → captured ids/events. It never mutates input.

`getLegalMoves` calls it for every current-player plane. `applyResolvedMove` consumes the analyzed move and immutably updates affected planes/stats; no UI/controller movement math is allowed.

- [ ] **Step 6: Verify and commit**

```bash
cd apps/web
bun test src/lib/aeroplane/topology.test.ts src/lib/aeroplane/rules.test.ts

git add src/lib/aeroplane/types.ts src/lib/aeroplane/topology.ts src/lib/aeroplane/rules.ts src/lib/aeroplane/topology.test.ts src/lib/aeroplane/rules.test.ts
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
- Produces `RngState`, `nextUint32`, `nextDie`, `deriveRngStreams`.
- Produces `CLASSIC_CONFIG`, `QUICK_CONFIG`, `normalizeConfig`, `createAeroplaneMatch`, `rollTurn`, `playResolvedMove`, `skipTurn`.
- `rollTurn` consumes dice only; it never chooses an AI move.

- [ ] **Step 1: Write RNG/dice tests**

```ts
test('same seed produces identical Fair Dice sequence', () => {
  const a = takeFairRolls({ value: 0x12345678 }, 8);
  const b = takeFairRolls({ value: 0x12345678 }, 8);
  expect(a).toEqual(b);
  expect(a.every(value => value >= 1 && value <= 6)).toBe(true);
});

test('dice and AI streams start independently', () => {
  const streams = deriveRngStreams(0x12345678);
  expect(streams.dice.value).not.toBe(streams.ai.value);
});
```

For Relaxed mode, assert inactive protection consumes one sample; active protection consumes exactly two samples even when candidate one is selected; candidate two is used only when candidate one has no legal move and candidate two does.

- [ ] **Step 2: Implement serializable xorshift32**

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

Derive dice/AI streams by mixing the root seed with two fixed non-zero salts. `Math.random()` is allowed only to choose a new root seed fallback when crypto is unavailable, never during an active match.

- [ ] **Step 3: Write turn tests**

```ts
test('six keeps player even when no legal move exists', () => {
  const skipped = skipTurn(stateAwaitingChoice('red', 6));
  expect(skipped.currentPlayer).toBe('red');
  expect(skipped.phase).toBe('awaiting-roll');
});

test('non-six advances clockwise including green to red', () => {
  expect(skipTurn(stateAwaitingChoice('green', 3)).currentPlayer).toBe('red');
});

test('Quick ends immediately on second finished plane', () => {
  const result = finishSecondPlaneForRed(QUICK_CONFIG);
  expect(result.state.phase).toBe('finished');
  expect(result.state.winner).toBe('red');
});
```

Also cover preset values/normalization, zero/one/many legal moves, no-move streak reset/increment, and last-place counters only on round completion.

- [ ] **Step 4: Implement turn/preset logic**

`normalizeConfig` enforces only stacking/blockade dependency. A UI helper marks `rulePreset = 'custom'` when any individual rule changes.

`rollTurn` consumes the dice policy and derives legal moves. Zero legal moves complete the skip inside the roll action; one-or-more leave `phase = 'awaiting-choice'`. Update no-move streak from that legal count. Update last-place rounds only when a non-six turn advances green→red.

Progress score for Relaxed protection:

```ts
finishedPlanes * 1000 + sum(activePlaneProgress)
```

- [ ] **Step 5: Verify and commit**

```bash
cd apps/web
bun test src/lib/aeroplane/dice.test.ts src/lib/aeroplane/game.test.ts src/lib/aeroplane/rules.test.ts

git add src/lib/aeroplane/rng.ts src/lib/aeroplane/dice.ts src/lib/aeroplane/game.ts src/lib/aeroplane/dice.test.ts src/lib/aeroplane/game.test.ts src/lib/aeroplane/types.ts
git commit -m "feat(aeroplane): add deterministic turns and dice"
```

---

## Task 4: Add three deterministic personality AIs

**Files:**
- Create: `apps/web/src/lib/aeroplane/ai.ts`
- Create: `apps/web/src/lib/aeroplane/ai.test.ts`
- Modify: `apps/web/src/lib/aeroplane/types.ts`

**Interfaces:**
- Consumes public state + `ResolvedMove[]` + personality + AI RNG.
- Produces `chooseAiMove(state, legalMoves, personality, rng): { move; rng }`.

- [ ] **Step 1: Write representative scenario tests**

```ts
test('cautious prefers home entry over an exposed minor capture', () => {
  const result = chooseAiMove(cautiousFixture.state, cautiousFixture.moves, 'cautious', { value: 7 });
  expect(result.move.planeId).toBe('red-home-runner');
});

test('aggressive prefers a multi-plane capture over quiet progress', () => {
  const result = chooseAiMove(aggressiveFixture.state, aggressiveFixture.moves, 'aggressive', { value: 7 });
  expect(result.move.planeId).toBe('red-capturer');
});

test('all personalities take a guaranteed finish', () => {
  for (const personality of ['cautious', 'aggressive', 'unpredictable'] as const) {
    expect(chooseAiMove(finishFixture.state, finishFixture.moves, personality, { value: 7 }).move.planeId)
      .toBe('red-finisher');
  }
});
```

Add same-state/seed repeatability and advanced stacking/blockade fixtures asserting the selected `planeId` is always in legal moves.

- [ ] **Step 2: Implement fixed feature weights from the design**

Features: finish, home entry, capture count, jump, flight, launch, formed blockade, progress gain, immediate capture exposure.

Exposure is calculated from the resulting public position by trying opponent plane + die values 1–6 through `resolveLegalMove`; count threats that would capture the moved plane. It does not consume RNG.

Cautious/Aggressive consume AI RNG only to break a top-score tie. Unpredictable consumes one sample per legal move for jitter `[-120, 120]`, plus one sample only if a final tie remains. Tests lock this consumption contract for replay.

- [ ] **Step 3: Verify and commit**

```bash
cd apps/web
bun test src/lib/aeroplane/ai.test.ts src/lib/aeroplane/rules.test.ts

git add src/lib/aeroplane/ai.ts src/lib/aeroplane/ai.test.ts src/lib/aeroplane/types.ts
git commit -m "feat(aeroplane): add personality opponents"
```

---

## Task 5: Add checksums, replay, and versioned recovery

**Files:**
- Create: `apps/web/src/lib/aeroplane/checksum.ts`
- Create: `apps/web/src/lib/aeroplane/replay.ts`
- Create: `apps/web/src/lib/aeroplane/persistence.ts`
- Create: `apps/web/src/lib/aeroplane/replay.test.ts`
- Create: `apps/web/src/lib/aeroplane/persistence.test.ts`
- Modify: `apps/web/src/lib/aeroplane/types.ts`

**Interfaces:**
- `checksumState(state): string`: canonical serialize + FNV-1a.
- `replayMatch(persisted): ReplayResult`: re-executes dice/rules/AI.
- `saveActiveMatch`, `restoreActiveMatch`, `clearActiveMatch`.
- Key: `procyon:aeroplane:active-match:v1`.

- [ ] **Step 1: Write replay/tamper tests**

```ts
test('replay reproduces final checksum', () => {
  const result = replayMatch(recordedMatch);
  expect(result).toEqual({ kind: 'ok', finalChecksum: recordedMatch.actions.at(-1)!.checksum });
});

test('changed roll is rejected', () => {
  const changed = structuredClone(recordedMatch);
  changed.actions[0] = { ...changed.actions[0], roll: 1 };
  expect(replayMatch(changed).kind).toBe('mismatch');
});

test('changed AI choice is rejected', () => {
  const changed = structuredClone(recordedMatch);
  const index = changed.actions.findIndex(action => action.kind === 'move' && action.actor === 'ai');
  changed.actions[index] = { ...changed.actions[index], planeId: 'red-0' };
  expect(replayMatch(changed).kind).toBe('mismatch');
});
```

- [ ] **Step 2: Implement checksum/replay**

Canonical state serialization sorts record keys and planes by id; excludes timestamp/presentation state. Replay starts from root seed/config and calls the real `rollTurn`, `chooseAiMove`, and `playResolvedMove`. A zero-move roll’s checksum is the post-skip state, so no unlogged skip mutation exists.

- [ ] **Step 3: Write persistence tests**

Cover empty, valid round-trip, pending-choice round-trip, exact next die/AI after restore, unknown version, bad player/plane counts, duplicate ids, out-of-range progress, invalid winner/phase, invalid RNG, storage exceptions.

- [ ] **Step 4: Implement manual save validation**

Validate schema version 1; four colours × four unique planes; progress `null` or integer 0–56; phase/current-player/pending-roll invariants; winner iff finished; normalized config; exactly three AI seats with unique personalities; uint32 RNG states; valid action/checksum shapes.

Corrupt payload: copy raw text to `sessionStorage['procyon:aeroplane:corrupt-save']`, remove active key, return `{ kind: 'corrupt', reason }`. Storage errors remain non-fatal.

- [ ] **Step 5: Verify and commit**

```bash
cd apps/web
bun test src/lib/aeroplane/replay.test.ts src/lib/aeroplane/persistence.test.ts src/lib/aeroplane/dice.test.ts src/lib/aeroplane/ai.test.ts

git add src/lib/aeroplane/checksum.ts src/lib/aeroplane/replay.ts src/lib/aeroplane/persistence.ts src/lib/aeroplane/replay.test.ts src/lib/aeroplane/persistence.test.ts src/lib/aeroplane/types.ts
git commit -m "feat(aeroplane): add recovery and replay"
```

---

## Task 6: Build the match controller and accessible board UI

**Files:**
- Create: `apps/web/src/lib/aeroplane/layout.ts`
- Create: `apps/web/src/hooks/useAeroplaneMatch.ts`
- Create: `apps/web/src/hooks/useAeroplaneMatch.test.ts`
- Replace shell: `apps/web/src/components/AeroplaneGame.tsx`
- Create: `apps/web/src/components/aeroplane/AeroplaneSetup.tsx`
- Create: `apps/web/src/components/aeroplane/AeroplaneBoard.tsx`
- Create: `apps/web/src/components/aeroplane/AeroplaneStatus.tsx`
- Create: `apps/web/src/components/aeroplane/AeroplaneEventFeed.tsx`
- Modify: `apps/web/src/components/aeroplane/AeroplaneBoardPreview.tsx`
- Create: `apps/web/src/components/aeroplane/AeroplaneGame.test.tsx`

**Interfaces:**
- Hook exposes authoritative match state + derived legal moves + presentation state/actions.
- Board receives logical state/`ResolvedMove` preview and callbacks; no dice/AI/storage imports.
- `layout.ts` is render-only and no domain rule module imports it.

- [ ] **Step 1: Write controller tests with fake timers/injected storage**

Cover one legal human move auto-apply, multiple-choice wait, AI delay not consuming RNG, stale AI timer cancellation on reset/unmount, save after pending-choice roll, resume/new match, repeated Skip Animations idempotence.

Representative assertions:

```ts
expect(match.state().phase).toBe('awaiting-choice');
expect(match.legalMoves()).toHaveLength(2);

const before = match.aiRng();
match.advanceTime(400);
expect(match.aiRng()).toEqual(before);
```

- [ ] **Step 2: Implement render-only anchors**

`layout.ts` provides normalized `{x,y}` anchors for 52 track nodes, four launch pads, 16 hangar slots, four six-position home paths (last anchor is finish), flight guides, and stack offsets. Generate rotations from one quadrant or declare constants; unit assertions check counts/symmetry only.

- [ ] **Step 3: Implement `useAeroplaneMatch` orchestration**

Own only editable setup, frozen active config/personality seats/root seed, restore prompt, calls to pure engine/dice/AI, 650 ms skippable AI presentation delay, animation overlay queue, event feed, persistence, and timer generation token.

Commit authoritative move state before starting visual route animation. `skipAnimations()` clears timers/overlay only.

- [ ] **Step 4: Write component interaction tests**

Assert Classic default; exact Quick config; blockades→stacking; stacking-off→blockades-off; manual edit→Custom; one legal auto; multiple legal only actionable; keyboard Enter/Space; touch two-activation preview; mobile event-feed collapse control; repeated animation skip does not change final plane location.

- [ ] **Step 5: Build components**

`AeroplaneSetup`: presets, victory, dice, launch, finish, stacking, blockades, human colour, chatter.

`AeroplaneBoard`: SVG from `layout.ts`, plane controls with visible focus and labels such as:

```text
Red plane 2, track position 14. Legal move: jump and long flight to position 30.
```

Hover/focus draws the full resolved route. Coarse pointer first activation previews and second activation on same legal plane applies.

`AeroplaneStatus`: current turn/die below board; compact sticky strip on narrow screens.

`AeroplaneEventFeed`: compact event list; collapsible on narrow screens.

- [ ] **Step 6: Verify and commit**

```bash
cd apps/web
bun test src/hooks/useAeroplaneMatch.test.ts src/components/aeroplane/AeroplaneGame.test.tsx
bun run typecheck

git add src/lib/aeroplane/layout.ts src/hooks/useAeroplaneMatch.ts src/hooks/useAeroplaneMatch.test.ts src/components/AeroplaneGame.tsx src/components/aeroplane
git commit -m "feat(aeroplane): add playable local match UI"
```

---

## Task 7: Generalize play history and record Aeroplane as unrated

**Files:**
- Create: `apps/api/src/types/play-history.ts`
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
- Create: `apps/web/src/lib/play-history.ts`
- Modify: `apps/web/src/lib/ai/opponent.ts`
- Modify: `apps/web/src/hooks/usePlayHistory.ts`
- Modify: `apps/web/src/hooks/usePlayHistory.test.ts`
- Modify: `apps/web/src/hooks/useAeroplaneMatch.ts`
- Modify: `apps/web/src/hooks/useAeroplaneMatch.test.ts`
- Modify: `apps/web/src/components/PlayHistoryPage.tsx`
- Modify: `apps/web/src/components/PlayHistoryPage.test.tsx`

**Interfaces:**
- API `GameId` has five values; `ChessVariantId` stays the rating-service type.
- `getRatedVariantId(gameId): ChessVariantId | null` explicitly converts the rated subset; do not use a cross-enum type predicate.
- `POST /play-history` accepts `gameId` rather than `chessId`.
- `OpponentEngineId` adds `aeroplane-trio-v1`.
- Web `submitPlayHistory` centralizes request construction; retry policy stays with lifecycle callers.

- [ ] **Step 1: Write API contract tests first**

Add a reusable valid details fixture and tests:

```ts
const validAeroplaneDetails = {
  rulePreset: 'quick-chill',
  victoryTarget: 2,
  diceMode: 'relaxed',
  launchRule: 'five-or-six',
  finishRule: 'bounce',
  stacking: false,
  blockades: false,
  durationSeconds: 240,
  planesFinished: 2,
  capturesMade: 3,
  capturesSuffered: 1,
  aiPlayers: [
    { color: 'yellow', personality: 'cautious' },
    { color: 'blue', personality: 'aggressive' },
    { color: 'green', personality: 'unpredictable' },
  ],
} as const;
```

Test: valid Aeroplane insert returns 201/null rating/zero rating rows; Aeroplane+LLM 400; Aeroplane+Stockfish 400; chess+AeroplaneTrio 400; Aeroplane draw 400; missing/invalid details 400; duplicate AI colour/personality 400; existing chess+LLM still rated; stockfish remains unrated.

- [ ] **Step 2: Verify API tests fail**

```bash
cd apps/api
bun test src/routes/play-history.test.ts src/constants/game.test.ts src/db/schema.test.ts
```

- [ ] **Step 3: Add ids, explicit rated conversion, and shared history detail type**

`constants/game.ts`:

```ts
export enum GameId {
  Chess = 'chess',
  Xiangqi = 'xiangqi',
  Shogi = 'shogi',
  Jungle = 'jungle',
  Aeroplane = 'aeroplane',
}

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

Add `AeroplaneTrioV1 = 'aeroplane-trio-v1'` to `OpponentEngineId`.

`apps/api/src/types/play-history.ts` owns the TypeScript `AeroplaneHistoryDetails` interface from the design so both Drizzle schema and route validation share one type without importing route code into DB code.

- [ ] **Step 4: Rename the history game field and add JSON details**

Schema:

```ts
gameId: text('game_id').$type<GameId>().notNull(),
details: text('details', { mode: 'json' }).$type<AeroplaneHistoryDetails | null>(),
```

Generate:

```bash
cd apps/api
bunx drizzle-kit generate --config=drizzle.config.dev.ts --name hpa391_aeroplane_history
```

Inspect `0011_hpa391_aeroplane_history.sql`: existing rows must be preserved, `chess_id` becomes `game_id`, and nullable `details` is added. Use this same migration for local SQLite and D1.

- [ ] **Step 5: Update route validation and rating branch**

Define `aeroplaneHistoryDetailsSchema` as `z.ZodType<AeroplaneHistoryDetails>` with exact enums, non-negative finite numeric constraints, array length 3, and `superRefine` uniqueness checks.

Extend request `superRefine` with pairing rules. Use `z.ZodIssueCode.custom` as existing code does.

Derive:

```ts
const ratedVariantId = getRatedVariantId(body.gameId);
const shouldRate = kind === 'llm' && ratedVariantId !== null;
```

Only `shouldRate` calls `updatePlayerRating({ variantId: ratedVariantId, ... })`. GET returns `gameId` + `details`.

- [ ] **Step 6: Add the web request helper and preserve strategy retry semantics**

Extend web `OpponentEngineId` to `'stockfish' | 'aeroplane-trio-v1'`.

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

Existing `usePlayHistory` keeps snapshot/generation/timeout/401-only-retry/no-ambiguous-retry logic; replace only its raw fetch construction with this helper and `gameId` field.

- [ ] **Step 7: Submit one terminal Aeroplane result**

On first transition to finished, if the controller’s auth snapshot is authenticated, submit human-perspective win/loss with `opponent: { kind: 'engine', id: 'aeroplane-trio-v1' }` and built details. Guard with per-match generation/saved ref. Use a 10-second abort signal and do not retry 5xx/network errors.

- [ ] **Step 8: Update history UI**

Change response field to `gameId`, add `aeroplane: 'Aeroplane Chess'`, label Aeroplane engine as `Three local rivals`, and show it as `Unrated`. Do not build a details panel.

- [ ] **Step 9: Verify and commit**

```bash
cd apps/api
bun test src/routes/play-history.test.ts src/routes/play-history.pvp-security.test.ts src/constants/game.test.ts src/db/schema.test.ts
bun run typecheck

cd ../web
bun test src/hooks/usePlayHistory.test.ts src/hooks/useAeroplaneMatch.test.ts src/components/PlayHistoryPage.test.tsx
bun run typecheck

cd ../..
git add apps/api apps/web/src/lib/play-history.ts apps/web/src/lib/ai/opponent.ts apps/web/src/hooks/usePlayHistory.ts apps/web/src/hooks/usePlayHistory.test.ts apps/web/src/hooks/useAeroplaneMatch.ts apps/web/src/hooks/useAeroplaneMatch.test.ts apps/web/src/components/PlayHistoryPage.tsx apps/web/src/components/PlayHistoryPage.test.tsx
git commit -m "feat(aeroplane): record unrated match history"
```

---

## Task 8: Add local chatter and deterministic E2E coverage

**Files:**
- Create: `apps/web/src/lib/aeroplane/chatter.ts`
- Create: `apps/web/src/lib/aeroplane/chatter.test.ts`
- Modify: `apps/web/src/hooks/useAeroplaneMatch.ts`
- Modify: `apps/web/src/hooks/useAeroplaneMatch.test.ts`
- Modify: `apps/web/src/components/aeroplane/AeroplaneEventFeed.tsx`
- Create: `apps/web/e2e/aeroplane.spec.ts`

**Interfaces:**
- `getLocalChatter(personality, event, stableIndex): string | null` is presentation-only.
- E2E uses deterministic DEV/test seed/fixture hooks; production behavior is unaffected unless `import.meta.env.DEV`.

- [ ] **Step 1: Test chatter isolation**

```ts
test('local chatter does not consume gameplay RNG', () => {
  const before = structuredClone(rngStreams);
  const line = getLocalChatter('aggressive', { type: 'capture', count: 2 }, 4);
  expect(typeof line).toBe('string');
  expect(rngStreams).toEqual(before);
});
```

Add at least three lines per personality across capture/flight/finish/win/loss. Select via stable event index/hash, not dice/AI RNG.

- [ ] **Step 2: Integrate chatter only after state commit**

Enqueue a line after authoritative transition completes. Catch/ignore presentation failure. Do not import `UniversalAIService`, provider adapters, or API-key configuration.

- [ ] **Step 3: Add Playwright flows**

Base flow:

```ts
test('Quick & Chill restores after reload', async ({ page }) => {
  await page.goto('/aeroplane?e2eSeed=39101');
  await page.getByRole('button', { name: /quick & chill/i }).click();
  await page.getByRole('button', { name: /^start match$/i }).click();
  await page.getByRole('button', { name: /roll dice/i }).click();
  await expect(page.getByTestId('aeroplane-event-feed')).toContainText(/rolled/i);
  await page.reload();
  await page.getByRole('button', { name: /resume match/i }).click();
  await expect(page.getByTestId('aeroplane-board')).toBeVisible();
});
```

Add deterministic fixture tests for: four human colours; one turn from every AI personality; launch→jump→flight→capture; stacking/blockade restrictions; reload in `awaiting-choice`; two-plane Quick victory; no provider configured; authenticated interception sees exactly one POST with `gameId:'aeroplane'` + `opponentEngineId:'aeroplane-trio-v1'`.

- [ ] **Step 4: Run feature and repository gates**

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

Expected: PASS. If full-repository gates expose unrelated pre-existing failures, record exact command/output in the implementation PR rather than weakening Aeroplane coverage.

- [ ] **Step 5: Commit**

```bash
cd apps/web
git add src/lib/aeroplane/chatter.ts src/lib/aeroplane/chatter.test.ts src/hooks/useAeroplaneMatch.ts src/hooks/useAeroplaneMatch.test.ts src/components/aeroplane/AeroplaneEventFeed.tsx e2e/aeroplane.spec.ts
git commit -m "test(aeroplane): finish local match coverage"
```

---

## Final implementation review checklist

- [ ] `GameVariant` still contains only Chess/Xiangqi/Shogi/Jungle.
- [ ] No Aeroplane import appears in AI factory/move adapters/rule guardian or `game-core`.
- [ ] Every preview/AI score/applied move comes from `ResolvedMove` produced by the rule resolver.
- [ ] Presets exactly match HPA-391.
- [ ] Six grants another turn after a no-move roll.
- [ ] Exact/bounce and both victory targets are tested.
- [ ] Direct flight and jump→flight are tested.
- [ ] Blockade origin split, path/jump crossing, landing, and flight-exit behavior are tested.
- [ ] Same root seed reproduces dice + AI across reload and replay.
- [ ] Relaxed protection consumes two dice samples whenever active.
- [ ] Presentation timing/chatter never consumes gameplay RNG.
- [ ] Reload while awaiting human choice preserves pending roll and choices.
- [ ] Skip Animations cannot apply a move twice.
- [ ] Signed-out/no-provider play completes normally.
- [ ] Aeroplane uses `opponentEngineId = 'aeroplane-trio-v1'`; no new local-opponent column exists.
- [ ] Aeroplane history returns `ratingUpdate:null` and creates no rating row.
- [ ] Existing LLM strategy rating and Stockfish unrated tests remain green.
- [ ] Play history uses `gameId`; rating tables stay on four strategy variants.
- [ ] Local chatter cannot block or mutate gameplay.
