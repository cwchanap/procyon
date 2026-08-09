# HPA-391 Aeroplane Chess Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a complete deterministic Aeroplane Chess mode with one human, three local personality AIs, exact reload recovery, replay diagnostics, unrated history, and responsive accessible gameplay.

**Architecture:** Keep Chess/Xiangqi/Shogi/Jungle inside the existing rectangular `GameVariant`/AI abstractions. Aeroplane uses a dedicated logical path engine under `apps/web/src/lib/aeroplane/`; a new `GameId` handles app/history identity, and the existing `opponentEngineId` path records `aeroplane-trio-v1` as unrated. Recovery restores validated authoritative snapshots directly; action-log replay is an isolated developer diagnostic required by HPA-391, not a recovery gate.

**Tech Stack:** TypeScript 5.9, Bun 1.3.6, Astro 4, React 18, Tailwind CSS, Bun test, Hono, Zod 4, Drizzle ORM/SQLite/D1, Playwright.

## Global Constraints

- HPA-391 is normative; use `docs/superpowers/specs/2026-08-08-hpa-391-aeroplane-chess-design.md` for clarified implementation choices.
- Do not add Aeroplane to `GAME_CONFIGS`, strategy state/piece maps, LLM move adapters, rule guardians, or `@procyon/game-core`.
- Do not create a generic race-game/Ludo framework.
- Gameplay/dice/AI/recovery must work without sign-in, provider configuration, or network access.
- Use separate serializable immutable RNG streams for dice and AI. UI timing/chatter consumes neither.
- Rules use logical positions only; render coordinates never determine legality.
- Apply each move to authoritative state exactly once before animation/chatter/history presentation.
- Classic: launch 6, extra turn 6, exact finish, target 4, Fair Dice, stacking/blockades off.
- Quick & Chill: launch 5/6, extra turn 6, bounce finish, target 2, Relaxed Dice, stacking/blockades off.
- Enabling blockades forces stacking on; disabling stacking forces blockades off.
- Red always starts. Turn order is red → yellow → blue → green.
- AI seats are assigned clockwise after the human as Cautious → Aggressive → Unpredictable and persisted once the match starts.
- Captures occur only at the final shared endpoint after the full automatic jump/flight chain.
- Aeroplane terminal history status is `win | loss`; `draw` is invalid.
- Provider-generated chatter is deferred; local personality lines satisfy this slice.
- Existing rated LLM strategy games and unrated Stockfish games must remain behaviorally unchanged.
- Replay/checksum is diagnostic only. Restore never replays a match to decide whether a valid snapshot can load.

## Risks and gates

| Risk | Why it matters | Gate |
| --- | --- | --- |
| Rating-path regression during `chessId → gameId` rename | Existing LLM games are rated and Stockfish is deliberately unrated | Task 7 must keep all existing API/hook/rating tests green before any Aeroplane API support lands |
| Duplicate non-idempotent history POST | A network ambiguity can create duplicate rows if retried blindly | Task 9 uses one-shot per-match save state; unit test and E2E assert exactly one POST |
| Blockade path semantics | Crossing/landing rules affect engine, AI, preview, and E2E | Task 2 table tests cover base path, +4 jump path, flight entrance/exit, stack split, and third-plane rejection before UI work |
| Seating/first-player drift | AI identity/history/E2E must agree for all human colours | Task 3 table locks all four seat assignments and red-first initialization |
| Replay becoming a second recovery engine | Doubles state reconstruction logic and failure modes | Task 5 test proves valid snapshot restore succeeds without invoking replay; replay has its own explicit API/tests |
| DEV fixture leaking into production | Test-only state injection must never be a product feature | Task 6 reads query/global fixture only behind `import.meta.env.DEV`; normal production path ignores both |
| Hard E2E paths depending on random play | Jump/blockade/near-win scenarios become slow/flaky | Task 6 defines one fixture contract; Task 10 uses injected fixtures rather than long random games |

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

### New UI/test files

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

History changes are intentionally split into two migrations:

```text
apps/api/drizzle/0011_hpa391_game_id.sql
apps/api/drizzle/0012_hpa391_aeroplane_history.sql
```

Drizzle also updates the corresponding `meta/*_snapshot.json` and `meta/_journal.json` files. The exact generated filenames may include Drizzle's suffix; inspect generated SQL rather than hand-writing a parallel migration.

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
- Produces `GameId = GameVariant | 'aeroplane'` and `Accent = GameId | 'brass'`.
- Preserves four-value `GameVariant` as the only key accepted by `GAME_CONFIGS` and strategy AI maps.
- Selector models own explicit `href`; display text never controls routing.

- [ ] **Step 1: Write the selector test first**

```ts
import { describe, expect, test } from 'bun:test';
import { render } from '@testing-library/react';
import { setupReactDom } from '../test/reactSetup';
import ChessGameSelector from './ChessGameSelector';

setupReactDom();

describe('ChessGameSelector', () => {
  test('links all five games explicitly', () => {
    const { getByRole } = render(<ChessGameSelector />);

    expect(
      getByRole('link', { name: /play standard chess/i }).getAttribute('href')
    ).toBe('/chess');
    expect(
      getByRole('link', { name: /play chinese chess/i }).getAttribute('href')
    ).toBe('/xiangqi');
    expect(
      getByRole('link', { name: /play japanese chess/i }).getAttribute('href')
    ).toBe('/shogi');
    expect(
      getByRole('link', { name: /play jungle chess/i }).getAttribute('href')
    ).toBe('/jungle');
    expect(
      getByRole('link', { name: /play aeroplane chess/i }).getAttribute('href')
    ).toBe('/aeroplane');
  });
});
```

- [ ] **Step 2: Run the failing test**

```bash
cd apps/web
bun test src/components/ChessGameSelector.test.tsx
```

Expected: FAIL because Aeroplane and link-based routing do not exist.

- [ ] **Step 3: Add `GameId` without widening `GameVariant`**

```ts
// apps/web/src/lib/game-id.ts
import type { GameVariant } from './ai/game-variant-types';

export type GameId = GameVariant | 'aeroplane';
export type Accent = GameId | 'brass';
```

Remove only `Accent` from `game-variant-types.ts`. Update `Panel` and `PageHeader` to import `Accent` from `game-id.ts`. Keep all strategy unions/maps unchanged.

- [ ] **Step 4: Generalize the card and selector**

```bash
git mv apps/web/src/components/ChessGameCard.tsx apps/web/src/components/GameCard.tsx
```

Use this card contract:

```ts
interface GameCardProps {
  title: string;
  description: string;
  gameId: GameId;
  href: string;
  preview: React.ReactNode;
}
```

Render an `<a>` styled with the already-exported `buttonVariants` from `ui/Button.tsx`; do not nest a `<button>` inside an anchor. `ChessGameSelector` becomes a typed five-entry data array. Existing four entries render `ChessBoardPreview`; Aeroplane renders `AeroplaneBoardPreview`.

- [ ] **Step 5: Add page-level accent/route plumbing**

Add Tailwind:

```js
aeroplane: { DEFAULT: '#4F8FD8' },
```

Create:

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

The temporary `AeroplaneGame` shell renders the page title only; Task 6 replaces it.

- [ ] **Step 6: Verify**

```bash
cd apps/web
bun test src/components/ChessGameSelector.test.tsx
bun run typecheck
```

