# HPA-391 Aeroplane Chess Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a complete deterministic Aeroplane Chess mode with one human, three local personality AIs, exact reload recovery, replay diagnostics, unrated history, and responsive accessible gameplay.

**Architecture:** Keep Chess/Xiangqi/Shogi/Jungle inside the existing rectangular `GameVariant`/AI/provider abstractions. Aeroplane uses a dedicated logical path engine under `apps/web/src/lib/aeroplane/`; a new `GameId` handles app/history identity. Rule resolution is turn-agnostic at the single-plane level while `game.ts` owns current-turn enforcement. Recovery restores validated authoritative snapshots directly; replay is an isolated developer diagnostic. The existing non-idempotent play-history save policy is extracted once and reused by strategy games and Aeroplane.

**Tech Stack:** TypeScript 5.9, Bun 1.3.6, Astro 4, React 18, Tailwind CSS, Bun test, Hono, Zod 4, Drizzle ORM/SQLite/D1, Playwright.

## Global Constraints

- HPA-391 is normative; use `docs/superpowers/specs/2026-08-08-hpa-391-aeroplane-chess-design.md` for clarified implementation choices.
- Do not add Aeroplane to `GAME_CONFIGS`, strategy state/piece maps, LLM move adapters, rule guardians, or `@procyon/game-core`.
- Do not create a generic race-game/Ludo framework.
- Gameplay/dice/AI/recovery must work without sign-in, provider configuration, or network access.
- `/aeroplane` must not mount `SidebarAIConfig` or hydrate the raw provider API key.
- Use separate serializable immutable RNG streams for dice and AI. UI timing/chatter consumes neither.
- Rules use logical positions only; render coordinates never determine legality.
- `resolveLegalMove` resolves the named plane regardless of `state.currentPlayer`; `game.ts` enforces turn ownership.
- Apply each move to authoritative state exactly once before animation/chatter/history presentation.
- Classic: launch 6, extra turn 6, exact finish, target 4, Fair Dice, stacking/blockades off.
- Quick & Chill: launch 5/6, extra turn 6, bounce finish, target 2, Relaxed Dice, stacking/blockades off.
- Enabling blockades forces stacking on; disabling stacking forces blockades off.
- Red always starts. Turn order is red → yellow → blue → green.
- AI seats are assigned clockwise after the human as Cautious → Aggressive → Unpredictable and persisted once the match starts.
- Captures occur only at the final shared endpoint after the full automatic jump/flight chain.
- Base arrival at logical progress 30 triggers its normal +4 jump; flight arrival at 30 stops because HPA-391 specifies only one pre-flight jump pass.
- Aeroplane terminal history status is `win | loss`; `draw` is invalid.
- Provider-generated chatter is deferred; local personality lines satisfy this slice.
- Existing rated LLM strategy games and unrated Stockfish games must remain behaviorally unchanged.
- Replay/checksum is diagnostic only. Restore never replays a match to decide whether a valid snapshot can load.

## Risks and gates

| Risk | Why it matters | Gate |
| --- | --- | --- |
| Homepage role regression from button → link | Existing critical journeys query Play actions as buttons | Task 1 updates the existing E2E and runs the homepage journey before Task 2 |
| Silent missing accent | CVA accepts missing variant entries without an exhaustive map | Task 1 defines `satisfies Record<Accent, string>` maps and typechecks |
| Provider-key hydration on Aeroplane | `AppShell` fetches `/ai-config/:id/full` on provider-enabled routes | Task 1 unit test locks `/aeroplane` out of `isAIConfigGamePath` |
| Opponent exposure always zero | A current-player guard inside `resolveLegalMove` would reject every opponent threat probe | Task 4 has a direct exposure regression fixture that fails if opponent probes return null |
| Rating-path regression during `chessId → gameId` rename | Existing LLM games are rated and Stockfish is deliberately unrated | Task 8 keeps existing API/hook/rating tests green before Aeroplane API support lands |
| Data loss during `chess_id → game_id` migration | Drizzle can interpret rename as drop/add | Task 8 rejects DROP/ADD SQL and runs an in-memory legacy-row survival test |
| Duplicate non-idempotent history POST | Ambiguous 5xx/network retry can create duplicate history/rating rows | Task 9 extracts and reuses the existing frozen-snapshot/generation/401-only policy |
| Blockade path semantics | Crossing/landing rules affect engine, AI, preview, and E2E | Task 2 table tests cover base path, +4 path, flight entrance/exit, split, and third-plane rejection before UI |
| Seating/first-player drift | AI identity/history/E2E must agree for all human colours | Task 3 locks all four seat assignments and red-first initialization |
| Replay becoming a second recovery engine | Doubles reconstruction/failure logic | Task 5 proves valid snapshot restore succeeds without invoking replay |
| DEV fixture leaking into production | Test-only injection must never be a product feature | Task 6 reads query/global fixtures only in DEV and tests non-DEV isolation |
| Hard E2E paths depending on random play | Jump/blockade/near-win scenarios become slow/flaky | Task 6 defines one fixture contract; Task 12 uses fixtures instead of long random games |

---

## File map

### New web domain/support files

