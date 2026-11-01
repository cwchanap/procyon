# HPA-692 — Integrate Aeroplane art and SFX into gameplay

**Status:** Reviewed design for implementation in the same draft PR  
**Linear:** https://linear.app/cwchanap/issue/HPA-692/integrate-aeroplane-art-and-sfx-pack-into-gameplay  
**Assets:** HPA-437, merged in https://github.com/cwchanap/procyon/pull/58  
**Design review:** https://github.com/cwchanap/procyon/pull/59#issuecomment-6554437223

## Goal and boundaries

Wire the already-delivered art and sound pack into the existing Aeroplane game. The game currently draws plane placeholder glyphs, text Sky Tycoon icons and oscillator cues. This is **only render and audio integration**: no rule, AI, save format, star progression, API, authentication or database changes, and no new art/SFX generation.

### Existing extension points

- `AeroplaneBoard.tsx` renders all planes through one `PlaneGlyph`, including the setup picker, committed board, mover, capture ghost and parked victim. It already has a background image slot, but only a colour-only empty sprite map and text Sky Tycoon markers.
- `presentationQueue` is a queue of `AeroplanePresentation` items. Each real item has `id`, `move` and `action.events`, with typed `TycoonEffectEvent`. The board currently declares only `id` and `move` in its prop type.
- The board owns animation boundaries and terminal cues, plus `lastProcessedIdRef` deduplication. `eventFeed` receives the same move item at commit time, before the motion finishes; it is **not** the right clock for coin/trap sounds.
- `sound.ts` already owns the lazy shared `AudioContext`, user-activation and mute checks, and the localStorage mute key.
- `AeroplaneSetup.tsx` calls its `onStart` callback from a direct user click; `AeroplaneGame.tsx` supplies `match.newMatch`. There is already a separate Roll gesture with audio priming.

## Design decisions

### 1. Static runtime assets — move, don't duplicate

Use public same-origin URLs, not a Vite `?url` import, `import.meta.glob`, runtime asset loader or new copy script. Bun unit tests run without Vite.

Move exactly **41** runtime files via `git mv`:

| Source under `apps/web/assets/aeroplane-pack/` | Target under `apps/web/public/aeroplane/` | Count |
| --- | --- | ---: |
| `planes/*.svg` | `planes/*.svg` | 20 |
| `board/background.svg` | `board/background.svg` | 1 |
| `icons/*.svg` | `icons/*.svg` | 11 |
| `sfx/*.m4a` | `sfx/*.m4a` | 9 |

Keep original `source-sfx/*.mp3` and the provenance/rights README **outside `public/`**. Update README references to new runtime URLs and remove its claim that files are not wired into the game. Update the art-palette description after placeholder `SKIN_MARKING` is removed; the committed SVG art itself becomes the source of truth for skin accents. Avoid shipping duplicate audio takes.

Add a tiny pure `apps/web/src/lib/aeroplane/assets.ts` for `spriteUrl(skin, color)`, `tileIconUrl(kind)` and `cueUrl(cue)`. Export the nine-name `AEROPLANE_CUES` tuple and derive the `AeroplaneCue` union from it, so the runtime inventory test and sound helper consume one source of truth. Types for colours, skins and tile kinds reuse existing game types; no asset registry or framework. The board background may use a direct constant URL.

### 2. Visuals — replace old plane renderer outright

- `PlaneGlyph` resolves the URL internally by **`skinId ?? 'classic'`** plus team colour, renders **only** the image in the existing 6 × 6 board-unit footprint and a separate plane-number `<text>`. `data-skin` equals that chosen skin. No placeholder circle/marking path remains.
- Remove the obsolete `spriteHref` prop and its board/animation call-site lookups; remove `PLANE_SPRITE_HREFS`, `PlaneSkinDetail`, `SKIN_MARKING`, `SKIN_BRASS` and `STAR_POINTS` **in this implementation PR**, not in an unspecified later cleanup. Keep `PLANE_FILL` and `PLANE_STROKE` because other board geometry still uses them.
- Only the human-colour planes use the unlocked selected skin. Rival-colour planes always show Classic; the setup picker shows each of the five skin choices in the current human colour, respecting existing lock/selection rules.
- Render the existing 1024 × 1024 board art in the `BoardSurface` image slot at x=1, y=1, 98 × 98, beneath track/hangar/guide geometry and overlays, while keeping the existing border.
- Render the ten Sky Tycoon tile icons using `tileIconUrl(kind)` in the current small anchor positions. Preserve ownership tint, `data-label`, test IDs and the existing accessible screen-reader list. Render the coin SVG decoratively next to each current balance; keep the colour, numeric value and word “coins” available to assistive technology.
- Standard mode keeps no Tycoon markers or balance list. No changes to legal-move controls, animation geometry, accessible move names or game logic.

### 3. Audio — one playback path, no delayed cues

Keep `primeAeroplaneAudio`, `playAeroplaneCue`, `readAeroplaneMuted`, `writeAeroplaneMuted` and the existing single lazy `AudioContext`. Replace the oscillator implementation, do **not** retain a “temporary” oscillator fallback.