Expected: PASS. A deliberate `GAME_CONFIGS.aeroplane` access must still fail TypeScript compilation.

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
- Produces `AeroplaneConfig`, `PlaneState`, `AeroplanePosition`, `AeroplaneEvent`, `ResolvedMove`.
- Produces `toGlobalTrackIndex`, `toPosition`, `resolveLegalMove`, `getLegalMoves`, `applyResolvedMove`.
- Rule modules import no React or render-coordinate module.
- Captures are final-endpoint-only.

- [ ] **Step 1: Define base types and failing topology tests**

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

Test:

```ts
expect(toGlobalTrackIndex('red', 1)).toBe(0);
expect(toGlobalTrackIndex('yellow', 1)).toBe(13);
expect(toGlobalTrackIndex('blue', 1)).toBe(26);
expect(toGlobalTrackIndex('green', 1)).toBe(39);
expect(toGlobalTrackIndex('green', 14)).toBe(0);
expect(isFlightEntrance(18)).toBe(true);
expect(isNormalJumpSquare(14)).toBe(true);
expect(isNormalJumpSquare(18)).toBe(false);
expect(toPosition('red', 51)).toEqual({
  kind: 'home',
  color: 'red',
  progress: 51,
  homeIndex: 0,
});
expect(toPosition('red', 56)).toEqual({ kind: 'finished', color: 'red' });
```

- [ ] **Step 2: Verify topology test fails**

```bash
cd apps/web
bun test src/lib/aeroplane/topology.test.ts
```

Expected: FAIL because the module/functions do not exist.

- [ ] **Step 3: Implement colour-symmetric topology**

```ts
export const TURN_ORDER = ['red', 'yellow', 'blue', 'green'] as const;
export const START_OFFSET = {
  red: 0,
  yellow: 13,
  blue: 26,
  green: 39,
} as const;
export const SHARED_PROGRESS_MAX = 50;
export const FINISH_PROGRESS = 56;
export const FLIGHT_ENTRANCE_PROGRESS = 18;
export const FLIGHT_EXIT_PROGRESS = 30;
```

Normal jump rule: shared progress where `progress % 4 === 2`, `progress + 4 <= 50`, excluding progress `18` because that node is the dedicated flight entrance.

- [ ] **Step 4: Write movement-chain tests before implementation**

```ts
test('launch requires allowed roll and empty launch pad', () => {
  const state = stateWithPlane('red-0', null);
  expect(resolveLegalMove(state, 'red-0', 5)).toBeNull();
  expect(resolveLegalMove(state, 'red-0', 6)?.finalEndpoint).toEqual({
    kind: 'launch',
    color: 'red',
  });

  const occupied = stateWithPlanes([
    ['red-0', null],
    ['red-1', 0],
  ]);
  expect(resolveLegalMove(occupied, 'red-0', 6)).toBeNull();
});

test('normal jump can feed the long flight', () => {
  const move = resolveLegalMove(stateWithPlane('red-0', 12), 'red-0', 2);
  expect(move?.baseEndpoint).toMatchObject({ kind: 'track', progress: 14 });
  expect(move?.finalEndpoint).toMatchObject({ kind: 'track', progress: 30 });
  expect(move?.events.map(event => event.type)).toEqual([
    'move',
    'jump',
    'flight',
  ]);
});

test('direct flight entrance also flies', () => {
  expect(
    resolveLegalMove(stateWithPlane('red-0', 16), 'red-0', 2)?.finalEndpoint
  ).toMatchObject({ kind: 'track', progress: 30 });
});

test('exact rejects overshoot and bounce reflects it', () => {
  expect(
    resolveLegalMove(
      stateWithPlane('red-0', 54, { finishRule: 'exact' }),
      'red-0',
      3
    )
  ).toBeNull();
  expect(
    resolveLegalMove(
      stateWithPlane('red-0', 54, { finishRule: 'bounce' }),
      'red-0',
      3
    )?.finalEndpoint
  ).toMatchObject({ kind: 'home', progress: 55 });
});
```

- [ ] **Step 5: Lock final-endpoint-only capture semantics**

```ts
test('jump-flight chain captures only at final endpoint', () => {
  const state = stateWithPlanes([
    ['red-0', 12],
    ['yellow-0', globalTrackProgressFor('yellow', globalIndexOf('red', 14))],
    ['blue-0', globalTrackProgressFor('blue', globalIndexOf('red', 18))],
    ['green-0', globalTrackProgressFor('green', globalIndexOf('red', 30))],
  ]);

  const move = resolveLegalMove(state, 'red-0', 2)!;
  expect(move.finalEndpoint).toMatchObject({ kind: 'track', progress: 30 });
  expect(move.capturedPlaneIds).toEqual(['green-0']);
});

test('plain landing captures every enemy plane on the final shared node', () => {
  const state = sharedCaptureFixture({ enemyCount: 2, stacking: true });
  const move = resolveLegalMove(state, 'red-0', 3)!;
  expect(move.capturedPlaneIds.sort()).toEqual(['blue-0', 'blue-1']);
});
```

Helper fixtures should construct equivalent global nodes through topology helpers; do not hand-code screen coordinates.

- [ ] **Step 6: Lock stacking/blockade path cases**

Use table-driven tests:

```ts
for (const scenario of [
  { name: 'stacking off rejects friendly final occupancy', kind: 'friendly-end' },
  { name: 'stacking on allows second plane', kind: 'friendly-stack' },
  { name: 'blockade rejects crossing on base path', kind: 'base-cross' },
  { name: 'blockade rejects landing', kind: 'blockade-end' },
  { name: 'jump segment cannot cross blockade', kind: 'jump-cross' },
  { name: 'flight checks entrance and exit but not skipped ring nodes', kind: 'flight' },
  { name: 'plane may leave its own blockade', kind: 'leave-own' },
  { name: 'existing two-plane blockade rejects a third friendly plane', kind: 'third-plane' },
] as const) {
  test(scenario.name, () => {
    expect(runBlockadeScenario(scenario.kind)).toBe(true);
  });
}
```

Add private-home collision and launch/home non-capture cases in the same test file.

- [ ] **Step 7: Implement one resolver**

`resolveLegalMove` performs, in order: ownership/finished guard → launch case → exact/bounce base progress → base blockade traversal → +4 normal jump → flight at progress 18 → final occupancy → captured ids/events. It never mutates input.

`getLegalMoves` calls the resolver for every current-player plane. `applyResolvedMove` consumes an analyzer-produced move and immutably updates affected planes/stats. The UI/controller must not reproduce movement math.

- [ ] **Step 8: Verify and commit**

```bash
cd apps/web
bun test src/lib/aeroplane/topology.test.ts src/lib/aeroplane/rules.test.ts

git add src/lib/aeroplane/types.ts src/lib/aeroplane/topology.ts src/lib/aeroplane/rules.ts src/lib/aeroplane/topology.test.ts src/lib/aeroplane/rules.test.ts
git commit -m "feat(aeroplane): add path rules engine"
```

---

## Task 3: Add deterministic seats, match initialization, turns, and dice

**Files:**
- Create: `apps/web/src/lib/aeroplane/rng.ts`
- Create: `apps/web/src/lib/aeroplane/dice.ts`
- Create: `apps/web/src/lib/aeroplane/game.ts`
- Create: `apps/web/src/lib/aeroplane/rng.test.ts`
- Create: `apps/web/src/lib/aeroplane/dice.test.ts`
- Create: `apps/web/src/lib/aeroplane/game.test.ts`
- Modify: `apps/web/src/lib/aeroplane/types.ts`

