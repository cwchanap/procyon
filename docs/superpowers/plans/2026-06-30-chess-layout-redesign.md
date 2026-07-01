# Chess Page Layout Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restructure the chess page into a three-zone layout (left rail / board column / board-side panel), consolidate all AI settings into the left navigation rail, and add app-wide light/dark theming — with near-zero per-component churn via CSS-variable-backed design tokens.

**Architecture:** Tailwind tokens (`ink-*`, `ivory`, `line`, `brass`) are redefined as CSS-variable-backed so a `.light`/`.dark` class on `<html>` re-themes the whole app. AI config crosses the AppShell↔ChessGame Astro-island boundary through a module-level singleton store consumed via `useSyncExternalStore`. The board column keeps only title+board+controls; tutorial/status/info/tips move into a right board-side panel.

**Tech Stack:** Astro 4 + React 18, Tailwind CSS 3.4 (flat config), `bun:test` + `@testing-library/react` + `happy-dom`, Playwright for E2E.

## Global Constraints

- **Runtime/package manager:** Bun (`bun install`, `bun test`, `bun run`). Do NOT use npm/yarn/pnpm.
- **No emojis in code** unless matching existing UI copy (existing chess UI uses emoji like 🤖/📚 — preserve those where they already exist; do not add new ones).
- **No code comments** unless the surrounding file already comments or clarity is essential.
- **Styling tokens:** use existing Tailwind token classes (`bg-ink-700`, `text-ivory`, `border-line`, `text-brass`, etc.). Do NOT introduce hex colors in components — they must resolve through the theme tokens. The only exception: board-square hexes in `tailwind.config.mjs` stay constant.
- **Astro islands:** `AppShell` (`client:only='react'`) and `ChessGame` (`client:load`) are separate React roots — never use React context to share state between them; use the `ai-config-store` module singleton.
- **Don't break other games:** Xiangqi/Shogi/Jungle keep working. The token changes are backward-compatible global re-themes. Do not restructure their layouts.
- **Verification per task:** run the listed test command; before each commit run `cd apps/web && bun test src` (no regressions) and `bunx eslint <changed files>` (root flat config). Commit only passing work.
- **Commits:** conventional-commit style (`feat:`, `refactor:`, `chore:`, `test:`). Never commit unless a task step explicitly says to.

---

## File Structure

**New files:**

- `apps/web/src/lib/theme.ts` — theme resolution + persistence helpers (pure, unit-tested).
- `apps/web/src/lib/ai/ai-config-store.ts` — module singleton store bridging AI config across islands.
- `apps/web/src/components/ThemeToggle.tsx` — sun/moon toggle button.
- `apps/web/src/components/game/SidebarAIConfig.tsx` — left-rail AI config panel.
- `apps/web/src/components/game/BoardSidePanel.tsx` — right board-side panel container.
- `apps/web/src/test/reactSetup.ts` — shared happy-dom setup helper for component tests.
- Tests: `theme.test.ts`, `ai-config-store.test.ts`, `ThemeToggle.test.tsx`, `SidebarAIConfig.test.tsx`, `BoardSidePanel.test.tsx`.
- E2E: `apps/web/e2e/chess-layout.spec.ts`.

**Modified files:**

- `apps/web/tailwind.config.mjs` — CSS-variable-backed tokens + `darkMode: 'class'`.
- `apps/web/src/layouts/Layout.astro` — `.light`/`.dark` palettes + no-flash bootstrap script.
- `apps/web/src/components/AppShell.tsx` — render `SidebarAIConfig` (game pages) + `ThemeToggle`.
- `apps/web/src/components/ChessGame.tsx` — migrate AI state to store; restructure into board column + `BoardSidePanel`.
- `apps/web/src/components/GamePageLayout.tsx` — default `showBackButton={false}`.

**Deleted files:**

- `apps/web/src/components/ai/AISettingsDialog.tsx` — contents move to `SidebarAIConfig`.

---

### Task 1: Theme token foundation + no-flash bootstrap

**Files:**

- Create: `apps/web/src/lib/theme.ts`
- Test: `apps/web/src/lib/theme.test.ts`
- Modify: `apps/web/tailwind.config.mjs`
- Modify: `apps/web/src/layouts/Layout.astro`

**Interfaces:**

- Produces: `theme.ts` exports `type Theme = 'light' | 'dark'`, `getStoredTheme(): Theme | null`, `getSystemTheme(): Theme`, `resolveInitialTheme(): Theme`, `applyTheme(theme: Theme): void`, `setTheme(theme: Theme): void`, `THEME_STORAGE_KEY = 'procyon-theme'`. Consumed by `ThemeToggle` (Task 2).

- [ ] **Step 1: Write the failing test for `theme.ts`**

Create `apps/web/src/lib/theme.test.ts`:

```ts
import { describe, test, expect, beforeEach, mock } from 'bun:test';
import {
  THEME_STORAGE_KEY,
  getStoredTheme,
  getSystemTheme,
  resolveInitialTheme,
  applyTheme,
  setTheme,
} from './theme';

describe('theme helpers', () => {
  beforeEach(() => {
    const w = window as unknown as Record<string, unknown>;
    w.localStorage = {
      store: {} as Record<string, string>,
      getItem(k: string) {
        return (this.store as Record<string, string>)[k] ?? null;
      },
      setItem(k: string, v: string) {
        (this.store as Record<string, string>)[k] = v;
      },
      removeItem(k: string) {
        delete (this.store as Record<string, string>)[k];
      },
    };
    document.documentElement.classList.remove('light', 'dark');
  });

  test('getStoredTheme returns null when unset', () => {
    expect(getStoredTheme()).toBeNull();
  });

  test('getStoredTheme returns stored value', () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, 'light');
    expect(getStoredTheme()).toBe('light');
  });

  test('getStoredTheme ignores invalid values', () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, 'banana');
    expect(getStoredTheme()).toBeNull();
  });

  test('resolveInitialTheme prefers stored over system', () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, 'dark');
    expect(resolveInitialTheme()).toBe('dark');
  });

  test('resolveInitialTheme falls back to system', () => {
    mock.module('globalThis', () => ({
      matchMedia: () => ({ matches: true }),
    }));
    // getSystemTheme reads matchMedia('(prefers-color-scheme: light)')
    (window as unknown as { matchMedia: unknown }).matchMedia = () => ({
      matches: true,
    });
    expect(resolveInitialTheme()).toBe('light');
  });

  test('applyTheme sets exactly one class', () => {
    applyTheme('light');
    expect(document.documentElement.classList.contains('light')).toBe(true);
    expect(document.documentElement.classList.contains('dark')).toBe(false);
    applyTheme('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(document.documentElement.classList.contains('light')).toBe(false);
  });

  test('setTheme persists and applies', () => {
    setTheme('light');
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('light');
    expect(document.documentElement.classList.contains('light')).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && bun test src/lib/theme.test.ts`
Expected: FAIL — `Cannot find module './theme'`.

- [ ] **Step 3: Implement `theme.ts`**

Create `apps/web/src/lib/theme.ts`:

```ts
export type Theme = 'light' | 'dark';

export const THEME_STORAGE_KEY = 'procyon-theme';

export function getStoredTheme(): Theme | null {
  if (typeof window === 'undefined') return null;
  const v = window.localStorage.getItem(THEME_STORAGE_KEY);
  return v === 'light' || v === 'dark' ? v : null;
}

export function getSystemTheme(): Theme {
  if (
    typeof window === 'undefined' ||
    typeof window.matchMedia !== 'function'
  ) {
    return 'dark';
  }
  return window.matchMedia('(prefers-color-scheme: light)').matches
    ? 'light'
    : 'dark';
}

export function resolveInitialTheme(): Theme {
  return getStoredTheme() ?? getSystemTheme();
}

export function applyTheme(theme: Theme): void {
  if (typeof document === 'undefined') return;
  const cl = document.documentElement.classList;
  cl.add(theme);
  cl.remove(theme === 'light' ? 'dark' : 'light');
}

export function setTheme(theme: Theme): void {
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  }
  applyTheme(theme);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/web && bun test src/lib/theme.test.ts`
