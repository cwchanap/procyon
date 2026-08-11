# HPA-162 Local Rival MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish the local Stockfish rival MVP with three persisted/frozen difficulty presets and an engine-only 10-second move deadline that preserves the board and requires New Game after timeout.

**Architecture:** Extend the existing HPA-161 `GameSetup` → `ActiveRivalSession` → provider flow. Difficulty stays mutable only in setup/preferences, is frozen into `EngineOpponent` at Start, and is forwarded through an explicit engine factory into `StockfishRivalProvider`; timeout stays in `useChessRivalSession`, which already owns provider/session/request staleness and disposal.

**Tech Stack:** TypeScript 5.9, React 18, Astro 4, Bun 1.3 tests, Testing Library, Playwright 1.55, Stockfish 18.0.8 Web Worker.

## Global Constraints

- Offer exactly `casual`, `normal`, and `strong`.
- Display exactly **Casual**, **Normal**, and **Strong**.
- Map Stockfish Skill Level exactly: Casual `0`, Normal `8`, Strong `16`.
- Keep Stockfish movetime exactly `250` ms for every preset.
- Keep the existing Start deadline exactly `60_000` ms.
- Add an engine-move deadline exactly `10_000` ms; never apply it to LLM moves.
- Default a fresh device to Casual and persist only `procyon.chess.rival-preferences.v2`.
- Never read/migrate the V1 preference key.
- Freeze difficulty only on successful Start; active/terminal UI reads the frozen session.
- On engine timeout: clear pending ownership, detach/dispose the provider, preserve board/session, ignore late results, and require New Game.
- `clearError()` must not re-arm a committed engine session whose provider is gone.
- Do not add an engine registry, generic recovery state machine, provider cancellation protocol, same-position retry, Worker reconstruction, Elo/calibration claims, or server-side difficulty persistence.
- Selecting difficulty must not construct/download Stockfish; current lazy Start ownership remains authoritative.

---

## File Structure

### Domain/session ownership

- Modify `apps/web/src/lib/chess/rival/types.ts` — `EngineDifficulty`, setup/session fields, `'timeout'` failure reason.
- Modify `apps/web/src/hooks/useChessRivalSession.ts` — 10-second engine move race, dead-provider recovery invariant, explicit engine factory input, frozen engine opponent.
- Modify `apps/web/src/hooks/useChessRivalSession.test.tsx` — risk-first fake-timer ownership tests and later difficulty freezing tests.
- Modify `apps/web/src/test/fakeRival.ts` — engine factories accept/record `{ difficulty }`.

### Preferences/setup

- Modify `apps/web/src/lib/chess/rival/preferences.ts` — atomic V1→V2 key/payload rewrite + `persistEngineDifficulty`.
- Modify `apps/web/src/lib/chess/rival/preferences.test.ts` — V2/default/version/storage coverage.
- Modify `apps/web/src/hooks/useChessRivalSetup.ts` — carry difficulty through all setup reconstruction/equality/selector paths.
- Modify `apps/web/src/hooks/useChessRivalSetup.test.tsx` — hydration/selection/persistence/fallback coverage.
- Modify `apps/web/e2e/chess-rival.spec.ts` — update hard-coded preference key/payload to V2; later update engine summary assertions for difficulty.

### Stockfish integration

- Modify `apps/web/src/lib/chess/rival/stockfish-provider.ts` — require difficulty in options, then map it centrally to UCI Skill Level.
- Modify `apps/web/src/lib/chess/rival/stockfish-provider.test.ts` — all provider constructors pass explicit difficulty; assert 0/8/16 and unchanged movetime.

### UI/wiring

- Modify `apps/web/src/components/game/ChessRivalSetup.tsx` and `.test.tsx` — engine-only difficulty radios + explicit callback.
- Modify `apps/web/src/components/game/RivalSetupSummary.tsx` and `.test.tsx` — editable pre-Start vs frozen active difficulty.
- Modify `apps/web/src/components/game/EngineRivalDetails.tsx` and `.test.tsx` — timeout-specific copy, no move retry.
- Modify `apps/web/src/components/ChessGame.tsx` and `.test.tsx` — pass `selectDifficulty`; integration proof for locked/frozen setup and timeout board preservation.

### Real packaged engine smoke

- Modify `apps/web/e2e/stockfish-assets.spec.ts` — real Worker readiness → `bestmove` → existing parser → `makeAIMove` legality.

