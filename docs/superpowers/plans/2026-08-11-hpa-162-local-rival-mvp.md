# HPA-162 Local Rival MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish the local Stockfish rival MVP with three persisted/frozen difficulty presets and an engine-only 10-second move deadline that preserves the board and requires New Game after timeout.

**Architecture:** Extend the existing HPA-161 `GameSetup` → `ActiveRivalSession` → provider flow. Difficulty is mutable only in setup/preferences, frozen into `EngineOpponent` at Start, and forwarded through an explicit engine factory into `StockfishRivalProvider`. The move deadline stays in `useChessRivalSession`, which already owns provider/session/request staleness and disposal.

**Tech Stack:** TypeScript 5.9, React 18, Astro 4, Bun 1.3 tests, Testing Library, Playwright 1.55, Stockfish 18.0.8 Web Worker.

## Global Constraints

- Offer exactly `casual`, `normal`, and `strong`; display exactly **Casual**, **Normal**, and **Strong**.
- Define product values/labels once in `ENGINE_DIFFICULTIES` and derive `EngineDifficulty` from that table.
- Keep Stockfish mapping local: Casual `0`, Normal `8`, Strong `16`.
- Keep Stockfish movetime exactly `250` ms for every preset.
- Keep Start deadline exactly `60_000` ms.
- Add an engine-move deadline exactly `10_000` ms; never apply it to LLM moves.
- Use the new preference payload/key `procyon.chess.rival-preferences.v2`. This is required by HPA-162; do not retain `version: 1`, read V1, or add migration logic.
- Default V2 difficulty to Casual.
- Freeze difficulty only after successful Start; active/terminal UI reads the frozen session.
- On engine timeout: clear pending ownership, detach/dispose the provider, preserve board/session, handle disposal-induced late rejection, and require New Game in the engine UI.
- Leave `clearError()` semantics unchanged; its only current caller is the LLM retry path.
- Selecting difficulty must not construct/download Stockfish.
- Do not add an engine registry, generic recovery state machine, provider cancellation protocol, same-position retry, Worker reconstruction, Elo/calibration claims, server-side difficulty persistence, or unrelated game changes.

### Review decision retained intentionally

A follow-up review proposed keeping `version: 1` and parsing a missing `engineDifficulty` as Casual. Do **not** implement that proposal unless HPA-162 itself is changed first: the current Linear requirement explicitly says to store difficulty in **a new version** of the rival-preferences payload and allows old payloads to reset without migration/backward compatibility.

---

## File Structure

### Timeout ownership

- Modify `apps/web/src/lib/chess/rival/types.ts` — add `'timeout'` failure reason.
- Modify `apps/web/src/hooks/useChessRivalSession.ts` — engine-only deadline, wrapped provider outcome, timeout disposal.
- Test `apps/web/src/hooks/useChessRivalSession.test.tsx` — fake-timer timeout/rejection/reset/newer-provider/LLM cases.

### Difficulty vocabulary and V2 preferences

- Modify `apps/web/src/lib/chess/rival/types.ts` — canonical `ENGINE_DIFFICULTIES`, derived `EngineDifficulty`, runtime helpers.
- Modify `apps/web/src/lib/chess/rival/types.test.ts` — real runtime extent/label assertions.
- Modify `apps/web/src/lib/chess/rival/preferences.ts` — V2 key/payload/default/parser/read/write + `persistEngineDifficulty`.
- Modify `apps/web/src/lib/chess/rival/preferences.test.ts` — V2 behavior.
- Modify `apps/web/src/hooks/useChessRivalSetup.ts` — consume the V2 preference type/key while setup shape is still unchanged in Task 2A.
- Modify `apps/web/src/hooks/useChessRivalSetup.test.tsx` — V2 preference fixtures.
- Modify `apps/web/e2e/chess-rival.spec.ts` — seed the canonical V2 key/payload instead of a hard-coded V1 fixture.

### Setup/session/provider freezing

- Modify `apps/web/src/lib/chess/rival/types.ts` — required `GameSetup.engineDifficulty` and `EngineOpponent.difficulty`.
- Modify `apps/web/src/lib/chess/rival/types.test.ts` — engine-session fixture includes difficulty.
- Modify `apps/web/src/hooks/useChessRivalSetup.ts` and `.test.tsx` — carry/persist/select difficulty through all setup paths.
- Modify `apps/web/src/hooks/useChessRivalSession.ts` and `.test.tsx` — explicit factory input + frozen session difficulty.
- Modify `apps/web/src/test/fakeRival.ts` — engine factories accept/record `{ difficulty }`.
- Modify `apps/web/src/lib/chess/rival/stockfish-provider.ts` and `.test.ts` — required difficulty option + 0/8/16 mapping in the same change.
- Modify fixture literals in `apps/web/src/components/game/ChessRivalSetup.test.tsx` and `RivalSetupSummary.test.tsx` so the tree typechecks before UI behavior is added.

### UI and integration