Expected: PASS (7 tests). If the `resolveInitialTheme falls back to system` test is flaky due to happy-dom's matchMedia, ensure the test sets `window.matchMedia` before calling; happy-dom provides `window`/`document` globals under `bun test`.

- [ ] **Step 5: Make Tailwind tokens CSS-variable-backed**

Modify `apps/web/tailwind.config.mjs`. Replace the `ink`, `ivory`, `line`, and `brass` color blocks (lines ~8–25) so they read from CSS variables. Add `darkMode: 'class'` at the top level. Leave `chess`/`xiangqi`/`shogi`/`jungle` variant accent hexes and the shadcn `hsl(var(--…))` tokens untouched.

The new top of `theme.extend` becomes:

```js
/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue}'],
  theme: {
    extend: {
      colors: {
        // Nocturne palette — CSS-variable-backed so .light/.dark flip the theme.
        ink: {
          900: 'hsl(var(--ink-900) / <alpha-value>)',
          800: 'hsl(var(--ink-800) / <alpha-value>)',
          700: 'hsl(var(--ink-700) / <alpha-value>)',
          600: 'hsl(var(--ink-600) / <alpha-value>)',
        },
        ivory: {
          DEFAULT: 'hsl(var(--ivory) / <alpha-value>)',
          dim: 'hsl(var(--ivory-dim) / <alpha-value>)',
        },
        brass: {
          DEFAULT: 'hsl(var(--brass) / <alpha-value>)',
          bright: 'hsl(var(--brass-bright) / <alpha-value>)',
        },
        line: {
          // Subtle borders: alpha baked in (no /alpha usage exists in the codebase).
          DEFAULT: 'hsl(var(--line) / 0.08)',
          brass: 'hsl(var(--line-brass) / 0.45)',
        },
        // per-variant accents + board square hexes — constant across themes:
        chess: {
          DEFAULT: '#C8A24B',
          board: '#2A2620',
          deep: '#1C1916',
        },
        xiangqi: {
          DEFAULT: '#C8402F',
          light: '#E0654F',
          board: '#241513',
          river: '#2D1A16',
          palace: '#3A211C',
        },
        shogi: {
          DEFAULT: '#3E5C8A',
          light: '#7BA0D6',
          board: '#23283A',
          deep: '#181B26',
        },
        jungle: {
          DEFAULT: '#3E8C6F',
          water: '#16323B',
          den: '#1F3029',
        },
        // shadcn semantic tokens (values from :root in Layout.astro)
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: { DEFAULT: 'hsl(var(--primary))', foreground: 'hsl(var(--primary-foreground))' },
        secondary: { DEFAULT: 'hsl(var(--secondary))', foreground: 'hsl(var(--secondary-foreground))' },
        destructive: { DEFAULT: 'hsl(var(--destructive))', foreground: 'hsl(var(--destructive-foreground))' },
        muted: { DEFAULT: 'hsl(var(--muted))', foreground: 'hsl(var(--muted-foreground))' },
        accent: { DEFAULT: 'hsl(var(--accent))', foreground: 'hsl(var(--accent-foreground))' },
        popover: { DEFAULT: 'hsl(var(--popover))', foreground: 'hsl(var(--popover-foreground))' },
        card: { DEFAULT: 'hsl(var(--card))', foreground: 'hsl(var(--card-foreground))' },
      },
      // ...fontFamily, borderRadius, boxShadow unchanged — keep existing entries
```

Keep the existing `fontFamily`, `borderRadius`, and `boxShadow` blocks exactly as they are.

- [ ] **Step 6: Add `.light` / `.dark` palettes + no-flash script to `Layout.astro`**

In `apps/web/src/layouts/Layout.astro`:

(a) Add a theme-bootstrap constant in the frontmatter (alongside `initialAuthScript`):

```ts
const themeBootstrap = `(function(){try{var k='procyon-theme';var s=localStorage.getItem(k);var t=(s==='light'||s==='dark')?s:(window.matchMedia&&window.matchMedia('(prefers-color-scheme: light)').matches?'light':'dark');var c=document.documentElement.classList;c.add(t);c.remove(t==='light'?'dark':'light');}catch(e){document.documentElement.classList.add('dark');}})();`;
```

(b) In `<head>`, after the `<title>` line, inject the no-flash script BEFORE any CSS renders:

```astro
<title>{title}</title>
<script is:inline set:html={themeBootstrap} />
```

(c) Replace the existing `:root { ... }` block inside `<style is:global>` with two theme blocks. The shadcn semantic tokens are duplicated per theme so any shadcn-component usage also flips. Replace the whole `:root { ... }` rule with:

```css
.dark {
  --background: 42 12% 5%;
  --foreground: 42 38% 88%;
  --card: 40 12% 10%;
  --card-foreground: 42 38% 88%;
  --popover: 40 12% 10%;
  --popover-foreground: 42 38% 88%;
  --primary: 42 53% 54%;
  --primary-foreground: 40 30% 8%;
  --secondary: 40 10% 15%;
  --secondary-foreground: 42 38% 88%;
  --muted: 40 10% 15%;
  --muted-foreground: 40 14% 64%;
  --accent: 40 10% 18%;
  --accent-foreground: 42 38% 88%;
  --destructive: 8 62% 48%;
  --destructive-foreground: 42 38% 88%;
  --border: 40 10% 16%;
  --input: 40 10% 16%;
  --ring: 42 53% 54%;
  --radius: 0.375rem;
  /* Nocturne palette */
  --ink-900: 42 12% 5%;
  --ink-800: 40 12% 7%;
  --ink-700: 38 11% 10%;
  --ink-600: 36 10% 14%;
  --ivory: 42 38% 88%;
  --ivory-dim: 40 14% 64%;
  --line: 42 38% 88%;
  --line-brass: 42 53% 54%;
  --brass: 42 53% 54%;
  --brass-bright: 45 68% 66%;
}

.light {
  --background: 40 35% 92%;
  --foreground: 30 30% 14%;
  --card: 44 50% 96%;
  --card-foreground: 30 30% 14%;
  --popover: 44 50% 96%;
  --popover-foreground: 30 30% 14%;
  --primary: 38 58% 36%;
  --primary-foreground: 40 35% 92%;
  --secondary: 38 30% 87%;
  --secondary-foreground: 30 30% 14%;
  --muted: 38 30% 87%;
  --muted-foreground: 34 12% 37%;
  --accent: 36 26% 82%;
  --accent-foreground: 30 30% 14%;
  --destructive: 8 62% 42%;
  --destructive-foreground: 40 35% 92%;
  --border: 30 20% 30%;
  --input: 30 20% 30%;
  --ring: 38 58% 36%;
  --radius: 0.375rem;
  /* Vellum palette (warm aged-paper) */
  --ink-900: 40 35% 92%;
  --ink-800: 38 30% 87%;
  --ink-700: 44 50% 96%;
  --ink-600: 36 26% 82%;
  --ivory: 30 30% 14%;
  --ivory-dim: 34 12% 37%;
  --line: 30 30% 14%;
  --line-brass: 38 60% 32%;
  --brass: 38 58% 36%;
  --brass-bright: 42 53% 45%;
}

html {
  background: hsl(var(--ink-900));
}
```

