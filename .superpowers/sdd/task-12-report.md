# Task 12 Report: Focused rival setup/status components

## Status

Completed.

## Summary

- Added `ChessRivalSetup`, a presentation-only setup panel for rival kind and side selection.
- Added `RivalSetupSummary`, a frozen/setup summary formatter for engine and LLM opponents.
- Added `EngineRivalDetails`, covering engine preflight, start, load failure, thinking, and active failure states.
- Added `LlmRivalDetails`, wrapping the existing `AIStatusPanel` and `AIGameInstructions` for LLM-specific details.
- Added focused test coverage for all four components.

## Files

- `apps/web/src/components/game/ChessRivalSetup.tsx`
- `apps/web/src/components/game/ChessRivalSetup.test.tsx`
- `apps/web/src/components/game/RivalSetupSummary.tsx`
- `apps/web/src/components/game/RivalSetupSummary.test.tsx`
- `apps/web/src/components/game/EngineRivalDetails.tsx`
- `apps/web/src/components/game/EngineRivalDetails.test.tsx`
- `apps/web/src/components/game/LlmRivalDetails.tsx`
- `apps/web/src/components/game/LlmRivalDetails.test.tsx`

## Requirement checklist

- Opponent choices are accessible radios with exact visible labels `On-device computer` and `Language model`.
- Engine setup copy includes runs on device, no account/API key, and `Unrated`.
- Side control is labeled `You play` with `White` and `Black` radio options.
- Locked setup disables opponent and side selectors and renders the lock explanation.
- Fallback notices render with `role="status"` and `aria-live="polite"`.
- Explicit unusable LLM selection remains selected and surfaces sign-in/config state.
- Summary strings match:
  - `On-device computer · Computer plays Black · Unrated`
  - `Language model · <model> · Computer plays White`
- Active summaries consume the complete `ActiveRivalSession`.
- Engine details cover ready, unsupported, loading, load failed with `Try again`, thinking, and active failure with `New Game` guidance.
- LLM details preserve sign-in/config guidance, existing retry/debug copy, and do not show engine copy.

## TDD evidence

Initial red run:

```text
bun test apps/web/src/components/game/ChessRivalSetup.test.tsx \
  apps/web/src/components/game/RivalSetupSummary.test.tsx \
  apps/web/src/components/game/EngineRivalDetails.test.tsx \
  apps/web/src/components/game/LlmRivalDetails.test.tsx

0 pass
4 fail
4 errors
Cannot find module './ChessRivalSetup'
Cannot find module './RivalSetupSummary'
Cannot find module './EngineRivalDetails'
Cannot find module './LlmRivalDetails'
```

Final focused test run:

```text
bun test apps/web/src/components/game/ChessRivalSetup.test.tsx \
  apps/web/src/components/game/RivalSetupSummary.test.tsx \
  apps/web/src/components/game/EngineRivalDetails.test.tsx \
  apps/web/src/components/game/LlmRivalDetails.test.tsx

20 pass
0 fail
41 expect() calls
```

Additional verification:

```text
bunx prettier --check <new task files>
All matched files use Prettier code style!

bun run lint
0 errors, 63 existing warnings

bun run typecheck
astro sync && tsc --noEmit
exit 0
```

## Concerns

- `bun run lint` still reports 63 pre-existing warnings in unrelated files; no lint errors were introduced by this task.
- Components are intentionally presentation-only and are not wired into `ChessGame` yet.
