# HPA-161 Engine Packaging and Production Loading Implementation Plan

> **For Procyon implementation owner:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Package the pinned Stockfish 18 lite single-threaded browser build into Procyon's Astro static output, prove that it loads under production-style headers, and ship the required licensing material without adding opponent UI or game-session behavior.

**Architecture:** `stockfish@18.0.8` remains a normal web-workspace dependency. A repository-owned Bun script resolves and validates the exact `.js`/`.wasm` pair, copies both files unchanged into `apps/web/public/vendor/stockfish/`, and fails closed on package-layout or basename drift. Focused Bun tests cover the copier and license metadata; a dedicated Playwright preview configuration verifies MIME types, Astro base-path handling, same-origin Worker creation, and the real UCI readiness handshake. Generated engine files stay untracked. This plan is implementation PR A from the approved HPA-161 design; the opponent/session runtime plan depends on it.

**Tech Stack:** Bun 1.3.1, Turborepo, Astro 4 static output, React 18, Playwright, Stockfish.js 18.0.8.

---

## Delivery and branch strategy

1. Merge the documentation-only HPA-161 design/plan PR first.
2. Create implementation branch `codex/hpa-161-stockfish-packaging` from updated `main`.
3. Complete this plan and open a draft PR titled `build(chess): package Stockfish browser assets`.
4. Merge packaging PR A before starting runtime PR B, or branch runtime PR B from PR A and retarget it to `main` after PR A merges.
5. Keep HPA-161 open until both packaging PR A and runtime PR B are merged.

Do not add opponent-selection UI, `ChessGame` orchestration, provider adapters, or history behavior in this PR.

## Baseline verification

Before edits:

```bash
git status --short
git branch --show-current
bun install
bun test apps/web/src/lib/ai/opponent.test.ts
bunx turbo run typecheck --filter=web
```

Expected:

- working tree is clean;
- branch is `codex/hpa-161-stockfish-packaging`;
- dependency installation succeeds;
- the existing opponent contract test passes;
- web typecheck passes.

---

## Task 1: Pin the package and define the asset contract

**Files:**

- Modify: `apps/web/package.json`
- Modify: `bun.lock`
- Create: `apps/web/scripts/stockfish-assets.ts`
- Create: `apps/web/scripts/stockfish-assets.test.ts`

### Step 1: Write the failing asset-contract tests

Create `apps/web/scripts/stockfish-assets.test.ts` with focused cases for:

```ts
import { describe, expect, test } from 'bun:test';
import path from 'node:path';
import {
  STOCKFISH_PACKAGE_VERSION,
  STOCKFISH_JS_FILENAME,
  STOCKFISH_WASM_FILENAME,
  validateStockfishAssetPair,
} from './stockfish-assets';

describe('Stockfish asset contract', () => {
  test('pins the approved package and filenames', () => {
    expect(STOCKFISH_PACKAGE_VERSION).toBe('18.0.8');
    expect(STOCKFISH_JS_FILENAME).toBe('stockfish-18-lite-single.js');
    expect(STOCKFISH_WASM_FILENAME).toBe('stockfish-18-lite-single.wasm');
  });

  test('requires colocated matching basenames', () => {
    const jsPath = '/pkg/bin/stockfish-18-lite-single.js';
    const wasmPath = '/pkg/bin/stockfish-18-lite-single.wasm';
    expect(validateStockfishAssetPair(jsPath, wasmPath)).toEqual({
      basename: 'stockfish-18-lite-single',
      directory: path.dirname(jsPath),
    });
  });

  test('rejects renamed or separated files', () => {
    expect(() =>
      validateStockfishAssetPair(
        '/pkg/bin/stockfish-18-lite-single.js',
        '/other/stockfish-18-lite-single.wasm'
      )
    ).toThrow(/same directory/i);

    expect(() =>
      validateStockfishAssetPair(
        '/pkg/bin/stockfish-18-lite-single.js',
        '/pkg/bin/renamed.wasm'
      )
    ).toThrow(/matching basename/i);
  });
});
```

Run:

