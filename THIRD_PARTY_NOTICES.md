# Third-Party Notices

This file records third-party components bundled or distributed by Procyon, with
license text and upstream traceability references.

## Stockfish.js / Stockfish

| Field                     | Value                                                                                                                    |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Components                | Stockfish.js (WASM packaging) and Stockfish (chess engine)                                                               |
| Package                   | `stockfish@18.0.8`                                                                                                       |
| Distributed files         | `stockfish-18-lite-single.js`, `stockfish-18-lite-single.wasm` (served from `apps/web/public/vendor/stockfish/`)         |
| License                   | GPL-3.0                                                                                                                  |
| Stockfish.js upstream     | https://github.com/nmrugg/stockfish.js (npm package commit `93c994592dcf3b4b21052ab925e9b534df9c0918`)                   |
| Stockfish engine upstream | https://github.com/official-stockfish/Stockfish (release tag `sf_18`, commit `cb3d4ee9b47d0c5aae855b12379378ea1439675c`) |
| License text              | `third_party/licenses/stockfish/Copying.txt` (also published beside the binaries)                                        |
| Corresponding source      | `third_party/licenses/stockfish/source/` archives, published under `/vendor/stockfish/source/`                           |

Stockfish.js is a WASM build of the Stockfish chess engine. The npm package
`stockfish@18.0.8` records gitHead `93c994592dcf3b4b21052ab925e9b534df9c0918`.

**Source distribution:** `prepare:stockfish` publishes the GPL object code together
with `Copying.txt`, `CorrespondingSource.txt`, and the exact corresponding-source
archives under `/vendor/stockfish/` (same origin as the binaries). Repository
copies of those materials live under `third_party/licenses/stockfish/`. **HPA-187**
still owns release-checklist verification that deployed environments continue to
serve these materials for supported browsers.