```text
apps/web/src/lib/game-id.ts
apps/web/src/lib/game-id.test.ts
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

### New web hooks/UI/tests

```text
apps/web/src/hooks/useAeroplaneMatch.ts
apps/web/src/hooks/useAeroplaneMatch.test.ts
apps/web/src/hooks/useTerminalHistorySave.ts
apps/web/src/hooks/useTerminalHistorySave.test.ts
apps/web/src/pages/aeroplane.astro
apps/web/src/components/AeroplaneGame.tsx
apps/web/src/components/aeroplane/AeroplaneSetup.tsx
apps/web/src/components/aeroplane/AeroplaneBoard.tsx
apps/web/src/components/aeroplane/AeroplaneStatus.tsx
apps/web/src/components/aeroplane/AeroplaneEventFeed.tsx
apps/web/src/components/aeroplane/AeroplaneBoardPreview.tsx
apps/web/src/components/aeroplane/AeroplaneGame.test.tsx
apps/web/e2e/aeroplane.spec.ts
```

### Existing web files changed

```text
apps/web/src/lib/ai/game-variant-types.ts
apps/web/src/lib/ai/opponent.ts
apps/web/src/hooks/usePlayHistory.ts
apps/web/src/hooks/usePlayHistory.test.ts
apps/web/src/components/AppShell.tsx
apps/web/src/components/ChessGameSelector.tsx
apps/web/src/components/ChessGameCard.tsx -> apps/web/src/components/GameCard.tsx
apps/web/src/components/GamePageLayout.tsx
apps/web/src/components/PageHeader.tsx
apps/web/src/components/ui/Panel.tsx
apps/web/src/components/PlayHistoryPage.tsx
apps/web/src/components/PlayHistoryPage.test.tsx
apps/web/e2e/critical-user-journeys.spec.ts
apps/web/tailwind.config.mjs
```

### API files changed/created

```text
apps/api/src/constants/game.ts
apps/api/src/constants/game.test.ts
apps/api/src/types/play-history.ts
apps/api/src/db/schema.ts
apps/api/src/db/schema.test.ts
apps/api/src/db/migration-safety.test.ts
apps/api/src/routes/play-history.ts
apps/api/src/routes/play-history.test.ts
apps/api/src/routes/play-history.pvp-security.test.ts
```

History changes are intentionally split into two migrations: the rename-only migration first, then the nullable Aeroplane `details` column. Drizzle-generated filenames may carry generated suffixes; tests discover the numbered file rather than assuming a suffix.

---

## Task 1: Add general game identity, safe routing, exhaustive accents, and AppShell exclusion

**Files:**
- Create: `apps/web/src/lib/game-id.ts`
- Create: `apps/web/src/lib/game-id.test.ts`
- Modify: `apps/web/src/lib/ai/game-variant-types.ts`
- Rename/Modify: `apps/web/src/components/ChessGameCard.tsx` → `apps/web/src/components/GameCard.tsx`
- Modify: `apps/web/src/components/ChessGameSelector.tsx`
- Create: `apps/web/src/components/ChessGameSelector.test.tsx`
- Create: `apps/web/src/components/aeroplane/AeroplaneBoardPreview.tsx`
- Modify: `apps/web/src/components/GamePageLayout.tsx`
- Modify: `apps/web/src/components/PageHeader.tsx`
- Modify: `apps/web/src/components/ui/Panel.tsx`
- Modify: `apps/web/src/components/AppShell.tsx`
- Modify: `apps/web/e2e/critical-user-journeys.spec.ts`
- Modify: `apps/web/tailwind.config.mjs`
- Create: `apps/web/src/pages/aeroplane.astro`
- Create shell: `apps/web/src/components/AeroplaneGame.tsx`

**Interfaces:**
- Produces `GameId = GameVariant | 'aeroplane'`, `Accent = GameId | 'brass'`, `GAME_ROUTES`, `STRATEGY_GAME_ROUTES`, and `isAIConfigGamePath`.
- Preserves four-value `GameVariant` for grid engines/provider-enabled routes.
- Selector models own explicit links; display text never controls routing.
- `/aeroplane` is a `GameId` route but not an AI-config route.

- [ ] **Step 1: Write identity/selector tests first**

```ts
// apps/web/src/lib/game-id.test.ts
import { describe, expect, test } from 'bun:test';
import { GAME_ROUTES, isAIConfigGamePath } from './game-id';

describe('game routes', () => {
  test('defines Aeroplane as a game route but not an AI-config route', () => {
    expect(GAME_ROUTES.aeroplane).toBe('/aeroplane');
    expect(isAIConfigGamePath('/aeroplane')).toBe(false);
  });

  test('keeps all strategy routes AI-config enabled', () => {
    for (const path of ['/chess', '/xiangqi', '/shogi', '/jungle']) {
      expect(isAIConfigGamePath(path)).toBe(true);
    }
  });
});
```

```ts
// apps/web/src/components/ChessGameSelector.test.tsx
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

- [ ] **Step 2: Run unit tests and confirm failure**

```bash
cd apps/web
bun test src/lib/game-id.test.ts src/components/ChessGameSelector.test.tsx
```

Expected: FAIL because `game-id.ts`, Aeroplane, and link-based selector actions do not exist.

- [ ] **Step 3: Add identity/route helpers without widening `GameVariant`**

```ts
// apps/web/src/lib/game-id.ts
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

Remove only `Accent` from `game-variant-types.ts`; keep every strategy map/union four-wide.

- [ ] **Step 4: Make every widened accent map exhaustive**

```ts
// Panel.tsx
const PANEL_ACCENT_CLASSES = {
  chess: 'border-l-2 border-l-chess',
  xiangqi: 'border-l-2 border-l-xiangqi',
  shogi: 'border-l-2 border-l-shogi',
  jungle: 'border-l-2 border-l-jungle',
  aeroplane: 'border-l-2 border-l-aeroplane',
  brass: 'border-l-2 border-l-brass',
} satisfies Record<Accent, string>;
```

Feed `PANEL_ACCENT_CLASSES` into CVA. `PageHeader` uses a separate `Record<Accent, string>` map. `GamePageLayout` broadens its existing exhaustive map to `Record<GameId, string>` and adds `aeroplane`.

Add Tailwind:

```js
aeroplane: { DEFAULT: '#4F8FD8' },
```

- [ ] **Step 5: Generalize card/selector and add the shell route**

```bash
git mv apps/web/src/components/ChessGameCard.tsx apps/web/src/components/GameCard.tsx
```

Card contract:

```ts
interface GameCardProps {
  title: string;
  description: string;
  gameId: GameId;
  href: string;
  preview: React.ReactNode;
}
```

Render the Play action as an `<a>` using `buttonVariants`; never nest a button inside a link. Selector entries use `GAME_ROUTES`.

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

The shell renders a heading only; Task 7 replaces it with the playable UI.

- [ ] **Step 6: Make AppShell's provider boundary explicit**

Replace the private hardcoded four-route helper with:

```ts
import { isAIConfigGamePath } from '../lib/game-id';
```

Use it for desktop rail rendering, mobile AI button/panel, and `hydrateAIConfig()` gating. Update the comment to state that Aeroplane is intentionally excluded because it has no provider consumer.

- [ ] **Step 7: Update the existing critical journey in the same slice**

In `critical-user-journeys.spec.ts`:

- change homepage Play readiness queries from `getByRole('button', ...)` to `getByRole('link', ...)`;
- rename route fixture key from `buttonName` to `linkName`;
- click the four existing core routes as links;
- add a separate Aeroplane shell assertion that clicks `Play Aeroplane Chess`, expects `/aeroplane`, and sees the Aeroplane heading without expecting the later Start control.

- [ ] **Step 8: Verify unit, type, and homepage E2E gates**

```bash
cd apps/web
bun test src/lib/game-id.test.ts src/components/ChessGameSelector.test.tsx
bun run typecheck
bunx playwright test e2e/critical-user-journeys.spec.ts --grep "homepage routes users to puzzles and core game pages"
```

Expected: PASS. Do not start Task 2 if the existing homepage journey is red.

- [ ] **Step 9: Commit**

```bash
git add apps/web/src/lib/game-id.ts apps/web/src/lib/game-id.test.ts apps/web/src/lib/ai/game-variant-types.ts apps/web/src/components apps/web/src/pages/aeroplane.astro apps/web/src/components/AppShell.tsx apps/web/e2e/critical-user-journeys.spec.ts apps/web/tailwind.config.mjs
git commit -m "feat(aeroplane): add safe game identity and route"
```

---

## Task 2: Build topology and a turn-agnostic authoritative move resolver

**Files:**
- Create: `apps/web/src/lib/aeroplane/types.ts`
- Create: `apps/web/src/lib/aeroplane/topology.ts`
- Create: `apps/web/src/lib/aeroplane/rules.ts`
- Create: `apps/web/src/lib/aeroplane/topology.test.ts`
- Create: `apps/web/src/lib/aeroplane/rules.test.ts`

**Interfaces:**
- Produces `AeroplaneConfig`, `PlaneState`, `AeroplanePosition`, `AeroplaneEvent`, `ResolvedMove`.
- Produces `toGlobalTrackIndex`, `toPosition`, `resolveLegalMove`, `getLegalMovesForColor`, `getLegalMoves`, `applyResolvedMove`.
- `resolveLegalMove` derives mover colour from the plane and does not compare against `state.currentPlayer`.
- `getLegalMoves` remains current-player-only.
- Rule modules import no React/render-coordinate module.

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
expect(isNormalJumpSquare(30)).toBe(true);
expect(toPosition('red', 51)).toEqual({ kind: 'home', color: 'red', progress: 51, homeIndex: 0 });
expect(toPosition('red', 56)).toEqual({ kind: 'finished', color: 'red' });
```