```bash
bun test apps/web/scripts/stockfish-assets.test.ts
```

Expected: FAIL because `stockfish-assets.ts` does not exist.

### Step 2: Pin the dependency

Add an exact dependency to `apps/web/package.json`:

```json
"stockfish": "18.0.8"
```

Run:

```bash
bun install
```

Expected:

- `bun.lock` changes;
- `node_modules/stockfish/bin/stockfish-18-lite-single.js` exists;
- `node_modules/stockfish/bin/stockfish-18-lite-single.wasm` exists.

Do **not** add `stockfish` to `trustedDependencies`. The selected files ship in the tarball and do not require the package postinstall symlink.

### Step 3: Implement the asset constants and validation

Create `apps/web/scripts/stockfish-assets.ts` with:

```ts
import path from 'node:path';

export const STOCKFISH_PACKAGE_VERSION = '18.0.8' as const;
export const STOCKFISH_JS_FILENAME = 'stockfish-18-lite-single.js' as const;
export const STOCKFISH_WASM_FILENAME = 'stockfish-18-lite-single.wasm' as const;
export const STOCKFISH_PUBLIC_DIRECTORY = 'vendor/stockfish' as const;

export function validateStockfishAssetPair(
  jsPath: string,
  wasmPath: string
): { basename: string; directory: string } {
  const jsDirectory = path.dirname(jsPath);
  const wasmDirectory = path.dirname(wasmPath);
  if (jsDirectory !== wasmDirectory) {
    throw new Error('Stockfish JS and WASM must be in the same directory');
  }

  const jsBasename = path.basename(jsPath, '.js');
  const wasmBasename = path.basename(wasmPath, '.wasm');
  if (jsBasename !== wasmBasename) {
    throw new Error('Stockfish JS and WASM must have a matching basename');
  }

  return { basename: jsBasename, directory: jsDirectory };
}
```

Keep package-root resolution out of this first step so the validation function remains pure and directly testable.

### Step 4: Run the focused tests

```bash
bun test apps/web/scripts/stockfish-assets.test.ts
```

Expected: PASS.

### Step 5: Commit

```bash
git add apps/web/package.json bun.lock apps/web/scripts/stockfish-assets.ts apps/web/scripts/stockfish-assets.test.ts
git commit -m "build(chess): pin Stockfish browser assets"
```

---

## Task 2: Implement the fail-closed preparation script

**Files:**

- Modify: `apps/web/scripts/stockfish-assets.ts`
- Create: `apps/web/scripts/prepare-stockfish.ts`
- Create: `apps/web/scripts/prepare-stockfish.test.ts`
- Modify: `apps/web/package.json`
- Modify: `.gitignore`

### Step 1: Write failing copier tests using temporary directories

Create `apps/web/scripts/prepare-stockfish.test.ts`. Use `mkdtemp`, a synthetic package root, and a synthetic destination. Cover:

1. copies the approved pair unchanged;
2. creates the destination directory;
3. preserves exact filenames and bytes;
4. is idempotent;
5. fails when JS is missing;
6. fails when WASM is missing;
7. fails if the pair does not have identical basenames;
8. removes no unrelated files outside the destination directory.

Shape the production API as:

```ts
export interface PrepareStockfishOptions {
  packageRoot: string;
  publicRoot: string;
}

export async function prepareStockfishAssets(
  options: PrepareStockfishOptions
): Promise<{
  jsDestination: string;
  wasmDestination: string;
}>;
```

Run:

```bash
bun test apps/web/scripts/prepare-stockfish.test.ts
```

Expected: FAIL because the implementation does not exist.

### Step 2: Add testable package-root resolution

Extend `stockfish-assets.ts` with a small resolver that starts from `import.meta.resolve('stockfish')` or `createRequire(import.meta.url).resolve('stockfish')`, walks upward until it finds the package's `package.json`, and verifies its version is exactly `18.0.8`.

Expose:

```ts
export function resolveInstalledStockfishPackageRoot(): string;
export function resolveStockfishSourcePair(packageRoot: string): {
  jsPath: string;
  wasmPath: string;
};
```

