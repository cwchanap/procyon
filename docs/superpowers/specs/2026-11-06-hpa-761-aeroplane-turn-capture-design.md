# HPA-761 — Aeroplane turn handling and capture announcements

**Status:** Proposed design (documentation-only draft)
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
| `apps/web/src/components/aeroplane/AeroplaneStatus.tsx` | The die uses `rollPresentation`, which may continue to show the most recent roller after the turn advances. | Do not infer a current turn from the decorative/latest die alone; HPA-763 separately owns stale status and disabled-roll styling. |

Existing coverage already exercises some pure-turn, delayed-AI, capture-resolution, and persistence behavior. We should extend the focused gaps instead of replacing the state machine.

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

First test the claimed lost-turn cases against current main and, if possible, a trace of the deployed November 4 build. A genuine counterexample (legal moves existed, yet the engine/controller passed) warrants the smallest fix at the **observably failing** boundary. If all rules/controller tests pass and the historical deploy is unknown, say that plainly rather than claim to have fixed a proven turn-loss bug.

### Design B — Show ordinary no-move roll outcomes, not fake movement

In `executeRoll`, after a committed result with `legalMoves.length === 0`, add a lightweight **roll-only feed entry** for a legitimate no-legal-move result. It should carry the actual roll actor, colour and face, and distinguish reason `no-legal-move` from the existing `customs` skip. Reuse the current event-feed union/renderer; no new global event bus or persisted event schema. The feed entry has `move: null`, is never queued as a moving plane, and never affects audio or the action checksum.

Render, for example:

- "You: Red rolled 3; no legal moves. Turn passes to Yellow."
- "You: Red rolled 6; no legal moves. Red rolls again."
- "AI: Yellow rolled 2; no legal moves. Turn passes to Blue."
- Keep the existing Customs line: "You: Red rolled 6 and skips this turn at Customs."

Read the post-roll authoritative state to determine whether the turn actually passed. Do not derive this from the last die presentation or assume every empty move list is a pass.

For a roll with legal choices, the existing die/status plus choice controls remain the feedback; avoid flooding the feed with an extra roll entry before every normal move. Keep animation-only presentation state separate from logged logical outcomes.

### Design C — Announce actual captures in both modes

In `AeroplaneEventFeed.tsx`, remove the Standard-vs-Tycoon gate around capture details. Use `presentation.move.capturedPlaneIds` (the committed, effective move) and existing `planeName` / `colorLabel` helpers to render "Blue plane 4 captures Red plane 1." as a detail under the move line. Preserve all current Tycoon effect copy and roll-only skip treatment.

Do not recalculate shared-square collisions from visual coordinates, add a second capture counter, or generate extra audio/assets. Presentation-only copy must not alter board state, RNG, event persistence, replay checksums, or scoring.

## Acceptance criteria

1. Deterministic Classic all-hangar **6** and active-plane fixtures retain legal human options; a no-move roll uses the correct next player and clear roll-only explanation. Rapid clicks and AI-turn clicks do not consume extra actions.
2. The reported incident is classified with evidence as **reproduced and corrected**, **stale deployment**, or **not reproduced on tested revision**. Do not say that explanatory UI alone proves the underlying skip resolved.
3. Standard and Tycoon capture feed lines identify both capturer and victim, including Blue capturing Red and multi-victim landings. No phantom capture entries.
4. Existing action ordering, checksum, deterministic dice, timing/animation behavior, Customs effects, and round/bonus semantics remain intact.
5. Tests cover both logic and rendered user-visible behavior. The existing one-PR implementation approach is retained.

## Explicit non-goals

- HPA-763: match reload/persistence, mute settings, login control, misleading disabled "Roll die" styling, stale die/status across actors, homepage text, setup truncation.
- Broad Aeroplane refactor, event sourcing, new telemetry service, engine rewrite, rule preset changes, AI changes, multiplayer, or storage migration.
- New artwork or SFX; the existing Aeroplane assets remain untouched.

When implementation begins, extend **this same PR** with the smallest tested fix; do not split HPA-761 across multiple PRs.
