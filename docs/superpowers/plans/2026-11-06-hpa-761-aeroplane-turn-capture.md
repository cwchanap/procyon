# HPA-761 — Minimal single-PR implementation plan

**Status:** Proposed — no implementation changes in the initial draft.
**Linear:** [HPA-761](https://linear.app/cwchanap/issue/HPA-761/aeroplane-chess-human-turns-are-silently-skipped-and-captures-are)
**Design:** [Aeroplane turn/capture design](../specs/2026-11-06-hpa-761-aeroplane-turn-capture-design.md)
**Delivery:** One existing draft PR for these docs **and**, after review, the code/tests. No follow-up implementation PR.

## Step 0 — Establish the reported failure vs current behavior

- [ ] Record tested main SHA and, if accessible, the Cloudflare build/revision behind `procyon.cwchanap.dev` at the Nov 4 incident and currently. Treat unknown historical revision as **unknown**; do not infer it from a newer successful deployment.
- [ ] Recreate **Standard / Classic / 4-plane / Red human** with deterministic dice in existing fixtures: initial roll 6 (four hangar launch choices), active Red plane with a legal non-six roll, ordinary empty-move roll, and rapid roll/AI-turn click attempts.
- [ ] Compare `activeMatch.actions` and authoritative state against the visible feed/status after each accepted roll. Distinguish (a) a correctly passed turn with **no legal moves**, (b) a true lost legal move, and (c) a stale/misleading die readout. Note that HPA-763 owns broader stale-roll UI.
- [ ] If the current code correctly retains legal turns, record the live incident as **unreproduced** on that revision. Do not invent a race condition or modify core turn logic without a failing reproduction.

## Step 1 — Lock turn invariants with small deterministic tests

**Targets:** `apps/web/src/lib/aeroplane/game.test.ts` and `apps/web/src/hooks/useAeroplaneMatch.test.ts` (reuse `diceStateForRoll`, the existing harness and test fixtures).

- [ ] With Classic all Red planes in hangars and roll **6**, assert `rollTurn` returns four launch moves, `phase === 'awaiting-choice'`, `pendingRoll === 6`, and `currentPlayer === 'red'`. Hook test: one roll action, no auto-advance, all four selectable.
- [ ] With a legal active Red plane and a fixed ordinary roll, assert the hook maintains a choice when multiple planes are legal, or auto-commits exactly one move when only one is legal. Check `actions`, `currentPlayer`, `pendingRoll`, and saved state, not just the die face.
- [ ] With no legal moves, assert a single accepted roll/pass action, expected next player, and die face; preserve the existing six-bonus no-move test in `game.test.ts`. A second click while awaiting a choice or during AI turn adds no action and consumes no dice RNG.
- [ ] If any true lost-turn test fails, fix only the proven culprit in `executeRoll`, `rollTurn`, or the board callback and retain the red test. Avoid replacing the hook or changing gameplay rules to mask the symptom.

## Step 2 — Add the missing ordinary no-move feed line

**Targets:** `apps/web/src/hooks/useAeroplaneMatch.ts`; `apps/web/src/components/aeroplane/AeroplaneEventFeed.tsx`.

- [ ] Extend the existing roll-only/null-move feed shape with a minimal discriminant for **ordinary no legal move** vs **Customs forced skip**. Keep actual `action` and roll face. No fake `ResolvedMove` and no extra authoritative action.
- [ ] After `executeRoll` commits an empty-move roll, enqueue one feed entry independent of board animation. Use `result.state.currentPlayer` to choose "turn passes" vs "rolls again". Keep existing Customs copy even when the forced skip roll is six.
- [ ] Leave the normal move flow unchanged: one legal human move auto-selects; multiple moves await the user; no extra feed noise on legal rolls.
- [ ] Extend `AeroplaneGame.test.tsx` event-feed tests plus hook tests: human no-move, AI no-move, six retaining turn, Customs skip, correct single entry, and a subsequent normal move. Keep the existing `skipAnimations` UI behavior.

## Step 3 — Make captures visible in Standard and Tycoon

**Target:** `apps/web/src/components/aeroplane/AeroplaneEventFeed.tsx`.

- [ ] Remove the `tycoon` check that suppresses `move.capturedPlaneIds` in Standard. Use the actual effective move, not the board's apparent landing location, as the source of victims.
- [ ] Add one explicit attacker-to-victim detail per captured plane: "Blue plane 4 captures Red plane 1." Reuse `planeName`; for multiple victims render one line per ID in stable order.
- [ ] Update the existing Tycoon test that currently expects "Captured Blue plane 3." to the unified wording. Assert Tycoon coins/cards/relocation copy and Customs skip still render.
- [ ] Extend the integrated `AeroplaneGame.test.tsx` capture journey around the existing capture/rollback test: assert the Standard feed announces the capture and the actual victim returns to hangar, with unchanged persisted state and action checksums. Add a focused AI-Blue-captures-human-Red fixture if required to cover the reported actor direction.

## Step 4 — One focused browser regression, no redundant suite

**Target:** `apps/web/e2e/aeroplane.spec.ts`.

- [ ] Reuse the fixture-based critical journey. Confirm initial **six** exposes multiple Red launch choices without skipping Red's turn. Verify a deterministic no-move roll produces visible feedback while AI turn automation continues.
- [ ] Extend the existing `captures only at the final endpoint` browser journey (or one nearby compact scenario) to check readable capture text in Standard mode; ensure landing without a capture adds no capture message.
- [ ] Do not add an exhaustive four-colour/four-preset matrix, separate performance harness, new end-to-end framework, or tests for HPA-763 in this PR.

## Step 5 — Verify and report the outcome

From repository root:

```bash
cd apps/web
bun test src/lib/aeroplane/game.test.ts src/hooks/useAeroplaneMatch.test.ts src/components/aeroplane/AeroplaneGame.test.tsx
bun run test:e2e e2e/aeroplane.spec.ts
cd ../..
bun run typecheck
bun run lint
bun run format:check
```

- [ ] Check both Standard and Sky Tycoon: legitimate passes are explained; legitimate legal rolls do not disappear; captures name the attacker and the victim.
- [ ] Review impacted snapshots/string assertions; verify no rules, RNG, persistence, save/replay checksums or sound changed accidentally.
- [ ] Add a short outcome note on HPA-761 and this PR: tested SHA/deployed SHA (if known), whether lost legal turns were **actually reproduced**, which code defect was corrected, and which tests passed. Do not claim the original incident is fully fixed if only missing feed text is confirmed.
- [ ] Keep this **same PR** draft while implementing, then mark ready only when implementation/test evidence is complete.

## Stop rule

The two presentation defects are confirmed and should be fixed. The **legitimate-roll-skipped** claim is not yet reproduced from main. If focused rule/hook/UI tests pass and production history cannot confirm the original revision, stop after the useful feedback/capture fix and regression coverage; label the original symptom as **unreproduced**, not a proven race fix.