- Modify `apps/web/src/components/game/ChessRivalSetup.tsx` and `.test.tsx` — radios from shared table + callback.
- Modify `apps/web/src/components/game/RivalSetupSummary.tsx` and `.test.tsx` — shared label helper, setup narrowing, frozen session display.
- Modify `apps/web/src/components/ChessGame.tsx` and `.test.tsx` — pass difficulty selector, prove lazy loading/locking.
- Modify `apps/web/src/components/game/EngineRivalDetails.tsx` and `.test.tsx` — timeout copy/no retry.
- Extend `apps/web/src/components/ChessGame.test.tsx` — board preservation + late fake resolve after timeout.

### Real packaged engine

- Modify `apps/web/e2e/stockfish-assets.spec.ts` — real Worker `bestmove` → `parseBestMove` → `makeAIMove`.

---

## Task 1: Prove and implement engine move timeout ownership first

**Files:**
- Modify: `apps/web/src/lib/chess/rival/types.ts`
- Modify: `apps/web/src/hooks/useChessRivalSession.ts`
- Test: `apps/web/src/hooks/useChessRivalSession.test.tsx`

**Interfaces:**
- Consumes: existing `PendingMoveRequest`, `providerRef`, `activeSessionRef`, request `isCurrent()` checks, `resolvePending()`, and Start-deadline race pattern.
- Produces: `ENGINE_MOVE_TIMEOUT_MS = 10_000`, typed `'timeout'`, engine-only deadline, safe disposal-induced late rejection handling.

- [ ] **Step 1: Add the failing basic timeout test**

Add `ENGINE_MOVE_TIMEOUT_MS` to the hook import and add:

```ts
test('engine move times out, disposes provider, and preserves the session', async () => {
	const move = deferred<RivalMoveResult>();
	const provider = new FakeRivalProvider('engine');
	provider.onMakeMove = () => move.promise;
	const { result } = renderSession({
		createEngineProvider: mock(() => provider),
	});

	await act(async () => {
		await result.current.start(startInput());
	});
	const sessionId = result.current.activeSession?.id;

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
		expect(result.current.activeSession?.id).toBe(sessionId);
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
cd apps/web
bun test src/hooks/useChessRivalSession.test.tsx
```

Expected: FAIL because `'timeout'`/`ENGINE_MOVE_TIMEOUT_MS`/deadline behavior do not exist.

- [ ] **Step 3: Add timeout to the typed contract**

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

- [ ] **Step 4: Wrap provider settlement before racing**

Replace the raw `await provider.makeMove(...)` path with an outcome wrapper:

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

The rejection handler must be attached before `Promise.race`: real Stockfish disposal rejects its pending move waiter.

- [ ] **Step 5: Implement the current timeout branch**

Before existing result/error handling:

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

For `outcome.kind === 'error'`, preserve the current stale check and `unexpected` error policy. For `result`, preserve existing typed-result behavior.

Do **not** change `clearError()`.

- [ ] **Step 6: Run the basic timeout test green**

```bash
cd apps/web
bun test src/hooks/useChessRivalSession.test.tsx
```

Expected: PASS.

- [ ] **Step 7: Add the load-bearing late-rejection test**

```ts
test('late engine rejection after timeout is handled and cannot replace timeout state', async () => {
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
			move.reject(new Error('late worker rejection'));
			await Promise.resolve();
		});

		expect(provider.disposeCount).toBe(1);
		expect(result.current.rivalError).toMatchObject({ reason: 'timeout' });
	} finally {
		jest.useRealTimers();
	}
});
```

- [ ] **Step 8: Add reset-before-deadline ownership coverage**

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

- [ ] **Step 9: Add old-deadline/new-provider coverage**

Use two fake engine providers. Provider A owns a pending move, then reset; provider B starts a fresh session. Advance the old deadline and assert B is untouched:

```ts
expect(providerA.disposeCount).toBe(1);
expect(providerB.disposeCount).toBe(0);
expect(result.current.activeSession?.id).toBe(secondSession?.id);
expect(result.current.rivalError).toBeNull();
```

Use the existing `orderedEngineFactory(providerA, providerB)` helper and existing `startInput()` helper; no new lifecycle harness is needed.

- [ ] **Step 10: Add explicit LLM-no-deadline coverage**

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

- [ ] **Step 11: Run focused verification**

```bash
cd apps/web
bun test src/hooks/useChessRivalSession.test.tsx
bun run typecheck
```

Expected: PASS.

- [ ] **Step 12: Commit timeout ownership**

```bash
git add apps/web/src/lib/chess/rival/types.ts \
  apps/web/src/hooks/useChessRivalSession.ts \
  apps/web/src/hooks/useChessRivalSession.test.tsx
git commit -m "feat: bound local engine move requests"
```

---

## Task 2A: Add the runtime difficulty vocabulary and V2 preference payload

**Files:**
- Modify: `apps/web/src/lib/chess/rival/types.ts`
- Modify: `apps/web/src/lib/chess/rival/types.test.ts`
- Modify: `apps/web/src/lib/chess/rival/preferences.ts`
- Modify: `apps/web/src/lib/chess/rival/preferences.test.ts`
- Modify: `apps/web/src/hooks/useChessRivalSetup.ts`
- Modify: `apps/web/src/hooks/useChessRivalSetup.test.tsx`
- Modify: `apps/web/e2e/chess-rival.spec.ts`

