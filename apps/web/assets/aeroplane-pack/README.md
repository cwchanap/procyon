# Aeroplane asset pack

Standalone assets for HPA-437. These files are not wired into the game and live outside `public/` so nothing ships until integration chooses how to serve them — Vite `?url` imports from this directory, or a copy into `public/` at integration time.

## Artwork

- `planes/{classic,contrail,racer,starlight,ace}-{red,yellow,blue,green}.svg` are 128 × 128, transparent, centred plane sprites. `classic` is the base; the other names match the four unlockable skin IDs and each has its own silhouette — slim dart (`contrail`), wide delta (`racer`), forward-crescent wing (`starlight`), canard fighter (`ace`) — so skins stay distinguishable at the ~14 px picker size. The game draws plane numbers separately.
- `board/background.svg` is a 1024 × 1024 square background sized to sit just inside the board's painted border (rx 5). It contains no track, tile or game geometry.
- `icons/{boost,tailwind,shield,wormhole,storm,customs,tax,crash,chance,airport,coin}.svg` are transparent 128 × 128 icons. `airport` uses an ink silhouette with a brass outline so it stays legible on the brass launch tiles (indices 0, 13, 26, 39) as well as the dark anchors at 6, 19, 32, 45; the other icons are brass-on-dark line art since no other tycoon tile sits on a brass anchor.

The artwork was drawn as original SVG for this pack. Body fills mirror `PLANE_FILL` and trim echoes `PLANE_STROKE` in `apps/web/src/components/aeroplane/AeroplaneBoard.tsx` — those constants are the source of truth; re-derive the sprites if the palette changes. Skin accent hues follow `SKIN_MARKING`; on the yellow body, marks use a dark bronze `#4a3413` for legibility. No third-party artwork was used.

## Sound

`sfx/` contains mono 44.1 kHz AAC `.m4a` cues (~64 kbps): `roll`, `hop`, `flight`, `capture`, `finish`, `win`, `coin-gain`, `coin-loss`, and `trap`. The original stereo ElevenLabs MP3 takes are retained in `source-sfx/` for provenance only.

Each cue was produced from its matching take by: stereo → mono downmix, leading-silence strip, dead-air trim to the durations below, per-cue gain so every cue lands near −30 dB RMS (the placeholder tones sit at −27 dB RMS, so cues play at roughly the same loudness rather than ~20 dB hotter), a −6 dBFS peak limiter, 3 ms fade-in and 35 ms fade-out, then AAC encode. Post-encode measurements: mean −29.9…−32.6 dB (was −22…−33.2 dB, an 11 dB spread), peaks −6…−12.7 dBFS.

| Cue       | Duration | Notes                                                        |
| --------- | -------: | ------------------------------------------------------------ |
| roll      |   0.60 s | Fits inside the 650 ms AI turn delay (was 1.0 s).            |
| hop       |   0.30 s | Dead tail removed (was 0.48 s); fires per 80 ms hop segment. |
| trap      |   0.44 s | ~31 ms leading silence stripped, dead tail removed.          |
| capture   |   0.42 s | Dead tail removed.                                           |
| coin-gain |   0.28 s | Dead tail removed.                                           |
| coin-loss |   0.62 s | Dead tail removed.                                           |
| finish    |   0.76 s | Dead tail removed.                                           |
| flight    |   0.69 s | Dead tail removed.                                           |
| win       |   0.90 s | Dead tail removed.                                           |

The takes were generated with ElevenLabs `eleven_text_to_sound_v2` from these prompts:

| Cue       | Prompt                                                                 | Requested seconds |
| --------- | ---------------------------------------------------------------------- | ----------------: |
| roll      | A single wooden die rattles and settles on a tabletop, close and soft. |               1.0 |
| hop       | A single light wooden game piece tap on a tabletop, short and soft.    |               0.5 |
| flight    | A short airy swish passing by, soft and clean.                         |               0.8 |
| capture   | A small wooden game piece knocked over, a hollow clack.                |               0.6 |
| finish    | A bright small brass bell rings once, warm and brief.                  |               0.8 |
| win       | A short cheerful three-note brass chime, clean and warm.               |               1.5 |
| coin-gain | One bright small brass coin clink, crisp and gentle.                   |               0.7 |
| coin-loss | A single low brass coin clunk on wood, soft and muted.                 |               0.7 |
| trap      | A quick spring mechanism snaps with a soft metallic clack.             |               0.7 |

ElevenLabs usage and distribution rights depend on the generating account's terms and have not been independently verified. `sfx/` and `source-sfx/` must stay out of `public/` (and out of any published bundle) until those rights are confirmed. The cues were decoded, measured and level-checked, but still require a human listening review in the game mix.

## Integration handoff

`PlaneGlyph` in `AeroplaneBoard.tsx` already receives both `color` and `skinId` at every call site (committed planes, the setup picker preview, the animated mover, `capture-ghost`, and `capture-parked`). One lookup inside `PlaneGlyph` — e.g. a `Record<SkinId, Record<AeroplaneColor, string>>` map — covers all of them; no per-call-site prop changes are needed. A sprite replaces the whole glyph including the skin marking, so the map must key on both; callers that pass `skinId: undefined` (non-human colours) fall back to `classic` naturally. Plane numbers remain separate.

The background slot is the 98 × 98 square painted at x=1, y=1 inside the border rect; the image draws after the border, so the asset insets its ink field to ~1.7 board units to clear the border's inner edge. Tile icons have no image slots yet; inspect their size and legibility in the board layout, since the current text markers are very small.

The current `AeroplaneCue` contract and sound helper support `roll`, `hop`, `capture`, `finish`, and `win` as oscillator placeholders at 0.06 gain. Playback of these files must preserve the existing mute, user-activation and best-effort behavior; if file playback ends up hotter or softer than the placeholders, the helper's gain is the code-side adjustment, not the files. Flight, coin gain/loss and trap require new cue hooks in a follow-up.