- [ ] **Step 2: Verify topology test fails**

```bash
cd apps/web
bun test src/lib/aeroplane/topology.test.ts
```

- [ ] **Step 3: Implement colour-symmetric topology**

```ts
export const TURN_ORDER = ['red', 'yellow', 'blue', 'green'] as const;
export const START_OFFSET = { red: 0, yellow: 13, blue: 26, green: 39 } as const;
export const SHARED_PROGRESS_MAX = 50;
export const FINISH_PROGRESS = 56;
export const FLIGHT_ENTRANCE_PROGRESS = 18;
export const FLIGHT_EXIT_PROGRESS = 30;
```

Normal jump rule: shared progress where `progress % 4 === 2`, `progress + 4 <= 50`, excluding `18` because it is the dedicated flight entrance. Progress `30` remains a normal jump square for a base arrival.

- [ ] **Step 4: Lock the path-sensitive progress-30 rule**

```ts
test('base arrival at 30 performs the normal jump to 34', () => {
  const move = resolveLegalMove(stateWithPlane('red-0', 28), 'red-0', 2)!;
  expect(move.baseEndpoint).toMatchObject({ kind: 'track', progress: 30 });
  expect(move.finalEndpoint).toMatchObject({ kind: 'track', progress: 34 });
  expect(move.events.map(event => event.type)).toEqual(['move', 'jump']);
});

test('long flight ends at 30 without a second jump pass', () => {
  const move = resolveLegalMove(stateWithPlane('red-0', 16), 'red-0', 2)!;
  expect(move.finalEndpoint).toMatchObject({ kind: 'track', progress: 30 });
  expect(move.events.map(event => event.type)).toEqual(['move', 'flight']);
});

test('normal jump can feed the long flight and still stops at 30', () => {
  const move = resolveLegalMove(stateWithPlane('red-0', 12), 'red-0', 2)!;
  expect(move.baseEndpoint).toMatchObject({ kind: 'track', progress: 14 });
  expect(move.finalEndpoint).toMatchObject({ kind: 'track', progress: 30 });
  expect(move.events.map(event => event.type)).toEqual(['move', 'jump', 'flight']);
});
```

- [ ] **Step 5: Write launch/finish/capture cases**

```ts
test('launch requires allowed roll and empty private launch pad', () => {
  expect(resolveLegalMove(stateWithPlane('red-0', null), 'red-0', 5)).toBeNull();
  expect(resolveLegalMove(stateWithPlane('red-0', null), 'red-0', 6)?.finalEndpoint)
    .toEqual({ kind: 'launch', color: 'red' });
  expect(resolveLegalMove(occupiedLaunchPadFixture(), 'red-0', 6)).toBeNull();
});

test('exact rejects overshoot and bounce reflects it', () => {
  expect(resolveLegalMove(stateWithPlane('red-0', 54, { finishRule: 'exact' }), 'red-0', 3)).toBeNull();
  expect(resolveLegalMove(stateWithPlane('red-0', 54, { finishRule: 'bounce' }), 'red-0', 3)?.finalEndpoint)
    .toMatchObject({ kind: 'home', progress: 55 });
});

test('jump-flight chain captures only the final endpoint', () => {
  const move = resolveLegalMove(jumpFlightCaptureFixture(), 'red-0', 2)!;
  expect(move.finalEndpoint).toMatchObject({ kind: 'track', progress: 30 });
  expect(move.capturedPlaneIds).toEqual(['green-0']);
});
```

Also cover multi-plane final capture, launch/home non-capture, and private-home collision.

- [ ] **Step 6: Lock blockade cases**

Use table tests for stacking-off friendly collision, stack creation/splitting, base crossing, blockade landing, jump-segment crossing, flight entrance/exit occupancy, leaving own blockade, and third-plane rejection.

- [ ] **Step 7: Test turn-agnostic single-plane resolution**

```ts
test('resolver can analyze an opponent plane without changing currentPlayer', () => {
  const state = opponentThreatFixture({ currentPlayer: 'red' });
  const move = resolveLegalMove(state, 'yellow-0', 3);
  expect(move).not.toBeNull();
  expect(state.currentPlayer).toBe('red');
});

test('getLegalMoves still returns only current-player planes', () => {
  const state = mixedColorMovableFixture({ currentPlayer: 'red' });
  expect(getLegalMoves(state, 3).every(move => move.planeId.startsWith('red-'))).toBe(true);
});
```

- [ ] **Step 8: Implement the single resolver**

`resolveLegalMove` performs: plane existence/finished guard → launch case → exact/bounce base progress → base blockade traversal → one normal +4 jump pass → flight at progress 18 → final occupancy → captures/events. It derives colour from the plane and never checks `state.currentPlayer`.

`getLegalMovesForColor` filters planes by requested colour; `getLegalMoves` calls it for `state.currentPlayer`. `applyResolvedMove` immutably applies analyzer output. Turn enforcement is deferred to `game.ts` in Task 3.

- [ ] **Step 9: Verify and commit**

```bash
cd apps/web
bun test src/lib/aeroplane/topology.test.ts src/lib/aeroplane/rules.test.ts

git add src/lib/aeroplane
git commit -m "feat(aeroplane): add turn-agnostic path rules"
```

---

## Task 3: Add deterministic seats, turn enforcement, and dice

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
- `game.ts` only applies a move present in the current player's legal set.
- New matches always start red.

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

test('dice and AI streams differ for the same root seed', () => {
  const streams = deriveRngStreams(39101);
  expect(streams.dice).not.toEqual(streams.ai);
});
```

Normalize xorshift zero state to a fixed nonzero value.

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
    expect(seatAIs(humanColor).map(seat => [seat.color, seat.personality])).toEqual(expected);
  });
}

test('red always starts', () => {
  for (const humanColor of TURN_ORDER) {
    expect(createAeroplaneMatch({ ...CLASSIC_CONFIG, humanColor }, 39101).state.currentPlayer).toBe('red');
  }
});
```

- [ ] **Step 3: Write Fair/Relaxed consumption tests**

```ts
test('fair consumes exactly one sample', () => {
  const rng = { value: 123 };
  expect(rollFair(rng).rng).toEqual(nextUint32(rng).rng);
});

test('active relaxed protection consumes exactly two samples', () => {
  const rng = { value: 456 };
  const result = rollRelaxed(relaxedFixtureState(), rng);
  const first = nextUint32(rng);
  const second = nextUint32(first.rng);
  expect(result.rng).toEqual(second.rng);
});
```

Fair mapping is `(sample % 6) + 1`; accept its tiny bias to preserve the one-sample contract.

- [ ] **Step 4: Write turn/ownership/victory tests**