**Interfaces:**
- Produces: `ENGINE_DIFFICULTIES`, derived `EngineDifficulty`, `isEngineDifficulty`, `getEngineDifficultyLabel`, `RivalPreferencesV2`, V2 storage key, `persistEngineDifficulty`.
- Does **not** yet make `GameSetup.engineDifficulty` or `EngineOpponent.difficulty` required; that contract change belongs to Task 2B so this task can remain typecheck-green.

- [ ] **Step 1: Add failing runtime vocabulary tests**

In `types.test.ts`, import `ENGINE_DIFFICULTIES`, `getEngineDifficultyLabel`, and `isEngineDifficulty` and add:

```ts
test('defines the complete ordered local-engine difficulty vocabulary', () => {
	expect(ENGINE_DIFFICULTIES).toEqual([
		{ value: 'casual', label: 'Casual' },
		{ value: 'normal', label: 'Normal' },
		{ value: 'strong', label: 'Strong' },
	]);
	expect(isEngineDifficulty('casual')).toBe(true);
	expect(isEngineDifficulty('normal')).toBe(true);
	expect(isEngineDifficulty('strong')).toBe(true);
	expect(isEngineDifficulty('expert')).toBe(false);
	expect(getEngineDifficultyLabel('normal')).toBe('Normal');
});
```

- [ ] **Step 2: Replace preference tests with V2 expectations**

Use:

```ts
const defaultPreferences: RivalPreferencesV2 = {
	version: 2,
	lastRivalKind: 'engine',
	humanSideByRival: { engine: 'white', llm: 'white' },
	engineDifficulty: 'casual',
};
```

Required tests:

```ts
test('missing V2 storage returns Casual defaults', () => {
	const storage = createMemoryStorage();
	expect(readRivalPreferences(storage)).toEqual(defaultPreferences);
});

test('V2 round-trips rival, side, and difficulty independently', () => {
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

test('invalid V2 difficulty falls back to full defaults', () => {
	const storage = createMemoryStorage({
		[RIVAL_PREFERENCES_STORAGE_KEY]: JSON.stringify({
			version: 2,
			lastRivalKind: 'llm',
			humanSideByRival: { engine: 'black', llm: 'black' },
			engineDifficulty: 'expert',
		}),
	});
	expect(readRivalPreferences(storage)).toEqual(defaultPreferences);
});
```

Also keep corrupt JSON, future version, invalid rival/side, and blocked-storage tests. Add one assertion that only the V2 key is read; a V1-key-only store must return defaults.

- [ ] **Step 3: Run the new type/preference tests red**

```bash
cd apps/web
bun test src/lib/chess/rival/types.test.ts src/lib/chess/rival/preferences.test.ts
```

Expected: FAIL because the table/V2 contract does not exist.

- [ ] **Step 4: Implement one canonical runtime vocabulary**

In `types.ts`:

```ts
export const ENGINE_DIFFICULTIES = [
	{ value: 'casual', label: 'Casual' },
	{ value: 'normal', label: 'Normal' },
	{ value: 'strong', label: 'Strong' },
] as const satisfies readonly { value: string; label: string }[];

export type EngineDifficulty =
	(typeof ENGINE_DIFFICULTIES)[number]['value'];

export function isEngineDifficulty(value: unknown): value is EngineDifficulty {
	return ENGINE_DIFFICULTIES.some(option => option.value === value);
}

export function getEngineDifficultyLabel(value: EngineDifficulty): string {
	return ENGINE_DIFFICULTIES.find(option => option.value === value)!.label;
}
```

Do not add a second label switch/table anywhere else.

- [ ] **Step 5: Version the preference module atomically**

In `preferences.ts`:

```ts
export const RIVAL_PREFERENCES_STORAGE_KEY =
	'procyon.chess.rival-preferences.v2';

export interface RivalPreferencesV2 {
	version: 2;
	lastRivalKind: RivalKind;
	humanSideByRival: Record<RivalKind, ChessSide>;
	engineDifficulty: EngineDifficulty;
}
```

Default:

```ts
export function createDefaultRivalPreferences(): RivalPreferencesV2 {
	return {
		version: 2,
		lastRivalKind: 'engine',
		humanSideByRival: { engine: 'white', llm: 'white' },
		engineDifficulty: 'casual',
	};
}
```

In `parseRivalPreferences`, require `record.version === 2` and `isEngineDifficulty(record.engineDifficulty)`. Return the complete V2 payload or `null`; do not read/normalize V1.

Use `RivalPreferencesV2` in read/write helpers and add:

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

- [ ] **Step 6: Update setup-hook preference plumbing without changing `GameSetup` yet**

Change `RivalPreferencesV1` imports/state/helper annotations to `RivalPreferencesV2`. `readPreferencesOnce()` continues to return `{ preferences, rememberedKind }`; `setupForResolution()` can continue ignoring `preferences.engineDifficulty` until Task 2B.

Update `storedPreferences()` / storage helpers in `useChessRivalSetup.test.tsx` so every persisted fixture includes:

```ts
version: 2,
engineDifficulty: 'casual',
```

Do not add `selectDifficulty` yet.

- [ ] **Step 7: Update the browser preference fixture to V2**

In `e2e/chess-rival.spec.ts`, import the canonical key:

```ts
import { RIVAL_PREFERENCES_STORAGE_KEY } from '../src/lib/chess/rival/preferences';
```

Delete the local hard-coded V1 constant. Update `seedRememberedRival()` payload:

```ts
JSON.stringify({
	version: 2,
	lastRivalKind: rememberedKind,
	humanSideByRival: { engine: 'white', llm: 'white' },
	engineDifficulty: 'casual',
})
```

- [ ] **Step 8: Verify Task 2A independently**

```bash
cd apps/web
bun test src/lib/chess/rival/types.test.ts \
  src/lib/chess/rival/preferences.test.ts \
  src/hooks/useChessRivalSetup.test.tsx
bun run typecheck
```

Expected: PASS. At this checkpoint the preference schema is V2, but gameplay setup/session types have not yet been made difficulty-required.

- [ ] **Step 9: Commit the vocabulary/preference slice**

```bash
git add apps/web/src/lib/chess/rival/types.ts \
  apps/web/src/lib/chess/rival/types.test.ts \
  apps/web/src/lib/chess/rival/preferences.ts \
  apps/web/src/lib/chess/rival/preferences.test.ts \
  apps/web/src/hooks/useChessRivalSetup.ts \
  apps/web/src/hooks/useChessRivalSetup.test.tsx \
  apps/web/e2e/chess-rival.spec.ts
git commit -m "feat: version local rival difficulty preferences"
```

---

## Task 2B: Carry frozen difficulty through setup/session/provider and map Stockfish

**Files:**
- Modify: `apps/web/src/lib/chess/rival/types.ts`
- Modify: `apps/web/src/lib/chess/rival/types.test.ts`
- Modify: `apps/web/src/hooks/useChessRivalSetup.ts`
- Modify: `apps/web/src/hooks/useChessRivalSetup.test.tsx`
- Modify: `apps/web/src/hooks/useChessRivalSession.ts`
- Modify: `apps/web/src/hooks/useChessRivalSession.test.tsx`
- Modify: `apps/web/src/test/fakeRival.ts`
- Modify: `apps/web/src/lib/chess/rival/stockfish-provider.ts`
- Modify: `apps/web/src/lib/chess/rival/stockfish-provider.test.ts`
- Fixture-only type updates: `apps/web/src/components/game/ChessRivalSetup.test.tsx`
- Fixture-only type updates: `apps/web/src/components/game/RivalSetupSummary.test.tsx`

**Interfaces:**
- Consumes: Task 2A `EngineDifficulty`, V2 preference helpers.
- Produces: required setup/session difficulty, `selectDifficulty`, `createEngineProvider({ difficulty })`, `StockfishRivalProvider({ difficulty })`, 0/8/16 mapping.

- [ ] **Step 1: Add failing setup/session/provider tests**

In `useChessRivalSetup.test.tsx`:

```ts
test('restores stored engine difficulty into resolved setup', async () => {
	const memory = createStorage(
		storedPreferences({ engineDifficulty: 'strong' })
	);
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

Add engine→LLM→engine persistence and automatic-fallback-does-not-change-difficulty assertions.

In `useChessRivalSession.test.tsx`, update setup fixtures to include Casual and add:

```ts
test('engine Start passes and freezes the exact setup difficulty', async () => {
	const provider = new FakeRivalProvider('engine');
	let received: EngineDifficulty | undefined;
	const { result } = renderSession({
		createEngineProvider: mock(({ difficulty }) => {
			received = difficulty;
			return provider;
		}),
	});

	const setup: GameSetup = {
		rivalKind: 'engine',
		humanSide: 'white',
		engineDifficulty: 'strong',
	};
	let session: ActiveRivalSession | null = null;
	await act(async () => {
		session = await result.current.start(startInput({ setup }));
	});

	expect(received).toBe('strong');
	expect(session?.opponent).toEqual({
		kind: 'engine',
		id: 'stockfish',
		difficulty: 'strong',
	});

	setup.engineDifficulty = 'casual';
	expect(session?.opponent).toMatchObject({ difficulty: 'strong' });
});
```

In `stockfish-provider.test.ts`, make `createHarness(difficulty = 'casual', options = {})` and add assertions for emitted Skill Levels `0`, `8`, and `16` while every move still emits `go movetime 250`.

- [ ] **Step 2: Run focused tests red**

```bash
cd apps/web
bun test src/hooks/useChessRivalSetup.test.tsx \
  src/hooks/useChessRivalSession.test.tsx \
  src/lib/chess/rival/stockfish-provider.test.ts
```

Expected: FAIL because setup/session/provider do not yet carry difficulty.

- [ ] **Step 3: Make setup/session difficulty required**

In `types.ts`:

```ts
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

Update `types.test.ts` engine fixture:

```ts
opponent: { kind: 'engine', id: 'stockfish', difficulty: 'casual' },
```

This file is explicitly part of the task; do not leave the old two-field engine opponent literal behind.

- [ ] **Step 4: Carry difficulty through every setup reconstruction**

In `useChessRivalSetup.ts`:

```ts
const defaultSetup: GameSetup = {
	rivalKind: 'engine',
	humanSide: 'white',
	engineDifficulty: 'casual',
};
```

`setupForResolution`:

```ts
return {
	rivalKind: resolution.kind,
	humanSide: preferences.humanSideByRival[resolution.kind],
	engineDifficulty: preferences.engineDifficulty,
};
```

`setupsEqual` must include `engineDifficulty`.

When `selectRival` rebuilds setup, include `engineDifficulty: nextPreferences.engineDifficulty`. `selectHumanSide` spreads existing setup, so it preserves difficulty.

Add to `UseChessRivalSetupResult`:

```ts
selectDifficulty(difficulty: EngineDifficulty): void;
```

Implementation:

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

Return it beside the existing selectors.

- [ ] **Step 5: Make the engine factory contract explicit and freeze it**

In `UseChessRivalSessionOptions`:

```ts
createEngineProvider?: (input: {
	difficulty: EngineDifficulty;
}) => ChessRivalProvider;
```

Default factory:

```ts
function defaultCreateEngineProvider({
	difficulty,
}: {
	difficulty: EngineDifficulty;
}): ChessRivalProvider {
	return new StockfishRivalProvider({ difficulty });
}
```

At Start:

```ts
candidate =
	input.setup.rivalKind === 'engine'
		? engineFactoryRef.current({
				difficulty: input.setup.engineDifficulty,
			})
		: llmFactoryRef.current({ config: frozenConfig });
```

Engine opponent creation:

```ts
return {
	kind: 'engine',
	id: 'stockfish',
	difficulty: setup.engineDifficulty,
};
```

- [ ] **Step 6: Update shared engine test factories**

In `fakeRival.ts`, make engine factories accept the exact input and record it:

```ts
export interface EngineFactoryCall {
	difficulty: EngineDifficulty;
}

export function engineFactory(
	makeCfg: (index: number) => FakeProviderConfig = () => ({})
): {
	create: (input: EngineFactoryCall) => ChessRivalProvider;
	instances: FakeRivalProvider[];
	calls: EngineFactoryCall[];
} {
	const instances: FakeRivalProvider[] = [];
	const calls: EngineFactoryCall[] = [];
	const create = (input: EngineFactoryCall): ChessRivalProvider => {
		calls.push(input);
		const provider = new FakeRivalProvider({
			...makeCfg(instances.length),
			kind: 'engine',
		});
		instances.push(provider);
		return provider;
	};
	return { create, instances, calls };
}
```

Update `engineOptions()` to expose `calls` too. Existing tests can ignore it.

- [ ] **Step 7: Require provider difficulty and map it immediately**

In `stockfish-provider.ts`:

```ts
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

Store the mapped value or difficulty on the instance and initialize with:

```ts
this.postCommand(
	formatSetSkillLevelCommand(
		STOCKFISH_SKILL_LEVEL_BY_DIFFICULTY[this.difficulty]
	)
);
```

Delete the fixed `STOCKFISH_SKILL_LEVEL = 0` constant. Leave `STOCKFISH_MOVE_TIME_MS = 250` unchanged.

Update the provider-test harness:

```ts
function createHarness(
	difficulty: EngineDifficulty = 'casual',
	options: { baseUrl?: string } = {}
) {
	const factoryHarness = createFactoryHarness();
	const provider = new StockfishRivalProvider({
		difficulty,
		workerFactory: factoryHarness.workerFactory,
		origin,
		...options,
	});
	return {
		provider,
		worker: factoryHarness.workers[0]!,
		workers: factoryHarness.workers,
		urls: factoryHarness.urls,
	};
}
```

For direct `new StockfishRivalProvider(...)` calls in this test file, pass `difficulty: 'casual'` unless that test is specifically checking another preset.

- [ ] **Step 8: Fix type fixtures before verification**

Update every `GameSetup` literal in session/setup/component tests to include `engineDifficulty`, using `'casual'` unless the test is about another preset.

Examples:

```ts
const engineSetup: GameSetup = {
	rivalKind: 'engine',
	humanSide: 'white',
	engineDifficulty: 'casual',
};

const llmSetup: GameSetup = {
	rivalKind: 'llm',
	humanSide: 'white',
	engineDifficulty: 'casual',
};
```

In `ChessRivalSetup.test.tsx` default fixture:

```ts
setup={
	overrides.setup ?? {
		rivalKind: 'engine',
		humanSide: 'white',
		engineDifficulty: 'casual',
	}
}
```

In `RivalSetupSummary.test.tsx`, add `engineDifficulty: 'casual'` to both engine and LLM `GameSetup` literals and add `difficulty: 'casual'` to the active engine `EngineOpponent` fixture.

- [ ] **Step 9: Verify Task 2B independently**

```bash
cd apps/web
bun test src/lib/chess/rival/types.test.ts \
  src/hooks/useChessRivalSetup.test.tsx \
  src/hooks/useChessRivalSession.test.tsx \
  src/lib/chess/rival/stockfish-provider.test.ts \
  src/components/game/ChessRivalSetup.test.tsx \
  src/components/game/RivalSetupSummary.test.tsx
