# Aeroplane asset pack

Standalone assets for HPA-437. These files are not wired into the game.

## Artwork

- `planes/{classic,contrail,racer,starlight,ace}-{red,yellow,blue,green}.svg` are 128 × 128, transparent, centred plane sprites. `classic` is the base; the other names match the four unlockable skin IDs. The game draws plane numbers separately.
- `board/background.svg` is a 1024 × 1024 square background without track or game geometry.
- `icons/{boost,tailwind,shield,wormhole,storm,customs,tax,crash,chance,airport,coin}.svg` are transparent 128 × 128 icons.

The artwork was drawn as original SVG for this pack, using the existing board's ink, brass and team-colour palette. No third-party artwork was used.

## Sound

`sfx/` contains mono 44.1 kHz, 16-bit WAV files: `roll`, `hop`, `flight`, `capture`, `finish`, `win`, `coin-gain`, `coin-loss`, and `trap`. The original generated MP3 takes are retained in `source-sfx/`. Each WAV was decoded from its matching take, peak-scaled to at most 0.6 full scale, and given a 5 ms fade-in and 35 ms fade-out.

The takes were generated with ElevenLabs `eleven_text_to_sound_v2` from these prompts:

| Cue | Prompt | Requested seconds |
| --- | --- | ---: |
| roll | A single wooden die rattles and settles on a tabletop, close and soft. | 1.0 |
| hop | A single light wooden game piece tap on a tabletop, short and soft. | 0.5 |
| flight | A short airy swish passing by, soft and clean. | 0.8 |
| capture | A small wooden game piece knocked over, a hollow clack. | 0.6 |
| finish | A bright small brass bell rings once, warm and brief. | 0.8 |
| win | A short cheerful three-note brass chime, clean and warm. | 1.5 |
| coin-gain | One bright small brass coin clink, crisp and gentle. | 0.7 |
| coin-loss | A single low brass coin clunk on wood, soft and muted. | 0.7 |
| trap | A quick spring mechanism snaps with a soft metallic clack. | 0.7 |

ElevenLabs usage and distribution rights depend on the generating account's terms and have not been independently verified. The WAV files have been decoded and measured, but still require a listening review in the game mix.

## Integration handoff

The current `PLANE_SPRITE_HREFS` map in `AeroplaneBoard.tsx` accepts colour only, and a sprite replaces the existing skin detail. Select by **skin and colour** in committed, animated, capture-ghost and setup-preview rendering before enabling these sprites. Plane numbers remain separate. The background slot covers the square underneath the existing board geometry. Tile icons have no image slots yet; inspect their size and legibility in the board layout, since the current text markers are very small.

The current `AeroplaneCue` contract and sound helper support `roll`, `hop`, `capture`, `finish`, and `win`. Playback of these files must preserve the existing mute, user-activation and best-effort behavior. Flight, coin gain/loss and trap require new cue hooks in a follow-up.