---

### Task 1: Prove and implement engine move timeout ownership first

**Files:**
- Modify: `apps/web/src/lib/chess/rival/types.ts`
- Modify: `apps/web/src/hooks/useChessRivalSession.ts`
- Test: `apps/web/src/hooks/useChessRivalSession.test.tsx`

**Interfaces:**
- Consumes: existing `PendingMoveRequest`, `providerRef`, `activeSessionRef`, `isCurrent`, `resolvePending`, `reset`, and current Start deadline pattern.
- Produces: `ENGINE_MOVE_TIMEOUT_MS = 10_000`, `'timeout'` failure reason, engine-only move deadline, safe late-result handling, and non-clearable dead-engine error state.

- [ ] **Step 1: Write the failing basic timeout test**

Add `ENGINE_MOVE_TIMEOUT_MS` to the test import and add:

```ts
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

- [ ] **Step 2: Run the session suite and confirm red**

```bash
cd apps/web && bun test src/hooks/useChessRivalSession.test.tsx
```

Expected: FAIL because the timeout constant/reason/behavior do not exist.

- [ ] **Step 3: Add the timeout type, constant, and exhaustive message**

In `types.ts`:

```ts
export type RivalMoveFailureReason =
	| 'no-move'
	| 'invalid-response'
	| 'invalid-move'
	| 'protocol-error'
	| 'timeout';
```

In `useChessRivalSession.ts`:

```ts
export const ENGINE_MOVE_TIMEOUT_MS = 10_000;
```

Extend `failureMessages`:

```ts
timeout: 'The on-device computer took too long to move.',
```

- [ ] **Step 4: Implement the engine-only provider/deadline outcome race**

Keep the existing pending request and `isCurrent()` guards. Wrap provider settlement so later rejection is always handled:

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

Handle a current timeout before the existing result/error paths:

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

For `{ kind: 'error' }`, preserve current stale-check/`unexpected` behavior. For `{ kind: 'result' }`, preserve current typed result handling.

- [ ] **Step 5: Run the basic timeout test green**

```bash
cd apps/web && bun test src/hooks/useChessRivalSession.test.tsx
```

Expected: PASS.

- [ ] **Step 6: Add a late-result regression test**

```ts
test('late engine result after timeout cannot replace timeout state', async () => {
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

		expect(provider.disposeCount).toBe(1);
		expect(result.current.rivalError).toMatchObject({ reason: 'timeout' });
	} finally {
		jest.useRealTimers();
	}
});
```

- [ ] **Step 7: Add reset-before-deadline ownership test**

```ts
test('reset before engine deadline prevents stale timeout state', async () => {
	const move = deferred<RivalMoveResult>();
	const provider = new FakeRivalProvider('engine');
	provider.onMakeMove = () => move.promise;
	const { result } = renderSession({ createEngineProvider: mock(() => provider) });
	await act(async () => void (await result.current.start(startInput())));

	jest.useFakeTimers();
	try {
		act(() => {
			void result.current.requestMove(makeContext(makeGameState()));
		});
		act(() => result.current.reset());
		await act(async () => {
			advanceTimers(ENGINE_MOVE_TIMEOUT_MS);
			await Promise.resolve();
		});

		expect(result.current.activeSession).toBeNull();
		expect(result.current.rivalError).toBeNull();
		expect(provider.disposeCount).toBe(1);
	} finally {
		jest.useRealTimers();
	}
});
```

- [ ] **Step 8: Add old-deadline/new-provider ownership test**

Use two engine providers: provider A has a pending move; reset after starting that move; Start provider B; then advance 10 seconds. Assert provider B remains committed and `disposeCount === 0`, while provider A was disposed by reset exactly once and no timeout error appears.

Concrete assertions:

```ts
expect(providerA.disposeCount).toBe(1);
expect(providerB.disposeCount).toBe(0);
expect(result.current.activeSession?.id).toBe(secondSession?.id);
expect(result.current.rivalError).toBeNull();
```

- [ ] **Step 9: Add explicit LLM-no-deadline test**

```ts
test('LLM move is not subject to the engine move deadline', async () => {
	const move = deferred<RivalMoveResult>();
	const provider = new FakeRivalProvider('llm');
	provider.onMakeMove = () => move.promise;
	const { result } = renderSession({
		createLlmProvider: mock(() => provider),
	});
	await act(async () => {
		await result.current.start(startInput({ setup: llmSetup }));
	});

	jest.useFakeTimers();
	try {
		let settled = false;
		const pending = result.current
			.requestMove(makeContext(makeGameState()))
			.finally(() => {
				settled = true;
			});
		await act(async () => {
			advanceTimers(ENGINE_MOVE_TIMEOUT_MS);
			await Promise.resolve();
		});
		expect(settled).toBe(false);
		expect(provider.disposeCount).toBe(0);

		await act(async () => {
			move.resolve({ ok: true, move: sampleMove });
			await pending;
		});
	} finally {
		jest.useRealTimers();
	}
});
```

- [ ] **Step 10: Add dead-provider `clearError()` regression test**

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
		expect(result.current.activeSession).not.toBeNull();
		expect(result.current.rivalError).toMatchObject({ reason: 'timeout' });
	} finally {
		jest.useRealTimers();
	}
});
```