bun run typecheck
```

Expected: PASS. No commit should exist where `StockfishRivalProvider` requires a difficulty but still ignores it.

- [ ] **Step 10: Commit setup/session/provider freezing**

```bash
git add apps/web/src/lib/chess/rival/types.ts \
  apps/web/src/lib/chess/rival/types.test.ts \
  apps/web/src/hooks/useChessRivalSetup.ts \
  apps/web/src/hooks/useChessRivalSetup.test.tsx \
  apps/web/src/hooks/useChessRivalSession.ts \
  apps/web/src/hooks/useChessRivalSession.test.tsx \
  apps/web/src/test/fakeRival.ts \
  apps/web/src/lib/chess/rival/stockfish-provider.ts \
  apps/web/src/lib/chess/rival/stockfish-provider.test.ts \
  apps/web/src/components/game/ChessRivalSetup.test.tsx \
  apps/web/src/components/game/RivalSetupSummary.test.tsx
git commit -m "feat: freeze local rival difficulty at start"
```

---

## Task 3: Add difficulty controls and frozen summary wiring

**Files:**
- Modify: `apps/web/src/components/game/ChessRivalSetup.tsx`
- Modify: `apps/web/src/components/game/ChessRivalSetup.test.tsx`
- Modify: `apps/web/src/components/game/RivalSetupSummary.tsx`
- Modify: `apps/web/src/components/game/RivalSetupSummary.test.tsx`
- Modify: `apps/web/src/components/ChessGame.tsx`
- Modify: `apps/web/src/components/ChessGame.test.tsx`

**Interfaces:**
- Consumes: `ENGINE_DIFFICULTIES`, `getEngineDifficultyLabel`, `selectDifficulty`.
- Produces: engine-only selector, frozen difficulty summary, ChessGame callback wiring.

- [ ] **Step 1: Add failing selector tests**

Extend the test render helper with:

```ts
onSelectDifficulty: (difficulty: EngineDifficulty) => void;
```

Add:

```ts
test('renders exactly the shared engine difficulty choices', () => {
	const { getByRole } = renderSetup();
	const group = getByRole('radiogroup', { name: /difficulty/i });
	expect(group).toBeTruthy();
	expect(getByRole('radio', { name: 'Casual' })).toBeTruthy();
	expect(getByRole('radio', { name: 'Normal' })).toBeTruthy();
	expect(getByRole('radio', { name: 'Strong' })).toBeTruthy();
});

test('difficulty is hidden for the language-model rival', () => {
	const { queryByRole } = renderSetup({
		setup: {
			rivalKind: 'llm',
			humanSide: 'white',
			engineDifficulty: 'strong',
		},
	});
	expect(queryByRole('radiogroup', { name: /difficulty/i })).toBeNull();
});

test('emits difficulty changes through onSelectDifficulty', () => {
	const onSelectDifficulty = mock(() => {});
	const { getByRole } = renderSetup({ onSelectDifficulty });
	fireEvent.click(getByRole('radio', { name: 'Strong' }));
	expect(onSelectDifficulty).toHaveBeenCalledWith('strong');
});
```

Extend the existing locked-selector test to assert all three difficulty radios are disabled.

- [ ] **Step 2: Render radios from the shared table**

Add prop:

```ts
onSelectDifficulty: (difficulty: EngineDifficulty) => void;
```

Render only for engine:

```tsx
{setup.rivalKind === 'engine' ? (
	<fieldset>
		<legend>Difficulty</legend>
		<div role='radiogroup' aria-label='Difficulty'>
			{ENGINE_DIFFICULTIES.map(option => (
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
					<span>{option.label}</span>
				</label>
			))}
		</div>
	</fieldset>
) : null}
```

Match surrounding component classes rather than introducing a new component framework.

- [ ] **Step 3: Wire `ChessGame` through the existing setup hook**

Pass:

```tsx
onSelectDifficulty={rivalSetup.selectDifficulty}
```

beside `onSelectRival` and `onSelectHumanSide`.

Extend the existing “constructs no Worker before the game starts” test by clicking `Strong` while engine is selected and asserting the Worker spy remains untouched.

- [ ] **Step 4: Add failing summary tests**

Expected pre-Start:

```ts
expect(
	getByText('On-device computer · Casual · Computer plays Black · Unrated')
).toBeTruthy();
```

Expected active frozen summary with a Strong engine session:

```ts
expect(
	getByText('On-device computer · Strong · Computer plays White · Unrated')
).toBeTruthy();
```

- [ ] **Step 5: Update summary after the existing optional-setup guard**

Change helper:

```ts
function engineSummary(difficulty: EngineDifficulty, rivalSide: ChessSide): string {
	return `On-device computer · ${getEngineDifficultyLabel(difficulty)} · Computer plays ${sideName(rivalSide)} · Unrated`;
}
```

Keep the current branch ordering exactly so `setup` is narrowed before access:

```ts
if (activeSession?.opponent.kind === 'engine') {
	return engineSummary(
		activeSession.opponent.difficulty,
		activeSession.rivalSide
	);
}
if (activeSession?.opponent.kind === 'llm') {
	return llmSummary(activeSession.opponent.model, activeSession.rivalSide);
}
if (!setup) {
	return '';
}

