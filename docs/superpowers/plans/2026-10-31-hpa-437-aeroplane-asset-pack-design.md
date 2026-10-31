# HPA-437 Aeroplane asset pack

## Purpose and scope

Deliver a cohesive vintage-aviation art and sound pack for Aeroplane, as standalone assets. This ticket does not change application code, game rules, unlock thresholds, or audio behavior.

## Direction and alternatives

Use the selected vintage-aviation direction: clear top-down silhouettes, restrained ink and brass, team-colour bodies, and short mechanical or chime-like sounds. A softer illustrated style was considered, but fine decoration would be harder to read at the board's small sprite size. The existing placeholder shapes remain the fallback until a separate integration.

## Deliverables

- Four transparent plane sprites, in red, yellow, blue and green, with a shared centred square footprint and no baked-in plane number. Provide SVG or 2x PNG.
- Four unlockable plane designs matching the existing IDs `contrail`, `racer`, `starlight`, and `ace`, each in all four team colours; the four base sprites represent `classic`. Preserve a recognizable team colour and distinguish designs by markings and silhouette details.
- A square ink-and-brass board background that remains quiet beneath the existing track, hangars, and controls; it must not bake in board geometry or text.
- Separate transparent icons for `boost`, `tailwind`, `shield`, `wormhole`, `storm`, `customs`, `tax`, `crash`, `chance`, `airport`, and `coin`, with distinct shapes legible at small sizes.
- Nine separate sound files: `roll`, `hop`, `flight`, `capture`, `finish`, `win`, `coin-gain`, `coin-loss`, and `trap`. Keep cues brief and coherent, with no speech or background music.
- A pack manifest or README mapping filenames to slots, documenting dimensions, formats, provenance and any usage restrictions, plus any integration work the current slots require.

## Integration constraints

The current board draws a background in a square at 98 × 98 board units under all game geometry. Plane images are drawn centred in a 6 × 6 board-unit square and their numbers are drawn separately. The current sprite map accepts a URL per team colour only; replacing a glyph also suppresses its skin detail. A later change must select a sprite by both colour and skin to retain unlocks, including motion and picker rendering. Icons have no image slots today. The current audio cue contract has only `roll`, `hop`, `capture`, `finish`, and `win`; flight, coin changes and traps need separate later hook points. None of those application changes are part of this pack.

## Verification

Check the complete inventory, file decoding, transparency and consistent sprite geometry. Inspect all art at native and in-board display sizes, including the four colours and all skins, against the current dark board and existing overlays. Listen to each finished sound and check its format, duration, volume, clipping, and usable start/end. Document any checks that cannot be completed; never claim the assets are integrated or tested in gameplay without the separate integration.