- [ ] **Step 11: Make `clearError()` preserve a dead committed engine error**

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

Do not expose provider liveness in `UseChessRivalSessionResult`.

- [ ] **Step 12: Run session suite + typecheck**

```bash
cd apps/web && bun test src/hooks/useChessRivalSession.test.tsx
cd apps/web && bun run typecheck
```

Expected: PASS.

- [ ] **Step 13: Commit timeout ownership**

```bash
git add apps/web/src/lib/chess/rival/types.ts \
  apps/web/src/hooks/useChessRivalSession.ts \
  apps/web/src/hooks/useChessRivalSession.test.tsx
git commit -m "feat: bound local engine move requests"
```

---

### Task 2: Rewrite preferences to V2 and freeze difficulty through the engine factory

**Files:**
- Modify: `apps/web/src/lib/chess/rival/types.ts`
- Modify: `apps/web/src/lib/chess/rival/preferences.ts`
- Test: `apps/web/src/lib/chess/rival/preferences.test.ts`
- Modify: `apps/web/src/hooks/useChessRivalSetup.ts`
- Test: `apps/web/src/hooks/useChessRivalSetup.test.tsx`
- Modify: `apps/web/src/hooks/useChessRivalSession.ts`
- Test: `apps/web/src/hooks/useChessRivalSession.test.tsx`
- Modify: `apps/web/src/test/fakeRival.ts`
- Modify: `apps/web/src/lib/chess/rival/stockfish-provider.ts` — accept required difficulty option now so the explicit production factory typechecks; mapping lands in Task 3.
- Test fixture update: `apps/web/src/lib/chess/rival/stockfish-provider.test.ts` — pass `difficulty: 'casual'` to all existing direct provider constructions.
- Modify: `apps/web/e2e/chess-rival.spec.ts` — V2 key/payload fixture.
- Update required `GameSetup`/engine-opponent fixtures in `ChessRivalSetup.test.tsx` and `RivalSetupSummary.test.tsx`.

**Interfaces:**
- Consumes: Task 1 timeout-capable session hook.
- Produces: `EngineDifficulty`, required setup/frozen opponent fields, V2 preference helpers, `selectDifficulty`, `createEngineProvider({ difficulty })`, and a provider options type that accepts that difficulty.

- [ ] **Step 1: Write V2 preference tests**

Use:

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

Add:

```ts
test('uses V2 key and ignores V1 payloads', () => {
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

Add explicit invalid-difficulty (`'expert'`), corrupt JSON, future-version (`version: 3`), and throwing-storage cases.

- [ ] **Step 2: Run preference suite red**

```bash
cd apps/web && bun test src/lib/chess/rival/preferences.test.ts
```

Expected: FAIL on V1 key/type and missing `persistEngineDifficulty`.

- [ ] **Step 3: Add required difficulty domain fields**

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

Update focused test fixtures to `engineDifficulty: 'casual'` unless a test deliberately exercises another preset.

- [ ] **Step 4: Rewrite `preferences.ts` atomically to V2**

```ts
export const RIVAL_PREFERENCES_STORAGE_KEY =
	'procyon.chess.rival-preferences.v2';

export interface RivalPreferencesV2 {
	version: 2;
	lastRivalKind: RivalKind;
	humanSideByRival: Record<RivalKind, ChessSide>;
	engineDifficulty: EngineDifficulty;
}

