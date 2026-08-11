# HPA-162 Local Rival MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish the local Stockfish rival MVP with three persisted/frozen difficulty presets and an engine-only 10-second move deadline that preserves the board and requires New Game after timeout.

**Architecture:** Extend the existing HPA-161 `GameSetup` → `ActiveRivalSession` → provider flow. Difficulty stays mutable only in setup/preferences, is frozen into `EngineOpponent` at Start, and is forwarded through an explicit engine factory into `StockfishRivalProvider`; timeout stays in `useChessRivalSession`, which already owns provider/session/request staleness and disposal.

**Tech Stack:** TypeScript 5.9, React 18, Astro 4, Bun 1.3 tests, Testing Library `renderHook`, Playwright 1.55, Stockfish 18.0.8 Web Worker.

## Global Constraints

- Offer exactly `casual`, `normal`, and `strong`.
- Display exactly **Casual**, **Normal**, and **Strong**.
- Map Stockfish Skill Level exactly: Casual `0`, Normal `8`, Strong `16`.
- Keep Stockfish movetime exactly `250` ms for every preset.
- Keep the existing Start deadline exactly `60_000` ms.
- Add an engine-move deadline exactly `10_000` ms; do not apply it to LLM moves.
- Default a fresh device to Casual and persist only the V2 key `procyon.chess.rival-preferences.v2`.
- Do not migrate or read the V1 preference key.
- Freeze difficulty only on successful Start; active/terminal UI reads the frozen session.
- On engine timeout: clear request ownership, detach/dispose the provider, preserve board/session, ignore late results, and require New Game.
- `clearError()` must not re-arm a committed engine session whose provider is gone.
- Do not add an engine registry, generic recovery state machine, provider cancellation protocol, same-position retry, Worker reconstruction, Elo/calibration claims, or server-side difficulty persistence.
- Selecting difficulty must not construct/download Stockfish; the current lazy Start boundary remains authoritative.

---

## File Structure

### Domain/session ownership

- Modify `apps/web/src/lib/chess/rival/types.ts`
  - add `EngineDifficulty`;
  - add `engineDifficulty` to `GameSetup`;
  - add frozen `difficulty` to `EngineOpponent`;
  - add `'timeout'` to `RivalMoveFailureReason`.
- Modify `apps/web/src/hooks/useChessRivalSession.ts`
  - add `ENGINE_MOVE_TIMEOUT_MS`;
  - add engine-only move race/disposal/dead-provider invariant;
  - make engine provider factory accept frozen difficulty;
  - freeze difficulty into engine opponent.
- Modify `apps/web/src/hooks/useChessRivalSession.test.tsx`
  - fake-timer timeout ownership tests first;
  - factory input/session freezing tests after domain type lands.
- Modify `apps/web/src/test/fakeRival.ts`
  - adapt injected engine factories to the explicit `{ difficulty }` input and record received difficulties.

### Device preferences/setup

- Modify `apps/web/src/lib/chess/rival/preferences.ts`
  - rewrite canonical payload/key from V1 to V2 atomically;
  - add `persistEngineDifficulty`.
- Modify `apps/web/src/lib/chess/rival/preferences.test.ts`
  - V2 default/round-trip/version/difficulty/storage tests.
- Modify `apps/web/src/hooks/useChessRivalSetup.ts`
  - carry difficulty through all setup reconstruction/equality paths;
  - expose `selectDifficulty`.
- Modify `apps/web/src/hooks/useChessRivalSetup.test.tsx`
  - V2 hydration, persistence, fallback, remembered difficulty, and selector callback tests.

### Stockfish integration

- Modify `apps/web/src/lib/chess/rival/stockfish-provider.ts`
  - require `difficulty` in provider options;
  - centralize 0/8/16 mapping beside provider;
  - use existing `formatSetSkillLevelCommand`;
  - keep 250 ms movetime.
- Modify `apps/web/src/lib/chess/rival/stockfish-provider.test.ts`
  - assert all three UCI Skill Level commands and unchanged movetime.

### UI/wiring

- Modify `apps/web/src/components/game/ChessRivalSetup.tsx`
  - add `onSelectDifficulty` prop and three engine-only radio choices.
- Modify `apps/web/src/components/game/ChessRivalSetup.test.tsx`
  - visibility, labels, selection, lock behavior, callback.
- Modify `apps/web/src/components/game/RivalSetupSummary.tsx`
  - include setup/frozen difficulty in engine summary.
- Modify `apps/web/src/components/game/RivalSetupSummary.test.tsx`
  - pre-Start and active-session source-of-truth tests.
- Modify `apps/web/src/components/game/EngineRivalDetails.tsx`
  - timeout-specific headline/copy; no move retry.
- Modify `apps/web/src/components/game/EngineRivalDetails.test.tsx`
  - distinguish Start-load retry from move-timeout New Game copy.
- Modify `apps/web/src/components/ChessGame.tsx`
  - pass `selectDifficulty` to setup UI; retain existing `onSetupChange → rivalSession.reset` and turn guard.
- Modify `apps/web/src/components/ChessGame.test.tsx`
  - focused integration coverage for timeout board preservation/New Game and difficulty wiring.

### Real packaged engine smoke

- Modify `apps/web/e2e/stockfish-assets.spec.ts`
  - extend readiness test through real `bestmove`;
  - reuse `parseBestMove` and `makeAIMove` for legality.

---

### Task 1: Prove and implement engine move timeout ownership first

**Files:**
- Modify: `apps/web/src/lib/chess/rival/types.ts`
- Modify: `apps/web/src/hooks/useChessRivalSession.ts`
- Test: `apps/web/src/hooks/useChessRivalSession.test.tsx`