**Interfaces:**
- Produces immutable `RngState`, `nextUint32`, `deriveRngStreams`.
- Produces `seatAIs`, `createAeroplaneMatch`, `normalizeConfig`, `rollTurn`, `playResolvedMove`.
- New matches always start with red.
- Resolved seats are part of the active match model and later persistence.

- [ ] **Step 1: Write immutable RNG tests**

```ts
test('nextUint32 is deterministic and does not mutate input', () => {
  const input = { value: 123456789 };
  const before = structuredClone(input);
  const first = nextUint32(input);
  const second = nextUint32({ value: 123456789 });

  expect(first).toEqual(second);
  expect(input).toEqual(before);
  expect(first.rng).not.toBe(input);
});

test('dice and AI streams are distinct for the same root seed', () => {
  const streams = deriveRngStreams(39101);
  expect(streams.dice).not.toEqual(streams.ai);
});
```

Implement a zero-state guard because xorshift32 cannot advance from zero:

```ts
function normalizeRngValue(value: number): number {
  const normalized = value >>> 0;
  return normalized === 0 ? 0x6d2b79f5 : normalized;
}
```

- [ ] **Step 2: Lock seat assignment and first player**

```ts
const seatCases = [
  ['red', [['yellow', 'cautious'], ['blue', 'aggressive'], ['green', 'unpredictable']]],
  ['yellow', [['blue', 'cautious'], ['green', 'aggressive'], ['red', 'unpredictable']]],
  ['blue', [['green', 'cautious'], ['red', 'aggressive'], ['yellow', 'unpredictable']]],
  ['green', [['red', 'cautious'], ['yellow', 'aggressive'], ['blue', 'unpredictable']]],
] as const;

for (const [humanColor, expected] of seatCases) {
  test(`seats AIs clockwise when human is ${humanColor}`, () => {
    expect(seatAIs(humanColor).map(seat => [seat.color, seat.personality]))
      .toEqual(expected);
  });
}

test('red always starts regardless of human colour', () => {
  for (const humanColor of TURN_ORDER) {
    expect(createAeroplaneMatch({ ...CLASSIC_CONFIG, humanColor }, 39101).state.currentPlayer)
      .toBe('red');
  }
});
```

- [ ] **Step 3: Write Fair/Relaxed dice consumption tests**

```ts
test('fair dice consumes exactly one sample', () => {
  const rng = { value: 123 };
  const result = rollFair(rng);
  expect(result.rng).toEqual(nextUint32(rng).rng);
  expect(result.roll).toBeGreaterThanOrEqual(1);
  expect(result.roll).toBeLessThanOrEqual(6);
});

test('relaxed protection consumes exactly two samples when active', () => {
  const rng = { value: 456 };
  const result = rollRelaxed(relaxedFixtureState(), rng);
  const first = nextUint32(rng);
  const second = nextUint32(first.rng);
  expect(result.rng).toEqual(second.rng);
});

test('relaxed prefers the first candidate with a legal move', () => {
  const result = rollRelaxed(relaxedCandidateFixture(), { value: 789 });
  expect(result.roll).toBe(result.candidates.find(candidate => candidate.hasLegalMove)!.roll);
});
```

Fair mapping uses `(sample % 6) + 1`. The tiny modulo bias is accepted; do not add variable-consumption rejection sampling.

- [ ] **Step 4: Write turn/victory tests**

```ts
test('six grants another turn even when there is no legal move', () => {
  const result = rollTurn(noLegalMoveState('red'), fixedDie(6));
  expect(result.state.currentPlayer).toBe('red');
  expect(result.state.phase).toBe('awaiting-roll');
});

test('non-six advances clockwise', () => {
  const result = completeSingleMoveTurn(singleMoveState('red'), 3);
  expect(result.state.currentPlayer).toBe('yellow');
});

test('complete round increments only on green to red transition', () => {
  const state = stateAwaitingCompletion('green', { roundNumber: 2 });
  const result = completeSingleMoveTurn(state, 4);
  expect(result.state.currentPlayer).toBe('red');
  expect(result.state.roundNumber).toBe(3);
});

test('quick match finishes at two planes and has no draw path', () => {
  const result = finishSecondPlaneForRed(QUICK_CONFIG);
  expect(result.state.phase).toBe('finished');
  expect(result.state.winner).toBe('red');
});
```

Also write explicit config normalization assertions:

```ts
expect(normalizeConfig({ ...CLASSIC_CONFIG, blockades: true })).toMatchObject({
  stacking: true,
  blockades: true,
});
expect(normalizeConfig({ ...CLASSIC_CONFIG, stacking: false, blockades: true })).toMatchObject({
  stacking: true,
  blockades: true,
});
expect(normalizeConfig({ ...CLASSIC_CONFIG, stacking: false, blockades: false })).toMatchObject({
  stacking: false,
  blockades: false,
});
```

When the UI turns stacking off after blockades were on, the UI update sets both `stacking=false` and `blockades=false` before normalization.

- [ ] **Step 5: Implement turn/preset logic**

`createAeroplaneMatch` normalizes config, creates 16 hangar planes, calls `seatAIs`, derives both RNG streams, sets `currentPlayer='red'`, and initializes counters.

`rollTurn` consumes the configured dice policy and derives legal moves. Zero legal moves complete the skip inside the roll action; one-or-more leave `phase='awaiting-choice'`. Update `noMoveStreak` from the legal count. Update `lastPlaceRounds` only when a non-six turn advances green→red.

Progress score:

```ts
finishedPlanes * 1000 + sum(activePlaneProgress)
```

- [ ] **Step 6: Verify and commit**

```bash
cd apps/web
bun test src/lib/aeroplane/rng.test.ts src/lib/aeroplane/dice.test.ts src/lib/aeroplane/game.test.ts src/lib/aeroplane/rules.test.ts

git add src/lib/aeroplane/rng.ts src/lib/aeroplane/dice.ts src/lib/aeroplane/game.ts src/lib/aeroplane/rng.test.ts src/lib/aeroplane/dice.test.ts src/lib/aeroplane/game.test.ts src/lib/aeroplane/types.ts
git commit -m "feat(aeroplane): add deterministic seats turns and dice"
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
- Uses the persisted seat personality; it never derives personality from colour.

- [ ] **Step 1: Write representative scenario tests**

```ts
test('cautious prefers home entry over an exposed minor capture', () => {
  const result = chooseAiMove(
    cautiousFixture.state,
    cautiousFixture.moves,
    'cautious',
    { value: 7 }
  );
  expect(result.move.planeId).toBe('red-home-runner');
});

test('aggressive prefers a multi-plane capture over quiet progress', () => {
  const result = chooseAiMove(
    aggressiveFixture.state,
    aggressiveFixture.moves,
    'aggressive',
    { value: 7 }
  );
  expect(result.move.planeId).toBe('red-capturer');
});

test('all personalities take a guaranteed finish', () => {
  for (const personality of ['cautious', 'aggressive', 'unpredictable'] as const) {
    expect(
      chooseAiMove(finishFixture.state, finishFixture.moves, personality, { value: 7 }).move.planeId
    ).toBe('red-finisher');
  }
});

