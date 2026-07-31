# Third-Party Notices

This file records third-party components bundled or distributed by Procyon, with
license text and upstream traceability references.

## Stockfish.js / Stockfish

| Field                     | Value                                                                                                            |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Components                | Stockfish.js (WASM packaging) and Stockfish (chess engine)                                                       |
| Package                   | `stockfish@18.0.8`                                                                                               |
| Distributed files         | `stockfish-18-lite-single.js`, `stockfish-18-lite-single.wasm` (served from `apps/web/public/vendor/stockfish/`) |
| License                   | GPL-3.0                                                                                                          |
| Stockfish.js upstream     | https://github.com/nmrugg/stockfish.js (release tag `v18.0.0`)                                                   |
| Stockfish engine upstream | https://github.com/official-stockfish/Stockfish                                                                  |
| License text              | `third_party/licenses/stockfish/Copying.txt`                                                                     |

Stockfish.js is a WASM build of the Stockfish chess engine. The npm package
ships prebuilt binaries tagged under `v18.0.0` on the Stockfish.js repository.

**Source distribution:** This notice documents third-party attribution and the
copied license text. It does not by itself satisfy GPL corresponding-source
distribution or written-offer obligations for the deployed binary. **HPA-187**
must verify corresponding-source distribution/offer obligations for the deployed
binary.