- When the context is first created **following user activation**, begin best-effort loading/decoding the nine short `.m4a` files once; cache decoded `AudioBuffer` objects. Each ready cue plays through `AudioBufferSourceNode` and a restrained gain node in the same context. No new dependency or general audio engine.
- Prime on **Start match**, **Roll**, and direct **unmute** (as needed), using the existing click callbacks. This gives initial AI turns a chance to load audio even when the human does not play Red. Never load/play at module import, SSR render or before a permitted gesture.
- If the buffer is not decoded, the context is suspended/unsupported, or user activation is blocked, **drop the requested sound**. Never schedule a sound later when its buffer finishes loading. No oscillator substitute and no burst of queued sounds.
- Muted playback is a no-op. Respect the existing persisted mute preference, including start/roll/unmute; failure to construct, resume, fetch, decode or play cannot interrupt a game action.
- Pace `hop` to a **150 ms minimum interval** inside `sound.ts`. No generalized overlap-policy abstraction is needed. Avoid stacking multiple economy/trap cues for the same committed action.

### 4. Timing — use the board clock for all move effects

Keep one owner of timing and duplicate suppression. **Do not create an `eventFeed` watcher or a second event ID ref in `AeroplaneGame.tsx`.**

Widen the board's `presentationQueue` prop so it can read each real entry's `action.events` (use a minimal compatible action shape; simple test fixtures without action may remain valid and simply have no effects). Define `AeroplaneBoardCue` from `Exclude<AeroplaneCue, 'roll'>` so type lists cannot drift.

| Cue | Trigger |
| --- | --- |
| `roll` | Existing `rollPresentation.id` logic in `AeroplaneGame.tsx` |
| `hop` | Existing board clock for hop/jump segments |
| `flight` | Same board clock when `segment.kind === 'flight'` |
| `capture` | Existing capture-return boundary, or the existing zero-duration capture fallback |
| `finish` | Board terminal cue for a finished plane |
| `win` | Board terminal cue for a win |
| `coin-gain` / `coin-loss` | **Board terminal**, from a pure selector applied to the move's `action.events`, when the human gains/loses coins |
| `trap` | **Board terminal** for storm/crash relocations or a Customs `skip` affecting **any player** |

Effect selector rules:

- Only typed `coins` and `transfer` events affect coin sound selection; derive the transfer direction relative to `state.config.humanColor`. AI-only coin changes are silent.
- `trap` can fire on **any** player's trap, consistently with existing capture feedback. Only `relocation` for `storm`/`crash` and the Customs `skip` event count as a trap sound. A roll-only `skipped` event **does not**: it would double-play a Customs penalty and is not queued to the board anyway.
- Pick **one** effect cue per action with priority `trap > coin-loss > coin-gain`. Do not fire every event separately, even if an action includes multiple transfers/coin deltas.
- On an animated move, emit its chosen effect **after landing**, in the same terminal branch that already emits `win`/`finish`. Terminal priority is `win > finish > effect`; preserve normal segment/capture sounds earlier in the motion. An ordinary landing with no terminal effect has no extra sound.
- On the existing reduced-motion/no-RAF immediate path, use the **same** terminal selection, preserving old capture/hop fallback when there is no win, finish or effect: `win > finish > effect > capture > hop`.
- Reset, resume, Skip animations, unmount and repeated renders rely on the existing queue lifecycle/`lastProcessedIdRef`. Do not persist sounds or add a new playback ID store.

## Verification

1. **Permanent runtime asset inventory unit test:** enumerate `SKIN_CATALOG × AEROPLANE_COLORS` (20), unique `TYCOON_TILES` kinds and coin (11), `AEROPLANE_CUES` (9), plus board background (1). Verify existence of all 41 files under `public/aeroplane` using a path rooted at the test file rather than relying on the current working directory. Test the same exported URL builders the components use. This removes the risk of silent 404s after placeholder deletion.
2. **Visual/unit tests:** assert actual `<image href>` on each skin, colour, picker, mover, ghost and parked victim; retain `data-skin` semantics. Verify background layer, ten tile icons, owner tint, Standard mode and accessible coin labels.
3. **Audio/unit tests:** stub `AudioContext`, fetch/`decodeAudioData` and buffer sources; verify one decode per cue, mute, activation, suspended/unsupported failures, no late playback, 150 ms hop pacing and one-effect selector priority. Replace old oscillator-focused tests.
4. **Motion/unit tests:** verify flight segment uses the new cue; terminal/zero-duration priority, human-only coins, any-player traps, Customs `skipped` exclusion, and reset/resume/Skip deduplication.
5. **Early codec smoke test:** after basic file playback is implemented **before wiring effects**, open the dev build and actually hear a file-backed Roll cue in Chromium and Safari (when available). If a browser cannot decode AAC, document the precise affected browser; do not invent a fallback framework.
6. **Final checks:** focused Bun tests at the end of **every phase**, then full web tests, lint, typecheck, Astro build, and human visual/audio QA at actual board size. The permanent inventory test replaces the proposed one-off file/HTTP spot check; Astro serves `public/` files as-is.

## Non-goals and risks

No new art/SFX production, gameplay rules, AI, stars, save formats, APIs, animation redesign, generic asset registry or audio framework. All implementation and tests land in **the same HPA-692 PR** after design review.

The real compatibility unknown is `decodeAudioData` with AAC. Check Chromium and Safari early; **Firefox on Linux may depend on available system codecs**, so a silent cue there should be documented as a compatibility limitation rather than causing gameplay failure. Clip length versus rapid hops is handled by the 150 ms rate limit. Human listening remains necessary to judge in-game gain/mix; unit tests cannot establish perceived audio quality.