test('same state and seed repeats exactly', () => {
  const first = chooseAiMove(unpredictableFixture.state, unpredictableFixture.moves, 'unpredictable', { value: 391 });
  const second = chooseAiMove(unpredictableFixture.state, unpredictableFixture.moves, 'unpredictable', { value: 391 });
  expect(first).toEqual(second);
});
```

- [ ] **Step 2: Test legal-only behavior with advanced rules**

```ts
for (const fixture of advancedRuleFixtures) {
  for (const personality of ['cautious', 'aggressive', 'unpredictable'] as const) {
    test(`${personality} selects legal move in ${fixture.name}`, () => {
      const legalIds = new Set(fixture.moves.map(move => move.planeId));
      const result = chooseAiMove(fixture.state, fixture.moves, personality, { value: 99 });
      expect(legalIds.has(result.move.planeId)).toBe(true);
    });
  }
}
```

Fixtures include stacking off, stacking on, blockade exit, home collision, direct flight, and jump→flight.

- [ ] **Step 3: Implement fixed feature weights**

Use the design table verbatim. Features: finish, home entry, capture count, jump, flight, launch, formed blockade, progress gain, immediate capture exposure.

Exposure is calculated from the resulting public position by trying opponent plane + die values 1–6 through `resolveLegalMove`; count threats whose `capturedPlaneIds` contains the moved plane. It consumes no RNG.

Cautious/Aggressive consume AI RNG only to break a top-score tie. Unpredictable consumes one sample per legal move for jitter `[-120, 120]`, plus one sample only if a final tie remains.

- [ ] **Step 4: Verify and commit**

```bash
cd apps/web
bun test src/lib/aeroplane/ai.test.ts src/lib/aeroplane/rules.test.ts

git add src/lib/aeroplane/ai.ts src/lib/aeroplane/ai.test.ts src/lib/aeroplane/types.ts
git commit -m "feat(aeroplane): add personality opponents"
```

---

## Task 5: Add versioned recovery and isolated replay diagnostics

**Files:**
- Create: `apps/web/src/lib/aeroplane/checksum.ts`
- Create: `apps/web/src/lib/aeroplane/persistence.ts`
- Create: `apps/web/src/lib/aeroplane/replay.ts`
- Create: `apps/web/src/lib/aeroplane/persistence.test.ts`
- Create: `apps/web/src/lib/aeroplane/replay.test.ts`
- Modify: `apps/web/src/lib/aeroplane/types.ts`

**Interfaces:**
- `saveActiveMatch`, `restoreActiveMatch`, `clearActiveMatch` restore authoritative snapshots directly.
- `checksumState(state): string` is deterministic but non-cryptographic.
- `replayMatch(persisted): ReplayResult` is called only by DEV/tests, never by restore.
- Key: `procyon:aeroplane:active-match:v1`.

- [ ] **Step 1: Define the minimal persisted shape**

```ts
export interface PersistedAeroplaneMatchV1 {
  version: 1;
  savedAt: string;
  rootSeed: number;
  config: AeroplaneConfig;
  state: AeroplaneState;
  seats: AiSeat[];
  diceRng: RngState;
  aiRng: RngState;
  actions: AeroplaneActionRecord[];
}

export type AeroplaneActionRecord =
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

Do not add per-action state snapshots, cryptographic signatures, or replay caches.

- [ ] **Step 2: Write snapshot recovery tests first**

```ts
test('valid pending-choice snapshot restores exact state seats and RNG', () => {
  const saved = validPendingChoiceSave();
  storage.setItem(ACTIVE_MATCH_KEY, JSON.stringify(saved));

  const restored = restoreActiveMatch(storage, sessionStorageStub);
  expect(restored.kind).toBe('ok');
  if (restored.kind !== 'ok') throw new Error('expected ok restore');
  expect(restored.match.state).toEqual(saved.state);
  expect(restored.match.seats).toEqual(saved.seats);
  expect(restored.match.diceRng).toEqual(saved.diceRng);
  expect(restored.match.aiRng).toEqual(saved.aiRng);
});

test('restore continues the exact next die and AI sample', () => {
  const saved = validPendingChoiceSave();
  const restored = restoreFixture(saved);
  expect(nextUint32(restored.diceRng)).toEqual(nextUint32(saved.diceRng));
  expect(nextUint32(restored.aiRng)).toEqual(nextUint32(saved.aiRng));
});

test('unknown version is preserved for session diagnostics and cleared', () => {
  const raw = JSON.stringify({ version: 99 });
  storage.setItem(ACTIVE_MATCH_KEY, raw);
  const result = restoreActiveMatch(storage, sessionStorageStub);
  expect(result.kind).toBe('corrupt');
  expect(sessionStorageStub.getItem(CORRUPT_SAVE_KEY)).toBe(raw);
  expect(storage.getItem(ACTIVE_MATCH_KEY)).toBeNull();
});
```

Write explicit invalid invariant cases for 15/17 planes, duplicate plane ids, progress outside `null | 0..56`, duplicate/missing personality seat, invalid pending roll, winner/phase mismatch, and zero/out-of-range RNG state.

- [ ] **Step 3: Implement lightweight runtime validation**

Validation checks only the authoritative snapshot and action-record shapes. It does **not** re-execute action history. Storage exceptions return a non-fatal error result.

Corrupt payload behavior:

```ts
sessionStorage.setItem('procyon:aeroplane:corrupt-save', raw);
localStorage.removeItem('procyon:aeroplane:active-match:v1');
return { kind: 'corrupt', reason };
```

- [ ] **Step 4: Write replay diagnostic tests**

```ts
test('replay reproduces rolls choices events and final checksum', () => {
  const result = replayMatch(recordedMatch);
  expect(result.kind).toBe('ok');
  if (result.kind !== 'ok') throw new Error('expected ok replay');
  expect(result.finalChecksum).toBe(recordedMatch.actions.at(-1)!.checksum);
});

test('replay reports mismatch when a recorded action changes', () => {
  const changed = structuredClone(recordedMatch);
  const moveIndex = changed.actions.findIndex(action => action.kind === 'move');
  const move = changed.actions[moveIndex];
  if (!move || move.kind !== 'move') throw new Error('move fixture missing');
  changed.actions[moveIndex] = { ...move, selectedPlaneId: 'red-0' };
  expect(replayMatch(changed).kind).toBe('mismatch');
});

test('valid snapshot restore is not gated by replay checksum mismatch', () => {
  const changed = structuredClone(recordedMatch);
  changed.actions[0] = { ...changed.actions[0], checksum: '00000000' };
  const result = restoreFixture(changed);
  expect(result.kind).toBe('ok');
});
```

- [ ] **Step 5: Implement checksum/replay**

Canonical serialization sorts record keys and planes by id and excludes timestamps/presentation state. Use a small FNV-1a helper for a stable 32-bit hexadecimal checksum; document that it is diagnostics only.

Replay starts from persisted root seed/config/seats and calls the real `rollTurn`, `chooseAiMove`, and `playResolvedMove`. At each action compare recorded roll, selected plane when present, events, and resulting checksum. Return the first mismatch with action index/reason; never mutate the persisted object.

- [ ] **Step 6: Verify and commit**

```bash
cd apps/web
bun test src/lib/aeroplane/persistence.test.ts src/lib/aeroplane/replay.test.ts src/lib/aeroplane/dice.test.ts src/lib/aeroplane/ai.test.ts

git add src/lib/aeroplane/checksum.ts src/lib/aeroplane/persistence.ts src/lib/aeroplane/replay.ts src/lib/aeroplane/persistence.test.ts src/lib/aeroplane/replay.test.ts src/lib/aeroplane/types.ts
git commit -m "feat(aeroplane): add recovery and replay diagnostics"
```

---

## Task 6: Build the match controller, accessible board UI, and DEV/E2E fixture hook

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
- Hook exposes authoritative state + seats + derived legal moves + presentation actions.
- Board receives logical state/`ResolvedMove` preview and callbacks; no dice/AI/storage imports.
- `layout.ts` is render-only and no domain rule module imports it.
- DEV overrides are read once during match initialization and ignored outside `import.meta.env.DEV`.