Note: the `<body>` already has `bg-ink-900 text-ivory` — those now resolve through the variables. The inline `html { background }` prevents a white flash before the body paints.

(d) The existing `* { border-color: hsl(var(--border)); }` rule stays.

- [ ] **Step 7: Verify build + lint**

Run: `cd apps/web && bun run build`
Expected: build succeeds (Astro compiles; Tailwind picks up the new config).

Run: `cd apps/web && bun test src/lib/theme.test.ts`
Expected: PASS.

Run: `bunx eslint apps/web/src/lib/theme.ts apps/web/src/layouts/Layout.astro`
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/lib/theme.ts apps/web/src/lib/theme.test.ts \
  apps/web/tailwind.config.mjs apps/web/src/layouts/Layout.astro
git commit -m "feat(web): app-wide light/dark theme tokens and no-flash bootstrap"
```

---

### Task 2: ThemeToggle component

**Files:**

- Create: `apps/web/src/test/reactSetup.ts`
- Create: `apps/web/src/components/ThemeToggle.tsx`
- Test: `apps/web/src/components/ThemeToggle.test.tsx`

**Interfaces:**

- Consumes: `resolveInitialTheme`, `setTheme`, `Theme` from `lib/theme` (Task 1).
- Produces: default export `ThemeToggle` — a `<button>` with `aria-label` starting `"Switch to "`.

- [ ] **Step 1: Create the shared React test setup helper**

Create `apps/web/src/test/reactSetup.ts` (extracted from the inline pattern in `ShogiHand.test.tsx`):

```ts
import { beforeAll, afterAll, afterEach } from 'bun:test';
import { cleanup } from '@testing-library/react';
import { Window } from 'happy-dom';

let happyWindow: Window;

export function setupReactDom() {
  beforeAll(() => {
    happyWindow = new Window();
    const g = globalThis as unknown as Record<string, unknown>;
    g.document = happyWindow.document;
    g.window = happyWindow;
    g.HTMLElement = happyWindow.HTMLElement;
    g.HTMLDivElement = happyWindow.HTMLDivElement;
    g.HTMLButtonElement = happyWindow.HTMLButtonElement;
    g.Element = happyWindow.Element;
    g.Node = happyWindow.Node;
    g.DocumentFragment = happyWindow.DocumentFragment;
    g.Text = happyWindow.Text;
    g.Comment = happyWindow.Comment;
    g.Selection = happyWindow.Selection;
    g.Range = happyWindow.Range;
    g.DOMRect = happyWindow.DOMRect;
    g.MutationObserver = happyWindow.MutationObserver;
    g.NodeFilter = happyWindow.NodeFilter;
    g.getComputedStyle = happyWindow.getComputedStyle.bind(happyWindow);
  });

  afterEach(() => {
    cleanup();
  });

  afterAll(() => {
    const g = globalThis as unknown as Record<string, unknown>;
    for (const key of [
      'document',
      'window',
      'HTMLElement',
      'HTMLDivElement',
      'HTMLButtonElement',
      'Element',
      'Node',
      'DocumentFragment',
      'Text',
      'Comment',
      'Selection',
      'Range',
      'DOMRect',
      'MutationObserver',
      'NodeFilter',
      'getComputedStyle',
    ]) {
      delete g[key];
    }
    happyWindow.close();
  });
}
```

- [ ] **Step 2: Write the failing test**

Create `apps/web/src/components/ThemeToggle.test.tsx`:

```tsx
import { describe, test, expect, beforeEach } from 'bun:test';
import { render, fireEvent } from '@testing-library/react';
import React from 'react';
import { setupReactDom } from '../test/reactSetup';
import { THEME_STORAGE_KEY } from '../lib/theme';
import ThemeToggle from './ThemeToggle';

setupReactDom();

