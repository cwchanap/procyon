# HPA-761 — Aeroplane turn handling and capture announcements

**Status:** Proposed design (documentation-only draft; refined after [PR #66 design review](https://github.com/cwchanap/procyon/pull/66#issuecomment-6702765762))
**Date:** 2026-11-06
**Linear:** [HPA-761 — Human turns are silently skipped and captures are never announced](https://linear.app/cwchanap/issue/HPA-761/aeroplane-chess-human-turns-are-silently-skipped-and-captures-are)
**Implementation plan:** [Focused single-PR plan](../plans/2026-11-06-hpa-761-aeroplane-turn-capture.md)

## Goal

Every accepted human roll must lead to one understandable outcome: **choose a legal plane**, **auto-play the only legal plane**, or **explicitly explain that no move is available**. A capture must be announced in the event feed, regardless of Standard or Sky Tycoon mode. Do not invent a gameplay-rule change for an unverified production symptom.

The reported setup is **Standard / Classic / 4-plane victory / Red human vs three AIs**. The November 4 playtest reported intermittent lost human rolls, including a displayed 6 from the initial hangar and later turns with an active Red plane. It also observed AI captures with no feed copy; e.g. Blue plane 4 sent Red plane 1 back to the hangar while the feed only described the Blue landing.

## Evidence from the current source (not proof about the deployed build)

| Path | Current behavior | Implication |
| --- | --- | --- |
| `apps/web/src/lib/aeroplane/game.ts` — `rollTurn` | Computes `getLegalMoves`; enters `awaiting-choice` when moves exist; advances only when no legal moves (or a Sky Tycoon Customs skip); a six retains a bonus turn on ordinary no-move rolls. | Pure rules do **not** obviously explain a legal six launching from the hangar being silently forfeited. Prove any actual turn loss before changing the engine. |
| `apps/web/src/hooks/useAeroplaneMatch.ts` — `executeRoll` | Validates human/AI actor and phase, commits rolled state/action, updates the die; if zero legal moves, returns without a Standard-mode feed entry. One legal human move is auto-applied, multiple choices are exposed through `legalMoves`. | Real no-move passes are visually indistinguishable from lost turns in the event feed. |
| `apps/web/src/hooks/useAeroplaneMatch.ts` — `applyMove` | Persists `playResolvedMove`'s effective move and action before the UI presentation; feeds a presentation for normal animations. | Use the committed move as the display source, not a second board-state calculation. |
| `apps/web/src/components/aeroplane/AeroplaneEventFeed.tsx` — `detailCopy` | Prints `move.capturedPlaneIds` only when `tycoon` is true. | This **confirmed** presentation condition hides every Standard capture despite the existing engine capture data. |
| `apps/web/src/components/aeroplane/AeroplaneBoard.tsx` and `AeroplaneStatus.tsx` | Each has a "No legal moves" branch under `phase === 'awaiting-choice' && legalMoves.length === 0`. The engine only enters `awaiting-choice` when it found legal moves. | These are **unreachable in normal engine-produced states** and currently have tests using manually constructed impossible states. Delete both branches and those tests; the feed owns pass explanations. |
| `apps/web/src/components/aeroplane/AeroplaneStatus.tsx` | The die uses `rollPresentation`, which may continue to show the most recent roller after the turn advances. | Do not infer the current turn from the latest die alone; broader stale status and disabled-roll styling belong to HPA-763. |
| `apps/web/e2e/aeroplane.spec.ts` — `fixtureFrom` | Defaults to `skipAnimations: true`, which suppresses `enqueuePresentation` and thus move-feed entries. | Feed assertions in Playwright **must use `skipAnimations: false`** and wait through the existing paced AI behavior. |

Existing coverage already checks one-legal-move auto-play, multiple-choice waiting, a human no-move roll pacing the AI, blocked-turn chaining, a six-without-moves retaining the turn, and launch-pad restrictions. Add only missing cases: all-hangar six, duplicate roll clicks, and an occupied launch pad yielding exactly one auto-playable move.

A six with a Red plane **already on the launch pad** cannot launch a second Red plane until the first leaves; with all other Red planes in their hangars, the existing plane is the **only** legal mover and auto-plays. This can look like a missing choice, but is correct behavior. A legitimately empty roll followed by the next AI's die can also look like a forfeited turn without feed narration.

## Product decisions and expected behavior

| Scenario | Expected result |
| --- | --- |
| Red's first Classic roll is **6** with all four Red planes in the hangar | Four legal launch choices remain available in `awaiting-choice`. Red is **not** handed to Yellow without a choice. |
| Red rolls with at least one legal active plane | With multiple legal moves, present plane choices; with one, auto-play exactly that move. Never consume another roll or advance without a committed move. |
| Red rolls 1–5 with all Red planes still in the Classic hangar | There is legitimately no move: advance according to existing rules **and** log a clear roll/pass explanation. |
| A roll has no moves but is **6** | Preserve existing bonus-turn semantics; feed text must say Red rolls again, not that the turn passed to Yellow. |
| Sky Tycoon Customs forces a skip | Keep the existing Customs-specific skip message; even a six hands over as today. Never confuse this with ordinary no-legal-move passes. |
| Blue plane 4 captures Red plane 1 on a shared square | Show the normal move line **plus** "Blue plane 4 captures Red plane 1." Red plane 1 returns to its hangar via existing authoritative rules. |
| One move captures multiple planes | Emit one readable capture detail per victim, in the resolved move's stable order, including the mover's colour/plane number. |
| No capture | No capture detail; Sky Tycoon economy/effect details remain unchanged. |
| Roll click while an AI is acting, or a rapid duplicate roll click | The controller's actor/phase guards reject extra human rolls; no extra consumed RNG or duplicate action. |

### Design A — Keep the game state authoritative

Do **not** reimplement move legality, the die, captures, turn order, bonus rolls, or persistence to compensate for missing UI copy. `rollTurn` / `getLegalMoves` and `playResolvedMove` already own those decisions. The accepted roll's committed `actions` and state must agree with `phase`, `currentPlayer`, and `pendingRoll`.

Test the three uncovered deterministic cases against a recorded **tested commit SHA**. A genuine counterexample (legal moves existed, yet the controller passed) warrants the smallest fix at the **observably failing** boundary. If tests pass, describe the historical turn-loss report as **not reproduced on `<tested-sha>`**. Do not assert which build served the November 4 incident; checking historical Cloudflare deployments is not a prerequisite to the same focused fix.

### Design B — Reuse the existing roll-only feed entry for genuine passes

`executeRoll` already constructs a `move: null` roll-only `AeroplaneSkipFeedEntry` for Customs. **Widen** that existing condition from `result.effectEvents.some(event => event.type === 'skipped')` to `result.legalMoves.length === 0`; never fabricate a `ResolvedMove` or an extra authoritative action.

Add only `nextPlayer: result.state.currentPlayer` to the roll-only feed entry. Its `action` already contains the actual roller, roll face, and the Customs `{ type: 'skipped' }` event:

- If `action.events` contains `type === 'skipped'`, keep the existing Customs message (including when the die is six).
- Otherwise, when `nextPlayer === action.color`, render a no-legal-moves **rolls again** line (ordinary bonus six).
- Otherwise, render a no-legal-moves **turn passes to {nextPlayer}** line.

Examples:

- "You: Red rolled 3; no legal moves. Turn passes to Yellow."
- "You: Red rolled 6; no legal moves. Red rolls again."
- "AI: Yellow rolled 2; no legal moves. Turn passes to Blue."
- "You: Red rolled 6 and skips this turn at Customs."

Do **not** add a second `reason` field: it duplicates `action.events` and can disagree. Do not derive post-roll turn order again in the renderer.

**Presentation gate:** Keep the same `!skipAnimationsRef.current` condition used by existing Customs feed entries. The test-only `skipAnimations: true` fixture suppresses both these feed entries and move presentations; a Playwright feed test must set it to `false`. The user-facing **Skip animations** button is separate: it stops the pending visual route without erasing already-logged feed entries. Feed entries are not persisted and never affect checksums, action records, board animation or RNG.

Only zero-legal-move rolls receive these extra lines. Normal legal rolls still use the existing die, choices, and resulting move entry; avoid new per-roll noise or pass aggregation. Early Classic games will naturally log many ordinary passes.

### Design C — Announce actual captures in both modes and remove a dead prop

In `AeroplaneEventFeed.tsx`, remove the `tycoon` gate around capture details; use the committed `presentation.move.capturedPlaneIds` and existing `planeName` to render `"${planeName(move.planeId)} captures ${planeName(victimId)}."` for each victim, in the resolved order. This identifies both sides even when the AI is Blue and the victim is human Red.

Once capture rendering is unconditional, the `tycoon` prop becomes unused. Remove it from `AeroplaneEventFeedProps`, `detailCopy`, `AeroplaneGame.tsx`'s call site, and tests. Preserve Tycoon action-effect details with their existing `action.events` type checks; no mode prop is needed.

Reuse the integrated **"Standard matches show no Sky Tycoon UI"** test: it already performs a Standard capture. Flip the assertion that capture text is absent to assert **"Red plane 1 captures Blue plane 1."** Extend pure feed-props renders to cover Blue capturing Red and multi-victim messages; no additional AI-specific gameplay fixture is required. Update the Tycoon expectation from "Captured Blue plane 3." to "Red plane 1 captures Blue plane 3."

Keep the existing capture/position rules, visual return-to-hangar, scoring and action checksums unchanged. No second collision calculation, extra SFX/art, or event-sourcing system.

### Design D — Remove impossible pass-copy branches

Delete the `awaiting-choice && legalMoves.length === 0` "No legal moves" branches from **both** `AeroplaneBoard.tsx` and `AeroplaneStatus.tsx`; `rollTurn` advances the turn directly rather than producing that normal-play state. Remove their direct component tests that construct it artificially (`AeroplaneGame.test.tsx` near the board status tests and `AeroplaneStatus.test.tsx`). Leave the valid AI awaiting-choice copy tests intact: `legalMoves` is intentionally empty when the controller hides an AI player's choices.

The **event feed** now owns all ordinary pass explanations. No HPA-763 die/status visual redesign is required.

## Acceptance criteria

1. Test only uncovered turn cases: Classic **all-hangar six → four launch choices**, duplicate human `roll()` → one action, **occupied Red launch pad with six → exactly one auto-applied move**. Preserve existing turn, bonus-roll and AI sequencing tests.
2. A no-move roll creates one correct roll-only feed entry (human/AI pass, bonus-six replay, or Customs skip) when animations are enabled. A legal roll creates no extra pass line. The dead Board/Status pass copy and impossible-state tests are removed.
3. Standard and Tycoon captures identify both attacker and victim (including Blue → Red and multi-victim cases), and neither the obsolete `tycoon` feed prop nor the old Standard-capture-suppression assertion remains.
4. Playwright feed checks set `skipAnimations: false` and wait through paced AI behavior. Existing presentation suppression under the `true` fixture is preserved.
5. Action ordering, checksum, deterministic dice, rules, audio, and persistence remain unchanged. Report the tested SHA and actual reproduced/unreproduced findings; one PR contains documentation and eventual implementation.

## Explicit non-goals

- HPA-763: match reload/persistence, mute settings, login control, misleading disabled "Roll die" styling, stale die/status across actors, homepage text, setup truncation.
- Broad Aeroplane refactor, event sourcing, new telemetry service, engine rewrite, rule preset changes, AI changes, multiplayer, or storage migration.
- New artwork or SFX; the existing Aeroplane assets remain untouched.

When implementation begins, extend **this same PR** with the smallest tested fix; do not split HPA-761 across multiple PRs.