**Interfaces:**
- Consumes: existing `PendingMoveRequest`, `providerRef`, `activeSessionRef`, `resolvePending`, `isCurrent`, `RivalSessionError`, and `reset()` ownership.
- Produces: `ENGINE_MOVE_TIMEOUT_MS = 10_000`, `RivalMoveFailureReason` including `'timeout'`, engine-only timeout behavior, and the invariant that a dead committed engine provider cannot be revived by `clearError()`.

- [ ] **Step 1: Add failing fake-timer tests for the basic timeout contract**

Add `ENGINE_MOVE_TIMEOUT_MS` to the hook import and add a controllable pending engine move test using the existing `deferred()` helper:

```ts
import {
	ENGINE_MOVE_TIMEOUT_MS,
	ENGINE_START_TIMEOUT_MS,
	useChessRivalSession,
	// existing type imports...
} from './useChessRivalSession';

test('engine move times out, disposes provider, preserves session, and returns timeout', async () => {
	const move = deferred<RivalMoveResult>();
	const provider = new FakeRivalProvider('engine');
	provider.onMakeMove = () => move.promise;
	const { result } = renderSession({
		createEngineProvider: mock(() => provider),
	});

	await act(async () => {
		await result.current.start(startInput());
	});
	const committedId = result.current.activeSession?.id;

	jest.useFakeTimers();
	try {
		let pending!: Promise<RivalMoveResult | null>;
		act(() => {
			pending = result.current.requestMove(makeContext(makeGameState()));
		});
		expect(result.current.rivalThinking).toBe(true);

		let outcome: RivalMoveResult | null = null;
		await act(async () => {
			advanceTimers(ENGINE_MOVE_TIMEOUT_MS);
			outcome = await pending;
		});

		expect(outcome).toEqual({
			ok: false,
			reason: 'timeout',
			message: 'The on-device computer took too long to move.',
		});
		expect(provider.disposeCount).toBe(1);
		expect(result.current.activeSession?.id).toBe(committedId);
		expect(result.current.rivalThinking).toBe(false);
		expect(result.current.rivalError).toMatchObject({
			kind: 'move-failed',
			reason: 'timeout',
		});
	} finally {
		jest.useRealTimers();
	}
});
```

- [ ] **Step 2: Run the focused test and confirm the red state**

Run:

```bash
cd apps/web && bun test src/hooks/useChessRivalSession.test.tsx
```

Expected: FAIL because `ENGINE_MOVE_TIMEOUT_MS` / `'timeout'` and timeout behavior do not exist.

- [ ] **Step 3: Add the minimal timeout type/constant/message**

In `types.ts`:

```ts
export type RivalMoveFailureReason =
	| 'no-move'
	| 'invalid-response'
	| 'invalid-move'
	| 'protocol-error'
	| 'timeout';
```

In `useChessRivalSession.ts` beside the Start deadline:

```ts
export const ENGINE_MOVE_TIMEOUT_MS = 10_000;
```

Extend the existing exhaustive message map:

```ts
const failureMessages: Record<RivalMoveFailureReason, string> = {
	'no-move': 'The opponent did not return a move.',
	'invalid-response': 'The opponent returned an invalid response.',
	'invalid-move': 'The opponent attempted an invalid move.',
	'protocol-error': 'The opponent failed to communicate a move.',
	timeout: 'The on-device computer took too long to move.',
};
```

- [ ] **Step 4: Implement the engine-only race inside `requestMove`**

Keep the existing pending-request setup and `isCurrent()` checks. Replace the direct engine await with an outcome wrapper so provider rejection is handled even after the race:

```ts
type ProviderOutcome =
	| { kind: 'result'; result: RivalMoveResult }
	| { kind: 'error'; error: unknown };

const providerOutcome: Promise<ProviderOutcome> = provider
	.makeMove(context.gameState, requestId)
	.then(
		result => ({ kind: 'result', result }) as const,
		error => ({ kind: 'error', error }) as const
	);

let outcome: ProviderOutcome | { kind: 'timeout' };
if (session.opponent.kind === 'engine') {
	let timeoutHandle: ReturnType<typeof setTimeout> | null = null;
	const deadline = new Promise<{ kind: 'timeout' }>(resolve => {
		timeoutHandle = setTimeout(
			() => resolve({ kind: 'timeout' }),
			ENGINE_MOVE_TIMEOUT_MS
		);
	});
	outcome = await Promise.race([providerOutcome, deadline]);
	if (timeoutHandle !== null) clearTimeout(timeoutHandle);
} else {
	outcome = await providerOutcome;
}
```

Handle a current timeout before the existing success/error branches:

```ts
if (outcome.kind === 'timeout') {
	if (!isCurrent()) {
		resolvePending();
		return null;
	}

	if (pendingRequestRef.current === pending) {
		pendingRequestRef.current = null;
	}
	if (providerRef.current === provider) {
		providerRef.current = null;
	}
	setRivalThinking(false);
	provider.dispose();

	const message = failureMessages.timeout;
	setRivalError({ kind: 'move-failed', reason: 'timeout', message });
	return { ok: false, reason: 'timeout', message };
}
```

For `{ kind: 'error' }`, preserve the current stale check and `unexpected` error behavior; for `{ kind: 'result' }`, continue the existing typed result path.

- [ ] **Step 5: Run the focused hook test and make the basic timeout case green**

Run:

```bash
cd apps/web && bun test src/hooks/useChessRivalSession.test.tsx
```

Expected: PASS for the new timeout test and all existing Start/move tests.

- [ ] **Step 6: Add failing stale/disposal tests before expanding implementation**

Add separate tests proving all ownership edges:

```ts
test('late engine result after timeout is ignored', async () => {
	const move = deferred<RivalMoveResult>();
	const provider = new FakeRivalProvider('engine');
	provider.onMakeMove = () => move.promise;
	const { result } = renderSession({ createEngineProvider: mock(() => provider) });
	await act(async () => void (await result.current.start(startInput())));

	jest.useFakeTimers();
	try {
		let pending!: Promise<RivalMoveResult | null>;
		act(() => {
			pending = result.current.requestMove(makeContext(makeGameState()));
		});
		await act(async () => {
			advanceTimers(ENGINE_MOVE_TIMEOUT_MS);
			expect(await pending).toMatchObject({ ok: false, reason: 'timeout' });
		});

		await act(async () => {
			move.resolve({ ok: true, move: sampleMove });
			await Promise.resolve();
		});

		expect(result.current.rivalError).toMatchObject({ reason: 'timeout' });
		expect(provider.disposeCount).toBe(1);
	} finally {
		jest.useRealTimers();
	}
});
```

Add three more explicit cases in the same file:

```ts
// reset before deadline: no timeout error is written after advancing 10s
// newer Start after reset: old deadline never disposes the newer provider
// LLM pending move: advancing ENGINE_MOVE_TIMEOUT_MS does not settle it
```

Implement those cases with the existing `deferred`, `orderedEngineFactory`, `reset`, and LLM factory helpers; assert exact provider `disposeCount` values and `rivalError` state rather than only checking promise completion.

- [ ] **Step 7: Add the dead-provider `clearError()` regression test**

```ts
test('clearError cannot re-arm a timed-out committed engine session', async () => {
	const provider = new FakeRivalProvider({
		kind: 'engine',
		makeMove: () => new Promise<RivalMoveResult>(() => {}),
	});
	const { result } = renderSession({ createEngineProvider: mock(() => provider) });
	await act(async () => void (await result.current.start(startInput())));

	jest.useFakeTimers();
	try {
		let pending!: Promise<RivalMoveResult | null>;
		act(() => {
			pending = result.current.requestMove(makeContext(makeGameState()));
		});
		await act(async () => {
			advanceTimers(ENGINE_MOVE_TIMEOUT_MS);
			await pending;
		});

		act(() => result.current.clearError());
		expect(result.current.rivalError).toMatchObject({ reason: 'timeout' });
		expect(result.current.activeSession).not.toBeNull();
	} finally {
		jest.useRealTimers();
	}
});
```

- [ ] **Step 8: Make `clearError()` preserve a dead engine error**

```ts
const clearError = useCallback(() => {
	if (
		activeSessionRef.current?.opponent.kind === 'engine' &&
		providerRef.current === null
	) {
		return;
	}
	setRivalError(null);
}, []);
```

Do not expose provider liveness through the hook result.

- [ ] **Step 9: Run the focused session suite and typecheck**

Run:

```bash
cd apps/web && bun test src/hooks/useChessRivalSession.test.tsx
cd apps/web && bun run typecheck
```

Expected: PASS.

- [ ] **Step 10: Commit the risk-first timeout slice**

```bash
git add apps/web/src/lib/chess/rival/types.ts \
  apps/web/src/hooks/useChessRivalSession.ts \
  apps/web/src/hooks/useChessRivalSession.test.tsx
git commit -m "feat: bound local engine move requests"
```

---

### Task 2: Rewrite preferences to V2 and freeze difficulty through the session factory

**Files:**
- Modify: `apps/web/src/lib/chess/rival/types.ts`
- Modify: `apps/web/src/lib/chess/rival/preferences.ts`
- Test: `apps/web/src/lib/chess/rival/preferences.test.ts`
- Modify: `apps/web/src/hooks/useChessRivalSetup.ts`
- Test: `apps/web/src/hooks/useChessRivalSetup.test.tsx`
- Modify: `apps/web/src/hooks/useChessRivalSession.ts`
- Test: `apps/web/src/hooks/useChessRivalSession.test.tsx`
- Modify: `apps/web/src/test/fakeRival.ts`
- Modify existing test fixtures that construct `GameSetup` / engine opponents in `apps/web/src/components/game/ChessRivalSetup.test.tsx` and `apps/web/src/components/game/RivalSetupSummary.test.tsx` so the required difficulty field compiles.

**Interfaces:**
- Consumes: timeout-capable session hook from Task 1.
- Produces: `EngineDifficulty`, required `GameSetup.engineDifficulty`, frozen `EngineOpponent.difficulty`, V2 preference helpers, `selectDifficulty`, and `createEngineProvider({ difficulty })`.

- [ ] **Step 1: Write V2 preference tests before rewriting the module**

Change the preference test fixture to:

```ts
const defaultPreferences: RivalPreferencesV2 = {
	version: 2,
	lastRivalKind: 'engine',
	humanSideByRival: {
		engine: 'white',
		llm: 'white',
	},
	engineDifficulty: 'casual',
};
```

Add explicit tests:

```ts
test('uses the V2 storage key and ignores V1', () => {
	const storage = createMemoryStorage({
		'procyon.chess.rival-preferences.v1': JSON.stringify({
			version: 1,
			lastRivalKind: 'llm',
			humanSideByRival: { engine: 'black', llm: 'black' },
		}),
	});

	expect(RIVAL_PREFERENCES_STORAGE_KEY).toBe(
		'procyon.chess.rival-preferences.v2'
	);
	expect(readRivalPreferences(storage)).toEqual(defaultPreferences);
});

test('persists engine difficulty independently in V2', () => {
	const storage = createMemoryStorage();
	persistRivalKind(storage, 'llm');
	persistHumanSide(storage, 'engine', 'black');
	persistEngineDifficulty(storage, 'strong');

	expect(readRivalPreferences(storage)).toEqual({
		version: 2,
		lastRivalKind: 'llm',
		humanSideByRival: { engine: 'black', llm: 'white' },
		engineDifficulty: 'strong',
	});
});
```