```ts
test('game rejects a resolved move belonging to the wrong player', () => {
  const state = playableState({ currentPlayer: 'red' });
  const yellowMove = resolveLegalMove(state, 'yellow-0', 3)!;
  expect(() => playResolvedMove(state, yellowMove)).toThrow(/current player/i);
});

test('six grants another turn even when no legal move exists', () => {
  const result = rollTurn(noLegalMoveState('red'), fixedDie(6));
  expect(result.state.currentPlayer).toBe('red');
  expect(result.state.phase).toBe('awaiting-roll');
});

test('green to red completes a round on a non-six', () => {
  const result = completeSingleMoveTurn(stateAwaitingCompletion('green', { roundNumber: 2 }), 4);
  expect(result.state.currentPlayer).toBe('red');
  expect(result.state.roundNumber).toBe(3);
});

test('Quick finishes at two planes and has no draw state', () => {
  const result = finishSecondPlaneForRed(QUICK_CONFIG);
  expect(result.state.phase).toBe('finished');
  expect(result.state.winner).toBe('red');
});
```

- [ ] **Step 5: Implement presets/counters/turn flow**

`createAeroplaneMatch` normalizes config, creates 16 hangar planes, calls `seatAIs`, derives both RNG streams, sets red as current player, and initializes counters.

`rollTurn` consumes the selected dice policy and uses current-player `getLegalMoves`. Zero legal moves complete skip inside the roll action. One-or-more leave `awaiting-choice`. Update `noMoveStreak`; update `lastPlaceRounds` only when a non-six advances green→red.

`playResolvedMove` confirms the move matches one of the current player's legal moves for `pendingRoll` before applying it.

- [ ] **Step 6: Verify and commit**

```bash
cd apps/web
bun test src/lib/aeroplane/rng.test.ts src/lib/aeroplane/dice.test.ts src/lib/aeroplane/game.test.ts src/lib/aeroplane/rules.test.ts

git add src/lib/aeroplane
git commit -m "feat(aeroplane): add deterministic seats turns and dice"
```

---

## Task 4: Add three personality AIs with working exposure analysis

**Files:**
- Create: `apps/web/src/lib/aeroplane/ai.ts`
- Create: `apps/web/src/lib/aeroplane/ai.test.ts`
- Modify: `apps/web/src/lib/aeroplane/types.ts`

**Interfaces:**
- Produces `chooseAiMove(state, legalMoves, personality, rng): { move; rng }`.
- May export `countImmediateCaptureThreats` for direct unit testing.
- Uses persisted seat personality; never derives personality from colour.

- [ ] **Step 1: Write representative personality tests**

```ts
test('aggressive prefers multi-plane capture over quiet progress', () => {
  expect(chooseAiMove(aggressiveFixture.state, aggressiveFixture.moves, 'aggressive', { value: 7 }).move.planeId)
    .toBe('red-capturer');
});

test('all personalities take a guaranteed finish', () => {
  for (const personality of ['cautious', 'aggressive', 'unpredictable'] as const) {
    expect(chooseAiMove(finishFixture.state, finishFixture.moves, personality, { value: 7 }).move.planeId)
      .toBe('red-finisher');
  }
});

test('same state and seed repeats exactly', () => {
  const first = chooseAiMove(unpredictableFixture.state, unpredictableFixture.moves, 'unpredictable', { value: 391 });
  const second = chooseAiMove(unpredictableFixture.state, unpredictableFixture.moves, 'unpredictable', { value: 391 });
  expect(first).toEqual(second);
});
```

- [ ] **Step 2: Add the exposure regression that catches the resolver defect**

```ts
test('opponent threat probe sees a capture while another player is current', () => {
  const fixture = exposedCandidateFixture();
  expect(countImmediateCaptureThreats(fixture.afterExposedMove, fixture.movedPlaneId)).toBeGreaterThan(0);
});

test('cautious avoids an otherwise-equal exposed move', () => {
  const fixture = exposureDecisionFixture();
  const result = chooseAiMove(fixture.state, fixture.moves, 'cautious', { value: 7 });
  expect(result.move.planeId).toBe(fixture.safePlaneId);
});
```

Design `exposureDecisionFixture` so finish/home/capture/jump/flight/launch/blockade/progress scores are equal; immediate capture exposure is the deciding feature. If opponent probes are silently rejected, this test chooses the wrong/tied candidate.

- [ ] **Step 3: Implement fixed weights and threat probing**

Use the design weight table verbatim. For each candidate, apply the resolved move to a hypothetical public state, then for every opponent plane and die `1..6` call turn-agnostic `resolveLegalMove`. Count threats whose `capturedPlaneIds` includes the moved plane. Do not change `currentPlayer` and consume no RNG for exposure.

Cautious/Aggressive consume AI RNG only for top-score ties. Unpredictable consumes one sample per legal move for jitter `[-120, 120]`, plus one sample only if the final top score still ties.

- [ ] **Step 4: Verify legal-only behavior and commit**

```bash
cd apps/web
bun test src/lib/aeroplane/ai.test.ts src/lib/aeroplane/rules.test.ts src/lib/aeroplane/game.test.ts

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
- `checksumState` is deterministic/non-cryptographic.
- `replayMatch` is DEV/test diagnostics only.
- Key: `procyon:aeroplane:active-match:v1`.

- [ ] **Step 1: Define persisted shape**

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
```

Action records contain roll/move actor, selected plane when applicable, structured events, and resulting checksum. Do not add per-action full state snapshots.

- [ ] **Step 2: Write recovery tests before replay**

Cover valid round-trip, awaiting-choice restore, exact seats/RNG, unknown version, invalid plane counts/ids/progress, invalid phase/winner/pending roll, invalid seats/RNG, and storage exceptions.

```ts
test('valid pending-choice snapshot restores exact state seats and RNG', () => {
  const saved = validPendingChoiceSave();
  const restored = restoreFixture(saved);
  expect(restored.kind).toBe('ok');
  if (restored.kind !== 'ok') throw new Error('expected ok');
  expect(restored.match.state).toEqual(saved.state);
  expect(restored.match.seats).toEqual(saved.seats);
  expect(restored.match.diceRng).toEqual(saved.diceRng);
  expect(restored.match.aiRng).toEqual(saved.aiRng);
});
```

- [ ] **Step 3: Implement manual snapshot validation**

Validate authoritative snapshot/action-record shapes without re-executing history. Corrupt raw text goes to session diagnostics and active key is cleared. Storage errors remain non-fatal.

- [ ] **Step 4: Write replay diagnostics tests**

```ts
test('replay reproduces recorded final checksum', () => {
  const result = replayMatch(recordedMatch);
  expect(result.kind).toBe('ok');
});

test('changed recorded AI choice reports mismatch', () => {
  const changed = mutateRecordedAiChoice(recordedMatch);
  expect(replayMatch(changed).kind).toBe('mismatch');
});

test('valid restore is independent of diagnostic checksum mismatch', () => {
  const changed = structuredClone(recordedMatch);
  changed.actions[0] = { ...changed.actions[0], checksum: '00000000' };
  expect(restoreFixture(changed).kind).toBe('ok');
});
```