const rivalSide = getRivalSide(setup.humanSide);
if (setup.rivalKind === 'engine') {
	return engineSummary(setup.engineDifficulty, rivalSide);
}
return llmSummary(llmModel ?? 'Selected model', rivalSide);
```

Do not add a local `difficultyLabel` switch.

- [ ] **Step 6: Verify UI/wiring**

```bash
cd apps/web
bun test src/components/game/ChessRivalSetup.test.tsx \
  src/components/game/RivalSetupSummary.test.tsx \
  src/components/ChessGame.test.tsx
bun run typecheck
```

Expected: PASS.

- [ ] **Step 7: Commit difficulty UI**

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

## Task 4: Present timeout as New-Game-only recovery and prove late moves cannot apply

**Files:**
- Modify: `apps/web/src/components/game/EngineRivalDetails.tsx`
- Test: `apps/web/src/components/game/EngineRivalDetails.test.tsx`
- Test: `apps/web/src/components/ChessGame.test.tsx`

**Interfaces:**
- Consumes: Task 1 timeout reason/state.
- Produces: timeout-specific copy, no move retry affordance, board-preservation/late-resolve integration proof.

- [ ] **Step 1: Add failing timeout-copy test**

```ts
test('timeout tells the player to start a New Game and offers no retry', () => {
	const view = render(
		<EngineRivalDetails
			enginePreflight={{ status: 'supported' }}
			startState='idle'
			rivalThinking={false}
			rivalError={{
				kind: 'move-failed',
				reason: 'timeout',
				message: 'The on-device computer took too long to move.',
			}}
			onRetry={() => {}}
		/>
	);

	expect(view.getByText('Computer move timed out')).toBeTruthy();
	expect(view.getByText(/Start a New Game/i)).toBeTruthy();
	expect(view.queryByRole('button', { name: /try again/i })).toBeNull();
});
```

- [ ] **Step 2: Specialize only the heading**

In the existing `rivalError` branch:

```ts
const errorHeading =
	rivalError.reason === 'timeout'
		? 'Computer move timed out'
		: 'Computer move failed';
```

Use `errorHeading`; keep existing message and New Game instruction. Do not add a move retry button.

- [ ] **Step 3: Add ChessGame timeout integration coverage**

Use the current engine test harness. Make the first engine move stay pending:

```ts
const move = deferred<RivalMoveResult>();
const { options, instances } = engineOptions(() => ({
	makeMove: () => move.promise,
}));
const view = render(<ChessGame rivalSessionOptions={options} />);
await waitForSetupResolved(view);
```

Start the default game (human White), play `e2 → e4` with the existing square labels:

```ts
fireEvent.click(view.getByRole('button', { name: /start/i }));
await waitFor(() => view.getByRole('button', { name: /new game/i }));
fireEvent.click(view.getByRole('button', { name: 'Square 6-4' }));
fireEvent.click(view.getByRole('button', { name: 'Square 4-4' }));
await waitFor(() => expect(instances[0]?.makeMoveCount).toBe(1));
```

Then freeze timers and cross the engine deadline:

```ts
jest.useFakeTimers();
try {
	await act(async () => {
		advanceTimers(ENGINE_MOVE_TIMEOUT_MS);
		await Promise.resolve();
	});

	expect(view.getByText('Computer move timed out')).toBeTruthy();
	expect(view.getByText(/Start a New Game/i)).toBeTruthy();

	// The legal human e2→e4 move remains.
	expect(view.getByRole('button', { name: 'Square 6-4' }).textContent).toBe('');
	expect(view.getByRole('button', { name: 'Square 4-4' }).textContent).toContain('♙');

	// Resolve the fake after timeout with Black e7→e5.
	await act(async () => {
		move.resolve({ ok: true, move: { from: 'e7', to: 'e5' } });
		await Promise.resolve();
	});

	// The late engine move never applies.
	expect(view.getByRole('button', { name: 'Square 1-4' }).textContent).toContain('♟');
	expect(view.getByRole('button', { name: 'Square 3-4' }).textContent).toBe('');
	expect(instances[0]?.makeMoveCount).toBe(1);
} finally {
	jest.useRealTimers();
}
```

This integration test carries the meaningful “late resolve cannot apply a move” guarantee; a hook-only late-resolve test after `Promise.race` is not required.

- [ ] **Step 4: Prove New Game resets the dead session**

Continue the same integration test or add a focused sibling test:

```ts
fireEvent.click(view.getByRole('button', { name: /new game/i }));
await waitFor(() => {
	expect(
		(view.getByRole('radio', { name: 'White' }) as HTMLInputElement).disabled
	).toBe(false);
});
expect(view.queryByText('Computer move timed out')).toBeNull();
```

Do not call or modify `rivalSession.clearError()` in engine tests.

- [ ] **Step 5: Verify timeout UI/integration**

```bash
cd apps/web
bun test src/components/game/EngineRivalDetails.test.tsx \
  src/components/ChessGame.test.tsx \
  src/hooks/useChessRivalSession.test.tsx
```

Expected: PASS.

- [ ] **Step 6: Commit timeout recovery presentation**

```bash
git add apps/web/src/components/game/EngineRivalDetails.tsx \
  apps/web/src/components/game/EngineRivalDetails.test.tsx \
  apps/web/src/components/ChessGame.test.tsx
