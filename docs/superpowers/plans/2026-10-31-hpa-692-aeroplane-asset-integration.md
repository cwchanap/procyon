# HPA-692 — Aeroplane asset integration implementation plan

> One ticket, **one PR**. This draft contains only the reviewed design and this plan. Implement all production code/tests in this **same draft PR** after review; do not create a separate implementation PR.

**Issue:** https://linear.app/cwchanap/issue/HPA-692/integrate-aeroplane-art-and-sfx-pack-into-gameplay  
**Design:** `docs/superpowers/specs/2026-10-31-hpa-692-aeroplane-asset-integration-design.md`  
**Reviewed feedback:** https://github.com/cwchanap/procyon/pull/59#issuecomment-6554437223  
**Source asset pack:** https://github.com/cwchanap/procyon/pull/58

**Goal:** integrate existing 20 plane sprites, 1 background, 11 icons and 9 sounds with the least code: static URLs, one `PlaneGlyph`, one `AudioContext` and the board's existing presentation clock. No rules, persistence, backend, new media generation or generic frameworks.

## Expected file changes

| File | Purpose |
| --- | --- |
| `apps/web/assets/aeroplane-pack/{planes,board,icons,sfx}` | Move runtime media out; do not copy |
| `apps/web/public/aeroplane/{planes,board,icons,sfx}` | Exact 41-file public media inventory |
| `apps/web/assets/aeroplane-pack/README.md` | Update path and palette notes; keep source MP3s/rights outside public |
| `apps/web/src/lib/aeroplane/assets.ts` (new) | Typed `spriteUrl`, `tileIconUrl`, `cueUrl` and nine-cue tuple |
| `apps/web/src/lib/aeroplane/assets.test.ts` (new) | Permanent all-41-file existence test |
| `apps/web/src/components/aeroplane/AeroplaneBoard.tsx` | Real planes/background/tile icons; flight/terminal effect cues |
| `apps/web/src/components/aeroplane/AeroplaneSetup.tsx` | No new setup control; existing onStart callback remains direct gesture |
| `apps/web/src/components/AeroplaneGame.tsx` | Prime audio when Start is clicked; retain Roll/mute; **no eventFeed audio effect** |
| `apps/web/src/components/aeroplane/AeroplaneStatus.tsx` | Decorative coin icon next to existing text |
| `apps/web/src/lib/aeroplane/sound.ts` | Decoded buffers, no oscillators; one pure effect selector, hop pacing |
| `apps/web/src/lib/aeroplane/sound.test.ts` | Browser-audio stubs/failure/selector tests |
| `apps/web/src/components/aeroplane/AeroplaneGame.test.tsx` | Asset href, overlay, animations and cue timing regression tests |

The Start priming logic belongs in `AeroplaneGame.tsx`, passed to the already-existing `AeroplaneSetup` `onStart` prop. No new callback API is needed. Only edit `AeroplaneSetup.tsx` if existing tests/accessibility demand it.

## Local validation after **each** phase

From `apps/web/`, run:

```bash
bun test src/lib/aeroplane src/components/aeroplane
```

Do not proceed with known failures. Keep baseline failures separate from regressions. Finish with the full checks in Phase 5.

## Phase 1 — Move media and make missing files fail tests