function isEngineDifficulty(value: unknown): value is EngineDifficulty {
	return value === 'casual' || value === 'normal' || value === 'strong';
}
```

Make `createDefaultRivalPreferences`, `parseRivalPreferences`, `readRivalPreferences`, internal `writeRivalPreferences`, `persistRivalKind`, and `persistHumanSide` all V2-only. Add:

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

Do not retain a V1 parser or migration branch.

- [ ] **Step 5: Run preferences green**

```bash
cd apps/web && bun test src/lib/chess/rival/preferences.test.ts
```

Expected: PASS.

- [ ] **Step 6: Write setup-hook difficulty hydration/selection tests**

Convert the setup test helper to `RivalPreferencesV2`, add `engineDifficulty` to expected setup objects, and add:

```ts
test('hydrates remembered engine difficulty', async () => {
	const memory = createStorage(storedPreferences({ engineDifficulty: 'strong' }));
	const { result } = renderHook(() =>
		useChessRivalSetup(createOptions({ storage: memory.storage }))
	);
	await waitForResolved(result);
	expect(result.current.setup.engineDifficulty).toBe('strong');
});

test('selectDifficulty persists and notifies the existing setup-change path', async () => {
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

Add an engine→LLM→engine test asserting remembered difficulty stays Strong and automatic fallback does not mutate it.

- [ ] **Step 7: Carry difficulty through every setup path**

Default:

```ts
const defaultSetup: GameSetup = {
	rivalKind: 'engine',
	humanSide: 'white',
	engineDifficulty: 'casual',
};
```

Resolution:

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

Equality compares `rivalKind`, `humanSide`, and `engineDifficulty`.

`selectRival` includes `engineDifficulty: nextPreferences.engineDifficulty`; `selectHumanSide` keeps spreading current setup.

Add result contract and implementation:

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

Return `selectDifficulty`.

- [ ] **Step 8: Update the browser rival preference fixture to V2 in the same atomic step**

In `apps/web/e2e/chess-rival.spec.ts`:

```ts
const RIVAL_PREFERENCES_STORAGE_KEY =
	'procyon.chess.rival-preferences.v2';
```

Change `seedRememberedRival` payload to:

```ts
JSON.stringify({
	version: 2,
	lastRivalKind: rememberedKind,
	humanSideByRival: { engine: 'white', llm: 'white' },
	engineDifficulty: 'casual',
})
```

Do not seed both keys.

- [ ] **Step 9: Write engine factory/session freezing test**

Update engine setup:

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

Add a mutable `GameSetup` object test: Start with Normal, mutate the source object's `engineDifficulty = 'strong'` after Start, and assert committed opponent remains Normal.

- [ ] **Step 10: Make the engine factory contract explicit and forward frozen difficulty**

```ts
createEngineProvider?: (input: {
	difficulty: EngineDifficulty;
}) => ChessRivalProvider;
```

```ts
function defaultCreateEngineProvider({
	difficulty,
}: {
	difficulty: EngineDifficulty;
}): ChessRivalProvider {
	return new StockfishRivalProvider({ difficulty });
}
```

Start construction:

```ts
candidate =
	input.setup.rivalKind === 'engine'
		? engineFactoryRef.current({
				difficulty: input.setup.engineDifficulty,
			})
		: llmFactoryRef.current({ config: frozenConfig });
```

Engine opponent:

```ts
return {
	kind: 'engine',
	id: 'stockfish',
	difficulty: setup.engineDifficulty,
};
```

- [ ] **Step 11: Make `StockfishRivalProviderOptions` accept required difficulty now**

In `stockfish-provider.ts`:

```ts
export interface StockfishRivalProviderOptions {
	difficulty: EngineDifficulty;
	workerFactory?: WorkerFactory;
	origin?: string;
	baseUrl?: string;
}
```

Keep the existing fixed Skill Level 0 in this task. Task 3 will consume `options.difficulty` for mapping.

Update every direct constructor in `stockfish-provider.test.ts` from forms like:

```ts
new StockfishRivalProvider({ workerFactory })
```

to:

```ts
new StockfishRivalProvider({
	difficulty: 'casual',
	workerFactory,
})
```

This keeps Task 2's intermediate commit type-correct without prematurely implementing Task 3's mapping.

- [ ] **Step 12: Update fake engine factories to the production signature**

In `fakeRival.ts`, import `EngineDifficulty` and use:

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

Return `difficulties` from `engineOptions` too.

- [ ] **Step 13: Run V2/setup/session/provider-fixture tests + typecheck**

```bash
cd apps/web && bun test \
  src/lib/chess/rival/preferences.test.ts \
  src/hooks/useChessRivalSetup.test.tsx \
  src/hooks/useChessRivalSession.test.tsx \
  src/lib/chess/rival/stockfish-provider.test.ts
cd apps/web && bun run typecheck
```

Expected: PASS. Typecheck catches every missed required `GameSetup.engineDifficulty` and provider constructor input.

- [ ] **Step 14: Commit atomic V2/freeze contract**

```bash
git add apps/web/src/lib/chess/rival/types.ts \
  apps/web/src/lib/chess/rival/preferences.ts \
  apps/web/src/lib/chess/rival/preferences.test.ts \
  apps/web/src/hooks/useChessRivalSetup.ts \
  apps/web/src/hooks/useChessRivalSetup.test.tsx \
  apps/web/src/hooks/useChessRivalSession.ts \
  apps/web/src/hooks/useChessRivalSession.test.tsx \
  apps/web/src/test/fakeRival.ts \
  apps/web/src/lib/chess/rival/stockfish-provider.ts \
  apps/web/src/lib/chess/rival/stockfish-provider.test.ts \
  apps/web/e2e/chess-rival.spec.ts \
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
- Consumes: required `StockfishRivalProviderOptions.difficulty` from Task 2; existing `formatSetSkillLevelCommand`, Skill Level advertisement check, and `formatGoCommand`.
- Produces: one Stockfish-specific 0/8/16 mapping; all presets retain 250 ms movetime.

- [ ] **Step 1: Add failing mapping tests for all presets**

Use existing fake Worker command capture and assert:

```ts
expect(casualWorker.messages).toContain('setoption name Skill Level value 0');
expect(normalWorker.messages).toContain('setoption name Skill Level value 8');
expect(strongWorker.messages).toContain('setoption name Skill Level value 16');
```

Construct providers explicitly with `difficulty: 'casual'`, `'normal'`, and `'strong'`.

Add a table-driven move assertion:

```ts
for (const difficulty of ['casual', 'normal', 'strong'] as const) {
	// initialize/beginGame using the existing fake Worker harness
	// invoke makeMove and capture commands
	expect(worker.messages).toContain('go movetime 250');
}
```

The harness setup is the existing provider test code; only the explicit difficulty and command assertions change.

- [ ] **Step 2: Run provider tests red**

```bash
cd apps/web && bun test src/lib/chess/rival/stockfish-provider.test.ts
```

Expected: Normal/Strong assertions fail because Skill Level is still fixed at 0.

- [ ] **Step 3: Replace fixed skill constant with centralized map**

```ts
const STOCKFISH_MOVE_TIME_MS = 250;
const STOCKFISH_SKILL_LEVEL_BY_DIFFICULTY = {
	casual: 0,
	normal: 8,
	strong: 16,
} as const satisfies Record<EngineDifficulty, number>;
```

Initialization:

```ts
this.postCommand(
	formatSetSkillLevelCommand(
		STOCKFISH_SKILL_LEVEL_BY_DIFFICULTY[optionsDifficulty]
	)
);
```

Store `options.difficulty` in a private `difficulty` field during construction and use `this.difficulty` in `initialize()`.

Do not change `STOCKFISH_MOVE_TIME_MS` or `makeMove` search command construction.

- [ ] **Step 4: Run provider + protocol tests**

```bash
cd apps/web && bun test \
  src/lib/chess/rival/stockfish-provider.test.ts \
  src/lib/chess/rival/stockfish-protocol.test.ts
```

Expected: PASS, including existing missing-Skill-Level advertisement failure coverage.

- [ ] **Step 5: Commit mapping**

```bash
git add apps/web/src/lib/chess/rival/stockfish-provider.ts \
  apps/web/src/lib/chess/rival/stockfish-provider.test.ts
git commit -m "feat: map local rival difficulty to Stockfish"
```

---

### Task 4: Add difficulty controls, frozen summaries, and production wiring

**Files:**
- Modify: `apps/web/src/components/game/ChessRivalSetup.tsx`
- Test: `apps/web/src/components/game/ChessRivalSetup.test.tsx`
- Modify: `apps/web/src/components/game/RivalSetupSummary.tsx`
- Test: `apps/web/src/components/game/RivalSetupSummary.test.tsx`
- Modify: `apps/web/src/components/ChessGame.tsx`
- Test: `apps/web/src/components/ChessGame.test.tsx`
- Modify: `apps/web/e2e/chess-rival.spec.ts` — update engine summary assertions to include Casual.

**Interfaces:**
- Consumes: `GameSetup.engineDifficulty`, `EngineOpponent.difficulty`, and `selectDifficulty` from Task 2.
- Produces: exactly three engine-only controls wired through existing `onSetupChange → rivalSession.reset`; summaries switch to frozen session difficulty after Start.

- [ ] **Step 1: Add failing setup component tests**

Pass `onSelectDifficulty` mock. For engine setup assert:

```ts
expect(screen.getByRole('radio', { name: 'Casual' })).toBeInTheDocument();
expect(screen.getByRole('radio', { name: 'Normal' })).toBeInTheDocument();
expect(screen.getByRole('radio', { name: 'Strong' })).toBeInTheDocument();
expect(screen.getByRole('radio', { name: 'Casual' })).toBeChecked();
```

Click Normal:

```ts
fireEvent.click(screen.getByRole('radio', { name: 'Normal' }));
expect(onSelectDifficulty).toHaveBeenCalledWith('normal');
```

Rerender with LLM setup and assert all three are absent. Rerender engine setup with `disabled` and assert all three are disabled.

- [ ] **Step 2: Run setup UI test red**

```bash
cd apps/web && bun test src/components/game/ChessRivalSetup.test.tsx
```

Expected: FAIL because prop/control is absent.

- [ ] **Step 3: Add explicit prop and three fixed radios**

```ts
interface ChessRivalSetupProps {
	// existing props...
	onSelectRival: (kind: RivalKind) => void;
	onSelectHumanSide: (side: ChessSide) => void;
	onSelectDifficulty: (difficulty: EngineDifficulty) => void;
}
```

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

Render only when `setup.rivalKind === 'engine'`; use the same `disabled` value as opponent/side controls and call `onSelectDifficulty(option.value)` directly. Keep existing visual component style; add no generic option/registry layer.

- [ ] **Step 4: Add failing summary tests for editable vs frozen source**

Pre-Start Casual:

```ts
expect(
	screen.getByText('On-device computer · Casual · Computer plays Black · Unrated')
).toBeInTheDocument();
```

Active session Strong while setup remains Casual:

```ts
expect(
	screen.getByText('On-device computer · Strong · Computer plays Black · Unrated')
).toBeInTheDocument();
```

- [ ] **Step 5: Update engine summary formatting**

Use active session when available:

```ts
const difficulty =
	activeSession?.opponent.kind === 'engine'
		? activeSession.opponent.difficulty
		: setup.engineDifficulty;
```

Use an exhaustive local label function:

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

Keep LLM summary unchanged.

- [ ] **Step 6: Wire `selectDifficulty` in `ChessGame`**

Where `ChessRivalSetup` is rendered:

```tsx
onSelectDifficulty={rivalSetup.selectDifficulty}
```

Do not add a difficulty-specific reset. `useChessRivalSetup` invokes existing `onSetupChange`, and `ChessGame` already supplies `rivalSession.reset`.

- [ ] **Step 7: Extend existing no-eager-load/unit integration coverage**

In the existing `constructs no Worker before the game starts` test, click **Strong** before opponent/side preview changes and keep:

```ts
expect(workerSpy).not.toHaveBeenCalled();
```

Add a successful Start test that selects Normal, clicks Start, and asserts:

```ts
expect(
	view.getByText(/On-device computer · Normal · Computer plays Black · Unrated/i)
).toBeTruthy();
expect(
	(view.getByRole('radio', { name: 'Normal' }) as HTMLInputElement).disabled
).toBe(true);
```

- [ ] **Step 8: Update existing browser rival engine-summary expectations**

In `apps/web/e2e/chess-rival.spec.ts`, replace engine summary regexes such as:

```ts
/On-device computer · Computer plays White · Unrated/i
```

with:

```ts
/On-device computer · Casual · Computer plays White · Unrated/i
```

Do the corresponding Black-side expectation with `Computer plays Black`. Keep the no-vendor-request-before-Start assertions unchanged.

- [ ] **Step 9: Run setup/summary/game tests + typecheck**

```bash
cd apps/web && bun test \
  src/components/game/ChessRivalSetup.test.tsx \
  src/components/game/RivalSetupSummary.test.tsx \
  src/components/ChessGame.test.tsx
cd apps/web && bun run typecheck
```

Expected: PASS.

- [ ] **Step 10: Commit UI/wiring**

```bash
git add apps/web/src/components/game/ChessRivalSetup.tsx \
  apps/web/src/components/game/ChessRivalSetup.test.tsx \
  apps/web/src/components/game/RivalSetupSummary.tsx \
  apps/web/src/components/game/RivalSetupSummary.test.tsx \
  apps/web/src/components/ChessGame.tsx \
  apps/web/src/components/ChessGame.test.tsx \
  apps/web/e2e/chess-rival.spec.ts
git commit -m "feat: add local rival difficulty controls"
```

---

### Task 5: Present timeout as New-Game-only recovery and prove board preservation

**Files:**
- Modify: `apps/web/src/components/game/EngineRivalDetails.tsx`
- Test: `apps/web/src/components/game/EngineRivalDetails.test.tsx`
- Test: `apps/web/src/components/ChessGame.test.tsx`

**Interfaces:**
- Consumes: Task 1 typed timeout/dead-provider invariant and current ChessGame move-error path.
- Produces: timeout-specific copy; integration proof that timeout applies no engine move, retains frozen session/locks, and New Game resets it.

- [ ] **Step 1: Add failing timeout presentation test**

Render with:

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

Keep existing Start-load failure test asserting **Try again** still appears for `startState === 'load-failed'`.

- [ ] **Step 2: Implement timeout-specific heading in existing error panel**

```ts
const errorHeading =
	rivalError?.reason === 'timeout'
		? 'Computer move timed out'
		: 'Computer move failed';
```

Use `errorHeading` in the existing `rivalError` branch. Keep the existing New Game instruction and add no retry button.

- [ ] **Step 3: Add exact ChessGame timeout integration test**

Import `ENGINE_MOVE_TIMEOUT_MS` into `ChessGame.test.tsx`.

Use the existing atomic Start test pattern:

```ts
test('engine timeout preserves the human move and requires New Game', async () => {
	const pendingMove = deferred<RivalMoveResult>();
	const { options, instances } = engineOptions(() => ({
		makeMove: () => pendingMove.promise,
	}));
	const view = render(<ChessGame rivalSessionOptions={options} />);
	await waitForSetupResolved(view);

	fireEvent.click(view.getByRole('radio', { name: 'Normal' }));
	fireEvent.click(view.getByRole('button', { name: /start/i }));
	await waitFor(() =>
		expect(view.getByRole('button', { name: /new game/i })).toBeTruthy()
	);

	jest.useFakeTimers();
	try {
		fireEvent.click(view.getByRole('button', { name: 'Square 6-4' }));
		fireEvent.click(view.getByRole('button', { name: 'Square 4-4' }));

		await act(async () => {
			(
				jest as unknown as { advanceTimersByTime(ms: number): void }
			).advanceTimersByTime(1000);
			await Promise.resolve();
		});
		expect(instances[0]?.makeMoveCount).toBe(1);

		await act(async () => {
			(
				jest as unknown as { advanceTimersByTime(ms: number): void }
			).advanceTimersByTime(ENGINE_MOVE_TIMEOUT_MS);
			for (let i = 0; i < 5; i++) await Promise.resolve();
		});

		expect(view.getByText('Computer move timed out')).toBeTruthy();
		expect(instances[0]?.disposeCount).toBe(1);
		expect(view.getByRole('button', { name: 'Square 6-4' }).textContent).toBe('');
		expect(view.getByRole('button', { name: 'Square 4-4' }).textContent).toContain('♙');
		expect(
			view.getByText(/On-device computer · Normal · Computer plays Black · Unrated/i)
		).toBeTruthy();
		expect(
			(view.getByRole('radio', { name: 'Normal' }) as HTMLInputElement).disabled
		).toBe(true);
	} finally {
		jest.useRealTimers();
	}

	fireEvent.click(view.getByRole('button', { name: /new game/i }));
	await waitFor(() => {
		expect(
			(view.getByRole('radio', { name: 'Normal' }) as HTMLInputElement).disabled
		).toBe(false);
	});
});
```

The human e2→e4 move is the board-preservation proof: after timeout, e2 stays empty and e4 still contains the white pawn; no black engine move is applied.

- [ ] **Step 4: Run timeout UI/integration/session tests**

```bash
cd apps/web && bun test \
  src/components/game/EngineRivalDetails.test.tsx \
  src/components/ChessGame.test.tsx \
  src/hooks/useChessRivalSession.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Commit timeout presentation**

```bash
git add apps/web/src/components/game/EngineRivalDetails.tsx \
  apps/web/src/components/game/EngineRivalDetails.test.tsx \
  apps/web/src/components/ChessGame.test.tsx
git commit -m "feat: show local engine timeout recovery"
```

No production `ChessGame.tsx` timeout lifecycle change belongs in this task; Task 1's hook and the existing `rivalError` turn guard own that behavior.

---

### Task 6: Extend packaged Stockfish smoke through one legal real move

**Files:**
- Modify: `apps/web/e2e/stockfish-assets.spec.ts`

**Interfaces:**
- Consumes: current asset smoke, `parseBestMove`, `createInitialGameState`, and `makeAIMove`.
- Produces: proof that the distributed Worker returns one starting move accepted by Procyon's authoritative rules.

- [ ] **Step 1: Import existing parser/rules helpers and rename the readiness test**

```ts
import { createInitialGameState, makeAIMove } from '../src/lib/chess/game';
import { parseBestMove } from '../src/lib/chess/rival/stockfish-protocol';
```

Rename to:

```ts
test('starts packaged Stockfish and returns a legal move', async ({ page }) => {
```

- [ ] **Step 2: Extend browser-side Worker sequence and return the first `bestmove` line**

Keep current auth stub, console capture, failed-request capture, and 15-second browser wait. Inside `page.evaluate`:

```ts
const waitForMessage = (predicate: (line: string) => boolean) =>
	new Promise<string>((resolve, reject) => {
		const timeout = window.setTimeout(() => {
			worker.removeEventListener('message', onMessage);
			reject(new Error(`Timed out. Messages: ${messages.join('\n')}`));
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
```

Sequence:

```ts
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
```

Do not parse UCI move syntax in browser code.

- [ ] **Step 3: Parse and validate through Procyon rules in the test runner**

```ts
const parsed = parseBestMove(bestMoveLine);
expect(parsed?.ok).toBe(true);
if (!parsed || !parsed.ok) {
	throw new Error(`Stockfish did not return a legal move payload: ${bestMoveLine}`);
}

const initial = createInitialGameState('human-vs-ai', 'white');
expect(initial.currentPlayer).toBe('white');
const next = makeAIMove(
	initial,
	parsed.move.from,
	parsed.move.to,
	parsed.move.promotion
);
expect(next).not.toBeNull();
```

`createInitialGameState('human-vs-ai', 'white')` is the exact standard-start helper call: current player is White and `makeAIMove` validates the returned White move through the authoritative attempt-move path.

Keep existing console-error and failed-asset-request assertions after the legality check. Do not assert one opening move.

- [ ] **Step 4: Run real packaged Worker smoke**

```bash
cd apps/web && bun run test:e2e:stockfish-assets
```

Expected: PASS.

- [ ] **Step 5: Run existing rival E2E**

```bash
cd apps/web && bunx playwright test e2e/chess-rival.spec.ts
```

Expected: PASS, including remembered preference, selector locking, mocked engine journey, and no Stockfish vendor request before explicit Start.

- [ ] **Step 6: Commit smoke extension**

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

- [ ] **Run static checks/build**

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

- [ ] **Run repository-level checks**

```bash
bun run typecheck
bun run lint
bun run test
bun run build
```

Expected: PASS across the workspace.

- [ ] **Review the final diff against HPA-162 scope**

Confirm exactly:

```text
Casual / Normal / Strong only
Skill Level 0 / 8 / 16 only
Stockfish go movetime 250 unchanged
Start timeout 60_000 unchanged
engine move timeout 10_000; no LLM deadline
V2 preference key only; no V1 migration/read path
active engine summary reads frozen session difficulty
engine timeout keeps activeSession but detaches/disposes provider
clearError cannot revive dead engine session
New Game is the only timeout recovery
no eager Stockfish construction/download before Start
real packaged Worker move passes parseBestMove + makeAIMove
no registry/cancellation/retry framework/Elo/server schema/unrelated game changes
```

Any mismatch must be fixed in the task that owns that behavior and that task's focused tests rerun before repeating final verification.