git commit -m "feat: surface local rival move timeout"
```

---

## Task 5: Extend the real packaged Stockfish smoke through a legal move

**Files:**
- Modify: `apps/web/e2e/stockfish-assets.spec.ts`

**Interfaces:**
- Consumes: existing same-origin Worker readiness smoke, `parseBestMove`, `createInitialGameState`, `makeAIMove`.
- Produces: one semantic proof that the distributed Worker returns a move accepted by Procyon's chess rules.

- [ ] **Step 1: Import the existing parser and chess legality path**

```ts
import { createInitialGameState, makeAIMove } from '../src/lib/chess/game';
import { parseBestMove } from '../src/lib/chess/rival/stockfish-protocol';
```

- [ ] **Step 2: Extend the browser Worker probe to return a bestmove line**

Change the readiness test name to:

```ts
test('starts the packaged Stockfish worker and returns one legal move', async ({ page }) => {
```

Inside `page.evaluate`, make the message waiter return the matching string:

```ts
const waitForMessage = (expected: string): Promise<string> =>
	new Promise((resolve, reject) => {
		const timeout = window.setTimeout(() => {
			worker.removeEventListener('message', onMessage);
			reject(
				new Error(
					`Timed out waiting for ${expected}. Messages: ${messages.join('\n')}`
				)
			);
		}, 15_000);

		function onMessage(event: MessageEvent<string>) {
			const line = String(event.data);
			messages.push(line);
			if (line.includes(expected)) {
				window.clearTimeout(timeout);
				worker.removeEventListener('message', onMessage);
				resolve(line);
			}
		}

		worker.addEventListener('message', onMessage);
	});
```

After current `uci`/`readyok`:

```ts
worker.postMessage('ucinewgame');
worker.postMessage('isready');
await waitForMessage('readyok');
worker.postMessage('position startpos');
worker.postMessage('go movetime 250');
return await waitForMessage('bestmove ');
```

Keep `worker.terminate()` in `finally` and assign the evaluate result to `bestMoveLine` outside the browser context.

- [ ] **Step 3: Parse and validate through Procyon rules**

After `page.evaluate`:

```ts
const parsed = parseBestMove(bestMoveLine);
expect(parsed).not.toBeNull();
expect(parsed?.ok).toBe(true);
if (!parsed || !parsed.ok) {
	throw new Error(`Stockfish returned unusable bestmove: ${bestMoveLine}`);
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

Do not assert a specific opening move.

- [ ] **Step 4: Keep delivery diagnostics intact**

The existing assertions for console errors and failed asset requests must remain after the legality assertion:

```ts
expect(consoleErrors.filter(entry => !isKnownFaviconEntry(entry))).toEqual([]);
expect(
	failedAssetRequests.filter(entry => !isKnownFaviconEntry(entry))
).toEqual([]);
```

Do not create a second Playwright config/project/job.

- [ ] **Step 5: Run the real packaged-engine smoke**

```bash
cd apps/web
bun run test:e2e:stockfish-assets
```

Expected: PASS with one real Worker move accepted by `makeAIMove`.

- [ ] **Step 6: Commit the smoke extension**

```bash
git add apps/web/e2e/stockfish-assets.spec.ts
git commit -m "test: verify packaged Stockfish legal move"
```

---

## Final Verification

Run from `apps/web` after all implementation commits:

```bash
bun test src/lib/chess/rival/types.test.ts \
  src/lib/chess/rival/preferences.test.ts \
  src/lib/chess/rival/stockfish-provider.test.ts \
  src/hooks/useChessRivalSetup.test.tsx \
  src/hooks/useChessRivalSession.test.tsx \
  src/components/game/ChessRivalSetup.test.tsx \
  src/components/game/RivalSetupSummary.test.tsx \
  src/components/game/EngineRivalDetails.test.tsx \
  src/components/ChessGame.test.tsx
bun run typecheck
bun run lint
bun run build
bun test
bun run test:e2e
bun run test:e2e:stockfish-assets
```

Expected: all commands pass.

Then perform one lightweight human product sanity check, without building a benchmark harness:

1. Start an on-device game on **Casual** and play roughly 5–10 normal moves.
2. Start a fresh on-device game on **Strong** and play roughly 5–10 normal moves from a comparable opening.
3. Confirm both presets respond reliably and the Strong game is observably less forgiving/stronger than Casual.
4. Do not record an Elo claim or tune thresholds from this check. If the presets are indistinguishable at the fixed 250 ms movetime, treat that as product evidence to revisit the chosen Skill Level mapping/movetime decision rather than hiding it behind green unit tests.

## Spec Coverage Self-Review

- Three product presets: Task 2A runtime table + Task 3 UI.
- New-version device persistence: Task 2A V2 payload/key.
- Frozen difficulty: Task 2B setup/session/factory.
- Skill 0/8/16 and unchanged movetime: Task 2B provider tests.
- Selector visibility/locking/lazy load: Task 3.
- 10-second timeout/dispose/stale rejection: Task 1.
- Board preservation/no late move/New Game only: Task 4.
- Real packaged Worker legal move: Task 5.
- Human differentiation sanity: Final Verification only; no automated calibration added.

No implementation step adds backward compatibility, engine registry, cancellation protocol, same-position recovery, LLM deadline, server difficulty persistence, or calibration machinery.