- [ ] **Step 5: Implement checksum/replay**

Canonical serialization sorts record keys/planes and excludes timestamps/presentation. Replay starts from root seed/config/seats and calls real turn/dice/AI functions. Return first mismatch; never mutate the persisted object and never call replay from restore.

- [ ] **Step 6: Verify and commit**

```bash
cd apps/web
bun test src/lib/aeroplane/persistence.test.ts src/lib/aeroplane/replay.test.ts src/lib/aeroplane/dice.test.ts src/lib/aeroplane/ai.test.ts

git add src/lib/aeroplane
git commit -m "feat(aeroplane): add recovery and replay diagnostics"
```

---

## Task 6: Build the match controller and DEV/E2E fixture contract

**Files:**
- Create: `apps/web/src/hooks/useAeroplaneMatch.ts`
- Create: `apps/web/src/hooks/useAeroplaneMatch.test.ts`

**Interfaces:**
- Hook exposes authoritative state, seats, RNG, derived legal moves, setup mutations, roll/select/reset/resume, presentation queue, and skip actions.
- No SVG/layout imports.
- No history HTTP/save-once implementation yet; Task 11 wires the shared policy.
- DEV overrides are ignored outside `import.meta.env.DEV`.

- [ ] **Step 1: Write controller tests with fake timers/injected storage**

```ts
test('one legal human move auto-applies without prompting', async () => {
  const match = createHookHarness(oneLegalHumanMoveFixture());
  match.roll();
  await match.flushPresentation();
  expect(match.state().phase).toBe('awaiting-roll');
});

test('multiple legal human moves wait for selection', () => {
  const match = createHookHarness(twoLegalHumanMovesFixture());
  match.roll();
  expect(match.state().phase).toBe('awaiting-choice');
  expect(match.legalMoves()).toHaveLength(2);
});

test('AI delay consumes no gameplay RNG before decision time', () => {
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

Also cover stale AI timer cancellation on reset/unmount, save after pending-choice roll, resume/new match, red-first AI turns when human is not red, and persisted seats on resume.

- [ ] **Step 2: Define/test DEV override contract**

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

DEV seed precedence:

```text
window.__PROCYON_AEROPLANE_FIXTURE__.seed
→ ?e2eSeed=<uint32>
→ normal generated seed
```

A supplied state/seats/RNG must pass persistence invariant helpers. Invalid fixture data is ignored with a DEV warning. Fixture/query seed makes `skipAnimations` default true unless fixture explicitly says false.

```ts
test('non-DEV ignores query and fixture', () => {
  expect(readDevOverrides({ dev: false, search: '?e2eSeed=12', fixture: { seed: 34 } }))
    .toEqual({});
});
```

- [ ] **Step 3: Implement controller orchestration**

Own editable setup, frozen active config/seats/root seed, restore/new-match state, pure engine/dice/AI calls, 650 ms skippable AI presentation delay, event feed model, persistence, DEV fixture read, and timer generation token.

Commit authoritative state and action record before route animation presentation. `skipAnimations()` only clears presentation timers/overlay.

- [ ] **Step 4: Verify and commit**

```bash
cd apps/web
bun test src/hooks/useAeroplaneMatch.test.ts src/lib/aeroplane/persistence.test.ts src/lib/aeroplane/ai.test.ts
bun run typecheck

git add src/hooks/useAeroplaneMatch.ts src/hooks/useAeroplaneMatch.test.ts
git commit -m "feat(aeroplane): add local match controller"
```

---

## Task 7: Build the accessible board/setup/status/feed UI

**Files:**
- Create: `apps/web/src/lib/aeroplane/layout.ts`
- Replace shell: `apps/web/src/components/AeroplaneGame.tsx`
- Create: `apps/web/src/components/aeroplane/AeroplaneSetup.tsx`
- Create: `apps/web/src/components/aeroplane/AeroplaneBoard.tsx`
- Create: `apps/web/src/components/aeroplane/AeroplaneStatus.tsx`
- Create: `apps/web/src/components/aeroplane/AeroplaneEventFeed.tsx`
- Modify: `apps/web/src/components/aeroplane/AeroplaneBoardPreview.tsx`
- Create: `apps/web/src/components/aeroplane/AeroplaneGame.test.tsx`

**Interfaces:**
- UI consumes `useAeroplaneMatch`; components do not call rules/dice/AI/storage directly.
- `layout.ts` is render-only; no domain rule module imports it.

- [ ] **Step 1: Implement/test render anchors**

`layout.ts` provides normalized anchors for 52 track nodes, four launch pads, 16 hangar slots, four six-position home paths, flight guides, and stack offsets. Tests assert counts and rotational symmetry only.

- [ ] **Step 2: Write component interaction tests**

Cover Classic default, exact Quick preset, blockades→stacking, stacking-off→blockades-off, manual edit→Custom, zero/one/many legal move UI, keyboard Enter/Space, coarse-pointer two-activation preview, mobile feed collapse, and repeated Skip Animations not changing final state.

- [ ] **Step 3: Build setup/status/feed components**

`AeroplaneSetup`: presets, victory, dice, launch, finish, stacking, blockades, human colour, chatter.  
`AeroplaneStatus`: current turn/die below board plus compact narrow status strip.  
`AeroplaneEventFeed`: compact list, collapsible on narrow screens.

- [ ] **Step 4: Build the board**

Render SVG from `layout.ts`. Plane controls get visible focus and accessible labels such as:

```text
Red plane 2, track position 14. Legal move: jump and long flight to position 30.
```

Hover/focus draws the full resolved route. Coarse pointer first activation previews; second activation on the same legal plane applies.

- [ ] **Step 5: Verify and commit**

```bash
cd apps/web
bun test src/components/aeroplane/AeroplaneGame.test.tsx src/hooks/useAeroplaneMatch.test.ts
bun run typecheck

git add src/lib/aeroplane/layout.ts src/components/AeroplaneGame.tsx src/components/aeroplane
git commit -m "feat(aeroplane): add accessible match UI"
```

---

## Task 8: Rename generic play history to `gameId` with a data-preservation gate

**Files:**
- Modify: `apps/api/src/constants/game.ts`
- Modify: `apps/api/src/constants/game.test.ts`
- Modify: `apps/api/src/db/schema.ts`
- Modify: `apps/api/src/db/schema.test.ts`
- Create: `apps/api/src/db/migration-safety.test.ts`
- Modify: `apps/api/src/routes/play-history.ts`
- Modify: `apps/api/src/routes/play-history.test.ts`
- Modify: `apps/api/src/routes/play-history.pvp-security.test.ts`
- Generate: first HPA-391 Drizzle migration (`0011_*.sql` + metadata)
- Create: `apps/web/src/lib/play-history.ts`
- Modify: `apps/web/src/hooks/usePlayHistory.ts`
- Modify: `apps/web/src/hooks/usePlayHistory.test.ts`
- Modify: `apps/web/src/components/PlayHistoryPage.tsx`
- Modify: `apps/web/src/components/PlayHistoryPage.test.tsx`

**Interfaces:**
- Aeroplane is **not accepted by the API yet**.
- Existing strategy payload/response field becomes `gameId`.
- `getRatedVariantId` converts the existing four game ids to `ChessVariantId`.
- `submitPlayHistory` centralizes transport only; save policy remains unchanged until Task 9.

- [ ] **Step 1: Write rename/rating regression tests first**

```ts
test('LLM chess remains rated after gameId rename', async () => {
  const response = await postHistory({
    gameId: 'chess',
    status: 'win',
    date: NOW,
    opponentLlmId: 'gpt-4o',
  });
  expect(response.status).toBe(201);
  expect((await response.json()).ratingUpdate).not.toBeNull();
});