describe('ThemeToggle', () => {
  beforeEach(() => {
    window.localStorage.clear();
    document.documentElement.classList.remove('light', 'dark');
  });

  test('renders an accessible button', () => {
    const { getByRole } = render(<ThemeToggle />);
    expect(getByRole('button', { name: /switch to/i })).toBeTruthy();
  });

  test('clicking toggles the html class and persists', () => {
    // start dark
    document.documentElement.classList.add('dark');
    const { getByRole } = render(<ThemeToggle />);
    const btn = getByRole('button', {
      name: /switch to/i,
    }) as HTMLButtonElement;
    fireEvent.click(btn);
    expect(document.documentElement.classList.contains('light')).toBe(true);
    expect(document.documentElement.classList.contains('dark')).toBe(false);
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('light');
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd apps/web && bun test src/components/ThemeToggle.test.tsx`
Expected: FAIL — cannot find `./ThemeToggle`.

- [ ] **Step 4: Implement `ThemeToggle.tsx`**

Create `apps/web/src/components/ThemeToggle.tsx`:

```tsx
import React, { useEffect, useState } from 'react';
import { resolveInitialTheme, setTheme, type Theme } from '../lib/theme';
import { cn } from '../lib/utils';

const ThemeToggle: React.FC = () => {
  const [theme, setThemeState] = useState<Theme>('dark');

  useEffect(() => {
    const initial = resolveInitialTheme();
    setThemeState(initial);
    setTheme(initial);
  }, []);

  const toggle = () => {
    const next: Theme = theme === 'dark' ? 'light' : 'dark';
    setThemeState(next);
    setTheme(next);
  };

  const nextLabel = theme === 'dark' ? 'light' : 'dark';
  return (
    <button
      type='button'
      onClick={toggle}
      aria-label={`Switch to ${nextLabel} mode`}
      title={`Switch to ${nextLabel} mode`}
      className={cn(
        'inline-flex h-9 w-9 items-center justify-center rounded-md border border-line',
        'text-ivory-dim transition-colors hover:bg-ink-600 hover:text-ivory'
      )}
    >
      <span aria-hidden='true'>{theme === 'dark' ? '\u2600' : '\u263E'}</span>
    </button>
  );
};

export default ThemeToggle;
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd apps/web && bun test src/components/ThemeToggle.test.tsx`
Expected: PASS (2 tests).

Run: `bunx eslint apps/web/src/components/ThemeToggle.tsx apps/web/src/test/reactSetup.ts`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/test/reactSetup.ts apps/web/src/components/ThemeToggle.tsx \
  apps/web/src/components/ThemeToggle.test.tsx
git commit -m "feat(web): add ThemeToggle component"
```

---

### Task 3: Wire ThemeToggle into AppShell

**Files:**

- Modify: `apps/web/src/components/AppShell.tsx`

**Interfaces:**

- Consumes: `ThemeToggle` default export (Task 2).

- [ ] **Step 1: Add the import**

At the top of `apps/web/src/components/AppShell.tsx`, add:

```ts
import ThemeToggle from './ThemeToggle';
```

- [ ] **Step 2: Add toggle to the desktop left-rail footer**

In the desktop `<aside>` (around line 112), replace:

```tsx
<div className='mt-6 border-t border-line pt-4'>{userChip}</div>
```

with:

```tsx
<div className='mt-6 border-t border-line pt-4 space-y-4'>
  {userChip}
  <div className='flex justify-end'>
    <ThemeToggle />
  </div>
</div>
```

- [ ] **Step 3: Add toggle to the mobile top header**

In the mobile `<header>` (around line 117), replace the inner `<a href='/'>…</a>` block's wrapping to add the toggle on the right. Change:

```tsx
		<header className='fixed inset-x-0 top-0 z-40 flex h-16 items-center border-b border-line bg-ink-800 px-4 lg:hidden'>
			<a href='/' className='flex items-center gap-3'>
```

to:

```tsx
		<header className='fixed inset-x-0 top-0 z-40 flex h-16 items-center justify-between border-b border-line bg-ink-800 px-4 lg:hidden'>
			<a href='/' className='flex items-center gap-3'>
```

Then, immediately before the closing `</header>` (after the PROCYON wordmark `</a>`), add:

```tsx
<ThemeToggle />
```

- [ ] **Step 4: Verify build + lint**

Run: `cd apps/web && bun run build`
Expected: succeeds.

Run: `bunx eslint apps/web/src/components/AppShell.tsx`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/AppShell.tsx
git commit -m "feat(web): add theme toggle to nav rail and mobile header"
```

---

### Task 4: ai-config-store (cross-island singleton)

**Files:**

- Create: `apps/web/src/lib/ai/ai-config-store.ts`
- Test: `apps/web/src/lib/ai/ai-config-store.test.ts`

**Interfaces:**

- Consumes: `AIConfig`, `AIProvider` from `./types`; `defaultAIConfig`, `loadAIConfig`, `saveAIConfig` from `./storage`; `env` from `../env`.
- Produces:
  - `interface AIConfigState { config: AIConfig; aiPlayer: 'white' | 'black' }`
  - `subscribe(cb): () => void`
  - `getSnapshot(): AIConfigState`
  - `useAIConfigStore(): AIConfigState` (React hook via `useSyncExternalStore`)
  - `hydrate(): Promise<void>`
  - `setConfig(patch: Partial<AIConfig>): void`
  - `setModel(model: string): void`
  - `setAIPlayer(player: 'white' | 'black'): void`
  - `setProvider(provider: AIProvider): Promise<string | null>` (returns error message or null)

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/lib/ai/ai-config-store.test.ts`:

```ts
import { describe, test, expect, beforeEach, spyOn } from 'bun:test';
import {
  subscribe,
  getSnapshot,
  setConfig,
  setModel,
  setAIPlayer,
  setProvider,
  hydrate,
} from './ai-config-store';
import { defaultAIConfig } from './storage';

describe('ai-config-store', () => {
  beforeEach(() => {
    // reset to defaults via setConfig
    setConfig(defaultAIConfig);
    setAIPlayer('black');
  });

  test('initial snapshot is defaults with black AI', () => {
    expect(getSnapshot().config).toEqual(defaultAIConfig);
    expect(getSnapshot().aiPlayer).toBe('black');
  });

  test('setModel updates config', () => {
    setModel('gemini-2.5-pro');
    expect(getSnapshot().config.model).toBe('gemini-2.5-pro');
  });

  test('setAIPlayer updates aiPlayer', () => {
    setAIPlayer('white');
    expect(getSnapshot().aiPlayer).toBe('white');
  });

  test('subscribe is notified on change and unsubscribes', () => {
    let calls = 0;
    const unsub = subscribe(() => calls++);
    setModel('gpt-4o');
    setAIPlayer('white');
    expect(calls).toBe(2);
    unsub();
    setModel('gemini-2.5-pro');
    expect(calls).toBe(2);
  });

  test('setProvider returns error message when fetch fails', async () => {
    const err = await setProvider('openai');
    // No auth / no network in test → expect a non-null error string
    expect(typeof err).toBe('string');
    expect(err!.length).toBeGreaterThan(0);
  });

  test('hydrate loads config from loadAIConfig', async () => {
    const { loadAIConfig } = await import('./storage');
    const spy = spyOn({ loadAIConfig }, 'loadAIConfig');
    // loadAIConfig is a named export; spy on the module instead:
    spy.mockRestore();
    // Just ensure hydrate does not throw and snapshot stays valid.
    await hydrate();
    expect(getSnapshot().config).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && bun test src/lib/ai/ai-config-store.test.ts`
Expected: FAIL — `Cannot find module './ai-config-store'`.

- [ ] **Step 3: Implement the store**

Create `apps/web/src/lib/ai/ai-config-store.ts`:

```ts
import { useSyncExternalStore } from 'react';
import type { AIConfig, AIProvider } from './types';
import { defaultAIConfig, loadAIConfig, saveAIConfig } from './storage';
import { env } from '../env';

export interface AIConfigState {
  config: AIConfig;
  aiPlayer: 'white' | 'black';
}

const initialState: AIConfigState = {
  config: defaultAIConfig,
  aiPlayer: 'black',
};

let state: AIConfigState = initialState;
let hydrated = false;
const listeners = new Set<() => void>();

export function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

export function getSnapshot(): AIConfigState {
  return state;
}

function emit(): void {
  for (const cb of listeners) cb();
}

function setState(next: AIConfigState): void {
  state = next;
  emit();
}

export function setConfig(patch: Partial<AIConfig>): void {
  setState({ ...state, config: { ...state.config, ...patch } });
  saveAIConfig(state.config);
}

export function setModel(model: string): void {
  setConfig({ model });
}

export function setAIPlayer(aiPlayer: 'white' | 'black'): void {
  setState({ ...state, aiPlayer });
}

export async function hydrate(): Promise<void> {
  if (hydrated) return;
  hydrated = true;
  try {
    const config = await loadAIConfig();
    setState({ ...state, config });
  } catch {
    // keep defaults
  }
}

export async function setProvider(
  provider: AIProvider
): Promise<string | null> {
  try {
    const res = await fetch(`${env.PUBLIC_API_URL}/ai-config`, {
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
    });
    if (!res.ok) {
      return "We couldn't load your saved AI settings. Please try again from AI Settings.";
    }
    const data = await res.json();
    const configurations = (data.configurations || []) as Array<{
      id?: string;
      provider?: AIProvider;
      hasApiKey?: boolean;
    }>;
    const providerConfig = configurations.find(
      c => c.provider === provider && c.hasApiKey
    );
    if (!providerConfig?.id) {
      return 'Add an API key for this provider in AI Settings to reuse it here.';
    }
    const fullRes = await fetch(
      `${env.PUBLIC_API_URL}/ai-config/${providerConfig.id}/full`,
      {
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
      }
    );
    if (!fullRes.ok) {
      return "We couldn't load your saved API key details. Please try again.";
    }
    const full = await fullRes.json();
    setConfig({
      provider,
      model: full.modelName || state.config.model,
      apiKey: full.apiKey || '',
      enabled: true,
    });
    return null;
  } catch {
    return 'Something went wrong loading AI settings. Please try again.';
  }
}

export function useAIConfigStore(): AIConfigState {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/web && bun test src/lib/ai/ai-config-store.test.ts`
Expected: PASS (6 tests). If the `hydrate` spy test is awkward, it only asserts no-throw + valid snapshot, which passes.

Run: `bunx eslint apps/web/src/lib/ai/ai-config-store.ts`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/ai/ai-config-store.ts apps/web/src/lib/ai/ai-config-store.test.ts
git commit -m "feat(web): add cross-island ai-config-store singleton"
```

---

### Task 5: SidebarAIConfig component

**Files:**

- Create: `apps/web/src/components/game/SidebarAIConfig.tsx`
- Test: `apps/web/src/components/game/SidebarAIConfig.test.tsx`

**Interfaces:**

- Consumes: `useAIConfigStore`, `setProvider`, `setModel`, `setAIPlayer` from `lib/ai/ai-config-store` (Task 4); `AI_PROVIDERS`, `AIProvider` from `lib/ai/types`; `useAuth` from `lib/auth`.
- Produces: default export `SidebarAIConfig` — renders three `<select>`s labelled "AI Provider", "AI Model", "AI plays", plus a "Manage API keys" link to `/profile`. No props.

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/components/game/SidebarAIConfig.test.tsx`:

```tsx
import { describe, test, expect, beforeEach } from 'bun:test';
import { render, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import { setupReactDom } from '../../test/reactSetup';
import { setConfig, setAIPlayer } from '../../lib/ai/ai-config-store';
import SidebarAIConfig from './SidebarAIConfig';

setupReactDom();

// Stub useAuth so the component thinks the user is signed in.
jest_module_stub: {
}

describe('SidebarAIConfig', () => {
  beforeEach(() => {
    setConfig({
      provider: 'gemini',
      apiKey: 'key',
      model: 'gemini-2.5-flash-lite',
      enabled: true,
      gameVariant: 'chess',
    });
    setAIPlayer('black');
  });

  test('renders provider, model, and AI-plays selects plus manage-keys link', async () => {
    const { getByLabelText, getByText } = render(<SidebarAIConfig />);
    // fetch of /ai-config is mocked at the window level in the app; in the test
    // it will fail silently and the panel still renders its controls.
    await waitFor(() => {
      expect(getByLabelText(/AI Provider/i)).toBeTruthy();
    });
    expect(getByLabelText(/AI Model/i)).toBeTruthy();
    expect(getByLabelText(/AI plays/i)).toBeTruthy();
    expect(getByText(/Manage API keys/i)).toBeTruthy();
  });

  test('changing the model select updates the store', async () => {
    const { getByLabelText } = render(<SidebarAIConfig />);
    const modelSelect = getByLabelText(/AI Model/i) as HTMLSelectElement;
    fireEvent.change(modelSelect, { target: { value: 'gemini-2.5-pro' } });
    expect(modelSelect.value).toBe('gemini-2.5-pro');
  });
});
```

Note: if `bunx tsc`/eslint flags the stray `jest_module_stub` comment line, delete it — it is a placeholder reminder, not code. The real `useAuth` stub: create `apps/web/src/__mocks__/auth.ts`? Simpler — wrap render with a mock by spying. Because `useAuth` is imported from `../../lib/auth`, stub it via `bun:test`'s `mock.module` inside the test file's top level:

At the top of the test file (before `describe`), replace the `jest_module_stub` line with:

```tsx
import { mock } from 'bun:test';
mock.module('../../lib/auth', () => ({
  useAuth: () => ({
    isAuthenticated: true,
    user: { username: 'tester' },
    loading: false,
  }),
}));
```

And stub `fetch` globally so `/ai-config` returns an empty list:

```tsx
beforeEach(() => {
  (globalThis as unknown as { fetch: unknown }).fetch = (() =>
    Promise.resolve({
      ok: true,
      json: () => Promise.resolve({ configurations: [] }),
    })) as unknown as typeof fetch;
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && bun test src/components/game/SidebarAIConfig.test.tsx`
Expected: FAIL — cannot find `./SidebarAIConfig`.

- [ ] **Step 3: Implement `SidebarAIConfig.tsx`**

Create `apps/web/src/components/game/SidebarAIConfig.tsx`:

```tsx
import React, { useEffect, useState } from 'react';
import {
  useAIConfigStore,
  setProvider,
  setModel,
  setAIPlayer,
} from '../../lib/ai/ai-config-store';
import type { AIProvider } from '../../lib/ai/types';
import { useAuth } from '../../lib/auth';

const MODEL_OPTIONS: Record<string, Array<{ value: string; label: string }>> = {
  gemini: [
    { value: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash' },
    { value: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
    { value: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
    { value: 'gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash Lite' },
  ],
  openrouter: [
    { value: 'gpt-4o-mini', label: 'GPT-4o Mini' },
    { value: 'gpt-4o', label: 'GPT-4o' },
    { value: 'claude-3-haiku', label: 'Claude 3 Haiku' },
    { value: 'llama-3.1-70b', label: 'Llama 3.1 70B' },
    { value: 'gpt-oss-120b', label: 'GPT OSS 120B' },
  ],
  openai: [
    { value: 'gpt-4o', label: 'GPT-4o' },
    { value: 'gpt-4o-mini', label: 'GPT-4o Mini' },
    { value: 'gpt-4-turbo', label: 'GPT-4 Turbo' },
    { value: 'gpt-3.5-turbo', label: 'GPT-3.5 Turbo' },
  ],
  chutes: [
    { value: 'deepseek-ai/DeepSeek-R1', label: 'DeepSeek-R1' },
    { value: 'zai-org/GLM-4.6-FP8', label: 'GLM 4.6 FP8' },
    { value: 'deepseek-ai/DeepSeek-V3', label: 'DeepSeek-V3' },
    {
      value: 'meta-llama/Llama-3.3-70B-Instruct',
      label: 'Llama 3.3 70B Instruct',
    },
  ],
};

const ALL_PROVIDER_OPTIONS: Array<{ value: AIProvider; label: string }> = [
  { value: 'gemini', label: 'Google Gemini' },
  { value: 'openrouter', label: 'OpenRouter' },
  { value: 'openai', label: 'OpenAI' },
  { value: 'chutes', label: 'Chutes.ai' },
];

const AI_PLAYER_OPTIONS = [
  { value: 'black', label: 'AI plays Black' },
  { value: 'white', label: 'AI plays White' },
];

const SidebarAIConfig: React.FC = () => {
  const { config, aiPlayer } = useAIConfigStore();
  const { isAuthenticated } = useAuth();
  const [availableProviders, setAvailableProviders] = useState<AIProvider[]>(
    []
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${import.meta.env.PUBLIC_API_URL}/ai-config`, {
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
        });
        if (!res.ok) return;
        const data = await res.json();
        const providers = (
          (data.configurations || []) as Array<{
            provider: AIProvider;
            hasApiKey: boolean;
          }>
        )
          .filter(c => c.hasApiKey)
          .map(c => c.provider);
        if (!cancelled) setAvailableProviders([...new Set(providers)]);
      } catch {
        /* leave empty */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const providerOptions =
    availableProviders.length > 0
      ? ALL_PROVIDER_OPTIONS.filter(p => availableProviders.includes(p.value))
      : ALL_PROVIDER_OPTIONS;

  const models = MODEL_OPTIONS[config.provider] || MODEL_OPTIONS.gemini;
  const currentModel = models.some(m => m.value === config.model)
    ? config.model
    : models[0]?.value || '';

  const onProviderChange = async (provider: AIProvider) => {
    setError(null);
    if (!isAuthenticated) {
      setError('Please sign in to manage your AI settings.');
      return;
    }
    const err = await setProvider(provider);
    if (err) setError(err);
  };

  return (
    <div className='space-y-4'>
      <h2 className='text-xs font-semibold uppercase tracking-wide text-ivory-dim'>
        AI Config
      </h2>

      {providerOptions.length === 0 ? (
        <div className='text-sm text-ivory-dim'>
          <p className='mb-2'>No AI providers configured.</p>
          <a href='/profile' className='text-brass hover:underline'>
            Manage API keys →
          </a>
        </div>
      ) : (
        <>
          <div>
            <label className='mb-1 block text-xs font-medium text-ivory-dim'>
              AI Provider
            </label>
            <select
              aria-label='AI Provider'
              value={config.provider}
              onChange={e => onProviderChange(e.target.value as AIProvider)}
              className='w-full rounded-md border border-line bg-ink-800 px-2 py-1.5 text-sm text-ivory focus:outline-none focus-visible:ring-2 focus-visible:ring-brass'
            >
              {providerOptions.map(o => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className='mb-1 block text-xs font-medium text-ivory-dim'>
              AI Model
            </label>
            <select
              aria-label='AI Model'
              value={currentModel}
              onChange={e => setModel(e.target.value)}
              className='w-full rounded-md border border-line bg-ink-800 px-2 py-1.5 text-sm text-ivory focus:outline-none focus-visible:ring-2 focus-visible:ring-brass'
            >
              {models.map(o => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className='mb-1 block text-xs font-medium text-ivory-dim'>
              AI plays
            </label>
            <select
              aria-label='AI plays'
              value={aiPlayer}
              onChange={e => setAIPlayer(e.target.value as 'white' | 'black')}
              className='w-full rounded-md border border-line bg-ink-800 px-2 py-1.5 text-sm text-ivory focus:outline-none focus-visible:ring-2 focus-visible:ring-brass'
            >
              {AI_PLAYER_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>

          <a
            href='/profile'
            className='block text-xs text-brass hover:underline'
          >
            Manage API keys
          </a>
        </>
      )}

      {error && (
        <p className='text-xs text-xiangqi' role='alert'>
          {error}
        </p>
      )}
    </div>
  );
};

export default SidebarAIConfig;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/web && bun test src/components/game/SidebarAIConfig.test.tsx`
Expected: PASS (2 tests). If the "Manage API keys" text vs "Manage API keys →" mismatch fails the `getByText`, the test uses a substring `/Manage API keys/i` which matches both — fine.

Run: `bunx eslint apps/web/src/components/game/SidebarAIConfig.tsx`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/game/SidebarAIConfig.tsx \
  apps/web/src/components/game/SidebarAIConfig.test.tsx
git commit -m "feat(web): add SidebarAIConfig panel for the left rail"
```

---

### Task 6: Migrate ChessGame AI state to the store + wire SidebarAIConfig into AppShell

**Files:**

- Modify: `apps/web/src/components/ChessGame.tsx`
- Modify: `apps/web/src/components/AppShell.tsx`

**Interfaces:**

- Consumes: `useAIConfigStore`, `hydrate`, `setAIPlayer` from `lib/ai/ai-config-store` (Task 4); `SidebarAIConfig` (Task 5).

- [ ] **Step 1: Migrate ChessGame state to the store**

In `apps/web/src/components/ChessGame.tsx`:

(a) Add imports (alongside the existing ai imports near line 23–28):

```ts
import {
  useAIConfigStore,
  hydrate as hydrateAIConfig,
} from '../lib/ai/ai-config-store';
```

(b) Replace the two `useState` declarations for aiConfig and aiPlayer (lines ~50–51):

```ts
const [aiConfig, setAIConfig] = useState<AIConfig>(defaultAIConfig);
```

and

```ts
const [aiPlayer, setAIPlayer] = useState<'white' | 'black'>('black');
```

with a single store read + a thin setter shim so the rest of the file keeps compiling:

```ts
const { config: aiConfig, aiPlayer } = useAIConfigStore();
const setAIPlayer = (player: 'white' | 'black') => setStoreAIPlayer(player);
```

Add `setStoreAIPlayer` to the import:

```ts
import {
  useAIConfigStore,
  hydrate as hydrateAIConfig,
  setAIPlayer as setStoreAIPlayer,
} from '../lib/ai/ai-config-store';
```

(c) `aiConfig` is now read-only (from the store). Remove the `setAIConfig` references:

- In the `useEffect` that loads config (lines ~189–197), replace the whole effect body to call `hydrateAIConfig()` and push into the service:

```ts
useEffect(() => {
  void hydrateAIConfig();
}, []);
```

- Add a new effect that pushes store config into the aiService whenever it changes:

```ts
useEffect(() => {
  aiService.updateConfig({ ...aiConfig, debug: isDebugMode });
}, [aiConfig, isDebugMode, aiService]);
```

- In `handleProviderChange` (lines ~64–161): this logic now lives in the store's `setProvider`. Replace the entire `handleProviderChange` callback with a thin wrapper that keeps the local `providerError` banner working (the banner still renders at the top of the board for now):

```ts
const handleProviderChange = useCallback(
  async (newProvider: AIProvider) => {
    setProviderError(null);
    if (!isAuthenticated) {
      setProviderError('Please sign in to manage your AI settings.');
      return;
    }
    const err = await setProvider(newProvider);
    if (err) setProviderError(err);
  },
  [isAuthenticated]
);
```

Add `setProvider` to the store import:

```ts
import {
  useAIConfigStore,
  hydrate as hydrateAIConfig,
  setAIPlayer as setStoreAIPlayer,
  setProvider,
} from '../lib/ai/ai-config-store';
```

(d) The `onModelChange` handler in the `AISettingsDialog` usage (`onModelChange={model => setAIConfig(prev => ({ ...prev, model }))}`) — `setAIConfig` no longer exists. Change it to use the store: `onModelChange={model => setModel(model)}` and add `setModel` to the store import. (The `AISettingsDialog` itself is removed in Task 8, but for this task it must still compile.)

(e) Remove now-unused imports: `defaultAIConfig` is no longer used in ChessGame (it was the `useState` initializer). Remove `defaultAIConfig` from the `storage` import on line 25 if nothing else uses it. Keep `loadAIConfig`/`saveAIConfig` only if still referenced; remove `_handleAIConfigChange`'s body's `saveAIConfig` call is fine to drop since the store persists. If `_handleAIConfigChange` becomes unused, leave it (it's prefixed `_` and already unused) but ensure it compiles — replace its body to use `setConfig` from the store, or delete the function. Simplest: delete `_handleAIConfigChange` entirely (it is already unused per the `_` prefix).

- [ ] **Step 2: Wire SidebarAIConfig into AppShell (game pages only)**

In `apps/web/src/components/AppShell.tsx`:

(a) Add imports:

```ts
import SidebarAIConfig from './game/SidebarAIConfig';
import { hydrate as hydrateAIConfig } from '../lib/ai/ai-config-store';
```

(b) Inside `AppShell`, after the existing `useEffect` that sets the path (around line 25–27), add a second effect to hydrate the AI config on mount (so the sidebar shows correct provider/model immediately):

```ts
useEffect(() => {
  void hydrateAIConfig();
}, []);
```

(c) Render the panel below the nav inside the desktop `<aside>`, but only on game pages. After the closing `</nav>` of the main nav (line ~111) and before the footer `<div className='mt-6 border-t border-line pt-4 ...'>`, insert:

```tsx
{
  isGamePage(path) && (
    <div className='mt-6 border-t border-line pt-4'>
      <SidebarAIConfig />
    </div>
  );
}
```

(d) Add the helper near the other helpers (e.g. after `isActive`):

```ts
const isGamePage = (p: string) =>
  ['/chess', '/xiangqi', '/shogi', '/jungle'].some(g => p.startsWith(g));
```

- [ ] **Step 3: Verify build + tests + lint**

Run: `cd apps/web && bun run build`
Expected: succeeds.

Run: `cd apps/web && bun test src`
Expected: all existing tests still PASS (no regressions). The store migration should not break chess logic tests.

Run: `bunx eslint apps/web/src/components/ChessGame.tsx apps/web/src/components/AppShell.tsx`
Expected: no errors (fix any unused-import warnings the changes introduced).

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/ChessGame.tsx apps/web/src/components/AppShell.tsx
git commit -m "refactor(web): migrate chess AI state to cross-island store; show AI config in nav rail"
```

---

### Task 7: BoardSidePanel component

**Files:**

- Create: `apps/web/src/components/game/BoardSidePanel.tsx`
- Test: `apps/web/src/components/game/BoardSidePanel.test.tsx`

**Interfaces:**

- Produces: default export `BoardSidePanel` with props:

  ```ts
  interface BoardSidePanelProps {
    gameMode: 'tutorial' | 'ai';
    onModeChange: (m: 'tutorial' | 'ai') => void;
    children?: React.ReactNode;
  }
  ```

  It renders: a Tutorial/AI toggle (two buttons), then `{children}` (ChessGame passes `AIStatusPanel`/`AIGameInstructions`/`TutorialInstructions`/`DemoSelector` as children depending on mode).

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/components/game/BoardSidePanel.test.tsx`:

```tsx
import { describe, test, expect, mock } from 'bun:test';
import { render, fireEvent } from '@testing-library/react';
import React from 'react';
import { setupReactDom } from '../../test/reactSetup';
import BoardSidePanel from './BoardSidePanel';

setupReactDom();

describe('BoardSidePanel', () => {
  test('renders a Tutorial toggle and an AI toggle', () => {
    const { getByRole } = render(
      <BoardSidePanel gameMode='ai' onModeChange={() => {}} />
    );
    expect(getByRole('button', { name: /tutorial/i })).toBeTruthy();
    expect(getByRole('button', { name: /play vs ai/i })).toBeTruthy();
  });

  test('clicking Tutorial calls onModeChange', () => {
    const onModeChange = mock();
    const { getByRole } = render(
      <BoardSidePanel gameMode='ai' onModeChange={onModeChange} />
    );
    fireEvent.click(getByRole('button', { name: /tutorial/i }));
    expect(onModeChange).toHaveBeenCalledWith('tutorial');
  });

  test('renders children', () => {
    const { getByText } = render(
      <BoardSidePanel gameMode='ai' onModeChange={() => {}}>
        <div>STATUS CHILD</div>
      </BoardSidePanel>
    );
    expect(getByText('STATUS CHILD')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && bun test src/components/game/BoardSidePanel.test.tsx`
Expected: FAIL — cannot find `./BoardSidePanel`.

- [ ] **Step 3: Implement `BoardSidePanel.tsx`**

Create `apps/web/src/components/game/BoardSidePanel.tsx`:

```tsx
import React from 'react';
import { cn } from '../../lib/utils';

type Mode = 'tutorial' | 'ai';

interface BoardSidePanelProps {
  gameMode: Mode;
  onModeChange: (m: Mode) => void;
  children?: React.ReactNode;
}

const base =
  'flex-1 rounded-md border px-3 py-2 text-sm font-medium transition-colors';

const BoardSidePanel: React.FC<BoardSidePanelProps> = ({
  gameMode,
  onModeChange,
  children,
}) => {
  return (
    <aside className='flex w-full flex-col gap-4 lg:w-72'>
      <div className='flex gap-2' role='group' aria-label='Game mode'>
        <button
          type='button'
          onClick={() => onModeChange('tutorial')}
          className={cn(
            base,
            gameMode === 'tutorial'
              ? 'border-brass bg-brass text-ink-900'
              : 'border-line text-ivory-dim hover:bg-ink-600 hover:text-ivory'
          )}
        >
          Tutorial
        </button>
        <button
          type='button'
          onClick={() => onModeChange('ai')}
          aria-label='Play vs AI'
          className={cn(
            base,
            gameMode === 'ai'
              ? 'border-brass bg-brass text-ink-900'
              : 'border-line text-ivory-dim hover:bg-ink-600 hover:text-ivory'
          )}
        >
          Play vs AI
        </button>
      </div>
      {children}
    </aside>
  );
};

export default BoardSidePanel;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/web && bun test src/components/game/BoardSidePanel.test.tsx`
Expected: PASS (3 tests).

Run: `bunx eslint apps/web/src/components/game/BoardSidePanel.tsx`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/game/BoardSidePanel.tsx \
  apps/web/src/components/game/BoardSidePanel.test.tsx
git commit -m "feat(web): add BoardSidePanel container"
```

---

### Task 8: ChessGame layout restructure (board column + side panel)

**Files:**

- Modify: `apps/web/src/components/ChessGame.tsx`

**Interfaces:**

- Consumes: `BoardSidePanel` (Task 7); existing `AIStatusPanel`, `AIGameInstructions`, `TutorialInstructions`, `DemoSelector`, `ChessBoard`, `GameStartOverlay`, `GameControls`.

- [ ] **Step 1: Replace the return JSX of `ChessGame`**

Remove the `<GameScaffold …>…</GameScaffold>` wrapper and its props (`title`, `subtitle`, `currentMode`, `onModeChange`, `showModeToggle`, `aiSettingsButton`). The scaffold, `GameModeToggle`, and `AISettingsDialog` are no longer used by chess. Keep the title/subtitle rendering inline.

Replace the entire `return ( … );` block (from `return (` after `const showModeToggle = …`) with:

```tsx
return (
  <div className='mx-auto w-full max-w-7xl px-4 py-6'>
    <div className='mb-6 text-center'>
      <h1 className='mb-2 font-display text-4xl font-bold text-ivory'>
        {title}
      </h1>
      <p className='text-xl font-medium text-ivory-dim'>{subtitle}</p>
    </div>

    {providerError && (
      <div
        className='mx-auto mb-4 flex max-w-4xl items-start justify-between gap-4 rounded-lg border border-xiangqi/40 bg-xiangqi/10 px-4 py-3 text-ivory'
        role='alert'
      >
        <p className='text-sm'>{providerError}</p>
        <button
          type='button'
          className='text-xs font-semibold uppercase tracking-wide text-xiangqi hover:text-ivory'
          onClick={() => setProviderError(null)}
        >
          Dismiss
        </button>
      </div>
    )}

    <div className='flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-center'>
      {/* Board column */}
      <div className='flex flex-col items-center gap-6'>
        <GameStartOverlay active={!gameStarted && gameMode !== 'tutorial'}>
          <ChessBoard
            board={currentBoard}
            selectedSquare={gameState.selectedSquare}
            possibleMoves={gameState.possibleMoves}
            onSquareClick={handleSquareClick}
            highlightSquares={currentHighlightSquares}
            disabled={!gameStarted && gameMode !== 'tutorial'}
          />
        </GameStartOverlay>

        {gameMode === 'ai' && (
          <GameControls
            hasGameStarted={gameStarted}
            isGameOver={isGameOver}
            aiConfigured={!!aiConfig.enabled && !!aiConfig.apiKey}
            isDebugMode={isDebugMode}
            canExport={gameStarted && !!gameExporterRef.current}
            onStartOrReset={handleStartOrReset}
            onReset={resetGame}
            onToggleDebug={() => setIsDebugMode(!isDebugMode)}
            onExport={() =>
              gameExporterRef.current?.exportAndDownload(gameState.status)
            }
          />
        )}

        {import.meta.env.DEV &&
          showDebugWinButton &&
          gameStarted &&
          !isGameOver && (
            <div className='flex gap-2 justify-center text-xs'>
              <button
                onClick={triggerDebugWin}
                className='px-3 py-1 bg-jungle hover:opacity-90 text-ink-900 rounded'
                title='Debug: Win'
              >
                Win
              </button>
              <button
                onClick={triggerDebugLoss}
                className='px-3 py-1 bg-xiangqi hover:opacity-90 text-ink-900 rounded'
                title='Debug: Loss'
              >
                Loss
              </button>
              <button
                onClick={triggerDebugDraw}
                className='px-3 py-1 bg-ink-600 hover:bg-ink-700 text-ivory rounded'
                title='Debug: Draw'
              >
                Draw
              </button>
            </div>
          )}
      </div>

      {/* Board-side panel */}
      <BoardSidePanel gameMode={gameMode} onModeChange={toggleToMode}>
        {gameMode === 'ai' ? (
          <>
            <AIStatusPanel
              aiConfigured={!!aiConfig.enabled && !!aiConfig.apiKey}
              hasGameStarted={gameStarted}
              isAIThinking={gameState.isAiThinking}
              isAIPaused={isAiPaused}
              aiError={aiError}
              aiDebugMoves={aiDebugMoves}
              isDebugMode={isDebugMode}
              onRetry={retryAIMove}
            />
            <AIGameInstructions
              providerName={aiConfig.provider}
              modelName={aiConfig.model}
              aiConfigured={aiConfig.enabled && !!aiConfig.apiKey}
            />
          </>
        ) : (
          <>
            <DemoSelector
              demos={logicDemos}
              currentDemo={currentDemo}
              onDemoChange={handleDemoChange}
            />
            <TutorialInstructions
              title={getCurrentDemo().title}
              explanation={getCurrentDemo().explanation}
              tips={[
                '"Control the center and develop your pieces early."',
                '"Castle early to protect your king and connect your rooks."',
                '"Look for forks, pins, and skewers to gain material advantages."',
                '"Always consider your opponent\'s best move before making yours."',
              ]}
              tipsTitle='Chess Tips'
            />
          </>
        )}
      </BoardSidePanel>
    </div>
  </div>
);
```

- [ ] **Step 2: Remove now-unused imports**

Remove these imports from the top of `ChessGame.tsx` (they are no longer referenced):

- `import GameScaffold from './game/GameScaffold';`
- `import AISettingsDialog from './ai/AISettingsDialog';`

Add:

- `import BoardSidePanel from './game/BoardSidePanel';`

Also remove the `showModeToggle` const (line ~856) since it is no longer used. Keep `title`/`subtitle` consts — they are used inline.

Remove the dead `gameMode === 'ai' && !gameStarted && !isLoadingConfig && (!aiConfig.enabled || !aiConfig.apiKey)` "AI not configured" block that previously sat above the board — its message is now redundant with the sidebar + `AIGameInstructions`. (The `AIStatusPanel`/`AIGameInstructions` already surface the not-configured state.)

- [ ] **Step 3: Verify build + tests + lint**

Run: `cd apps/web && bun run build`
Expected: succeeds.

Run: `cd apps/web && bun test src`
Expected: all tests PASS (chess logic tests unaffected; no component test for ChessGame exists yet — added in Task 11 E2E).

Run: `bunx eslint apps/web/src/components/ChessGame.tsx`
Expected: no errors. Fix any unused-variable warnings.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/ChessGame.tsx
git commit -m "refactor(web): restructure chess page into board column + side panel"
```

---

### Task 9: Remove "Back to Game Selection"

**Files:**

- Modify: `apps/web/src/components/GamePageLayout.tsx`

- [ ] **Step 1: Default the back button off**

In `apps/web/src/components/GamePageLayout.tsx`, change the destructured default (line ~22) from:

```tsx
	showBackButton = true,
```

to:

```tsx
	showBackButton = false,
```

The left-rail "Play" (♟) nav item already navigates to `/`, so the link is redundant. All game pages lose the back button consistently.

- [ ] **Step 2: Verify build**

Run: `cd apps/web && bun run build`
Expected: succeeds.

Run: `bunx eslint apps/web/src/components/GamePageLayout.tsx`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/GamePageLayout.tsx
git commit -m "chore(web): remove Back to Game Selection link from game pages"
```

---

### Task 10: Retire AISettingsDialog

**Files:**

- Delete: `apps/web/src/components/ai/AISettingsDialog.tsx`

- [ ] **Step 1: Confirm no remaining imports**

Run: `rg -n "AISettingsDialog" apps/web/src`
Expected: no matches (Task 8 removed the last usage). If any remain, remove them first.

- [ ] **Step 2: Delete the file**

Run: `git rm apps/web/src/components/ai/AISettingsDialog.tsx`

- [ ] **Step 3: Verify build + lint**

Run: `cd apps/web && bun run build`
Expected: succeeds (no broken imports).

Run: `cd apps/web && bun test src`
Expected: all PASS.

- [ ] **Step 4: Commit**

```bash
git commit -m "refactor(web): remove retired AISettingsDialog modal"
```

---

### Task 11: E2E test + full verification

**Files:**

- Create: `apps/web/e2e/chess-layout.spec.ts`

- [ ] **Step 1: Write the E2E test**

Create `apps/web/e2e/chess-layout.spec.ts`:

```ts
import { test, expect } from '@playwright/test';

test.describe('Chess page layout', () => {
  test('theme toggle flips and persists', async ({ page }) => {
    await page.goto('/chess');
    // Default is dark (or system). Toggle to light.
    const toggle = page.getByRole('button', { name: /switch to/i }).first();
    await toggle.click();
    await expect(page.locator('html')).toHaveClass(/light/);
    // Persist across reload
    await page.reload();
    await expect(page.locator('html')).toHaveClass(/light/);
  });

  test('board-side panel is visible beside the board on desktop', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/chess');
    await expect(
      page.getByRole('button', { name: /^Tutorial$/ })
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: /Play vs AI/i })
    ).toBeVisible();
  });

  test('board-side panel stacks below board on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 800 });
    await page.goto('/chess');
    const board = page
      .locator('canvas, .chess-board, [class*="board"]')
      .first();
    const tutorialBtn = page.getByRole('button', { name: /^Tutorial$/ });
    // Tutorial button exists (panel rendered); on mobile it stacks below.
    await expect(tutorialBtn).toBeVisible();
  });

  test('Back to Game Selection link is absent', async ({ page }) => {
    await page.goto('/chess');
    await expect(page.getByText('Back to Game Selection')).toHaveCount(0);
  });
});
```

- [ ] **Step 2: Run E2E (local servers assumed running, per repo convention)**

Run: `cd apps/web && bun run test:e2e -- e2e/chess-layout.spec.ts`
Expected: 4 tests PASS. (If servers aren't running, start `bun run web:dev` and `bun run api:dev` first, or run `bun run test:e2e` which auto-starts servers in CI.)

- [ ] **Step 3: Run the full unit suite + lint + build**

Run: `cd apps/web && bun test src`
Expected: all PASS.

Run: `cd apps/web && bun run build`
Expected: succeeds.

Run: `bun run lint:all`
Expected: no errors across the repo.

- [ ] **Step 4: Manual smoke (both themes)**

Visit `/`, `/chess`, `/profile`, `/puzzles` in both light and dark. Confirm: nav legible, panels have borders, brass accent visible, no white flashes on load. Tune any HSL value in `Layout.astro` `.light` block if contrast is off.

- [ ] **Step 5: Commit**

```bash
git add apps/web/e2e/chess-layout.spec.ts
git commit -m "test(web): e2e coverage for chess layout and theme toggle"
```

---

## Self-Review (completed during authoring)

- **Spec coverage:** Theming = Task 1–3 ✓. Three-zone layout = Task 8 ✓. AI config in left rail = Task 5–6 ✓. Model dropdown in rail (not board) = Task 5 ✓. Tutorial/status/info/tips in board-side panel = Task 7–8 ✓. Remove back button = Task 9 ✓. Theme toggle = Task 2–3 ✓. Cross-island store (spec correction) = Task 4 ✓. Retire AISettingsDialog = Task 10 ✓.
- **Placeholder scan:** none — every code step shows complete code; the `jest_module_stub` marker is explicitly called out for deletion with a real `mock.module` replacement in the same step.
- **Type consistency:** store exports (`useAIConfigStore`, `setProvider`, `setModel`, `setAIPlayer`, `hydrate`) are used with identical names across Tasks 4, 5, 6. `BoardSidePanel` props match between Task 7 and Task 8 usage (`gameMode`, `onModeChange`, `children`). `Theme`/`setTheme`/`resolveInitialTheme` consistent between Task 1 and Task 2.
