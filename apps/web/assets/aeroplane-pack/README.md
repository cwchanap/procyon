# Aeroplane asset pack

Standalone assets for HPA-437, now wired into the game by HPA-692. The runtime media is served from `apps/web/public/aeroplane/` at `/aeroplane/…` URLs (built by `apps/web/src/lib/aeroplane/assets.ts`); this directory keeps only this README and the `source-sfx/` provenance takes, which must stay outside `public/`.

## Artwork

- `planes/{classic,contrail,racer,starlight,ace}-{red,yellow,blue,green}.svg` are 128 × 128, transparent, centred plane sprites. `classic` is the base; the other names match the four unlockable skin IDs and each has its own silhouette — slim dart (`contrail`), wide delta (`racer`), forward-crescent wing (`starlight`), canard fighter (`ace`) — so skins stay distinguishable at the ~14 px picker size. The game draws plane numbers separately.
- `board/background.svg` is a 1024 × 1024 square background sized to sit just inside the board's painted border (rx 5). It contains no track, tile or game geometry.
- `icons/{boost,tailwind,shield,wormhole,storm,customs,tax,crash,chance,airport,coin}.svg` are transparent 128 × 128 icons. `airport` uses an ink silhouette with a brass outline so it stays legible on the brass launch tiles (indices 0, 13, 26, 39) as well as the dark anchors at 6, 19, 32, 45; the other icons are brass-on-dark line art since no other tycoon tile sits on a brass anchor.

The artwork was drawn as original SVG for this pack. Body fills mirror `PLANE_FILL` and trim echoes `PLANE_STROKE` in `apps/web/src/components/aeroplane/AeroplaneBoard.tsx` — those constants are the source of truth; re-derive the sprites if the palette changes. The committed sprites themselves are the source of truth for skin accents: the placeholder `SKIN_MARKING` constant was deleted together with the oscillator-era glyph code when these sprites took over rendering; on the yellow body, marks use a dark bronze `#4a3413` for legibility. No third-party artwork was used.

## Sound

`/aeroplane/sfx/` (in `public/aeroplane/sfx/`) contains mono 44.1 kHz AAC `.m4a` cues (~64 kbps): `roll`, `hop`, `flight`, `capture`, `finish`, `win`, `coin-gain`, `coin-loss`, and `trap`. The original stereo ElevenLabs MP3 takes are retained in `source-sfx/` here for provenance only.

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

ElevenLabs usage and distribution rights for these outputs were verified against the generating account's terms by the repository owner before this pack was published; `sfx/` and `source-sfx/` may be committed and published in any bundle — the optimized cues now ship from `public/`. The cues were decoded, measured and level-checked, but still require a human listening review in the game mix. To re-check real-browser AAC decoding (fetch, `decodeAudioData`, buffer starts) against the live dev game, run `bun scripts/aeroplane-audio-smoke.ts` from `apps/web` with the dev server on port 3500.

## Integration (as shipped by HPA-692)

All pack media is wired into the game; URL builders live in `apps/web/src/lib/aeroplane/assets.ts` and serve from `public/aeroplane/`:

- **Planes** — `PlaneGlyph` in `apps/web/src/components/aeroplane/AeroplaneBoard.tsx` resolves `spriteUrl(skinId ?? 'classic', color)` (`/aeroplane/planes/{skin}-{color}.svg`) and renders only that image plus the separate plane-number text, at every call site: committed planes, the setup picker, the animated mover, `capture-ghost` and `capture-parked`. Only the human colour uses the unlocked skin; rival colours always render `classic`.
- **Board** — `/aeroplane/board/background.svg` fills the 98 × 98 image slot at x=1, y=1 under the track/hangar geometry, inside the painted border.
- **Tile icons** — all ten Sky Tycoon tiles (plus the coin next to each balance) render `tileIconUrl(kind)` (`/aeroplane/icons/{kind}.svg`) at 3.4 board units centred on each track anchor; owned airports tint with a `PLANE_FILL` ring. No text markers remain.
- **SFX** — all nine cues play from `/aeroplane/sfx/{cue}.m4a` as decoded `AudioBuffer`s through `apps/web/src/lib/aeroplane/sound.ts`; the oscillator implementation is gone. Creation and the nine-cue preload happen only after a permitted direct gesture (Start match, Roll, unmute); motion and terminal effects fire off the board's presentation clock, and hop starts are paced to at least 150 ms apart.