Add invalid `engineDifficulty`, corrupt JSON, wrong-version/future-version, and throwing-storage cases; each must fall back to the full V2 default or remain non-throwing as appropriate.

- [ ] **Step 2: Run the preference suite and confirm it fails on V1**

```bash
cd apps/web && bun test src/lib/chess/rival/preferences.test.ts
```

Expected: FAIL because the module is still V1 and has no `persistEngineDifficulty`.

- [ ] **Step 3: Add the difficulty domain fields**

In `types.ts`:

```ts
export type EngineDifficulty = 'casual' | 'normal' | 'strong';

export type EngineOpponent = {
	kind: 'engine';
	id: 'stockfish';
	difficulty: EngineDifficulty;
};

export interface GameSetup {
	rivalKind: RivalKind;
	humanSide: ChessSide;
	engineDifficulty: EngineDifficulty;
}
```

Update every existing `GameSetup` literal touched by the focused rival tests to include `engineDifficulty: 'casual'` unless the test specifically needs Normal/Strong.

- [ ] **Step 4: Rewrite `preferences.ts` atomically to V2**

Use one canonical key/type only:

```ts
import type {
	ChessSide,
	EngineDifficulty,
	RivalKind,
} from './types';

export const RIVAL_PREFERENCES_STORAGE_KEY =
	'procyon.chess.rival-preferences.v2';

export interface RivalPreferencesV2 {
	version: 2;
	lastRivalKind: RivalKind;
	humanSideByRival: Record<RivalKind, ChessSide>;
	engineDifficulty: EngineDifficulty;
}
```

Add validation:

```ts
function isEngineDifficulty(value: unknown): value is EngineDifficulty {
	return value === 'casual' || value === 'normal' || value === 'strong';
}
```

Return V2 from `createDefaultRivalPreferences`, `parseRivalPreferences`, `readRivalPreferences`, and internal `writeRivalPreferences`. Add:

```ts
export function persistEngineDifficulty(
	storage: RivalPreferenceStorage,
	difficulty: EngineDifficulty
): void {
	const preferences = readRivalPreferences(storage);
	writeRivalPreferences(storage, {
		...preferences,
		engineDifficulty: difficulty,
	});
}
```

Do not add a V1 parser or migration branch.

- [ ] **Step 5: Run preference tests to green before touching setup hook behavior**

```bash
cd apps/web && bun test src/lib/chess/rival/preferences.test.ts
```

Expected: PASS.

- [ ] **Step 6: Write setup-hook tests for hydration and `selectDifficulty`**

Update the setup test helper to `RivalPreferencesV2` and add `engineDifficulty` to expected setup objects.

Add:

```ts
test('hydrates remembered engine difficulty', async () => {
	const memory = createStorage(
		storedPreferences({ engineDifficulty: 'strong' })
	);
	const { result } = renderHook(() =>
		useChessRivalSetup(createOptions({ storage: memory.storage }))
	);
	await waitForResolved(result);

	expect(result.current.setup.engineDifficulty).toBe('strong');
});

test('selectDifficulty persists, updates setup, and notifies setup change', async () => {
	const memory = createStorage();
	const onSetupChange = mock(() => {});
	const { result } = renderHook(() =>
		useChessRivalSetup(
			createOptions({ storage: memory.storage, onSetupChange })
		)
	);
	await waitForResolved(result);

	act(() => result.current.selectDifficulty('normal'));

	expect(result.current.setup.engineDifficulty).toBe('normal');
	expect(memory.read()?.engineDifficulty).toBe('normal');
	expect(onSetupChange).toHaveBeenCalledWith({
		rivalKind: 'engine',
		humanSide: 'white',
		engineDifficulty: 'normal',
	});
});
```

Also assert switching engine → LLM → engine retains remembered engine difficulty and automatic fallback never changes it.

- [ ] **Step 7: Extend every setup reconstruction path in `useChessRivalSetup`**

Update imports/types to V2 and add the default:

```ts
const defaultSetup: GameSetup = {
	rivalKind: 'engine',
	humanSide: 'white',
	engineDifficulty: 'casual',
};
```

`setupForResolution`:

```ts
function setupForResolution(
	preferences: RivalPreferencesV2,
	resolution: ResolvedSetupKind
): GameSetup {
	return {
		rivalKind: resolution.kind,
		humanSide: preferences.humanSideByRival[resolution.kind],
		engineDifficulty: preferences.engineDifficulty,
	};
}
```

`setupsEqual` must compare all three fields.

`selectRival` must build `nextSetup` with `engineDifficulty: nextPreferences.engineDifficulty`; `selectHumanSide` already spreads current setup and therefore preserves it.

Add result contract + selector:

```ts
selectDifficulty(difficulty: EngineDifficulty): void;
```

```ts
const selectDifficulty = useCallback(
	(difficulty: EngineDifficulty) => {
		setupTouchedRef.current = true;
		explicitKindRef.current = setup.rivalKind;
		clearedFallbackNoticeRef.current = null;
		setFallbackNotice(null);

		const nextPreferences: RivalPreferencesV2 = {
			...preferences,
			engineDifficulty: difficulty,
		};
		const nextSetup: GameSetup = {
			...setup,
			engineDifficulty: difficulty,
		};

		if (storageRef.current) {
			persistEngineDifficulty(storageRef.current, difficulty);
		}
		setPreferences(nextPreferences);
		setSetup(nextSetup);
		onSetupChange?.(nextSetup);
	},
	[onSetupChange, preferences, setup]
);
```

Return `selectDifficulty` with the existing selectors.