- [ ] **Step 1: Write controller tests with fake timers/injected storage**

```ts
test('one legal human move auto-applies without prompting', async () => {
  const match = createHookHarness(oneLegalHumanMoveFixture());
  match.roll();
  await match.flushPresentation();
  expect(match.state().phase).toBe('awaiting-roll');
  expect(match.state().planes.find(p => p.id === 'red-0')?.progress).toBe(1);
});

test('multiple legal human moves wait for selection', () => {
  const match = createHookHarness(twoLegalHumanMovesFixture());
  match.roll();
  expect(match.state().phase).toBe('awaiting-choice');
  expect(match.legalMoves()).toHaveLength(2);
});

test('AI presentation delay consumes no gameplay RNG', () => {
  const match = createHookHarness(aiTurnFixture());
  const before = match.aiRng();
  match.advanceTime(400);
  expect(match.aiRng()).toEqual(before);
});

test('skip animations is idempotent', () => {
  const match = createHookHarness(animatedMoveFixture());
  match.skipAnimations();
  const once = match.state();
  match.skipAnimations();
  expect(match.state()).toEqual(once);
});
```

Also test stale AI timer cancellation on reset/unmount, save after pending-choice roll, resume/new match, red-first AI turn when human is not red, and persisted seats unchanged on resume.

- [ ] **Step 2: Implement render-only anchors**

`layout.ts` provides normalized `{x,y}` anchors for 52 track nodes, four launch pads, 16 hangar slots, four six-position home paths, flight guides, and stack offsets. Generate rotations from one quadrant or declare constants; tests assert counts/symmetry only.

- [ ] **Step 3: Define and test the DEV fixture contract before using it**

Inside `useAeroplaneMatch.ts`, export the type but read it only behind DEV:

```ts
export interface AeroplaneE2EFixture {
  seed?: number;
  config?: AeroplaneConfig;
  state?: AeroplaneState;
  seats?: AiSeat[];
  diceRng?: RngState;
  aiRng?: RngState;
  skipAnimations?: boolean;
}
```

Resolution precedence in DEV:

```text
window.__PROCYON_AEROPLANE_FIXTURE__.seed
→ ?e2eSeed=<uint32>
→ normal generated seed
```

A supplied fixture state/seats/RNG must pass the same invariant helpers as persistence. Invalid fixtures are ignored with a DEV console warning. When a fixture or `e2eSeed` is active, `skipAnimations` defaults to `true` unless the fixture explicitly supplies `false`.

Test:

```ts
test('DEV fixture wins over e2eSeed and defaults animations skipped', () => {
  const overrides = readDevOverrides({
    dev: true,
    search: '?e2eSeed=12',
    fixture: { seed: 34 },
  });
  expect(overrides.seed).toBe(34);
  expect(overrides.skipAnimations).toBe(true);
});

test('non-DEV ignores query and window fixture', () => {
  expect(readDevOverrides({
    dev: false,
    search: '?e2eSeed=12',
    fixture: { seed: 34 },
  })).toEqual({});
});
```

- [ ] **Step 4: Implement `useAeroplaneMatch` orchestration**

Own only editable setup, frozen active config/seats/root seed, restore prompt, calls to pure engine/dice/AI, 650 ms skippable AI presentation delay, animation overlay queue, event feed, persistence, DEV fixture read, and timer generation token.

Commit authoritative move state and action-history record before starting visual route animation. `skipAnimations()` clears timers/overlay only.

- [ ] **Step 5: Write component interaction tests**

```ts
test('Classic is default and Quick applies exact preset', async () => {
  const ui = renderAeroplaneGame();
  expect(ui.getByText(/classic match/i)).toBeDefined();
  await ui.click(ui.getByRole('button', { name: /quick & chill/i }));
  expect(ui.getByLabelText(/victory/i)).toHaveValue('2');
  expect(ui.getByLabelText(/dice/i)).toHaveValue('relaxed');
});

test('turning blockades on enables stacking and turning stacking off disables blockades', async () => {
  const ui = renderAeroplaneGame();
  await ui.click(ui.getByLabelText(/blockades/i));
  expect(ui.getByLabelText(/stacking/i)).toBeChecked();
  await ui.click(ui.getByLabelText(/stacking/i));
  expect(ui.getByLabelText(/blockades/i)).not.toBeChecked();
});
```

Add keyboard Enter/Space selection, coarse-pointer two-activation preview, mobile event-feed collapse control, legal-plane pulse only during human multi-choice, and repeated animation skip leaving final plane location unchanged.

- [ ] **Step 6: Build components**

`AeroplaneSetup`: presets, victory, dice, launch, finish, stacking, blockades, human colour, chatter.

`AeroplaneBoard`: SVG from `layout.ts`, plane controls with visible focus and accessible labels such as:

```text
Red plane 2, track position 14. Legal move: jump and long flight to position 30.
```

Hover/focus draws the full resolved route. Coarse pointer first activation previews and second activation on the same legal plane applies.

`AeroplaneStatus`: current turn/die below board; compact sticky strip on narrow screens.

`AeroplaneEventFeed`: compact event list; collapsible on narrow screens.

- [ ] **Step 7: Verify and commit**

```bash
cd apps/web
bun test src/hooks/useAeroplaneMatch.test.ts src/components/aeroplane/AeroplaneGame.test.tsx
bun run typecheck

git add src/lib/aeroplane/layout.ts src/hooks/useAeroplaneMatch.ts src/hooks/useAeroplaneMatch.test.ts src/components/AeroplaneGame.tsx src/components/aeroplane
git commit -m "feat(aeroplane): add playable local match UI"
```

---

## Task 7: Rename generic play history to `gameId` without changing existing rating behavior

**Files:**
- Modify: `apps/api/src/constants/game.ts`
- Modify: `apps/api/src/constants/game.test.ts`
- Modify: `apps/api/src/db/schema.ts`
- Modify: `apps/api/src/db/schema.test.ts`
- Modify: `apps/api/src/routes/play-history.ts`
- Modify: `apps/api/src/routes/play-history.test.ts`
- Modify: `apps/api/src/routes/play-history.pvp-security.test.ts`
- Generate: next Drizzle migration for `chess_id` → `game_id`
- Create: `apps/web/src/lib/play-history.ts`
- Modify: `apps/web/src/hooks/usePlayHistory.ts`
- Modify: `apps/web/src/hooks/usePlayHistory.test.ts`
- Modify: `apps/web/src/components/PlayHistoryPage.tsx`
- Modify: `apps/web/src/components/PlayHistoryPage.test.tsx`

**Interfaces:**
- This task does **not** accept Aeroplane in the API yet.
- API payload/response field becomes `gameId` for existing four strategy games.
- `getRatedVariantId` makes the rating conversion explicit.
- Web `submitPlayHistory` centralizes request construction while lifecycle retry policy stays in `usePlayHistory`.

- [ ] **Step 1: Write regression tests for the rename before changing implementation**

Update existing request fixtures from `chessId` to `gameId` and add:

```ts
test('LLM strategy game still receives a rating update after gameId rename', async () => {
  const response = await postHistory({
    gameId: 'chess',
    status: 'win',
    date: NOW,
    opponentLlmId: 'gpt-4o',
  });
  expect(response.status).toBe(201);
  expect((await response.json()).ratingUpdate).not.toBeNull();
});

test('Stockfish strategy game remains unrated after gameId rename', async () => {
  const response = await postHistory({
    gameId: 'chess',
    status: 'win',
    date: NOW,
    opponentEngineId: 'stockfish',
  });
  expect(response.status).toBe(201);
  expect((await response.json()).ratingUpdate).toBeNull();
});
```

At this stage `gameId: 'aeroplane'` must still fail validation.

- [ ] **Step 2: Verify tests fail on the old contract**

```bash
cd apps/api
bun test src/routes/play-history.test.ts src/routes/play-history.pvp-security.test.ts src/constants/game.test.ts src/db/schema.test.ts
```

Expected: FAIL because API still expects `chessId`.

- [ ] **Step 3: Add generic identity and explicit rated conversion for existing games**

Start `GameId` with the existing four API-supported values in this task:

```ts
export enum GameId {
  Chess = 'chess',
  Xiangqi = 'xiangqi',
  Shogi = 'shogi',
  Jungle = 'jungle',
}

export function getRatedVariantId(gameId: GameId): ChessVariantId {
  switch (gameId) {
    case GameId.Chess:
      return ChessVariantId.Chess;
    case GameId.Xiangqi:
      return ChessVariantId.Xiangqi;
    case GameId.Shogi:
      return ChessVariantId.Shogi;
    case GameId.Jungle:
      return ChessVariantId.Jungle;
  }
}
```

The function becomes nullable when Task 8 adds Aeroplane.

- [ ] **Step 4: Rename DB/API field and generate the first migration**

Schema:

```ts
gameId: text('game_id').$type<GameId>().notNull(),
```

Route request:

```ts
gameId: z.nativeEnum(GameId),
```

Use `body.gameId` everywhere play history previously used `body.chessId`. Convert rating input only through:

```ts
variantId: getRatedVariantId(body.gameId),
```

Generate:

```bash
cd apps/api
bunx drizzle-kit generate --config=drizzle.config.dev.ts --name hpa391_game_id
```

Inspect generated SQL. The intended data change is the column rename only:

```sql
ALTER TABLE `play_history` RENAME COLUMN `chess_id` TO `game_id`;
```

Do not hand-write a second migration if Drizzle already generated the rename.

- [ ] **Step 5: Extract the web POST helper and update strategy callers**

```ts
// apps/web/src/lib/play-history.ts
export interface SubmitPlayHistoryInput {
  gameId: GameId;
  status: 'win' | 'loss' | 'draw';
  date: string;
  opponentLlmId?: OpponentLlmId;
  opponentEngineId?: OpponentEngineId;
  details?: unknown;
}

export async function submitPlayHistory(
  input: SubmitPlayHistoryInput,
  fetchImpl: typeof fetch = fetch
): Promise<Response> {
  return fetchImpl(`${env.PUBLIC_API_URL}/play-history`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    signal: AbortSignal.timeout(10_000),
    body: JSON.stringify(input),
  });
}
```

`usePlayHistory` keeps its existing savedRef/snapshot/401-retry semantics and calls `submitPlayHistory` with `gameId: snapshotGameVariant`.

Update `PlayHistoryPage` response field/label lookup from `chessId` to `gameId`; only the existing four labels are reachable in this task.

- [ ] **Step 6: Run the rating regression gate**

```bash
cd apps/api
bun test src/routes/play-history.test.ts src/routes/play-history.pvp-security.test.ts src/constants/game.test.ts src/db/schema.test.ts src/services/rating-service.db.test.ts src/routes/ratings.db.test.ts

cd ../web
bun test src/hooks/usePlayHistory.test.ts src/components/PlayHistoryPage.test.tsx
bun run typecheck
```