test('Stockfish remains unrated after gameId rename', async () => {
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

At this stage `gameId: 'aeroplane'` must still be rejected.

- [ ] **Step 2: Add four-value API `GameId` and rename the schema/request fields**

```ts
export enum GameId {
  Chess = 'chess',
  Xiangqi = 'xiangqi',
  Shogi = 'shogi',
  Jungle = 'jungle',
}

export function getRatedVariantId(gameId: GameId): ChessVariantId {
  switch (gameId) {
    case GameId.Chess: return ChessVariantId.Chess;
    case GameId.Xiangqi: return ChessVariantId.Xiangqi;
    case GameId.Shogi: return ChessVariantId.Shogi;
    case GameId.Jungle: return ChessVariantId.Jungle;
  }
}
```

Schema uses `gameId: text('game_id').$type<GameId>().notNull()`. Request uses `gameId: z.nativeEnum(GameId)`. Rating call uses only `getRatedVariantId(body.gameId)`.

- [ ] **Step 3: Generate the rename interactively and reject destructive SQL**

Run in an interactive shell:

```bash
cd apps/api
bunx drizzle-kit generate --config=drizzle.config.dev.ts --name hpa391_game_id
```

When Drizzle asks whether `chess_id` was renamed to `game_id` or is a new column, choose **rename**.

Then run:

```bash
MIGRATION="$(ls drizzle/0011_*.sql)"
grep -F 'RENAME COLUMN `chess_id` TO `game_id`' "$MIGRATION"
! grep -Eq 'DROP COLUMN [`"]?chess_id|ADD COLUMN [`"]?game_id' "$MIGRATION"
```

Expected: first grep succeeds and destructive grep returns no match. If generation cannot be answered interactively or emits DROP/ADD, stop this task; do not run migrations.

- [ ] **Step 4: Add a CI-friendly legacy-row survival test**

```ts
// apps/api/src/db/migration-safety.test.ts
import { describe, expect, test } from 'bun:test';
import { Database } from 'bun:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

test('0011 renames chess_id without losing existing play history', () => {
  const drizzleDir = join(import.meta.dir, '..', '..', 'drizzle');
  const file = readdirSync(drizzleDir).find(name => /^0011_.*\.sql$/.test(name));
  if (!file) throw new Error('0011 migration missing');
  const sql = readFileSync(join(drizzleDir, file), 'utf8');

  expect(sql).toContain('RENAME COLUMN `chess_id` TO `game_id`');
  expect(sql).not.toMatch(/DROP COLUMN [`"]?chess_id/);
  expect(sql).not.toMatch(/ADD COLUMN [`"]?game_id/);

  const db = new Database(':memory:');
  db.exec('CREATE TABLE play_history (id integer PRIMARY KEY, chess_id text NOT NULL)');
  db.exec("INSERT INTO play_history (id, chess_id) VALUES (1, 'chess')");
  db.exec(sql.replaceAll('--> statement-breakpoint', ''));
  const row = db.query('SELECT id, game_id FROM play_history WHERE id = 1').get();
  expect(row).toEqual({ id: 1, game_id: 'chess' });
  db.close();
});
```

- [ ] **Step 5: Add transport helper and update existing web field names**

```ts
export interface SubmitPlayHistoryInput {
  gameId: GameId;
  status: 'win' | 'loss' | 'draw';
  date: string;
  opponentLlmId?: OpponentLlmId;
  opponentEngineId?: OpponentEngineId;
  details?: unknown;
}

export async function submitPlayHistory(input: SubmitPlayHistoryInput): Promise<Response> {
  return fetch(`${env.PUBLIC_API_URL}/play-history`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    signal: AbortSignal.timeout(10_000),
    body: JSON.stringify(input),
  });
}
```

`usePlayHistory` keeps its current save policy and calls this helper. `PlayHistoryPage` changes response field/label lookup to `gameId`.

- [ ] **Step 6: Run the hard migration/rating regression gate**

```bash
cd apps/api
bun test src/db/migration-safety.test.ts src/routes/play-history.test.ts src/routes/play-history.pvp-security.test.ts src/constants/game.test.ts src/db/schema.test.ts src/services/rating-service.db.test.ts src/routes/ratings.db.test.ts
bun run typecheck

cd ../web
bun test src/hooks/usePlayHistory.test.ts src/components/PlayHistoryPage.test.tsx
bun run typecheck
```

Expected: migration preserves the seeded legacy row; LLM rating and Stockfish unrated behavior remain green. **Do not start Task 9 until this gate is green.**

- [ ] **Step 7: Commit**

```bash
git add apps/api/src apps/api/drizzle apps/web/src/lib/play-history.ts apps/web/src/hooks/usePlayHistory.ts apps/web/src/hooks/usePlayHistory.test.ts apps/web/src/components/PlayHistoryPage.tsx apps/web/src/components/PlayHistoryPage.test.tsx
git commit -m "refactor(history): rename chess history identity safely"
```

---

## Task 9: Extract the shared non-idempotent terminal-history save policy

**Files:**
- Create: `apps/web/src/hooks/useTerminalHistorySave.ts`
- Create: `apps/web/src/hooks/useTerminalHistorySave.test.ts`
- Modify: `apps/web/src/hooks/usePlayHistory.ts`
- Modify: `apps/web/src/hooks/usePlayHistory.test.ts`
- Modify: `apps/web/src/lib/play-history.ts`

**Interfaces:**
- Produces `useTerminalHistorySave` as the single owner of save-once/frozen-snapshot/generation/auth-switch/401-only retry semantics.
- `usePlayHistory` becomes strategy-specific payload derivation.
- Aeroplane consumes the same hook in Task 11.

- [ ] **Step 1: Move policy behavior into focused failing tests before refactor**

Cover all existing behaviors currently pinned in `usePlayHistory.test.ts`:

```ts
test('submits one frozen terminal payload only once', async () => { /* terminal twice, expect one POST */ });
test('provider changes after terminal do not change frozen payload', async () => { /* expect first snapshot */ });
test('account switch abandons a pending save', async () => { /* A → B, expect no B submission */ });
test('401 retries are bounded to three delayed retries', async () => { /* four total attempts max */ });
test('new game generation makes old 401 response stale', async () => { /* old response cannot clear new saved state */ });
test('500 is not retried', async () => { /* one attempt */ });
test('network timeout/error is not retried', async () => { /* one attempt */ });
test('unmount clears a pending 401 timer', async () => { /* timer callback never fires */ });
```

Move policy-specific assertions from the strategy hook suite into this new suite rather than duplicating them.

- [ ] **Step 2: Define the generic hook contract**

```ts
export interface UseTerminalHistorySaveOptions {
  enabled: boolean;
  isTerminal: boolean;
  isAuthenticated: boolean;
  userId: string | null | undefined;
  buildPayload: () => SubmitPlayHistoryInput | null;
  debugKey?: string;
  onFailure?: (reason: 'rejected' | 'network') => void;
}

export function useTerminalHistorySave(options: UseTerminalHistorySaveOptions): void;
```

A transition from terminal → non-terminal resets saved/snapshot/retry state and increments the internal generation token. The hook does not need game-specific move counts.

- [ ] **Step 3: Implement shared policy by extracting existing behavior, not redesigning it**

The hook owns:

1. `savedRef` optimistic one-shot state;
2. frozen first payload + user id snapshot;
3. `generationRef` to invalidate old in-flight 401 responses after a new game;
4. previous-user guard before first terminal save;
5. account-switch abandonment for retries;
6. `MAX_401_RETRIES = 3`, `RETRY_401_DELAY_MS = 5000`;
7. one retry timer handle and cleanup;
8. no retry on non-401 4xx, 5xx, network, or timeout;
9. optional one-time debug counter.

Use `submitPlayHistory` for transport.

- [ ] **Step 4: Reduce `usePlayHistory` to strategy payload derivation**

`usePlayHistory` computes terminal status/result and builds one of:

```ts
{ gameId, status, date, opponentLlmId }
{ gameId, status, date, opponentEngineId }
```

Then calls `useTerminalHistorySave`. Keep the existing `moveCount` option in the public type for this slice to avoid unrelated four-component call-site churn; the shared policy no longer depends on it.

- [ ] **Step 5: Run both generic-policy and strategy regression suites**

```bash
cd apps/web
bun test src/hooks/useTerminalHistorySave.test.ts src/hooks/usePlayHistory.test.ts
bun run typecheck
```

Expected: the new generic suite owns non-idempotent save semantics; strategy tests prove payload/result/opponent derivation is unchanged.

- [ ] **Step 6: Commit**

```bash
git add src/hooks/useTerminalHistorySave.ts src/hooks/useTerminalHistorySave.test.ts src/hooks/usePlayHistory.ts src/hooks/usePlayHistory.test.ts src/lib/play-history.ts
git commit -m "refactor(history): share terminal save policy"
```

---

## Task 10: Add the Aeroplane server history contract and details projection

**Files:**
- Modify: `apps/api/src/constants/game.ts`
- Modify: `apps/api/src/constants/game.test.ts`
- Create: `apps/api/src/types/play-history.ts`
- Modify: `apps/api/src/db/schema.ts`
- Modify: `apps/api/src/db/schema.test.ts`
- Modify: `apps/api/src/routes/play-history.ts`
- Modify: `apps/api/src/routes/play-history.test.ts`
- Generate: next Drizzle migration adding nullable `details`

**Interfaces:**
- Final API `GameId` has five values.
- Final `getRatedVariantId(gameId): ChessVariantId | null` returns null for Aeroplane.
- `OpponentEngineId` adds `aeroplane-trio-v1`.
- Aeroplane requires trio pairing, structural details, and `win | loss`.
- `GET /play-history` returns `details`.

- [ ] **Step 1: Write Aeroplane API tests first**

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

- valid Aeroplane trio insert → `201`, `ratingUpdate: null`, zero rating rows;
- Aeroplane + LLM → `400`;
- Aeroplane + Stockfish → `400`;
- chess + Aeroplane trio id → `400`;
- Aeroplane draw → `400`;
- missing details → `400`;
- negative/non-integer counters → `400`;
- two/four AI seat entries → `400`;
- invalid enum value → `400`;
- GET returns the exact stored `details` object.

Do **not** add duplicate-colour/personality or human-colour cross-field tests; those are deterministic `seatAIs()` domain invariants, not a second server implementation.

- [ ] **Step 2: Extend final ids/rated conversion**

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
    case GameId.Chess: return ChessVariantId.Chess;
    case GameId.Xiangqi: return ChessVariantId.Xiangqi;
    case GameId.Shogi: return ChessVariantId.Shogi;
    case GameId.Jungle: return ChessVariantId.Jungle;
    case GameId.Aeroplane: return null;
  }
}
```

- [ ] **Step 3: Add structural details schema only**

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

No details `superRefine` for seat uniqueness. Keep route-level opponent/game/outcome pairing validation.

- [ ] **Step 4: Add nullable details column/migration**

```ts
details: text('details', { mode: 'json' })
  .$type<AeroplaneHistoryDetails | null>(),
```

Generate the next migration. Existing rows remain null without backfill.

- [ ] **Step 5: Add pairing/outcome/rating rules and GET projection**

Aeroplane requires `opponentEngineId === AeroplaneTrioV1`, rejects draw, and requires details. Non-Aeroplane rejects AeroplaneTrioV1.

Rating:

```ts
const ratedVariantId = getRatedVariantId(body.gameId);
const shouldRate = kind === 'llm' && ratedVariantId !== null;
```

Only `shouldRate` calls `updatePlayerRating`.

GET explicit select adds:

```ts
details: playHistory.details,
```

- [ ] **Step 6: Run API/rating gate and commit**

```bash
cd apps/api
bun test src/routes/play-history.test.ts src/routes/play-history.pvp-security.test.ts src/constants/game.test.ts src/db/schema.test.ts src/services/rating-service.db.test.ts src/routes/ratings.db.test.ts
bun run typecheck

git add src drizzle
git commit -m "feat(history): record Aeroplane as unrated local game"
```

---

## Task 11: Reuse terminal-save policy for Aeroplane and render history labels

**Files:**
- Modify: `apps/web/src/lib/ai/opponent.ts`
- Modify: `apps/web/src/lib/play-history.ts`
- Modify: `apps/web/src/hooks/useAeroplaneMatch.ts`
- Modify: `apps/web/src/hooks/useAeroplaneMatch.test.ts`
- Modify: `apps/web/src/components/PlayHistoryPage.tsx`
- Modify: `apps/web/src/components/PlayHistoryPage.test.tsx`

**Interfaces:**
- Web `OpponentEngineId` adds `'aeroplane-trio-v1'`.
- `useAeroplaneMatch` calls the shared `useTerminalHistorySave`; it does not own another saved/generation/retry ref set.
- History page labels Aeroplane/trio as unrated; it receives `details` but does not render a details panel.

- [ ] **Step 1: Add web types and terminal payload builder**

```ts
export type OpponentEngineId = 'stockfish' | 'aeroplane-trio-v1';
```

Build human-perspective payload only when terminal:

```ts
function buildAeroplaneHistoryPayload(match: ActiveAeroplaneMatch): SubmitPlayHistoryInput {
  return {
    gameId: 'aeroplane',
    status: match.state.winner === match.config.humanColor ? 'win' : 'loss',
    date: new Date().toISOString(),
    opponentEngineId: 'aeroplane-trio-v1',
    details: {
      rulePreset: match.config.rulePreset,
      victoryTarget: match.config.victoryTarget,
      diceMode: match.config.diceMode,
      humanColor: match.config.humanColor,
      durationSeconds: elapsedSeconds(match),
      planesFinished: humanStats(match).finished,
      capturesMade: humanStats(match).capturesMade,
      capturesSuffered: humanStats(match).capturesSuffered,
      aiPlayers: match.seats,
    },
  };
}
```

- [ ] **Step 2: Wire the existing shared policy unconditionally in the hook**

Inside `useAeroplaneMatch`, call:

```ts
useTerminalHistorySave({
  enabled: activeMatch !== null,
  isTerminal: activeMatch?.state.phase === 'finished',
  isAuthenticated,
  userId: user?.id,
  buildPayload: () => activeMatch?.state.phase === 'finished'
    ? buildAeroplaneHistoryPayload(activeMatch)
    : null,
  debugKey: 'AEROPLANE',
});
```

Do not add `savedRef`, generation refs, or retry timers to `useAeroplaneMatch`.

- [ ] **Step 3: Write Aeroplane integration tests**

```ts
test('terminal Aeroplane match builds trio payload once', async () => {
  const env = installHistoryTestEnv({ authenticated: true });
  const match = renderTerminalAeroplaneMatch();
  await env.flush();
  expect(env.playHistoryBodies).toHaveLength(1);
  expect(env.playHistoryBodies[0]).toMatchObject({
    gameId: 'aeroplane',
    opponentEngineId: 'aeroplane-trio-v1',
    status: 'win',
  });
});
```

Also assert repeated terminal renders do not produce another POST and signed-out play produces none. Retry/account-switch semantics remain in Task 9's generic suite rather than duplicated here.

- [ ] **Step 4: Update history UI contract**

`ServerPlayHistory.gameId` includes `aeroplane`; opponent engine ids include the trio; response includes `details`.

Labels:

```ts
const GAME_LABELS = {
  chess: 'Classical Chess',
  shogi: 'Shogi',
  xiangqi: 'Xiangqi',
  jungle: 'Jungle',
  aeroplane: 'Aeroplane Chess',
} satisfies Record<GameId, string>;
```

`aeroplane-trio-v1` displays `Local Aeroplane trio`. Any engine row displays `Unrated`. Keep `details` in the mocked GET response but do not render it yet, matching the real API projection from Task 10.

- [ ] **Step 5: Verify and commit**

```bash
cd apps/web
bun test src/hooks/useTerminalHistorySave.test.ts src/hooks/usePlayHistory.test.ts src/hooks/useAeroplaneMatch.test.ts src/components/PlayHistoryPage.test.tsx
bun run typecheck

git add src/lib/ai/opponent.ts src/lib/play-history.ts src/hooks/useAeroplaneMatch.ts src/hooks/useAeroplaneMatch.test.ts src/components/PlayHistoryPage.tsx src/components/PlayHistoryPage.test.tsx
git commit -m "feat(aeroplane): save unrated play history"
```

---

## Task 12: Add local chatter and deterministic end-to-end coverage

**Files:**
- Create: `apps/web/src/lib/aeroplane/chatter.ts`
- Create: `apps/web/src/lib/aeroplane/chatter.test.ts`
- Modify: `apps/web/src/hooks/useAeroplaneMatch.ts`
- Modify: `apps/web/src/hooks/useAeroplaneMatch.test.ts`
- Create: `apps/web/e2e/aeroplane.spec.ts`

**Interfaces:**
- Chatter is presentation-only and uses no gameplay RNG.
- E2E uses Task 6 DEV fixture contract, not production-only controls.

- [ ] **Step 1: Write chatter isolation tests**

```ts
test('same notable event produces stable local line without consuming RNG', () => {
  const before = { value: 123 };
  const first = getChatterLine(captureEvent, 'aggressive');
  const second = getChatterLine(captureEvent, 'aggressive');
  expect(first).toBe(second);
  expect(before).toEqual({ value: 123 });
});
```

Use local line tables for capture/flight/finish/win/loss and a stable event hash/index. Do not call provider services.

- [ ] **Step 2: Wire chatter after authoritative completion**

Generate/enqueue only after a committed notable event. When disabled, enqueue nothing. Chatter exceptions are swallowed/fall back to no line and never affect match state.

- [ ] **Step 3: Write deterministic E2E fixtures**

Use `page.addInitScript` to set `window.__PROCYON_AEROPLANE_FIXTURE__` before `/aeroplane` loads. Build focused fixtures for:

1. each human colour, verifying fixed AI seats and red-first automation;
2. launch and one full human + three AI turn cycle;
3. base arrival `30 → 34` versus flight `18 → 30`;
4. final-endpoint-only capture;
5. stacking and blockade crossing/landing rejection;
6. awaiting-choice reload/resume with next RNG preserved;
7. Quick two-plane deterministic victory;
8. signed-in completion submits exactly one Aeroplane history POST;
9. no provider configured and no AI Config rail/mobile control on Aeroplane.

- [ ] **Step 4: Run the full feature gate**

```bash
cd apps/web
bun test src/lib/aeroplane src/hooks/useAeroplaneMatch.test.ts src/hooks/useTerminalHistorySave.test.ts src/components/aeroplane/AeroplaneGame.test.tsx src/components/PlayHistoryPage.test.tsx
bun run typecheck
bunx playwright test e2e/aeroplane.spec.ts e2e/critical-user-journeys.spec.ts

cd ../api
bun test
bun run typecheck

cd ../..
bun run lint
bun run build
```

Expected: all commands exit 0. Fix any feature-caused regression before completing the task.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/aeroplane/chatter.ts apps/web/src/lib/aeroplane/chatter.test.ts apps/web/src/hooks/useAeroplaneMatch.ts apps/web/src/hooks/useAeroplaneMatch.test.ts apps/web/e2e/aeroplane.spec.ts
git commit -m "test(aeroplane): finish chatter and end-to-end coverage"
```

---

## Final verification checklist

Before marking HPA-391 complete, run fresh verification and confirm each item with evidence:

- [ ] `GAME_CONFIGS` remains four strategy variants; Aeroplane is absent from LLM factory/rule guardian/game-core.
- [ ] `/aeroplane` is excluded from AppShell AI provider UI/raw-key hydration.
- [ ] Selector Play actions are links and the existing homepage critical journey is green.
- [ ] Every widened accent map is exhaustive and includes Aeroplane.
- [ ] Resolver can analyze opponent planes; gameplay still rejects wrong-turn application.
- [ ] Base arrival at progress 30 jumps to 34; flight arrival at 30 stops.
- [ ] Cautious exposure regression proves opponent threat analysis is nonzero when expected.
- [ ] Same seed reproduces dice/AI; RNG inputs are immutable.
- [ ] Restore resumes exact state/seats/RNG without replay dependency.
- [ ] `0011` is rename-only and preserves a pre-existing play-history row.
- [ ] Existing LLM rating and Stockfish unrated tests pass after `gameId` rename.
- [ ] `useTerminalHistorySave` is the only owner of terminal save/retry policy.
- [ ] Aeroplane history is trio-paired, win/loss-only, unrated, shape-validated, and returned with `details`.
- [ ] History UI labels Aeroplane/trio/unrated and does not need a details panel for this slice.
- [ ] Skip Animations is idempotent and presentation/chatter consume no gameplay RNG.
- [ ] Targeted and full E2E gates pass, including exactly one history POST.