- [ ] **Step 8: Write the engine factory/session freezing test**

Update `engineSetup` in the session test:

```ts
const engineSetup: GameSetup = {
	rivalKind: 'engine',
	humanSide: 'white',
	engineDifficulty: 'normal',
};
```

Add:

```ts
test('engine Start forwards and freezes the Start difficulty', async () => {
	const provider = new FakeRivalProvider('engine');
	const factory = mock(({ difficulty }: { difficulty: EngineDifficulty }) => {
		expect(difficulty).toBe('normal');
		return provider;
	});
	const { result } = renderSession({ createEngineProvider: factory });

	let session: ActiveRivalSession | null = null;
	await act(async () => {
		session = await result.current.start(startInput());
	});

	expect(session?.opponent).toEqual({
		kind: 'engine',
		id: 'stockfish',
		difficulty: 'normal',
	});
});
```

Add a second assertion using a separate mutable setup object: mutate its `engineDifficulty` after Start and verify the committed opponent remains Normal.

- [ ] **Step 9: Change the engine factory signature and frozen opponent construction**

In `UseChessRivalSessionOptions`:

```ts
createEngineProvider?: (input: {
	difficulty: EngineDifficulty;
}) => ChessRivalProvider;
```

Change the default factory:

```ts
function defaultCreateEngineProvider({
	difficulty,
}: {
	difficulty: EngineDifficulty;
}): ChessRivalProvider {
	return new StockfishRivalProvider({ difficulty });
}
```

Change Start construction:

```ts
candidate =
	input.setup.rivalKind === 'engine'
		? engineFactoryRef.current({
				difficulty: input.setup.engineDifficulty,
			})
		: llmFactoryRef.current({ config: frozenConfig });
```

Change engine opponent creation:

```ts
return {
	kind: 'engine',
	id: 'stockfish',
	difficulty: setup.engineDifficulty,
};
```

- [ ] **Step 10: Update `fakeRival.ts` engine factory helpers to record difficulty inputs**

Use the production factory type rather than maintaining a divergent zero-arg fake:

```ts
export function engineFactory(
	makeCfg: (index: number) => FakeProviderConfig = () => ({})
): {
	create: NonNullable<UseChessRivalSessionOptions['createEngineProvider']>;
	instances: FakeRivalProvider[];
	difficulties: EngineDifficulty[];
} {
	const instances: FakeRivalProvider[] = [];
	const difficulties: EngineDifficulty[] = [];
	const create: NonNullable<
		UseChessRivalSessionOptions['createEngineProvider']
	> = ({ difficulty }) => {
		difficulties.push(difficulty);
		const provider = new FakeRivalProvider({
			...makeCfg(instances.length),
			kind: 'engine',
		});
		instances.push(provider);
		return provider;
	};
	return { create, instances, difficulties };
}
```

Update `engineOptions` to return `difficulties` too. Keep fake provider behavior otherwise unchanged.

- [ ] **Step 11: Run domain/preferences/setup/session tests and typecheck**

```bash
cd apps/web && bun test \
  src/lib/chess/rival/preferences.test.ts \
  src/hooks/useChessRivalSetup.test.tsx \
  src/hooks/useChessRivalSession.test.tsx
cd apps/web && bun run typecheck
```

Expected: PASS. Typecheck is important here because required `GameSetup.engineDifficulty` deliberately exposes missed fixture/call-site updates.

- [ ] **Step 12: Commit the atomic V2/freeze contract**

```bash
git add apps/web/src/lib/chess/rival/types.ts \
  apps/web/src/lib/chess/rival/preferences.ts \
  apps/web/src/lib/chess/rival/preferences.test.ts \
  apps/web/src/hooks/useChessRivalSetup.ts \
  apps/web/src/hooks/useChessRivalSetup.test.tsx \
  apps/web/src/hooks/useChessRivalSession.ts \
  apps/web/src/hooks/useChessRivalSession.test.tsx \
  apps/web/src/test/fakeRival.ts \
  apps/web/src/components/game/ChessRivalSetup.test.tsx \
  apps/web/src/components/game/RivalSetupSummary.test.tsx
git commit -m "feat: persist frozen local rival difficulty"
```

---

### Task 3: Map frozen difficulty to Stockfish Skill Level without changing movetime

**Files:**
- Modify: `apps/web/src/lib/chess/rival/stockfish-provider.ts`
- Test: `apps/web/src/lib/chess/rival/stockfish-provider.test.ts`

**Interfaces:**
- Consumes: `EngineDifficulty` and `new StockfishRivalProvider({ difficulty })` from Task 2; existing `formatSetSkillLevelCommand`, Skill Level advertisement parsing, and `formatGoCommand`.
- Produces: one Stockfish-specific 0/8/16 mapping; provider construction requires difficulty; movetime remains 250 ms.

- [ ] **Step 1: Add failing provider tests for all three presets**

Use the existing fake Worker command capture. For each provider, complete `uci`/`uciok` + Skill Level advertisement + ready handshake, then assert the emitted command:

```ts
expect(casualWorker.messages).toContain(
	'setoption name Skill Level value 0'
);
expect(normalWorker.messages).toContain(
	'setoption name Skill Level value 8'
);
expect(strongWorker.messages).toContain(
	'setoption name Skill Level value 16'
);
```

Add one move test per preset or a table-driven test and assert every command list contains:

```ts
'go movetime 250'
```

Update all existing provider test constructors to pass an explicit difficulty, normally `'casual'`.

- [ ] **Step 2: Run provider tests and confirm Normal/Strong fail**

```bash
cd apps/web && bun test src/lib/chess/rival/stockfish-provider.test.ts
```

Expected: FAIL because the provider still hard-codes Skill Level 0.

