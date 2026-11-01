# HPA-692 — Integrate Aeroplane art and SFX into gameplay

**Status:** Proposed for review (planning-only draft PR)  
**Linear:** https://linear.app/cwchanap/issue/HPA-692/integrate-aeroplane-art-and-sfx-pack-into-gameplay  
**Source assets:** HPA-437, merged in https://github.com/cwchanap/procyon/pull/58

## Problem and product outcome

PR #58 shipped a complete standalone Aeroplane asset pack, but the app still renders the temporary geometric plane glyphs, hand-painted plain background, character-based Sky Tycoon markers and oscillator sounds. The pack README explicitly leaves integration for a follow-up.

**Outcome:** the existing game uses the delivered art and sounds in both Standard and Sky Tycoon modes. This is a render/audio change only: the game rules, selected-skin progression, persistence, AI, API and match outcome must not change.

## Current implementation (main after PR #58)

- `apps/web/assets/aeroplane-pack/` contains 20 SVG plane sprites (5 skins × 4 colours), 1 board background, 11 SVG icons, 9 optimized `.m4a` cues, original `.mp3` takes and a handoff README.
- `AeroplaneBoard.tsx` has `PLANE_SPRITE_HREFS = {}`, `BOARD_BACKGROUND_HREF = undefined`, the shared `PlaneGlyph`, and text `TILE_GLYPH` markers. The skin detail fallback currently renders only when `spriteHref` is missing.
- The setup picker shares `PlaneGlyph`. The board also uses it for committed planes, moving planes, capture ghosts and parked captured planes. Opponent colours intentionally use the Classic skin.
- The board already has a logical motion timeline with `hop`, `jump` and `flight` segments, and one `onCue` callback. The game component emits one `roll` cue per roll presentation ID.
- `sound.ts` has one lazy `AudioContext`, activation/mute guards, oscillator tones for five cues and persisted mute preference.
- `useAeroplaneMatch` exposes ephemeral `eventFeed` entries with typed `action.events` from `TycoonEffectEvent`. These are cleared on reset/resume; there is no need to modify the game engine to produce audio cues.
- `AeroplaneStatus.tsx` already shows Sky Tycoon coin balances as readable text. The Sky Tycoon markers preserve airport owner highlights and an accessible screen-reader list.

## Decisions

### 1. Static asset paths: move, do not copy

Move **only runtime assets** to `apps/web/public/aeroplane/`:

| From `apps/web/assets/aeroplane-pack/` | To `apps/web/public/aeroplane/` | Count |
| --- | --- | ---: |
| `planes/*.svg` | `planes/*.svg` | 20 |
| `board/background.svg` | `board/background.svg` | 1 |
| `icons/*.svg` | `icons/*.svg` | 11 |
| `sfx/*.m4a` | `sfx/*.m4a` | 9 |

Keep `apps/web/assets/aeroplane-pack/source-sfx/*.mp3` and its README **outside `public/`**. Update the README to point to public runtime files and preserve the original provenance/license information. Do not duplicate compressed sounds or source files inside the shipped bundle. Use same-origin absolute URLs, e.g. `/aeroplane/planes/racer-red.svg`, without an asset service or build copy script.

This is deliberately simpler than a new Vite asset manifest or generalized theme loader, and static files work in the existing Astro build.

### 2. Board, skins and icons

**Plane rendering**

- Resolve a sprite from the existing typed `SkinId` and `AeroplaneColor`: `/aeroplane/planes/{skin}-{color}.svg`. The default for an undefined skin is `classic`.
- Put the URL selection inside the already-shared `PlaneGlyph` rather than passing a URL at each call site. Remove the old colour-only `PLANE_SPRITE_HREFS` and obsolete geometric skin-detail placeholders when integration is complete. Keep the number as a separate SVG `<text>` label and keep the existing 6 × 6 display footprint.
- Every place using `PlaneGlyph` must show the actual requested skin and colour. In match views, only `state.config.humanColor` receives `progress.selectedSkin`; AI opponents remain Classic. The setup picker continues to show all five choices regardless of locked state.
- `data-skin` should describe the **rendered** sprite, and tests must inspect the actual image `href`, not merely the metadata attribute. Do not change legal-move controls or screen-reader names.

**Board surface and mode-specific markers**

- Render `/aeroplane/board/background.svg` in the existing `BoardSurface` slot (`x=1, y=1, width=98, height=98`) **behind** the track, hangars, lanes, guides, and plane overlays. Keep existing board stroke/border and overlays.
- Replace `TycoonTileMarkers`' text glyph with `/aeroplane/icons/{kind}.svg` for the ten `TycoonTileKind` values. Keep the owner-tint circle, `data-testid`, `data-label` and the separate screen-reader list unchanged. Check that each icon fits the small track anchor and does not hide an ownership tint.
- Use `/aeroplane/icons/coin.svg` as a decorative icon beside **existing** coin numbers in `AeroplaneStatus`. Keep the word `coins`, colour names, balances and assistive-technology labels. Do not add an additional economy widget.
- Standard mode continues to render no Tycoon tiles or balance list.