Expected: all existing LLM rating and Stockfish unrated behavior passes with the renamed field. Do not start Task 8 until this gate is green.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src apps/api/drizzle apps/web/src/lib/play-history.ts apps/web/src/hooks/usePlayHistory.ts apps/web/src/hooks/usePlayHistory.test.ts apps/web/src/components/PlayHistoryPage.tsx apps/web/src/components/PlayHistoryPage.test.tsx
git commit -m "refactor(history): rename chess history identity to game id"
```

---

## Task 8: Add the Aeroplane server history contract as an unrated engine game

**Files:**
- Modify: `apps/api/src/constants/game.ts`
- Modify: `apps/api/src/constants/game.test.ts`
- Create: `apps/api/src/types/play-history.ts`
- Modify: `apps/api/src/db/schema.ts`
- Modify: `apps/api/src/db/schema.test.ts`
- Modify: `apps/api/src/routes/play-history.ts`
- Modify: `apps/api/src/routes/play-history.test.ts`
- Generate: next Drizzle migration adding `details`

**Interfaces:**
- Final API `GameId` has five values.
- Final `getRatedVariantId(gameId): ChessVariantId | null` returns null only for Aeroplane.
- `OpponentEngineId` adds `aeroplane-trio-v1`.
- Aeroplane requires matching engine opponent, required details, and `win | loss` status.
- Existing strategy rows keep `details = null`.

- [ ] **Step 1: Write final Aeroplane API tests first**

Use:

```ts
const validAeroplaneDetails = {
  rulePreset: 'quick-chill',
  victoryTarget: 2,
  diceMode: 'relaxed',
  humanColor: 'red',
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

Tests:

```ts
test('Aeroplane trio result inserts history and never rates', async () => {
  const response = await postHistory({
    gameId: 'aeroplane',
    status: 'win',
    date: NOW,
    opponentEngineId: 'aeroplane-trio-v1',
    details: validAeroplaneDetails,
  });
  expect(response.status).toBe(201);
  expect((await response.json()).ratingUpdate).toBeNull();
  expect(await countRatingRows()).toBe(0);
});

test.each([
  ['LLM', { opponentLlmId: 'gpt-4o' }],
  ['Stockfish', { opponentEngineId: 'stockfish' }],
])('Aeroplane rejects %s opponent pairing', async (_name, opponent) => {
  const response = await postHistory({
    gameId: 'aeroplane',
    status: 'win',
    date: NOW,
    details: validAeroplaneDetails,
    ...opponent,
  });
  expect(response.status).toBe(400);
});

test('Aeroplane trio id is invalid for strategy game', async () => {
  const response = await postHistory({
    gameId: 'chess',
    status: 'win',
    date: NOW,
    opponentEngineId: 'aeroplane-trio-v1',
  });
  expect(response.status).toBe(400);
});

test('Aeroplane draw is invalid', async () => {
  const response = await postHistory({
    gameId: 'aeroplane',
    status: 'draw',
    date: NOW,
    opponentEngineId: 'aeroplane-trio-v1',
    details: validAeroplaneDetails,
  });
  expect(response.status).toBe(400);
});
```

Add explicit 400 tests for missing details, negative/non-integer counters, duplicate AI colour, duplicate personality, AI colour equal to human colour, and only two AI seats.

- [ ] **Step 2: Verify Aeroplane tests fail**

```bash
cd apps/api
bun test src/routes/play-history.test.ts src/constants/game.test.ts src/db/schema.test.ts
```

- [ ] **Step 3: Extend final ids/rated conversion**

```ts
export enum GameId {
  Chess = 'chess',
  Xiangqi = 'xiangqi',
  Shogi = 'shogi',
  Jungle = 'jungle',
  Aeroplane = 'aeroplane',
}

export enum OpponentEngineId {
  Stockfish = 'stockfish',
  AeroplaneTrioV1 = 'aeroplane-trio-v1',
}

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

- [ ] **Step 4: Add minimal HPA-required details type/schema**

```ts
export interface AeroplaneHistoryDetails {
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

Zod base schema:

```ts
const aeroplaneHistoryDetailsSchema = z.object({
  rulePreset: z.enum(['classic', 'quick-chill', 'custom']),
  victoryTarget: z.union([z.literal(2), z.literal(4)]),
  diceMode: z.enum(['fair', 'relaxed']),
  humanColor: z.enum(['red', 'yellow', 'blue', 'green']),
  durationSeconds: z.number().finite().int().nonnegative(),
  planesFinished: z.number().int().min(0).max(4),
  capturesMade: z.number().int().nonnegative(),
  capturesSuffered: z.number().int().nonnegative(),
  aiPlayers: z.array(z.object({
    color: z.enum(['red', 'yellow', 'blue', 'green']),
    personality: z.enum(['cautious', 'aggressive', 'unpredictable']),
  })).length(3),
});
```

Add a `superRefine` that requires three unique AI colours, three unique personalities, and no AI colour equal to `humanColor`.

- [ ] **Step 5: Add `details` column and second migration**

```ts
details: text('details', { mode: 'json' })
  .$type<AeroplaneHistoryDetails | null>(),
```

Generate:

```bash
cd apps/api
bunx drizzle-kit generate --config=drizzle.config.dev.ts --name hpa391_aeroplane_history
```

The intended new data column is nullable JSON text so existing strategy rows remain valid without backfill.

- [ ] **Step 6: Add pairing/outcome validation and rating guard**

After exactly-one-opponent validation:

```ts
if (data.gameId === GameId.Aeroplane) {
  if (data.opponentEngineId !== OpponentEngineId.AeroplaneTrioV1) {
    addIssue(ctx, 'Aeroplane requires opponentEngineId=aeroplane-trio-v1');
  }
  if (data.status === GameResultStatus.Draw) {
    addIssue(ctx, 'Aeroplane result must be win or loss');
  }
  if (!data.details) {
    addIssue(ctx, 'Aeroplane history details are required');
  }
} else if (data.opponentEngineId === OpponentEngineId.AeroplaneTrioV1) {
  addIssue(ctx, 'aeroplane-trio-v1 is only valid for Aeroplane');
}
```

Use a nested/union Zod schema if that produces cleaner typing; behavior above is normative.

Rating branch:

```ts
const ratedVariantId = getRatedVariantId(body.gameId);
const shouldRate = kind === 'llm' && ratedVariantId !== null;

if (shouldRate) {
  await updatePlayerRating({
    userId: user.userId,
    variantId: ratedVariantId,
    playHistoryId: record.id,
    gameResult: body.status,
    opponentLlmId: body.opponentLlmId ?? null,
    opponentUserId: null,
  }, tx);
}
```

Store `details` only for Aeroplane; strategy inserts use null.

- [ ] **Step 7: Run final API gate and commit**

```bash
cd apps/api
bun test src/routes/play-history.test.ts src/routes/play-history.pvp-security.test.ts src/constants/game.test.ts src/db/schema.test.ts src/services/rating-service.db.test.ts src/routes/ratings.db.test.ts
bun run typecheck

git add src drizzle
git commit -m "feat(history): record Aeroplane as unrated local game"
```

---

## Task 9: Submit Aeroplane history once and render it in the history UI

**Files:**
- Modify: `apps/web/src/lib/ai/opponent.ts`
- Modify: `apps/web/src/lib/play-history.ts`
- Modify: `apps/web/src/hooks/useAeroplaneMatch.ts`
- Modify: `apps/web/src/hooks/useAeroplaneMatch.test.ts`
- Modify: `apps/web/src/components/PlayHistoryPage.tsx`
- Modify: `apps/web/src/components/PlayHistoryPage.test.tsx`

**Interfaces:**
- Web `OpponentEngineId` adds `'aeroplane-trio-v1'`.
- Controller maps terminal winner to human `win | loss` and never submits draw.
- History submission is one-shot per active match; 5xx/network ambiguity is not retried automatically.

- [ ] **Step 1: Extend web types and helper input**

```ts
export type OpponentEngineId = 'stockfish' | 'aeroplane-trio-v1';
```

Give the helper a typed details union:

```ts
export type PlayHistoryDetails = AeroplaneHistoryDetails | null;
```

Strategy callers omit details. Aeroplane passes the exact Task 8 shape.

- [ ] **Step 2: Write one-shot save tests before wiring the controller**

```ts
test('terminal Aeroplane win submits once with trio opponent and details', async () => {
  const submissions: SubmitPlayHistoryInput[] = [];
  const match = createHookHarness(nearHumanWinFixture(), {
    isAuthenticated: true,
    submitHistory: async input => {
      submissions.push(input);
      return new Response('{}', { status: 201 });
    },
  });

  match.finishHumanMove();
  await match.flushEffects();
  await match.flushEffects();

  expect(submissions).toHaveLength(1);
  expect(submissions[0]).toMatchObject({
    gameId: 'aeroplane',
    status: 'win',
    opponentEngineId: 'aeroplane-trio-v1',
  });
});

test('AI victory submits loss and never draw', async () => {
  const submission = await finishAiVictoryAndCaptureSubmission();
  expect(submission.status).toBe('loss');
});

test('history network failure does not retry or change terminal game state', async () => {
  const match = createFailingHistoryHarness();
  match.finishHumanMove();
  await match.flushEffects();
  expect(match.historyCalls()).toBe(1);
  expect(match.state().phase).toBe('finished');
});
```

- [ ] **Step 3: Build history details from authoritative final state**

```ts
function buildAeroplaneHistoryDetails(
  match: ActiveAeroplaneMatch,
  durationSeconds: number
): AeroplaneHistoryDetails {
  const human = match.config.humanColor;
  return {
    rulePreset: match.config.rulePreset,
    victoryTarget: match.config.victoryTarget,
    diceMode: match.config.diceMode,
    humanColor: human,
    durationSeconds,
    planesFinished: countFinished(match.state, human),
    capturesMade: match.state.stats[human].capturesMade,
    capturesSuffered: match.state.stats[human].capturesSuffered,
    aiPlayers: match.seats,
  };
}
```

Freeze `startedAt` when the active match begins/resumes. Duration uses wall-clock presentation time and is not part of gameplay determinism.

Use a per-match generation/saved ref so rerenders, animation completion, chatter, or auth changes cannot send the same terminal result twice.

- [ ] **Step 4: Add history-page label tests**

```ts
test('renders Aeroplane trio as unrated Aeroplane Chess', async () => {
  mockHistoryResponse([{
    id: 3,
    gameId: 'aeroplane',
    date: new Date().toISOString(),
    status: 'win',
    opponentUserId: null,
    opponentLlmId: null,
    opponentEngineId: 'aeroplane-trio-v1',
    details: validAeroplaneDetails,
    ratingChange: null,
    newRating: null,
  }]);

  const { getByText } = render(<PlayHistoryPage />);
  await waitFor(() => expect(getByText('Aeroplane Chess')).toBeDefined());
  expect(getByText('Aeroplane AI trio')).toBeDefined();
  expect(getByText('Unrated')).toBeDefined();
});
```

Stockfish continues to render `On-device rival`; legacy/rated LLM rows keep existing labels.

- [ ] **Step 5: Verify and commit**

```bash
cd apps/web
bun test src/hooks/useAeroplaneMatch.test.ts src/hooks/usePlayHistory.test.ts src/components/PlayHistoryPage.test.tsx
bun run typecheck

git add src/lib/ai/opponent.ts src/lib/play-history.ts src/hooks/useAeroplaneMatch.ts src/hooks/useAeroplaneMatch.test.ts src/components/PlayHistoryPage.tsx src/components/PlayHistoryPage.test.tsx
git commit -m "feat(aeroplane): save unrated play history"
```

---

## Task 10: Add local chatter and deterministic E2E coverage

**Files:**
- Create: `apps/web/src/lib/aeroplane/chatter.ts`
- Create: `apps/web/src/lib/aeroplane/chatter.test.ts`
- Modify: `apps/web/src/hooks/useAeroplaneMatch.ts`
- Modify: `apps/web/src/hooks/useAeroplaneMatch.test.ts`
- Modify: `apps/web/src/components/aeroplane/AeroplaneEventFeed.tsx`
- Create: `apps/web/e2e/aeroplane.spec.ts`

**Interfaces:**
- Chatter is local/presentation-only and consumes neither gameplay RNG stream.
- E2E uses `?e2eSeed=` for normal deterministic runs and `window.__PROCYON_AEROPLANE_FIXTURE__` for hard-path state.

- [ ] **Step 1: Write chatter determinism/isolation tests**

```ts
test('same event/personality chooses same local line without gameplay RNG', () => {
  expect(localReaction('cautious', captureEvent, 7))
    .toBe(localReaction('cautious', captureEvent, 7));
});

test('chatter failure cannot change authoritative state', () => {
  const before = terminalFixture.state;
  const after = enqueueReactionWithThrowingSink(terminalFixture);
  expect(after).toEqual(before);
});
```

Use a presentation-only hash/index derived from personality + event type + turn number. Do not import `rng.ts` in `chatter.ts`.

- [ ] **Step 2: Implement local lines only**

Provide small fixed line pools for capture, flight, finish, win, and loss for each personality. Enqueue only after authoritative action completion. When chatter is disabled, do no work.

Do not call `UniversalAIService`, provider configuration, or network APIs.

- [ ] **Step 3: Build Playwright fixture helpers**

In the E2E file:

```ts
async function installFixture(
  page: Page,
  fixture: AeroplaneE2EFixture
): Promise<void> {
  await page.addInitScript(value => {
    (window as Window & {
      __PROCYON_AEROPLANE_FIXTURE__?: AeroplaneE2EFixture;
    }).__PROCYON_AEROPLANE_FIXTURE__ = value;
  }, fixture);
}
```

Use `page.goto('/aeroplane?e2eSeed=39101')` for ordinary seeded matches. Use `installFixture` before `goto` for exact jump/flight/capture/blockade/near-win positions.

- [ ] **Step 4: E2E each human colour/seat assignment without playing full matches**

```ts
for (const humanColor of ['red', 'yellow', 'blue', 'green'] as const) {
  test(`starts with deterministic seats when human is ${humanColor}`, async ({ page }) => {
    await installFixture(page, setupFixtureFor(humanColor));
    await page.goto('/aeroplane');
    await expect(page.getByTestId('human-color')).toHaveText(humanColor);
    await expect(page.getByTestId('ai-seats')).toContainText(expectedSeatText(humanColor));
    await expect(page.getByTestId('current-player')).toContainText('Red');
  });
}
```

This verifies red-first behavior including automatic AI-first flow for non-red humans.

- [ ] **Step 5: E2E forced rule chains**

Create fixtures whose next human action proves each path directly:

```ts
test('jump into flight captures only at final endpoint', async ({ page }) => {
  await installFixture(page, jumpFlightCaptureFixture());
  await page.goto('/aeroplane');
  await page.getByRole('button', { name: /red plane 1/i }).click();
  await expect(page.getByTestId('red-0')).toHaveAttribute('data-progress', '30');
  await expect(page.getByTestId('intermediate-enemy')).toHaveAttribute('data-location', 'track');
  await expect(page.getByTestId('final-enemy')).toHaveAttribute('data-location', 'hangar');
});

test('blockade blocks base and jump paths', async ({ page }) => {
  await installFixture(page, blockadeFixture());
  await page.goto('/aeroplane');
  await expect(page.getByTestId('blocked-plane')).not.toHaveAttribute('data-legal', 'true');
});
```

Add direct flight, stack split, third-plane blockade rejection, and private-home collision fixtures.

- [ ] **Step 6: E2E reload and deterministic Quick victory**

```ts
test('reload resumes pending choice with same next RNG sequence', async ({ page }) => {
  await installFixture(page, pendingChoiceFixture());
  await page.goto('/aeroplane');
  const before = await page.getByTestId('pending-roll').textContent();
  await page.reload();
  await page.getByRole('button', { name: /resume match/i }).click();
  await expect(page.getByTestId('pending-roll')).toHaveText(before ?? '');
});

test('Quick victory submits exactly one unrated result', async ({ page }) => {
  let historyPosts = 0;
  await page.route('**/api/play-history', async route => {
    if (route.request().method() === 'POST') historyPosts += 1;
    await route.fulfill({ status: 201, body: JSON.stringify({ ratingUpdate: null }) });
  });
  await installFixture(page, quickNearVictoryFixture());
  await page.goto('/aeroplane');
  await page.getByRole('button', { name: /red plane 2/i }).click();
  await expect(page.getByText(/you win/i)).toBeVisible();
  expect(historyPosts).toBe(1);
});
```

Also run one anonymous/no-provider seeded match far enough to complete one human turn and all three personality AI turns; assert no provider/network move endpoint is called.

- [ ] **Step 7: Full verification**

```bash
bun run test
bun run typecheck
bun run lint
bun run test:e2e -- --grep "Aeroplane"
```

Expected: all commands exit 0.

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/lib/aeroplane/chatter.ts apps/web/src/lib/aeroplane/chatter.test.ts apps/web/src/hooks/useAeroplaneMatch.ts apps/web/src/hooks/useAeroplaneMatch.test.ts apps/web/src/components/aeroplane/AeroplaneEventFeed.tsx apps/web/e2e/aeroplane.spec.ts
git commit -m "test(aeroplane): add chatter and deterministic e2e coverage"
```

---

## Final implementation verification checklist

Before marking HPA-391 implemented, run all of these from repository root:

```bash
bun run test
bun run typecheck
bun run lint
bun run build
bun run test:e2e
```

Then verify the acceptance criteria explicitly:

- [ ] Anonymous visitor starts/plays without provider configuration.
- [ ] Classic and Quick presets match HPA-391 exactly.
- [ ] All four human colours produce the documented AI seating and red-first turn order.
- [ ] Launch/jump/flight/final-endpoint capture/home/stack/blockade rules are engine-enforced.
- [ ] Zero/one/multiple legal-move behavior matches the controller contract.
- [ ] Cautious/Aggressive/Unpredictable are deterministic and legal-only.
- [ ] Save/reload restores authoritative state, seats, and exact next dice/AI RNG.
- [ ] Replay diagnostics reproduce recorded roll/choice/events/checksum but are not a recovery gate.
- [ ] Pointer/touch/keyboard interactions and animation skipping are usable/idempotent.
- [ ] Signed-in Aeroplane completion creates exactly one `aeroplane-trio-v1` history row with `ratingUpdate: null` and no rating row.
- [ ] Existing LLM strategy games still update ratings; Stockfish remains unrated.
- [ ] Local chatter cannot affect gameplay state or RNG.
- [ ] Production ignores DEV/E2E fixture hooks.