The source pair must resolve exactly to:

```text
<packageRoot>/bin/stockfish-18-lite-single.js
<packageRoot>/bin/stockfish-18-lite-single.wasm
```

Reject a mismatched installed version before copying.

### Step 3: Implement the copier

Create `prepare-stockfish.ts`:

- export `prepareStockfishAssets()` for unit tests;
- when executed directly, resolve the installed package root;
- set `publicRoot` to `apps/web/public` relative to the script;
- create `public/vendor/stockfish`;
- copy the exact pair without renaming or content hashing;
- verify destination sizes are non-zero and match source sizes;
- print the two destination paths;
- exit non-zero on any failure.

The loader derives the `.wasm` sibling from the Worker `.js` filename. Never rename either file independently.

### Step 4: Wire preparation into web commands

In `apps/web/package.json`, add:

```json
"prepare:stockfish": "bun run scripts/prepare-stockfish.ts"
```

Make preparation explicit instead of relying on lifecycle hooks:

```json
"dev": "bun run prepare:stockfish && astro dev",
"dev:web": "bun run prepare:stockfish && astro dev",
"start": "bun run prepare:stockfish && astro dev",
"build": "bun run prepare:stockfish && astro build"
```

Do not alter root Turbo task semantics.

### Step 5: Ignore generated assets

Add to `.gitignore`:

```gitignore
/apps/web/public/vendor/stockfish/
```

The preparation script must recreate the directory from a clean checkout.

### Step 6: Run focused verification

```bash
rm -rf apps/web/public/vendor/stockfish
bun test apps/web/scripts/stockfish-assets.test.ts apps/web/scripts/prepare-stockfish.test.ts
cd apps/web && bun run prepare:stockfish
ls -lh public/vendor/stockfish
cmp public/vendor/stockfish/stockfish-18-lite-single.js ../../node_modules/stockfish/bin/stockfish-18-lite-single.js
cmp public/vendor/stockfish/stockfish-18-lite-single.wasm ../../node_modules/stockfish/bin/stockfish-18-lite-single.wasm
cd ../..
git status --short
```

Expected:

- tests pass;
- both files exist under `apps/web/public/vendor/stockfish/`;
- both `cmp` commands return zero;
- generated files do not appear in `git status`.

### Step 7: Commit

```bash
git add apps/web/scripts apps/web/package.json .gitignore
git commit -m "build(chess): prepare Stockfish static assets"
```

---

## Task 3: Add licensing and source traceability

**Files:**

- Create: `third_party/licenses/stockfish/Copying.txt`
- Create or modify: `THIRD_PARTY_NOTICES.md`
- Create: `apps/web/scripts/stockfish-license.test.ts`

### Step 1: Write a failing license traceability test

Create a test that asserts:

- `Copying.txt` exists and contains `GNU GENERAL PUBLIC LICENSE` and `Version 3`;
- `THIRD_PARTY_NOTICES.md` contains `Stockfish.js`, `Stockfish`, `18.0.8`, `GPL-3.0`, and the chosen upstream source/tag/commit reference;
- the notice names the distributed filenames;
- the notice does not claim that the notice alone completes source-distribution obligations.

Run:

```bash
bun test apps/web/scripts/stockfish-license.test.ts
```

Expected: FAIL because the files are absent.

### Step 2: Copy the upstream license verbatim

Copy the package-provided `Copying.txt` to:

```text
third_party/licenses/stockfish/Copying.txt
```

Do not edit the license body.

### Step 3: Add the notice

Add a Stockfish section to `THIRD_PARTY_NOTICES.md` containing:

- component names: Stockfish.js and Stockfish;
- package: `stockfish@18.0.8`;
- distributed files;
- license: GPL-3.0;
- upstream repository and exact release/tag/commit used by the package;
- location of the copied license;
- explicit note that HPA-187 must verify corresponding-source distribution/offer obligations for the deployed binary.

### Step 4: Run the test

```bash
bun test apps/web/scripts/stockfish-license.test.ts
```

Expected: PASS.

### Step 5: Commit