- [ ] **Step 3: Replace the fixed skill constant with the centralized mapping**

```ts
import type {
	EngineDifficulty,
	RivalMoveResult,
} from './types';

const STOCKFISH_MOVE_TIME_MS = 250;
const STOCKFISH_SKILL_LEVEL_BY_DIFFICULTY = {
	casual: 0,
	normal: 8,
	strong: 16,
} as const satisfies Record<EngineDifficulty, number>;

export interface StockfishRivalProviderOptions {
	difficulty: EngineDifficulty;
	workerFactory?: WorkerFactory;
	origin?: string;
	baseUrl?: string;
}
```

Store the supplied difficulty:

```ts
private readonly difficulty: EngineDifficulty;

constructor(options: StockfishRivalProviderOptions) {
	this.difficulty = options.difficulty;
	// existing Worker setup...
}
```

Change initialization only:

```ts
this.postCommand(
	formatSetSkillLevelCommand(
		STOCKFISH_SKILL_LEVEL_BY_DIFFICULTY[this.difficulty]
	)
);
```

Do not change `STOCKFISH_MOVE_TIME_MS` or `makeMove` search command construction.

- [ ] **Step 4: Run provider + protocol tests**

```bash
cd apps/web && bun test \
  src/lib/chess/rival/stockfish-provider.test.ts \
  src/lib/chess/rival/stockfish-protocol.test.ts
```

Expected: PASS, including the existing test that fails initialization when Stockfish does not advertise `Skill Level`.

- [ ] **Step 5: Commit the Stockfish mapping**

```bash
git add apps/web/src/lib/chess/rival/stockfish-provider.ts \
  apps/web/src/lib/chess/rival/stockfish-provider.test.ts
git commit -m "feat: map local rival difficulty to Stockfish"
```

---

### Task 4: Add difficulty setup controls and frozen summaries

**Files:**
- Modify: `apps/web/src/components/game/ChessRivalSetup.tsx`
- Test: `apps/web/src/components/game/ChessRivalSetup.test.tsx`
- Modify: `apps/web/src/components/game/RivalSetupSummary.tsx`
- Test: `apps/web/src/components/game/RivalSetupSummary.test.tsx`
- Modify: `apps/web/src/components/ChessGame.tsx`
- Test: `apps/web/src/components/ChessGame.test.tsx`

**Interfaces:**
- Consumes: `GameSetup.engineDifficulty`, `EngineOpponent.difficulty`, and `useChessRivalSetup.selectDifficulty` from Task 2.
- Produces: exactly three engine-only controls wired through the existing setup-reset path and summaries that switch from editable setup to frozen session after Start.

- [ ] **Step 1: Add failing component tests for engine-only difficulty controls**

In `ChessRivalSetup.test.tsx`, pass an `onSelectDifficulty` mock and assert:

```ts
expect(screen.getByRole('radio', { name: 'Casual' })).toBeInTheDocument();
expect(screen.getByRole('radio', { name: 'Normal' })).toBeInTheDocument();
expect(screen.getByRole('radio', { name: 'Strong' })).toBeInTheDocument();
```

For `setup.engineDifficulty: 'casual'`:

```ts
expect(screen.getByRole('radio', { name: 'Casual' })).toBeChecked();
```

Click Normal and assert:

```ts
expect(onSelectDifficulty).toHaveBeenCalledWith('normal');
```

Rerender with `rivalKind: 'llm'` and assert all three difficulty radios are absent. Rerender with `disabled` and assert all three engine difficulty radios are disabled.

- [ ] **Step 2: Run setup component tests and confirm they fail**

```bash
cd apps/web && bun test src/components/game/ChessRivalSetup.test.tsx
```

Expected: FAIL because the prop/control does not exist.

- [ ] **Step 3: Add the explicit `onSelectDifficulty` prop and controls**

Extend imports/props:

```ts
import type {
	ActiveRivalSession,
	ChessSide,
	EngineDifficulty,
	EnginePreflight,
	GameSetup,
	LlmUsability,
	RivalKind,
} from '../../lib/chess/rival/types';

interface ChessRivalSetupProps {
	// existing props...
	onSelectRival: (kind: RivalKind) => void;
	onSelectHumanSide: (side: ChessSide) => void;
	onSelectDifficulty: (difficulty: EngineDifficulty) => void;
}
```

Use a local fixed option list; no registry/config layer:

```ts
const engineDifficultyOptions: Array<{
	value: EngineDifficulty;
	label: string;
}> = [
	{ value: 'casual', label: 'Casual' },
	{ value: 'normal', label: 'Normal' },
	{ value: 'strong', label: 'Strong' },
];
```

Render the group only under:

```tsx
{setup.rivalKind === 'engine' && (
	<fieldset disabled={disabled}>
		<legend>Difficulty</legend>
		{engineDifficultyOptions.map(option => (
			<label key={option.value}>
				<input
					type='radio'
					name='engine-difficulty'
					value={option.value}
					aria-label={option.label}
					checked={setup.engineDifficulty === option.value}
					disabled={disabled}
					onChange={() => onSelectDifficulty(option.value)}
				/>
				{option.label}
			</label>
		))}
	</fieldset>
)}
```

Apply the repository's existing classes/markup style rather than introducing new component primitives.

- [ ] **Step 4: Add failing summary tests for editable vs frozen difficulty**

In `RivalSetupSummary.test.tsx`:

```ts
expect(
	screen.getByText('On-device computer · Casual · Computer plays Black · Unrated')
).toBeInTheDocument();
```

For an active session whose opponent has `difficulty: 'strong'` while setup says Casual:

```ts
expect(
	screen.getByText('On-device computer · Strong · Computer plays Black · Unrated')
).toBeInTheDocument();
expect(screen.queryByText(/Casual/)).not.toBeInTheDocument();
```

