# HPA-692 — Aeroplane asset integration implementation plan

> Planning artifact for **one PR**. This draft starts with docs only. After design review, implement all changes in this same branch/PR; do not create a separate implementation PR.

**Issue:** https://linear.app/cwchanap/issue/HPA-692/integrate-aeroplane-art-and-sfx-pack-into-gameplay  
**Design:** `docs/superpowers/specs/2026-10-31-hpa-692-aeroplane-asset-integration-design.md`  
**Source:** `apps/web/assets/aeroplane-pack/README.md`; merged asset pack: https://github.com/cwchanap/procyon/pull/58

**Goal:** wire the supplied 20 sprites, board art, 11 icons and nine sound cues into the existing Aeroplane UI with no game-state or backend changes.

**Strategy:** static public paths, one shared sprite URL selector, use existing board/picker/coin UI slots and the existing Web Audio helper. Use existing typed presentation events for remaining cues. Avoid new dependencies or reusable systems.

## Files expected to change

| File or directory | Change |
| --- | --- |
| `apps/web/assets/aeroplane-pack/{planes,board,icons,sfx}` | Git-move runtime assets out, do not duplicate |
| `apps/web/public/aeroplane/{planes,board,icons,sfx}` | Public runtime assets (41 files) |
| `apps/web/assets/aeroplane-pack/README.md` | Correct deployed paths and retain source/provenance |
| `apps/web/src/components/aeroplane/AeroplaneBoard.tsx` | Sprites, board background, tile icons, flight cue |
| `apps/web/src/components/aeroplane/AeroplaneStatus.tsx` | Decorative coin icon beside existing balance text |
| `apps/web/src/components/AeroplaneGame.tsx` | One event-feed-driven economy/trap cue, reuse mute/prime |
| `apps/web/src/lib/aeroplane/sound.ts` | Nine cue URLs, cached Web Audio playback, pure effect cue selection |
| `apps/web/src/lib/aeroplane/sound.test.ts` | Audio failures/mute/activation/cache/throttling/effect tests |
| `apps/web/src/components/aeroplane/AeroplaneGame.test.tsx` | Replace geometry-specific assertions; test URLs/overlays/modes/cues |
| Optional focused E2E/static-file smoke test | Add only if existing test setup makes it trivial |

No API, game engine, serialized match or database files should need to change.

## Phase 1 — Relocate runtime files and update handoff (same PR)

- [ ] Confirm all shipped inputs are present on main: 20 `planes/{classic,contrail,racer,starlight,ace}-{red,yellow,blue,green}.svg`, `board/background.svg`, ten tile icons + `coin.svg`, and nine compressed `sfx/*.m4a`. Never silently invent a missing asset.
- [ ] Use `git mv` to put those **41** runtime files under `apps/web/public/aeroplane/` with the same subfolders and basenames.
- [ ] Keep `source-sfx/*.mp3` and the provenance README in `apps/web/assets/aeroplane-pack/` so source takes are not deployed; update the README's paths and integration notes.
- [ ] Confirm no media files are duplicated and no source MP3s entered `public/`.

**Checkpoint:** listed relative URL paths exist, source/provenance remain in git, and there is no generated manifest/build copy step.

## Phase 2 — Wire visual slots and update component tests

- [ ] In `AeroplaneBoard.tsx`, replace the empty `PLANE_SPRITE_HREFS` lookup with a tiny URL selector using `SkinId` and `AeroplaneColor`. Resolve inside `PlaneGlyph`; do not repeat image URL logic at the committed, overlay, capture and picker call sites.
- [ ] Use an SVG `<image>` at the existing x/y ±3 plane footprint; preserve the separately painted plane number. The selected human skin renders in all layers; other team colours receive `classic`. Remove `PlaneSkinDetail` and the placeholder geometric path once no longer used.
- [ ] Set `data-skin` to the actually requested sprite variant. Update tests to inspect `image[href]` for every skin/colour, not just `data-skin` or old `.skin-detail-*` hooks.
- [ ] Fill `BoardSurface`'s existing optional image slot from `/aeroplane/board/background.svg`. Preserve render order (border, background, track/hangars/guides, markers, plane overlays).
- [ ] Replace character glyphs in `TycoonTileMarkers` with the ten `/aeroplane/icons/{kind}.svg` images, sized within the current anchor. Keep the airport tint circle, board/test IDs, `data-label` and screen-reader list intact.
- [ ] In `AeroplaneStatus.tsx`, place a decorative `coin.svg` next to the existing balance for each team without changing the text or accessible list.
- [ ] Rewrite existing `AeroplaneGame.test.tsx` tests for sprite URLs: picker, committed planes, moving plane, parked victim and capture ghost; preserve guest/default and human-vs-AI rules.
- [ ] Extend board tests to assert background URL, all ten tile-kind image URLs, owner tint, unchanged screen-reader ownership text, Standard mode with zero Tycoon markers, and unchanged balance text.