- [ ] Check the approved inventory on main: 20 plane SVGs (all 5 skins × 4 colours), 1 board SVG, 11 icons (ten tile kinds plus coin) and 9 optimized M4As.
- [ ] `git mv` only runtime files to `apps/web/public/aeroplane/{planes,board,icons,sfx}/`. Leave original `source-sfx/*.mp3` and the README outside `public/`; do not copy files or add build-time media sync.
- [ ] Add `src/lib/aeroplane/assets.ts` with direct URL builders `spriteUrl(skin,color)`, `tileIconUrl(kind)`, `cueUrl(cue)`, plus `AEROPLANE_CUES` as a const tuple and `AeroplaneCue` derived from it. Keep the module pure, with only existing game **type** imports.
- [ ] Add `src/lib/aeroplane/assets.test.ts`. Enumerate `SKIN_CATALOG` × `AEROPLANE_COLORS`, all unique `TYCOON_TILES` kinds + coin, the 9-name cue tuple and the board background. Assert all **41 public paths** exist, deriving the filesystem root from the test file location (not the caller's cwd).
- [ ] Update the pack README for served URLs and update the `SKIN_MARKING` palette claim (that placeholder constant will be deleted in Phase 2).
- [ ] Run focused tests. Assert no original source takes or duplicate audio files appear under `public/`.

**Checkpoint:** the inventory test covers every URL that production will emit and is green.

## Phase 2 — Replace visual placeholders, not just hide them

- [ ] In `AeroplaneBoard.tsx`, make `PlaneGlyph` render only an SVG `<image>` using `spriteUrl(skinId ?? 'classic', color)` plus its separate text number, preserving image footprint/board positions and `data-skin`.
- [ ] Delete `spriteHref` prop and all four colour-only call-site lookups; delete `PLANE_SPRITE_HREFS`, `PlaneSkinDetail`, `SKIN_MARKING`, `SKIN_BRASS`, `STAR_POINTS` and the old circle/marking fallback branch. **Keep** `PLANE_FILL` and `PLANE_STROKE`, still used by the rest of the board.
- [ ] Preserve human-selected skin through committed planes, mover, parked victim, capture ghost and setup preview. AI planes remain Classic. Do not change skin unlock thresholds or selection persistence.
- [ ] Put `/aeroplane/board/background.svg` in the existing `BoardSurface` image slot behind board geometry and overlays. Remove unused optional background placeholder logic if it becomes dead.
- [ ] Replace each Sky Tycoon text-marker glyph with `tileIconUrl(kind)` at the existing anchor; preserve owner highlight, markup hooks and screen-reader list. Add a decorative coin image in `AeroplaneStatus.tsx` while keeping readable balance text.
- [ ] Rewrite `AeroplaneGame.test.tsx` tests to check **actual `<image href>` paths** for all colours/skins, picker/board/animation/ghost/parked states; update tests that currently expect the dead `.skin-detail-*` path.
- [ ] Test background order, the ten tile image kinds, owner tint, no Standard markers, and unchanged screen-reader labels/coin text.
- [ ] Run focused tests.

**Checkpoint:** real sprite URLs render in every old glyph slot, existing move controls remain usable, and focused tests are green.

## Phase 3 — Replace oscillators, preload on Start, check AAC early

- [ ] In `sound.ts`, use `AEROPLANE_CUES` and `cueUrl` from `assets.ts`. Replace the `CUE_TONES` oscillator/`createOscillator` path outright. Do not keep a tone fallback.
- [ ] Keep the single lazy `AudioContext` and existing audio-guard/mute API. When first created after a permitted user gesture, begin one best-effort fetch/`decodeAudioData` per cue and cache ready buffers; do not fetch during SSR/import or before activation.
- [ ] Play ready buffers through one-shot `AudioBufferSourceNode` plus local gain. A cue requested before decode finishes is **silently dropped**, never queued for later. Catches around fetch, decode, resume and playback must not alter game behavior.
- [ ] Rate-limit only the `hop` cue to one start every **150 ms** in `sound.ts`; avoid general overlap policy/config plumbing. Continue to respect stored mute preference.
- [ ] In `AeroplaneGame.tsx`, wrap the Start callback passed to `AeroplaneSetup`: call `primeAeroplaneAudio()` in the direct click and then `match.newMatch()`. Keep existing Roll priming and optional direct-unmute priming. Do not change the button or invent a setup flow.
- [ ] Rewrite `sound.test.ts` for running/suspended/unsupported/throwing contexts, `fetch`/decode failure, caching, mute, activation, no delayed catch-up, one roll per ID, and hop spacing. Test `resetAeroplaneAudioForTest` clears all audio caches.
- [ ] Run focused tests.
- [ ] **Early real-browser check before Phase 4:** open the dev game and trigger a Roll cue; confirm real `.m4a` decoded-buffer playback in Chromium and Safari where available. Document if unavailable. Also note Firefox/Linux AAC may rely on system codec support; playback failure must remain harmless.

**Checkpoint:** no oscillators or dual paths remain; file-backed primary cues behave best-effort, focused tests pass and a codec smoke result is recorded.

## Phase 4 — Use the board's existing terminal clock for new cues

- [ ] Derive `AeroplaneBoardCue = Exclude<AeroplaneCue, 'roll'>`. Extend the board's minimal `presentationQueue` prop to include `action.events` from real `AeroplanePresentation` items, using an optional typed field if needed to keep simplified existing test fixtures inexpensive.
- [ ] In existing `emitDueCues`, read `timeline.segments[due].kind`: emit `flight` for a flight, `hop` for hop/jump, and keep `capture` for capture-return segments. Do not alter interpolation.
- [ ] Add small pure `selectEffectCue(events, humanColor)` to `sound.ts`. Identify trap events (`relocation.effect` storm/crash, `skip` on any colour) and human-affecting `coins`/`transfer`. Choose **trap > coin-loss > coin-gain** and at most one effect sound per move. Ignore roll-only `skipped` so Customs does not sound twice; AI-only coins are silent.
- [ ] In the board's existing animated terminal branch, emit `win > finish > effect`; if none applies, do not add a second terminal cue. Existing hop/capture cues have already played at segment boundaries.
- [ ] Apply the **same** terminal selector in the zero-duration/reduced-motion branch, followed by the old `capture`/`hop` fallback if no win, finish or effect. Rely on existing `lastProcessedIdRef` and queue cancellation.
- [ ] **No eventFeed-driven effect and no new ref/effect in `AeroplaneGame.tsx`.** Do not change serialized action records, `useAeroplaneMatch` or game-state transitions.
- [ ] Add tests for ordering and arrival-time effects; win/finish priority, AI traps, human-only money, storm/crash/Customs skip, transfer polarity, roll-only `skipped` excluded, multiple effects collapsing to one cue, reduced motion and queue reset/resume/Skip. Ensure changing mute does not replay a prior action.
- [ ] Run focused tests.

**Checkpoint:** all nine cues have meaningful trigger sites, landing effects align with visual arrival, no extra dedup system is introduced, and focused tests pass.

## Phase 5 — Final verification and handoff

From `apps/web/`:

```bash
bun run test
bun run lint
bun run typecheck
bun run build
# Run relevant existing Aeroplane Playwright checks if available.
```

- [ ] Verify the permanent **41-file** inventory test stays green, there are no duplicate public assets, and the build includes the public directory. Do not add a one-off production URL spot-check or special Stockfish-style static server.
- [ ] Manually inspect board and picker at desktop/mobile scale: every colour/skin, mover/ghost/parked visuals, owned brass airport markers, coin balances and Standard vs Sky Tycoon.
- [ ] Human-listen to all nine cues in-game (including a first AI turn, rapid hop, trap and win), check mute/unmute, and document tested browsers and limitations. If volume is off, adjust existing code-side gain or cue cadence; do not generate new SFX here.
- [ ] Keep the PR draft until implementation, tests and human QA are complete. Update the Linear issue and PR checklist when actually shipped.

## Review constraints

- One HPA-692 implementation PR, not a second PR after this docs draft.
- No asset generation, gameplay rule changes, new persistent state, API/backend changes, generic audio engine or generalized asset loader.
- Early browser codec behavior is the primary uncertainty: Safari/Chromium should be tested before more triggers are added; Firefox/Linux codec support is an explicit risk, not a reason to add speculative transcoding.