- [ ] **Step 5: Update `RivalSetupSummary` source-of-truth selection**

Keep LLM formatting untouched. For engine sessions choose:

```ts
const difficulty =
	activeSession?.opponent.kind === 'engine'
		? activeSession.opponent.difficulty
		: setup.engineDifficulty;
```

Format the label with an exhaustive local switch/function:

```ts
function difficultyLabel(value: EngineDifficulty): string {
	switch (value) {
		case 'casual':
			return 'Casual';
		case 'normal':
			return 'Normal';
		case 'strong':
			return 'Strong';
	}
}
```

Insert that label into the existing engine summary text; do not add Elo text.

- [ ] **Step 6: Wire the selector through `ChessGame` and prove it uses existing reset ownership**

Where `ChessRivalSetup` is rendered, add:

```tsx
onSelectDifficulty={rivalSetup.selectDifficulty}
```

Do not add a difficulty-specific reset callback. `useChessRivalSetup` already calls `onSetupChange`, and `ChessGame` already supplies `rivalSession.reset` there.

Add a focused `ChessGame.test.tsx` assertion: select Normal before Start, then Start, and verify the visible active summary contains Normal. Keep the existing assertion that no `/vendor/stockfish/*` request/construction occurs before explicit Start.

- [ ] **Step 7: Run setup/summary/game tests**

```bash
cd apps/web && bun test \
  src/components/game/ChessRivalSetup.test.tsx \
  src/components/game/RivalSetupSummary.test.tsx \
  src/components/ChessGame.test.tsx
```

Expected: PASS.

- [ ] **Step 8: Commit the difficulty UI slice**

```bash
git add apps/web/src/components/game/ChessRivalSetup.tsx \
  apps/web/src/components/game/ChessRivalSetup.test.tsx \
  apps/web/src/components/game/RivalSetupSummary.tsx \
  apps/web/src/components/game/RivalSetupSummary.test.tsx \
  apps/web/src/components/ChessGame.tsx \
  apps/web/src/components/ChessGame.test.tsx
git commit -m "feat: add local rival difficulty controls"
```

---

### Task 5: Present engine timeout as New-Game-only recovery and prove board preservation

**Files:**
- Modify: `apps/web/src/components/game/EngineRivalDetails.tsx`
- Test: `apps/web/src/components/game/EngineRivalDetails.test.tsx`
- Test/possibly wiring-only modify: `apps/web/src/components/ChessGame.test.tsx`
- Modify `apps/web/src/components/ChessGame.tsx` only if a focused test reveals missing wiring; do not add a second timeout lifecycle owner.

**Interfaces:**
- Consumes: typed timeout `RivalSessionError`, dead-provider `clearError` invariant, and existing `ChessGame` failure path/turn guard from Task 1.
- Produces: timeout-specific user copy, no move retry action, and integration proof that the board stays unchanged until New Game.

- [ ] **Step 1: Add failing timeout presentation test**

Render `EngineRivalDetails` with:

```ts
rivalError={{
	kind: 'move-failed',
	reason: 'timeout',
	message: 'The on-device computer took too long to move.',
}}
```

Assert:

```ts
expect(screen.getByText('Computer move timed out')).toBeInTheDocument();
expect(
	screen.getByText('The on-device computer took too long to move.')
).toBeInTheDocument();
expect(screen.getByText(/Start a New Game/)).toBeInTheDocument();
expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
```

Keep the existing Start-load failure test asserting **Try again** remains available when `startState === 'load-failed'`.

- [ ] **Step 2: Implement timeout-specific heading only inside existing error branch**

```tsx
const errorHeading =
	rivalError?.reason === 'timeout'
		? 'Computer move timed out'
		: 'Computer move failed';
```

Use `errorHeading` in the current `rivalError` panel and keep the existing New Game instruction. Do not add an engine move retry button.

- [ ] **Step 3: Add a `ChessGame` integration test for timeout board preservation**

Inject an engine provider whose `makeMove` never settles. Start a game, capture the displayed board state/FEN-facing behavior already used in the test suite, advance fake timers through the move deadline, then assert:

```ts
// timeout copy is visible
// no provider move was applied
// active rival summary still shows the frozen difficulty
// setup controls remain locked
// provider disposeCount is 1
```

Then trigger the existing **New Game** action and assert setup becomes editable and a new Start can construct a fresh provider. Do not call `clearError()` from UI code for the engine path.

- [ ] **Step 4: Run focused UI/game timeout tests**

```bash
cd apps/web && bun test \
  src/components/game/EngineRivalDetails.test.tsx \
  src/components/ChessGame.test.tsx \
  src/hooks/useChessRivalSession.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Commit timeout presentation/integration**

```bash
git add apps/web/src/components/game/EngineRivalDetails.tsx \
  apps/web/src/components/game/EngineRivalDetails.test.tsx \
  apps/web/src/components/ChessGame.test.tsx \
  apps/web/src/components/ChessGame.tsx