```bash
git add third_party/licenses/stockfish/Copying.txt THIRD_PARTY_NOTICES.md apps/web/scripts/stockfish-license.test.ts
git commit -m "docs: add Stockfish third-party notices"
```

---

## Task 4: Verify production-style static delivery

**Files:**

- Create: `apps/web/playwright.stockfish.config.ts`
- Create: `apps/web/e2e/stockfish-assets.spec.ts`
- Modify: `apps/web/package.json`

### Step 1: Add a dedicated production-preview Playwright config

Create `apps/web/playwright.stockfish.config.ts` rather than changing the general E2E server behavior. Configure:

```ts
webServer: {
  command: 'bun run build && bunx astro preview --host 127.0.0.1 --port 3510',
  port: 3510,
  reuseExistingServer: false,
  timeout: 120_000,
},
use: {
  baseURL: 'http://127.0.0.1:3510',
},
```

Use Chromium only for this deterministic packaging smoke. Cross-browser release coverage remains HPA-187/HPA-166.

### Step 2: Write the failing asset-delivery tests

Create `apps/web/e2e/stockfish-assets.spec.ts` with tests that:

1. request `/vendor/stockfish/stockfish-18-lite-single.js` and assert 200, no redirect, non-HTML content type;
2. request `/vendor/stockfish/stockfish-18-lite-single.wasm` and assert 200, no redirect, `application/wasm`, and a body larger than 1 MB;
3. navigate to an existing same-origin page, construct the Worker with the stable public URL, send `uci`, and wait for `uciok`;
4. send `isready` and wait for `readyok`;
5. terminate the Worker in `finally`;
6. assert no page console error or failed asset request occurred.

Run before implementation wiring is complete:

```bash
cd apps/web
bunx playwright test --config=playwright.stockfish.config.ts e2e/stockfish-assets.spec.ts
```

Expected: FAIL until the build copies the assets and preview serves them correctly.

### Step 3: Add a focused script

In `apps/web/package.json` add:

```json
"test:e2e:stockfish-assets": "playwright test --config=playwright.stockfish.config.ts e2e/stockfish-assets.spec.ts"
```

### Step 4: Make only the minimum serving changes required

The app uses Astro static output. Prefer stable files in `public/` so Astro copies them verbatim. If preview serves the WASM with the wrong MIME type, add the smallest repository-supported static-header configuration and cover it in this test. Do not introduce Cloudflare-specific runtime code into the React application.

If a CSP exists, update it narrowly to permit:

- same-origin Worker execution via `worker-src 'self'`;
- the browser's required WebAssembly compilation directive for supported browsers.

Do not weaken unrelated CSP directives.

### Step 5: Run the production smoke

```bash
cd apps/web
bun run test:e2e:stockfish-assets
```

Expected: PASS; the real Worker reaches both `uciok` and `readyok` under preview headers.

### Step 6: Commit

```bash
git add apps/web/playwright.stockfish.config.ts apps/web/e2e/stockfish-assets.spec.ts apps/web/package.json
# Include only actual static-header/CSP files changed by the test.
git commit -m "test(chess): verify Stockfish production loading"
```

---

## Task 5: Prove clean-checkout and Turbo cache behavior

**Files:**

- Modify if needed: `apps/web/scripts/prepare-stockfish.test.ts`
- Create: `apps/web/scripts/verify-stockfish-build.test.ts`

### Step 1: Write a build-manifest verification test

Create `verify-stockfish-build.test.ts` that runs the preparation function in a temporary output directory and asserts:

- both files are recreated from no destination directory;
- the generated file SHA-256 values match the installed source files;
- changing a byte in a source fixture changes the destination hash;
- changing the preparation implementation fixture or version constant changes a computed preparation fingerprint if the script emits one.

Do not commit the real 7 MB binary or duplicate it into test fixtures.

### Step 2: Add a manual Turbo hash regression to the implementation checklist

Run:

```bash
bunx turbo run build --filter=web --dry=json > /tmp/hpa161-turbo-before.json
cp apps/web/scripts/prepare-stockfish.ts /tmp/prepare-stockfish.ts
printf '\n// cache verification\n' >> apps/web/scripts/prepare-stockfish.ts
bunx turbo run build --filter=web --dry=json > /tmp/hpa161-turbo-after-script.json
mv /tmp/prepare-stockfish.ts apps/web/scripts/prepare-stockfish.ts
```

Compare the web build task hashes in the two JSON files. Expected: hashes differ because `$TURBO_DEFAULT$` includes the preparation script.

Then verify the lockfile participates in the global hash without committing a mutation:

```bash
cp bun.lock /tmp/bun.lock.hpa161
printf '\n' >> bun.lock
bunx turbo run build --filter=web --dry=json > /tmp/hpa161-turbo-after-lock.json
mv /tmp/bun.lock.hpa161 bun.lock
```

Expected: the web build task hash differs from `/tmp/hpa161-turbo-before.json`. Do not add redundant `bun.lock` entries to `turbo.json` unless this verification disproves Turborepo's default global lockfile hashing.

### Step 3: Verify a clean checkout path

```bash
rm -rf apps/web/public/vendor/stockfish apps/web/dist
bun install
PUBLIC_GOOGLE_CLIENT_ID=verification-only bunx turbo run build --filter=web --force
find apps/web/dist/vendor/stockfish -maxdepth 1 -type f -print
```

Expected: both exact engine files exist in `dist/vendor/stockfish/` after a clean build.

### Step 4: Run tests

```bash
bun test apps/web/scripts/stockfish-assets.test.ts \
  apps/web/scripts/prepare-stockfish.test.ts \
  apps/web/scripts/stockfish-license.test.ts \
  apps/web/scripts/verify-stockfish-build.test.ts
```

Expected: PASS.

### Step 5: Commit

```bash
git add apps/web/scripts/verify-stockfish-build.test.ts apps/web/scripts/prepare-stockfish.test.ts
git commit -m "test(chess): verify Stockfish build reproducibility"
```

---

## Task 6: Complete packaging PR validation

### Step 1: Run the focused suite

```bash
bun test apps/web/scripts/*.test.ts
cd apps/web && bun run test:e2e:stockfish-assets && cd ../..
```

Expected: all packaging, license, build, and real-Worker preview checks pass.

### Step 2: Run repository quality gates

```bash
bunx turbo run typecheck --filter=web
bunx turbo run lint --filter=web
PUBLIC_GOOGLE_CLIENT_ID=verification-only bunx turbo run build --filter=web --force
bun run test
```

Expected:

- typecheck passes;
- lint has no new errors;
- web production build passes;
- full monorepo tests pass.

### Step 3: Check generated and committed state

```bash
git diff --check
git status --short
git ls-files apps/web/public/vendor/stockfish
```

Expected:

- no whitespace errors;
- only intentional source/docs/test changes are tracked;
- `git ls-files` returns no generated Stockfish binary paths.

### Step 4: Final commit if validation caused intentional edits

```bash
git add <only-intended-files>
git commit -m "build(chess): finalize Stockfish delivery"
```

Skip this commit when the tree is already clean.

### Step 5: Push and create draft PR A

```bash
git push -u origin codex/hpa-161-stockfish-packaging
```

Draft PR body must include:

- exact package/version and artifact names;
- generated-file policy;
- production-preview UCI handshake result;
- MIME/base-path/CSP checks;
- license and corresponding-source boundary;
- focused and full validation commands;
- note that opponent/session UI is intentionally deferred to PR B.

---

## Packaging PR A completion criteria

PR A is complete when:

- `stockfish@18.0.8` is pinned without enabling its postinstall;
- preparation fails closed on version/path/basename mismatch;
- generated assets are untracked and reproducible from a clean checkout;
- exact `.js`/`.wasm` filenames remain colocated and unchanged;
- Astro preview serves correct content types without HTML fallback;
- a same-origin real Worker reaches `uciok` and `readyok` under production-style headers;
- Turbo hash behavior is verified for script and lockfile changes;
- GPL license and third-party/source traceability are present;
- no opponent UI or chess-session runtime behavior is included.