### 3. Sound: preserve the existing small helper

Keep the existing public API (`primeAeroplaneAudio`, `playAeroplaneCue`, `readAeroplaneMuted`, `writeAeroplaneMuted`) and one shared lazy `AudioContext`; **do not** introduce a global sound manager or a second audio subsystem.

- Extend `AeroplaneCue` to exactly the nine delivered names: `roll`, `hop`, `flight`, `capture`, `finish`, `win`, `coin-gain`, `coin-loss`, `trap`. Map each to `/aeroplane/sfx/{cue}.m4a`.
- On the existing direct gesture (Roll, or unmuting), resume/prime the context and start best-effort loading/decoding of the small cue set. Cache decoded buffers and reuse them; play through `AudioBufferSourceNode` with the existing restrained gain approach. A decode/play promise rejection is not a game failure.
- **Never queue a past cue to play after an async load**: if a requested buffer is not yet ready, drop that file playback. Keeping an existing low-volume tone as a temporary fallback for the five legacy cues is acceptable, but once a file is ready it is the only sound played for that cue. An unsupported cue simply remains silent. No later catch-up burst.
- Do not create or play audio before user activation. Preserve the mute storage key and SSR-safe, best-effort behavior. Muting prevents playback immediately, including during or after loading. A first silent/muted roll is preferable to a blocked interaction or delayed sound burst.
- Hop clips are longer than the board's fast hop segments. Apply a small hop rate limit (about 150 ms) or equivalent per-cue one-at-a-time policy to prevent multiple overlapping taps. Play at most one economy/trap cue per committed action.

**Sound triggers**

| Cue | Existing signal |
| --- | --- |
| `roll` | `AeroplaneGame` latest roll ID (once per roll) |
| `hop` | Board motion segment start for hop/jump |
| `flight` | Board motion segment start when `segment.kind === 'flight'` |
| `capture` | Existing capture-return/terminal path |
| `finish` | Existing finished-plane terminal path |
| `win` | Existing victorious terminal path, taking priority |
| `coin-gain` | One new `eventFeed` action with a positive coin delta **affecting the human** |
| `coin-loss` | One new `eventFeed` action with a negative coin delta **affecting the human** |
| `trap` | One new action with storm/crash relocation or a Customs skip; wins priority over economy cues |

For transfers, derive the sign relative to `state.config.humanColor` (`from` is loss, `to` is gain). Economy cues for AI-only transfers stay silent to avoid noise during three-AI turns. For a single action, pick **trap > coin-loss > coin-gain** instead of playing every effect event. Keep this selection in a small pure function that can be unit-tested.

Use the already-ephemeral `eventFeed`, keyed by each entry's ID, to avoid rerender duplicates and replayed historic effects. It is empty after reset/resume and suppressed when animations are skipped. Do not add sound fields to serialized game actions or persistence. Reduced-motion presentation keeps existing immediate terminal cue behavior; no requirement to simulate all skipped segment sounds.

## Test and acceptance matrix

1. **Visual component tests:** all 20 skin/colour URLs resolve by naming convention, picker preview and human/opponent/ghost/mover/parked glyph URLs are correct, and the human's selected skin persists through overlays. Replace old assertions about `.skin-detail-*` with assertions about `<image href>`.
2. **Board and mode tests:** background is behind existing shapes; all Sky Tycoon tile kinds map to the right icons and preserve owner colour/accessible labels; Standard shows none; coin balance text stays accessible.
3. **Audio unit tests:** fake a running/suspended/broken `AudioContext`, fetch/decode failures and loaded buffers; check mute, activation, single playback, no asynchronous catch-up, volume/rate limiting, and one effect cue per action.
4. **Lifecycle tests:** reset, resume, re-render, repeated roll ID and skipped animations do not replay a burst of sounds; changing mute affects the next cue without replaying the previous one.
5. **Build/smoke:** `bun run test`, `bun run lint`, `bun run typecheck`, `bun run build` and focused web/E2E checks; request a plane, icon, background and `.m4a` URL from the built site and verify successful static delivery.
6. **Human QA, explicitly not automatable:** inspect at actual board and picker sizes, with all team colours/skins, especially icons over brass airport tiles; listen to all nine sounds in the real game mix, including a rapid move, mute/unmute and the first roll. Test one Chromium and one Safari session where available. Record anything not verified.

## Non-goals

- Creating or editing art/SFX (HPA-437 owns asset generation).
- New rules, Sky Tycoon tile behavior, AI tactics, unlock thresholds or account/persistence changes.
- Reworking the layout, animation timeline, responsive framework, API, database, or generalized media systems.
- Additional PRs for this ticket: design, implementation and tests belong to **one PR**.

## Implementation review risks

- A green `data-skin` attribute is not evidence that the correct sprite URL rendered; assert `href` and visually inspect at size.
- A 0.30-second hop cue can overlap several 80 ms hops; bound sound density.
- AAC decoding and browser gesture rules differ; play failures must never block a turn, and the manual listening check remains a release gate.
- The art pack's source takes must not accidentally be copied to `public/` or counted as deployable runtime assets.