git commit -m "feat: show local engine timeout recovery"
```

If `ChessGame.tsx` needed no production change in this task, omit it from `git add`.

---

### Task 6: Extend the packaged Stockfish smoke through one legal real move

**Files:**
- Modify: `apps/web/e2e/stockfish-assets.spec.ts`

**Interfaces:**
- Consumes: existing production asset smoke, `parseBestMove` from `src/lib/chess/rival/stockfish-protocol.ts`, `createInitialGameState`/`makeAIMove` from `src/lib/chess/game.ts`.
- Produces: browser proof that the distributed Stockfish Worker can return at least one starting move that Procyon's chess rules accept.

- [ ] **Step 1: Add source imports and change the readiness test to expect a returned `bestmove` line**

At the top of the spec add:

```ts
import { createInitialGameState, makeAIMove } from '../src/lib/chess/game';
import { parseBestMove } from '../src/lib/chess/rival/stockfish-protocol';
```

Rename the test to:

```ts
test('starts packaged Stockfish and returns a legal move', async ({ page }) => {
```

- [ ] **Step 2: Extend the browser-side Worker sequence**

Keep the existing console/failed-request capture and auth stub. Change `page.evaluate` to return the first `bestmove` line:

```ts
const bestMoveLine = await page.evaluate(
	async ({ scriptPath }) => {
		const worker = new Worker(scriptPath);
		const messages: string[] = [];

		const waitForMessage = (predicate: (line: string) => boolean) =>
			new Promise<string>((resolve, reject) => {
				const timeout = window.setTimeout(() => {
					worker.removeEventListener('message', onMessage);
					reject(
						new Error(`Timed out. Messages: ${messages.join('\n')}`)
					);
				}, 15_000);

				function onMessage(event: MessageEvent<string>) {
					const line = String(event.data);
					messages.push(line);
					if (predicate(line)) {
						window.clearTimeout(timeout);
						worker.removeEventListener('message', onMessage);
						resolve(line);
					}
				}
				worker.addEventListener('message', onMessage);
			});

		try {
			worker.postMessage('uci');
			await waitForMessage(line => line.includes('uciok'));
			worker.postMessage('ucinewgame');
			worker.postMessage('isready');
			await waitForMessage(line => line.includes('readyok'));
			worker.postMessage('position startpos');
			worker.postMessage('go movetime 250');
			return await waitForMessage(line => line.startsWith('bestmove '));
		} finally {
			worker.terminate();
		}
	},
	{ scriptPath: STOCKFISH_JS_PATH }
);
```

Do not duplicate UCI move parsing in browser code.

- [ ] **Step 3: Parse and validate the returned move with Procyon rules**

After `page.evaluate`:

```ts
const parsed = parseBestMove(bestMoveLine);
expect(parsed?.ok).toBe(true);
if (!parsed || !parsed.ok) {
	throw new Error(`Stockfish did not return a legal move payload: ${bestMoveLine}`);
}

const initial = createInitialGameState('human-vs-ai', 'white');
const next = makeAIMove(
	initial,
	parsed.move.from,
	parsed.move.to,
	parsed.move.promotion
);
expect(next).not.toBeNull();
```

Use the existing initial-state mode/side arguments required for White to move in the test; if `createInitialGameState`'s current helper contract encodes AI side differently, select the combination that produces the standard initial FEN with `currentPlayer === 'white'`. Do not assert an exact opening move.

Keep the existing `consoleErrors` and failed asset request assertions after the legality assertion.

- [ ] **Step 4: Run the packaged Stockfish smoke**

```bash
cd apps/web && bun run test:e2e:stockfish-assets
```

Expected: PASS; the real bundled Worker completes UCI readiness and produces one move accepted by `makeAIMove`.

- [ ] **Step 5: Run existing rival E2E to preserve lazy loading and opponent selection**

```bash
cd apps/web && bunx playwright test e2e/chess-rival.spec.ts
```

Expected: PASS, including the existing assertion that Stockfish assets are not requested before explicit on-device Start.

- [ ] **Step 6: Commit the real-engine smoke extension**

```bash
git add apps/web/e2e/stockfish-assets.spec.ts
git commit -m "test: validate packaged Stockfish legal move"
```

---

## Final Verification

- [ ] **Run all focused rival/unit tests together**

```bash
cd apps/web && bun test \
  src/lib/chess/rival/preferences.test.ts \
  src/lib/chess/rival/stockfish-protocol.test.ts \
  src/lib/chess/rival/stockfish-provider.test.ts \
  src/hooks/useChessRivalSetup.test.tsx \
  src/hooks/useChessRivalSession.test.tsx \
  src/components/game/ChessRivalSetup.test.tsx \
  src/components/game/RivalSetupSummary.test.tsx \
  src/components/game/EngineRivalDetails.test.tsx \
  src/components/ChessGame.test.tsx
```

Expected: PASS.

- [ ] **Run the entire web unit suite**

```bash
cd apps/web && bun test src scripts
```

Expected: PASS.

- [ ] **Run static checks and build**

```bash
cd apps/web && bun run typecheck
cd apps/web && bun run lint
cd apps/web && bun run build
```

Expected: PASS.

- [ ] **Run targeted browser suites**

```bash
cd apps/web && bunx playwright test e2e/chess-rival.spec.ts
cd apps/web && bun run test:e2e:stockfish-assets
```

Expected: PASS.

- [ ] **Run repository-level checks before declaring completion**

```bash
bun run typecheck
bun run lint
bun run test
bun run build
```

Expected: PASS across the workspace.

- [ ] **Review the final diff against HPA-162 boundaries**

Confirm all of the following before moving the implementation PR out of draft:

```text
- exactly three presets: Casual / Normal / Strong
- exactly one Stockfish mapping: 0 / 8 / 16
- go movetime remains 250
- Start timeout remains 60_000
- engine move timeout is 10_000 and LLM has no new deadline
- only V2 preference key is read/written; no V1 migration code
- active engine summary reads frozen session difficulty
- timeout keeps activeSession but removes/disposes provider
- clearError cannot resume dead engine session
- New Game is the only timeout recovery
- no eager Stockfish construction/download before Start
- real packaged Worker returns a move accepted by makeAIMove
- no registry, cancellation protocol, retry framework, Elo, server schema, or unrelated game changes
```

If any item is false, fix it in the task that owns that behavior and rerun that task's focused tests before repeating final verification.