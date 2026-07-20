# @procyon/game-core

Shared structural primitives for the chess/xiangqi/shogi/jungle engines.

**Scope rule:** share the scaffold, specialize the rules. Generic piece-movement primitives (sliding/stepping offsets), board helpers parameterized by `Dims`, the `isSquareAttacked` enemy-scan scaffold, and the `moveLeavesKingInCheck` copy/apply/test shell live here. Variant-specific rules (castling, cannon screens, shogi drops/nifu/uchifuzume, jungle terrain) AND variant-specific compositions (`hasLegalMove`/`hasAnyLegalMoves`) stay in `apps/web/src/lib/{variant}/`.

See `docs/superpowers/2026-07-18-tier2-game-core-package-design.md` for full design.
