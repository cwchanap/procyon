# Aeroplane Asset Pack Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to execute this plan task-by-task.

**Goal:** Deliver the approved standalone art and SFX pack for HPA-437.

**Architecture:** Keep assets and their handoff README together under `apps/web/public/assets/aeroplane-pack/`; do not change application code. Generate consistent plane and icon artwork and separate short sounds, then validate the full inventory and inspect the results.

**Tech Stack:** SVG or PNG artwork, browser-compatible audio, existing local media tools.

**Spec:** `docs/superpowers/plans/2026-10-31-hpa-437-aeroplane-asset-pack-design.md`

## Global Constraints

Four team colours, Classic plus four existing unlockable skin IDs, eleven distinct icons, one square background, nine audio cues; no code or rules changes. Preserve centred sprite geometry and transparent backgrounds; no baked-in plane number or board geometry.

## Review Focus

- Missing colour/skin combinations: inventory all 20 sprites.
- Small display size: inspect all skin and icon shapes at board scale on dark background.
- Transparent sprite bounds: decode assets and compare canvas sizes and alpha.
- Audio faults: decode each cue and inspect duration, peak and endpoints; listen to each cue.
- Integration mismatch: document colour-only sprite map, absent icon slots and four absent cue types.

### Task 1: Art

**Files:** Create assets in `apps/web/public/assets/aeroplane-pack/{planes,icons,board}/`.

- [x] Produce one centred sprite for each of five skin IDs and four team colours.
- [x] Produce the eleven icons and quiet square board background.
- [ ] Validate SVG decoding and inventory; inspect in a board-scale contact sheet and the actual board. Inventory and contact sheet checked; actual board integration remains open.

### Task 2: Audio and handoff

**Files:** Create audio under `apps/web/public/assets/aeroplane-pack/sfx/` and a README in the pack root.

- [x] Produce the nine named cues with the agreed mechanical/chime direction.
- [ ] Check each cue decodes, has sensible duration, peak and endpoints; listen to the set.
- [x] Document mapping, dimensions, provenance, usage constraints and integration limitations.
- [ ] Recheck inventory, final assets, and repository status; report any remaining checks honestly.
