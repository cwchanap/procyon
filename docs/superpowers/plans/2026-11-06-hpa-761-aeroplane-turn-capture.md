# HPA-761 — Focused single-PR implementation plan

**Status:** Implemented — steps 1–6 are complete and verified in this PR. Originally proposed; revised after [initial design review](https://github.com/cwchanap/procyon/pull/66#issuecomment-6702765762), [type/string follow-up](https://github.com/cwchanap/procyon/pull/66#pullrequestreview-5810574105), and a post-implementation review covering the status live region, feed typing, and e2e harness hardening.
**Linear:** [HPA-761](https://linear.app/cwchanap/issue/HPA-761/aeroplane-chess-human-turns-are-silently-skipped-and-captures-are)
**Design:** [Aeroplane turn/capture design](../specs/2026-11-06-hpa-761-aeroplane-turn-capture-design.md)
**Delivery:** **One PR** for design, the eventual focused code changes, and verification. No separate implementation PR.

## What current code already covers

- `rollTurn` selects legal moves before entering `awaiting-choice`; ordinary no-move rolls advance immediately and six grants another turn. `playResolvedMove` owns captures and authoritative transitions.
- `useAeroplaneMatch.test.ts` already covers one legal move auto-applying, multiple choices waiting, paced human no-move → AI, and blocked human → AI chaining.
- `game.test.ts` covers a six retaining the turn even with no move; `rules.test.ts` covers six-only launch and launch-pad restrictions.
- Two actual presentation gaps: ordinary no-move rolls are omitted from the feed, and Standard-mode captures are deliberately suppressed.
- In `AeroplaneBoard.tsx` and `AeroplaneStatus.tsx`, "No legal moves" text is guarded by an engine-unreachable `awaiting-choice && legalMoves.length === 0` condition. Their hand-built state tests are misleading.
- `e2e/aeroplane.spec.ts`'s `fixtureFrom` defaults to `skipAnimations: true`, which suppresses move feed entries. Feed assertions require `skipAnimations: false`.

No Cloudflare build archaeology is needed to choose the fix. Report the **tested code SHA**; never equate that to the historic November 4 production build without evidence.

## Step 1 — Three targeted tests before source changes

**Targets:** `apps/web/src/lib/aeroplane/game.test.ts`, `apps/web/src/hooks/useAeroplaneMatch.test.ts`.

- [x] **All-hangar six:** In Classic, all four Red planes begin in hangars. Fixed roll **6** yields four legal launch moves, `phase === 'awaiting-choice'`, `pendingRoll === 6` and `currentPlayer === 'red'`. Verify the hook exposes four choices and does not advance to Yellow. No extra broad fixtures.
- [x] **Duplicate click:** Calling the human `roll()` twice from the same start yields **one authoritative roll action**, unchanged consumed RNG on the rejected call, and no double-advance.
- [x] **Occupied launch pad:** With Red plane 1 on its launch pad (progress 0), all other Red planes in hangars, and a fixed roll **6**, the pad blocks further launches; exactly **one** legal move exists for Red plane 1 and the hook auto-applies it. The player will not be shown a choice; this is expected.

If these pass, do **not** rewrite turn scheduling or add speculative race guards. Note that a silent _legitimate pass_ followed by an AI die, or an auto-applied only legal move, might look like a lost Red turn. Mark the original lost-legal-move symptom **"not reproduced on `<tested-sha>`"** unless new failing evidence emerges.

## Step 2 — Widen the existing roll-only feed entry

**Targets:** `apps/web/src/hooks/useAeroplaneMatch.ts` and `apps/web/src/components/aeroplane/AeroplaneEventFeed.tsx`.

- [x] Reuse the roll-only entry — renamed `AeroplaneRollOnlyFeedEntry` in the review follow-up since it covers every no-move roll, not only skips (`move: null`, real `action`, no board route). **Required** `nextPlayer: AeroplaneColor` on the hook interface, populated from `result.state.currentPlayer`. On the component side, `AeroplaneEventFeedProps` is typed directly as the hook's `AeroplaneFeedEntry` union — the earlier `AeroplanePresentationLike` view interface and its optional `nextPlayer` were removed, so `nextPlayer` is required everywhere and the `'next player'` fallback was deleted. **Do not add `reason`:** the committed `action.events` already distinguishes Customs via `{ type: 'skipped' }`.
- [x] In `executeRoll`, widen the current Customs-only feed condition to `result.legalMoves.length === 0`, under the **existing `!skipAnimationsRef.current` gate**. The entry is for a real committed roll with no legal move, not an extra action or an animation. The same entry is exposed as `noMoveNotice` **unconditionally** — the status live region is content, not presentation — and is replaced or cleared on the next roll and on reset.
- [x] For a null-move entry, a shared `rollOutcomeCopy(entry)` uses `entry.action.events.some(event => event.type === 'skipped')` first, then `entry.nextPlayer === entry.action.color`, otherwise a pass; `eventCopy` prefixes `actor = 'AI' | 'You'`. Colour/roll come from `colorLabel[entry.action.color]` / `entry.action.roll`. **Exact copy contract (including case/punctuation):**
  - Customs: `${actor}: ${color} rolled ${roll} and skips this turn at Customs.`
  - Bonus roll: `${actor}: ${color} rolled ${roll}; no legal moves. ${color} rolls again.`
  - Pass: `${actor}: ${color} rolled ${roll}; no legal moves. Turn passes to ${colorLabel[entry.nextPlayer]}.`
  - `nextPlayer` is required on every roll-only entry — no fallback. Do not recompute the next player from the die or mode.
- [x] Every `move === null` row uses `data-testid='aeroplane-feed-roll-only'` (renamed from `aeroplane-feed-skip`); the brass left-border is applied only when the action carries the Customs `skipped` event.
- [x] Keep legal-roll handling as-is: one human move auto-applies, multiple choices await selection, and normal move feed lines are unchanged. No per-legal-roll lines or feed aggregation.
- [x] Update hook and feed tests for human no-move, AI no-move, a no-move **six** (same player), Customs **six** (forced pass), exactly one entry per accepted roll, and `noMoveNotice` set/clear behavior. The existing hook test comparing the entire Customs entry must include `nextPlayer`. Assert all three **exact** templates above; fixtures supply an engine-reachable `nextPlayer` (a Customs six always hands off, never to the roller).
- [x] **Fixture semantics:** `skipAnimations: true` suppresses both existing move feed presentations and the roll-only feed entry, but **not** `noMoveNotice`. The user-facing **Skip animations** button instead cancels queued board animation while retaining feed entries already shown. Preserve both behaviors.

## Step 3 — Display capture details in both modes, remove the obsolete prop

**Targets:** `AeroplaneEventFeed.tsx`, `AeroplaneGame.tsx`, and `AeroplaneGame.test.tsx`.

- [x] Render every `move.capturedPlaneIds` victim as `"${planeName(move.planeId)} captures ${planeName(victimId)}."` in stable order, regardless of mode. Preserve Tycoon economy/chance/event details.
- [x] Remove the now-unused `tycoon` prop from `AeroplaneEventFeedProps`, `detailCopy`, the `<AeroplaneEventFeed>` call site in `AeroplaneGame.tsx` **and the existing `<AeroplaneEventFeed events={...} tycoon />` test render in `AeroplaneGame.test.tsx`**, plus any other test reference. Remove the stale "Standard feed stays unchanged" comment.
- [x] Flip the **existing** integrated test `"Standard matches show no Sky Tycoon UI"` in `AeroplaneGame.test.tsx`: it already captures `blue-0` using Red plane 1. Replace its suppression assertion with **"Red plane 1 captures Blue plane 1."** Keep its checks that no Sky Tycoon UI renders.
- [x] Update the Tycoon feed expectation `"Captured Blue plane 3."` to **"Red plane 1 captures Blue plane 3."** Fix the test's fabricated Customs roll action `{ type: 'skip' }` to the actual `{ type: 'skipped' }`, and give it `nextPlayer`.
- [x] Add **pure-props feed renders** for Blue plane 4 capturing Red plane 1 and a multi-victim capture. The renderer is actor-agnostic; no extra AI-Blue gameplay fixture is needed. Do not duplicate existing state/capture checksum tests.

## Step 4 — Delete two unreachable pass-copy branches and obsolete tests

**Targets:** `apps/web/src/components/aeroplane/AeroplaneBoard.tsx`, `AeroplaneStatus.tsx`, `AeroplaneGame.test.tsx`, `AeroplaneStatus.test.tsx`.

- [x] Delete both copy branches under `phase === 'awaiting-choice' && legalMoves.length === 0`. The game engine never produces that phase for an ordinary no-move roll; the feed from Step 2 now describes it. Review follow-up: `AeroplaneStatus` regained a minimal `No legal planes can move.` guard — restored/fixture states can still enter `awaiting-choice` with zero moves and must not render "0 legal planes — choose one."
- [x] `AeroplaneStatus` takes a `noMoveNotice` prop and appends `rollOutcomeCopy(noMoveNotice)` inside its `role='status'` live region, so the outcome is announced even when the feed is collapsed or `skipAnimations` suppressed it. Its single-move line reads `One legal plane — choose it.` (auto-apply only happens inside `executeRoll`; a restored awaiting-choice state still needs a click).
- [x] Remove the direct component tests that manually build this impossible scenario (the `"shows 'No legal moves' when there are no legal moves"` tests in `AeroplaneGame.test.tsx` and `AeroplaneStatus.test.tsx`). Preserve the separate **AI-awaiting-choice with hidden legalMoves** tests, which are valid.
- [x] Do not change HPA-763's status/die visuals, button styling, reload, audio settings or login.

## Step 5 — One focused browser regression with feed enabled

**Target:** `apps/web/e2e/aeroplane.spec.ts`.

- [x] Reuse the existing deterministic fixture helpers and nearby critical journeys rather than building a new harness. In **one concise e2e regression**, verify an ordinary Classic no-move roll produces the pass line and an actual Standard capture produces the attacker → victim line, while a noncapture produces no capture detail. Reuse the `"captures only at the final endpoint"` scenario to exercise captured/not-captured landing where possible.
- [x] **Explicitly pass `{ skipAnimations: false }` to `fixtureFrom` for every scenario asserting feed text.** The default is `true`; otherwise `enqueuePresentation` returns without appending the move to the feed and the test cannot pass. Wait for the existing paced AI timers/status rather than assuming instant advancement.
- [x] Review follow-up: `gotoAeroplane` now waits for the mount-time save (hydration proof) after navigation; `humanActionCount(page, 'roll'|'move')` throws on a failed read instead of returning 0; `isRedAwaitingRoll` is shared; the feed regression raises its timeout via `test.setTimeout`.
- [x] Do not add a broad variant/colour matrix or extra e2e for the already-covered one/multiple move branches.

## Step 6 — Verify and report

Run from repository root:

```bash
cd apps/web
bun test src/lib/aeroplane/game.test.ts src/hooks/useAeroplaneMatch.test.ts src/components/aeroplane/AeroplaneGame.test.tsx src/components/aeroplane/AeroplaneStatus.test.tsx
bun run test:e2e e2e/aeroplane.spec.ts
cd ../..
bun run typecheck
bun run lint
bun run format:check
```

- [x] Confirm Standard/Tycoon passes, bonus six, Customs, single/multiple captures and no-capture lines in rendered UI, with the correct fixture animation setting.
- [x] Keep rules, RNG, timer semantics, action records/checksums, persisted match, audio, and existing replay behavior unchanged unless a failing focused test demonstrates a required change.
- [x] Report the **tested SHA**, whether the original lost _legal_ turn reproduced, actual changes, and tests run to **HPA-761 and this same PR**. If it did not reproduce, say **"not reproduced on `<tested-sha>`"**, not "fixed".
- [x] Keep **PR #66** draft while implementing, then mark ready when changes and verification are complete.

## Stop rule

Fix only the two confirmed presentation defects and remove their dead UI branches/obsolete tests. If the targeted three turn tests and existing coverage stay green, leave authoritative turn logic untouched and record the unresolved historical symptom accurately. No second PR, Cloudflare deployment forensics, broad refactor, new art or SFX.