**Checkpoint:** DOM tests cover actual asset URL selection and the original board interactions. This phase is presentation-only.

## Phase 3 — Replace primary sound playback, keep failure behavior

- [ ] In `sound.ts`, extend `AeroplaneCue` to the nine existing files and map each cue to its static `.m4a` URL.
- [ ] Keep the existing single lazy `AudioContext`, user activation guard, `primeAeroplaneAudio` and mute API. On user-initiated prime, start best-effort fetch and `decodeAudioData` for the nine short clips; cache decoded buffers, using no external library.
- [ ] For ready files, play a new one-shot `AudioBufferSourceNode` through a modest gain node into the shared context. Bound simultaneous hop sounds (about one every 150 ms); do not restart the same cue when a React component re-renders.
- [ ] Preserve the existing pre-activation and suspended-context rule: do not queue old sounds. When a cue is requested while loading/blocked, drop the file cue (or use the former low-volume oscillator fallback for a legacy cue only). When ready, the actual file replaces its placeholder; never mix the two.
- [ ] Do not let constructor, fetch, decode, node setup or `resume()` errors interrupt a roll, move or UI rendering. Clear test-only buffer/cache state in `resetAeroplaneAudioForTest`.
- [ ] In `AeroplaneGame.tsx`, retain one cue per `rollPresentation.id` and prime from the direct Roll gesture; prime on explicit unmute if needed. Retain the persisted mute storage key.
- [ ] Expand `sound.test.ts` mocks for fetch/decode and buffer-source nodes. Assert mute, unsupported/throwing audio stacks, buffer reuse, first blocked activation, absence of catch-up bursts, one roll per ID and hop pacing.

**Checkpoint:** the existing five cues use the delivered audio after decoding and remain best-effort. Tests are deterministic; no real audio device needed for unit tests.

## Phase 4 — Wire the four missing cue triggers without touching the game rules

- [ ] Extend the board cue union with `flight`. In the existing timeline boundary clock, emit `flight` for a `flight` segment and `hop` for other movement segments. Leave capture, finish, win priority and reduced-motion behavior intact.
- [ ] Add a small pure function in the Aeroplane sound/presentation layer to choose one `trap`, `coin-loss`, or `coin-gain` cue from an action's typed `TycoonEffectEvent` entries, with human-colour filtering for coins/transfers; priority `trap > coin-loss > coin-gain`.
- [ ] Use `match.eventFeed` in `AeroplaneGame.tsx` to fire the selected cue once for each new entry ID, without persisting additional data. A new match, reset or resume exposes no old `eventFeed` entries; avoid audio when merely re-rendering or toggling mute.
- [ ] Cover transfer gain/loss relative to the human, storm/crash/Customs trap, Standard no effects, AI-only economy silence, and two simultaneous effects collapsing to one audio cue.
- [ ] Update motion tests for flight timing and confirm no altered frame positions, autoplay behavior or terminal cues. Test rapid hops, reset/resume, skip animations and muted effects.

**Checkpoint:** all nine provided cue files have an intentional gameplay trigger and no new game action/state fields were introduced.

## Phase 5 — Build verification and human quality gate

Run the repository's existing commands; fix only regressions introduced by this PR.

```bash
cd apps/web
bun run test
bun run lint
bun run typecheck
bun run build
# Follow with focused Playwright tests where available.
```

- [ ] Confirm public files ship in the built site; verify HTTP success for one plane, one tile icon, the background, the coin icon and one `.m4a` cue. Validate all 41 files exist using a small one-off inventory check if useful, not a permanent build system.
- [ ] Inspect the game visually at normal desktop/mobile board sizes. Check each human skin in the picker and on-board, AI Classic sprites, capture/flight overlays, owned brass airport markers and Standard vs Sky Tycoon layouts.
- [ ] Listen to all nine cues through a real browser in context, including rapid hops, coins, trap, win, first roll and mute toggle. Repeat in Chromium and Safari if available. Adjust *code-side* gain/trigger density only; avoid regenerating audio in this coding ticket.
- [ ] Record unavailable manual checks explicitly. Do not claim the sound mix or at-size artwork was verified solely from unit tests.
- [ ] Keep the PR as **draft** until implementation and human QA are complete; reference HPA-692 and HPA-437 in the PR description and update the issue when shipped.

## Review checklist

- [ ] No duplicate media files or source takes in deployed assets.
- [ ] Every skin/colour has the correct URL in board, picker and animation states.
- [ ] Text labels, ownership tint and existing accessibility remain intact.
- [ ] No change to rules, result, stars, save data or server routes.
- [ ] Audio cannot throw, autoplay before gesture or replay missed cues.
- [ ] This is **one PR for HPA-692**: avoid creating separate plan/implementation PRs.

## Scope guard

If a browser-specific codec issue requires transcoding, document the exact issue and use a narrow compatibility conversion of the already-approved cue, not a new SFX generation task or a generalized audio framework. If an icon is too small, adjust the display footprint/contrast in the existing board component first; do not redesign the board.
