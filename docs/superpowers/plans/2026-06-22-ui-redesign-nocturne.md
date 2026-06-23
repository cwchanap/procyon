# Nocturne UI Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reskin the entire `apps/web` frontend into the "Nocturne — Lacquer & Brass" design system (dark brass-on-lacquer palette, per-variant jewel accents, Fraunces/Hanken Grotesk/Spline Sans Mono typography, responsive sidebar app-shell, restrained motion) without changing any game logic, AI, API, schema, or auth behavior.

**Architecture:** A single design-token layer (Tailwind config + CSS variables in `Layout.astro`) feeds a small set of shared primitives (`Button`, `Input`, `Panel`, `PageHeader`, `AppShell`). Every page/component is then restyled to consume those tokens and primitives. Work is phased: (1) foundation, (2) homepage, (3) game pages, (4) remaining pages — each phase independently builds and passes tests.

**Tech Stack:** Astro 4 (SSR) + React 18 + Tailwind CSS 3 + `class-variance-authority` + `clsx`/`tailwind-merge` (`cn` helper). Bun runtime/package manager. Playwright E2E. Fonts via Google Fonts `<link>`.

**Reference spec:** `docs/superpowers/2026-06-22-ui-redesign-nocturne-design.md`

## Global Constraints

Every task implicitly includes this section.

- **No behavior changes.** Only presentation (classes, markup wrappers, CSS, fonts). Do NOT change game/move logic, AI orchestration, API calls, hooks' return values, routing, or auth flow.
- **Preserve all E2E-pinned text exactly.** The Playwright suite matches accessible names/headings by exact string. Do NOT change the text of headings or interactive controls, including emoji on game controls. Known pinned strings that MUST stay verbatim:
  - Headings: `Procyon Chess`, `Standard Chess`, `Chinese Chess`, `Chinese Chess (象棋)`, `Japanese Chess (Shogi)`, `将棋 (Shogi)`, `Classical Chess`, `Shogi Logic & Tutorials`, `Chess Puzzles`, `Play History`, `Profile`, `Your Ratings`, `AI Configuration`, `AI Settings`, `Saved Configurations`, `Basic Piece Movement`, `Back Rank Mate`, `Access Denied`, `Sign in to view your play history`.
  - Buttons (exact, emoji included): `⚙️ AI Settings`, `🆕 New Game`, `🎮 Play Again`, `▶️ Start`, `📚 Tutorial Mode`, `Sign In`, `Sign Up`, `Sign Out`, `Login`, `Save Configuration`, `Set Active`, `Promote`, `Hint`, `Close`, `Cancel`, `Delete`, `Decline`, `Go to Login`, `Go to Profile`, `Back to puzzles`.
  - Links: `← Back to home`, `Login`.
- **Preserve all `data-testid` and `data-*` hooks:** `data-testid="game-cards"` (+ its `data-hydrated`), `data-testid="profile-page"`, `data-testid="play-history-guest"`, `data-testid="google-signin-button"`. The ✨ decorative spans on the homepage card CTA may be removed because the test matches `/Play Standard Chess/i` as a substring.
- **Preserve the auth-nav hydration anti-flash mechanism.** The `procyon-auth-client-pending` / `procyon-auth-hydrated` classes and the `#procyon-server-auth-nav` / `#procyon-client-auth-nav` swap (Layout.astro CSS + AppNavBar.tsx effect) must keep working; port it into the new shell, don't delete it.
- **Single theme: dark.** No light-mode toggle. Remove the shadcn `.dark` override block; repoint the base `:root` tokens to Nocturne.
- **Accessibility:** keep visible focus states (brass ring), keyboard-navigable nav, and `@media (prefers-reduced-motion: reduce)` disabling non-essential motion.

### Design tokens (authoritative values)

| Token          | Hex                      |
| -------------- | ------------------------ |
| ink-900        | `#0E0D0B`                |
| ink-800        | `#141210`                |
| ink-700        | `#1C1916`                |
| ink-600        | `#26221D`                |
| ivory          | `#EDE6D6`                |
| ivory-dim      | `#B8AE9C`                |
| brass          | `#C8A24B`                |
| brass-bright   | `#E3C06B`                |
| line           | `rgba(237,230,214,0.08)` |
| line-brass     | `rgba(200,162,75,0.45)`  |
| chess accent   | `#C8A24B`                |
| xiangqi accent | `#C8402F`                |
| shogi accent   | `#3E5C8A`                |
| jungle accent  | `#3E8C6F`                |

### Restyle conventions (the class-mapping table)

When a task says "apply the restyle mapping," make these substitutions. After editing a file, the grep gate (below) must come back empty for it.

| Find (old)                                                                                                                                                                                  | Replace (new)                                                                       |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `bg-gradient-to-br from-indigo-900 via-purple-900 to-pink-900` (and `from-green-900 via-blue-900 to-purple-900`, any page-wrapper gradient)                                                 | remove the class (let body `bg-ink-900` show) or `bg-ink-900`                       |
| `glass-effect`                                                                                                                                                                              | `bg-ink-700 border border-line rounded-lg` (prefer the `<Panel>` component)         |
| `text-white`                                                                                                                                                                                | `text-ivory`                                                                        |
| `text-purple-100`, `text-purple-200`, `text-purple-300`, `text-gray-300`                                                                                                                    | `text-ivory-dim`                                                                    |
| `bg-gradient-to-r from-cyan-400 via-purple-400 to-pink-400 bg-clip-text text-transparent` (gradient-clipped headings)                                                                       | `text-ivory font-display` (use `text-brass` if it was an accent)                    |
| `bg-gradient-to-r from-cyan-300 to-purple-300 ... bg-clip-text text-transparent`                                                                                                            | `text-ivory font-display`                                                           |
| button gradients `bg-gradient-to-r from-purple-* to-pink-*` (+ hover variants)                                                                                                              | use `<Button>` (brass) or `bg-brass text-ink-900 hover:bg-brass-bright font-medium` |
| avatar/icon `bg-gradient-to-r from-purple-500 to-pink-500` / `from-yellow-400 to-orange-500`                                                                                                | `bg-brass text-ink-900`                                                             |
| borders `border-purple-500/20`, `border-white/20`, `border-white/10`, `border-border/50`, `border-border/30`                                                                                | `border-line` (use `border-line-brass` only for active/emphasis)                    |
| surfaces `bg-white/10`, `bg-white/5`, `bg-card/80`, `bg-card/90`, `bg-card/95`                                                                                                              | `bg-ink-700` (raised: `bg-ink-600`)                                                 |
| `backdrop-blur-*` on the above surfaces                                                                                                                                                     | remove (matte panels, no glass)                                                     |
| `focus-visible:ring-cyan-400`, `focus:ring-cyan-400`                                                                                                                                        | `focus-visible:ring-brass`                                                          |
| `hover:scale-105`, `hover:scale-110`, `hover:-translate-y-2`, `transform`                                                                                                                   | remove, or `hover:-translate-y-0.5` for cards                                       |
| `text-red-300`, `text-red-400` (destructive)                                                                                                                                                | `text-[#C8402F]`                                                                    |
| numbers/ratings/ELO/move-notation/timestamps text                                                                                                                                           | add `font-mono`                                                                     |
| page titles / hero headline                                                                                                                                                                 | add `font-display`                                                                  |
| decorative blobs/particles (`animate-float`, `animate-ping`, `animate-spin`, `animate-bounce`, `animate-pulse` on positioned `div`s), shimmer overlays, `✨` spans in the homepage card CTA | delete the elements                                                                 |

### Grep gate (run after each restyle task, scoped to the file(s) changed)

```bash
grep -nE "from-indigo-900|via-purple-900|from-purple-[0-9]|via-purple-400|to-pink-[0-9]|from-cyan-|glass-effect|bg-clip-text|text-purple-[0-9]|animate-float|backdrop-blur|hover:scale-1" <files>
```

Expected: no output. (The `animated-bg`, `glow`, `shimmer`, `float` keyframes are removed centrally in Task 2; this gate catches stragglers.)

### Testing approach (this repo)

There is **no React/DOM render-test harness** (all unit tests are game-logic/hooks). So per-task verification is: `bun run lint` (root) + `cd apps/web && bun run build` (TS + Astro compile) + the grep gate + the targeted Playwright spec for any task that changes markup the suite asserts on + a stated visual check. E2E needs both servers; start them once with `bun run dev` (web :3500, api :3501) in a separate terminal, or run the full suite at the end (Task 18). Game-logic unit tests must remain green but should be untouched by this work.

### Branch

All work lands on the existing branch `redesign/nocturne-ui`. Commit after every task.

---

## Phase 1 — Foundation

### Task 1: Tailwind tokens

**Files:**

- Modify: `apps/web/tailwind.config.mjs`

**Interfaces:**

- Produces: Tailwind color utilities `bg-ink-900|800|700|600`, `text-ivory`, `text-ivory-dim`, `bg-brass`, `text-brass`, `bg-brass-bright`, `border-line`, `border-line-brass`, `text-chess|xiangqi|shogi|jungle` (+ `bg-`/`border-` variants); font utilities `font-display`, `font-sans`, `font-mono`; `shadow-panel`. The shadcn semantic colors (`primary`, `card`, `border`, …) remain defined (driven by `:root` vars set in Task 2).

- [ ] **Step 1: Replace the config with the Nocturne extension**

Replace the entire file with:

```js
/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue}'],
  theme: {
    extend: {
      colors: {
        // Nocturne palette (explicit, for new work)
        ink: {
          900: '#0E0D0B',
          800: '#141210',
          700: '#1C1916',
          600: '#26221D',
        },
        ivory: {
          DEFAULT: '#EDE6D6',
          dim: '#B8AE9C',
        },
        brass: {
          DEFAULT: '#C8A24B',
          bright: '#E3C06B',
        },
        line: {
          DEFAULT: 'rgba(237,230,214,0.08)',
          brass: 'rgba(200,162,75,0.45)',
        },
        // per-variant jewel accents
        chess: '#C8A24B',
        xiangqi: '#C8402F',
        shogi: '#3E5C8A',
        jungle: '#3E8C6F',
        // shadcn semantic tokens (values from :root, see Layout.astro)
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
      },
      fontFamily: {
        display: ['Fraunces', 'Georgia', 'serif'],
        sans: ['"Hanken Grotesk"', 'system-ui', 'sans-serif'],
        mono: ['"Spline Sans Mono"', 'ui-monospace', 'monospace'],
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      boxShadow: {
        panel: '0 24px 60px -20px rgba(0,0,0,0.7)',
      },
    },
  },
  plugins: [],
};
```

- [ ] **Step 2: Verify build**

Run: `cd apps/web && bun run build`
Expected: build succeeds (no Tailwind/config errors).

- [ ] **Step 3: Commit**

```bash
git add apps/web/tailwind.config.mjs
git commit -m "feat(ui): add Nocturne design tokens to Tailwind config"
```

---

### Task 2: Global styles, fonts, tokens, grain (Layout.astro)

**Files:**

- Modify: `apps/web/src/layouts/Layout.astro`

**Interfaces:**

- Consumes: Task 1 utilities.
- Produces: CSS vars in `:root` for shadcn tokens (Nocturne values); the loaded font families; a `.grain` body overlay; the `fade-in-up` keyframe + `prefers-reduced-motion` guard; the preserved `procyon-auth-*` hydration CSS. The static fallback nav in this file is removed in Task 7 (this task only touches `<head>`, `<body>` classes, and `<style>`).

- [ ] **Step 1: Swap fonts into `<head>`**

In the `<head>` (after the `<title>`), add before the Google GSI script:

```html
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link
  rel="stylesheet"
  href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,600;9..144,700&family=Hanken+Grotesk:wght@400;500;600;700&family=Spline+Sans+Mono:wght@400;500;600&display=swap"
/>
```

- [ ] **Step 2: Replace the `<body>` background classes**

Change the `<body class=...>` from the purple gradient to:

```astro
<body class='min-h-screen bg-ink-900 text-ivory overflow-x-hidden antialiased'
></body>
```

- [ ] **Step 3: Replace the `:root`/`.dark` token block**

In the `<style is:global>` block, replace the entire `:root { ... }` and `.dark { ... }` rules with a single Nocturne `:root` (delete the `.dark` block):

```css
:root {
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
}
```

- [ ] **Step 4: Remove decorative keyframes/utilities, keep `fade-in-up`, add grain + reduced-motion**

In the same `<style is:global>` block: delete the `@keyframes shimmer`, `@keyframes float`, `@keyframes glow`, `@keyframes gradient-shift`, `.animated-bg`, `.animate-float`, `.glass-effect` rules. Keep `@keyframes fade-in-up` and `.animate-fade-in-up`. Replace the `body { font-family: -apple-system... }` rule and the purple `body::before` radial-gradient with:

```css
body {
  font-family: 'Hanken Grotesk', system-ui, sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  position: relative;
}

/* Fixed film-grain overlay for lacquer depth */
body::before {
  content: '';
  position: fixed;
  inset: 0;
  pointer-events: none;
  z-index: -1;
  opacity: 0.04;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
}

@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.001ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.001ms !important;
  }
}
```

Keep the `* { border-color: hsl(var(--border)); }`, `#procyon-client-auth-nav`, and all `html.procyon-auth-*` rules unchanged.

- [ ] **Step 5: Verify build + grep gate**

Run: `cd apps/web && bun run build`
Expected: success.
Run: `grep -nE "glass-effect|animated-bg|from-indigo-900|via-purple-900" apps/web/src/layouts/Layout.astro`
Expected: only the static fallback nav (untouched here, removed in Task 7) may still match `via-purple`/gradient on the `<nav>`; everything in `<style>`/`<body>`/`<head>` is clean. Note this for Task 7.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/layouts/Layout.astro
git commit -m "feat(ui): Nocturne global styles, fonts, grain overlay, dark tokens"
```

---

### Task 3: Button primitive reskin

**Files:**

- Modify: `apps/web/src/components/ui/Button.tsx`

**Interfaces:**

- Consumes: Task 1 utilities, `cn` from `../../lib/utils`.
- Produces: `Button` / `buttonVariants` with variants `default` (brass), `destructive`, `outline` (brass hairline), `secondary`, `ghost`, `link`; sizes unchanged (`default|sm|lg|icon`). Same `ButtonProps` shape (no API change).

- [ ] **Step 1: Replace the `cva` definition**

Replace the `buttonVariants` `cva(...)` call (lines 5–32) with:

```tsx
const buttonVariants = cva(
  'inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium font-sans transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brass focus-visible:ring-offset-2 focus-visible:ring-offset-ink-900 disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        default: 'bg-brass text-ink-900 hover:bg-brass-bright',
        destructive: 'bg-[#C8402F] text-ivory hover:bg-[#D64A39]',
        outline:
          'border border-line-brass bg-transparent text-ivory hover:bg-ink-600',
        secondary: 'bg-ink-600 text-ivory hover:bg-ink-700',
        ghost: 'text-ivory-dim hover:bg-ink-600 hover:text-ivory',
        link: 'text-brass underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-10 px-4 py-2',
        sm: 'h-9 rounded-md px-3',
        lg: 'h-11 rounded-md px-8',
        icon: 'h-10 w-10',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
);
```

- [ ] **Step 2: Verify build**

Run: `cd apps/web && bun run build`
Expected: success.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/ui/Button.tsx
git commit -m "feat(ui): reskin Button to brass Nocturne variants"
```

---

### Task 4: Input primitive reskin

**Files:**

- Modify: `apps/web/src/components/ui/Input.tsx`

**Interfaces:**

- Consumes: `cn`. Produces: `Input` with the same `InputProps` shape.

- [ ] **Step 1: Replace the class string**

Replace the `cn(...)` class string (line 12) with:

```tsx
'flex h-10 w-full rounded-md border border-line bg-ink-800 px-3 py-2 text-sm text-ivory placeholder:text-ivory-dim/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brass focus-visible:border-line-brass disabled:cursor-not-allowed disabled:opacity-50 transition-colors',
```

- [ ] **Step 2: Verify build**

Run: `cd apps/web && bun run build`
Expected: success.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/ui/Input.tsx
git commit -m "feat(ui): reskin Input for Nocturne fields"
```

---

### Task 5: Panel primitive (new)

**Files:**

- Create: `apps/web/src/components/ui/Panel.tsx`

**Interfaces:**

- Consumes: `cn`. Produces: `Panel` — `React.FC<PanelProps>` where `PanelProps = React.HTMLAttributes<HTMLDivElement> & { accent?: 'chess'|'xiangqi'|'shogi'|'jungle'|'brass'; raised?: boolean }`. Renders a matte surface with hairline border, optional left accent edge, optional deeper surface+shadow. Used as the standard card/side-panel container in later tasks.

- [ ] **Step 1: Create the component**

```tsx
import React from 'react';
import { cn } from '../../lib/utils';

const accentBorder: Record<string, string> = {
  chess: 'border-l-2 border-l-chess',
  xiangqi: 'border-l-2 border-l-xiangqi',
  shogi: 'border-l-2 border-l-shogi',
  jungle: 'border-l-2 border-l-jungle',
  brass: 'border-l-2 border-l-brass',
};

export interface PanelProps extends React.HTMLAttributes<HTMLDivElement> {
  accent?: 'chess' | 'xiangqi' | 'shogi' | 'jungle' | 'brass';
  raised?: boolean;
}

export const Panel: React.FC<PanelProps> = ({
  accent,
  raised = false,
  className,
  children,
  ...props
}) => {
  return (
    <div
      className={cn(
        'rounded-lg border border-line',
        raised ? 'bg-ink-600 shadow-panel' : 'bg-ink-700',
        accent && accentBorder[accent],
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
};

export default Panel;
```

- [ ] **Step 2: Verify build**

Run: `cd apps/web && bun run build`
Expected: success (component is unused so far — confirms it compiles).

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/ui/Panel.tsx
git commit -m "feat(ui): add Panel primitive"
```

---

### Task 6: PageHeader component (new)

**Files:**

- Create: `apps/web/src/components/PageHeader.tsx`

**Interfaces:**

- Consumes: `cn`. Produces: `PageHeader` — `React.FC<{ eyebrow?: string; title: string; titleClassName?: string; accent?: 'chess'|'xiangqi'|'shogi'|'jungle'|'brass'; className?: string }>`. Renders eyebrow (uppercase, tracked, `ivory-dim`) → serif title (`font-display`) → accent hairline rule. `titleClassName` lets callers preserve heading text/level styling.

- [ ] **Step 1: Create the component**

```tsx
import React from 'react';
import { cn } from '../lib/utils';

const ruleColor: Record<string, string> = {
  chess: 'bg-chess',
  xiangqi: 'bg-xiangqi',
  shogi: 'bg-shogi',
  jungle: 'bg-jungle',
  brass: 'bg-brass',
};

export interface PageHeaderProps {
  eyebrow?: string;
  title: string;
  titleClassName?: string;
  accent?: 'chess' | 'xiangqi' | 'shogi' | 'jungle' | 'brass';
  className?: string;
}

export const PageHeader: React.FC<PageHeaderProps> = ({
  eyebrow,
  title,
  titleClassName,
  accent = 'brass',
  className,
}) => {
  return (
    <header className={cn('mb-10', className)}>
      {eyebrow && (
        <p className='mb-3 text-xs font-mono uppercase tracking-[0.25em] text-ivory-dim'>
          {eyebrow}
        </p>
      )}
      <h1
        className={cn(
          'font-display text-4xl sm:text-5xl font-semibold text-ivory',
          titleClassName
        )}
      >
        {title}
      </h1>
      <div className={cn('mt-5 h-px w-24', ruleColor[accent])} />
    </header>
  );
};

export default PageHeader;
```

- [ ] **Step 2: Verify build**

Run: `cd apps/web && bun run build`
Expected: success.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/PageHeader.tsx
git commit -m "feat(ui): add PageHeader component"
```

---

### Task 7: App-shell (sidebar + mobile bottom nav)

**Files:**

- Create: `apps/web/src/components/AppShell.tsx`
- Modify: `apps/web/src/components/AppNavBar.tsx`
- Modify: `apps/web/src/layouts/Layout.astro`

**Interfaces:**

- Consumes: `useAuth` from `../lib/auth`, `Button`, `cn`. Produces: `AppShell` default export — the hydrated client nav (desktop left rail ≥`lg` + mobile bottom tab bar) that sets `procyon-auth-hydrated` on mount (same effect AppNavBar had). `AppNavBar` is re-pointed to render `AppShell` (kept as a thin re-export so existing imports/`client:only` usage keep working). Layout.astro's static fallback nav becomes a Nocturne top bar and `<main>` gets left padding on `lg` for the rail.

**Notes:** Nav items: Play (`/`), Puzzles (`/puzzles`), History (`/play-history`), Ratings (`/profile#ratings` → use `/profile`), Profile (`/profile`). Use the current route via `window.location.pathname` for the active tick. Keep the "Login" link/button (anonymous) and the Sign Out action (authenticated) — both are E2E-pinned.

- [ ] **Step 1: Create `AppShell.tsx`**

```tsx
import React, { useEffect, useState } from 'react';
import { useAuth } from '../lib/auth';
import { cn } from '../lib/utils';

interface NavItem {
  label: string;
  href: string;
  icon: string; // unicode glyph
}

const NAV: NavItem[] = [
  { label: 'Play', href: '/', icon: '♟' },
  { label: 'Puzzles', href: '/puzzles', icon: '◆' },
  { label: 'History', href: '/play-history', icon: '≡' },
  { label: 'Profile', href: '/profile', icon: '◐' },
];

export function AppShell() {
  const { user, logout, isAuthenticated, loading } = useAuth();
  const [path, setPath] = useState('/');

  useEffect(() => {
    setPath(window.location.pathname);
    document.documentElement.classList.add('procyon-auth-hydrated');
    document.documentElement.classList.remove('procyon-auth-client-pending');
  }, []);

  const isActive = (href: string) =>
    href === '/' ? path === '/' : path.startsWith(href);

  const handleLogout = async () => {
    const result = await logout();
    if (!result.success) alert('Failed to sign out. Please try again.');
  };

  const userChip = loading ? (
    <div className='h-10' aria-hidden='true' />
  ) : isAuthenticated ? (
    <div className='flex items-center gap-3'>
      <div className='flex h-9 w-9 items-center justify-center rounded-full bg-brass text-ink-900 text-sm font-bold'>
        {user?.username.charAt(0).toUpperCase()}
      </div>
      <div className='min-w-0 flex-1'>
        <div className='truncate text-sm text-ivory'>{user?.username}</div>
        <button
          onClick={handleLogout}
          className='text-xs text-ivory-dim hover:text-brass transition-colors'
        >
          Sign Out
        </button>
      </div>
    </div>
  ) : (
    <a
      href='/login'
      className='inline-flex h-10 w-full items-center justify-center rounded-md bg-brass px-4 text-sm font-medium text-ink-900 hover:bg-brass-bright transition-colors'
    >
      Login
    </a>
  );

  return (
    <>
      {/* Desktop left rail */}
      <aside className='fixed inset-y-0 left-0 z-50 hidden w-60 flex-col border-r border-line bg-ink-800 px-4 py-6 lg:flex'>
        <a href='/' className='mb-10 flex items-center gap-3'>
          <span className='flex h-9 w-9 items-center justify-center rounded-full bg-brass text-ink-900 text-lg'>
            ♔
          </span>
          <span className='font-display text-xl font-semibold tracking-wide text-ivory'>
            PROCYON
          </span>
        </a>
        <nav className='flex flex-1 flex-col gap-1'>
          {NAV.map(item => (
            <a
              key={item.href}
              href={item.href}
              className={cn(
                'group flex items-center gap-3 rounded-md border-l-2 px-3 py-2 text-sm transition-colors',
                isActive(item.href)
                  ? 'border-l-brass bg-ink-700 text-brass'
                  : 'border-l-transparent text-ivory-dim hover:bg-ink-600 hover:text-ivory'
              )}
            >
              <span className='w-4 text-center'>{item.icon}</span>
              {item.label}
            </a>
          ))}
        </nav>
        <div className='mt-6 border-t border-line pt-4'>{userChip}</div>
      </aside>

      {/* Mobile bottom tab bar */}
      <nav className='fixed inset-x-0 bottom-0 z-50 flex border-t border-line bg-ink-800/95 backdrop-blur lg:hidden'>
        {NAV.map(item => (
          <a
            key={item.href}
            href={item.href}
            aria-label={item.label}
            className={cn(
              'flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] transition-colors',
              isActive(item.href)
                ? 'text-brass'
                : 'text-ivory-dim hover:text-ivory'
            )}
          >
            <span className='text-base'>{item.icon}</span>
            {item.label}
          </a>
        ))}
        {!loading && !isAuthenticated && (
          <a
            href='/login'
            aria-label='Login'
            className='flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] text-brass'
          >
            <span className='text-base'>→</span>
            Login
          </a>
        )}
      </nav>
    </>
  );
}

export default AppShell;
```

- [ ] **Step 2: Re-point `AppNavBar.tsx` to the shell**

Replace the entire contents of `apps/web/src/components/AppNavBar.tsx` with a thin re-export (existing `client:only='react'` usage in Layout keeps resolving):

```tsx
export { AppShell as AppNavBar, default } from './AppShell';
```

- [ ] **Step 3: Restyle the static fallback nav + main padding in `Layout.astro`**

In `Layout.astro`, replace the server fallback `<nav>...</nav>` (inside `#procyon-server-auth-nav`) with a slim Nocturne top bar (shown pre-hydration / no-JS):

```astro
<nav class='fixed top-0 left-0 right-0 z-40 border-b border-line bg-ink-800'>
  <div class='mx-auto flex h-16 max-w-6xl items-center justify-between px-4'>
    <a href='/' class='flex items-center gap-3'>
      <span
        class='flex h-8 w-8 items-center justify-center rounded-full bg-brass text-ink-900 text-lg'
      >
        ♔
      </span>
      <span class='font-display text-lg font-semibold tracking-wide text-ivory'>
        PROCYON
      </span>
    </a>
    <a
      href='/login'
      data-auth-anonymous
      class='inline-flex h-9 items-center justify-center rounded-md bg-brass px-4 text-sm font-medium text-ink-900 hover:bg-brass-bright'
    >
      Login
    </a>
  </div>
</nav>
```

Then update `<main>` so content clears the rail on desktop and the bottom bar on mobile:

```astro
<main class={showNav ? 'lg:pl-60 pt-16 pb-20 lg:pt-0 lg:pb-0' : ''}>
  <slot />
</main>
```

- [ ] **Step 4: Verify build + grep gate**

Run: `cd apps/web && bun run build`
Expected: success.
Run: `grep -nE "from-purple|via-purple|glass-effect|bg-clip-text|from-yellow-400" apps/web/src/layouts/Layout.astro apps/web/src/components/AppShell.tsx apps/web/src/components/AppNavBar.tsx`
Expected: no output.

- [ ] **Step 5: Verify hydration + nav E2E**

Start servers if not running (`bun run dev`). Run: `cd apps/web && bunx playwright test e2e/auth-basic.spec.ts`
Expected: PASS (Login link, Sign Out flow, anti-flash still work).
Visual check: desktop shows left rail with active tick; mobile (<1024px) shows bottom tab bar; no purple anywhere.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/AppShell.tsx apps/web/src/components/AppNavBar.tsx apps/web/src/layouts/Layout.astro
git commit -m "feat(ui): responsive sidebar app-shell with brass nav"
```

---

## Phase 2 — Homepage

### Task 8: Per-variant board previews

**Files:**

- Modify: `apps/web/src/components/ChessBoardPreview.tsx`

**Interfaces:**

- Produces: `ChessBoardPreview` now accepts `{ variant?: 'chess'|'xiangqi'|'shogi'|'jungle' }` and tints the board squares per variant (default `chess`). Backward compatible (no props → chess colors). Consumed by `ChessGameCard` (Task 9).

- [ ] **Step 1: Add variant tinting**

Replace the component body with:

```tsx
import React from 'react';

type Variant = 'chess' | 'xiangqi' | 'shogi' | 'jungle';

const PALETTE: Record<Variant, { light: string; dark: string }> = {
  chess: { light: '#2A2620', dark: '#1C1916' },
  xiangqi: { light: '#3A211C', dark: '#241513' },
  shogi: { light: '#23283A', dark: '#181B26' },
  jungle: { light: '#1F3029', dark: '#15211C' },
};

const ChessBoardPreview: React.FC<{ variant?: Variant }> = ({
  variant = 'chess',
}) => {
  const boardSize = 8;
  const squareSize = 20;
  const { light, dark } = PALETTE[variant];

  const squares = [];
  for (let row = 0; row < boardSize; row++) {
    for (let col = 0; col < boardSize; col++) {
      const isLight = (row + col) % 2 === 0;
      squares.push(
        <rect
          key={`${row}-${col}`}
          x={col * squareSize}
          y={row * squareSize}
          width={squareSize}
          height={squareSize}
          fill={isLight ? light : dark}
        />
      );
    }
  }

  return (
    <svg
      width={boardSize * squareSize}
      height={boardSize * squareSize}
      viewBox={`0 0 ${boardSize * squareSize} ${boardSize * squareSize}`}
    >
      {squares}
    </svg>
  );
};

export default ChessBoardPreview;
```

- [ ] **Step 2: Verify build**

Run: `cd apps/web && bun run build`
Expected: success.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/ChessBoardPreview.tsx
git commit -m "feat(ui): per-variant board preview tints"
```

---

### Task 9: Game card reskin

**Files:**

- Modify: `apps/web/src/components/ChessGameCard.tsx`

**Interfaces:**

- Consumes: `Button`, `Panel` (Task 5), `ChessBoardPreview` (Task 8). Produces: `ChessGameCard` with the same props plus `variant?: 'chess'|'xiangqi'|'shogi'|'jungle'` (default `chess`) for accent + preview tint. The CTA text stays `Play {title}` (no ✨). The card title text is unchanged.

- [ ] **Step 1: Replace the component**

```tsx
import React from 'react';
import { Button } from './ui/Button';
import { Panel } from './ui/Panel';
import ChessBoardPreview from './ChessBoardPreview';

type Variant = 'chess' | 'xiangqi' | 'shogi' | 'jungle';

interface ChessGameCardProps {
  title: string;
  description: string;
  variant?: Variant;
  onPlay: () => void;
}

const ChessGameCard: React.FC<ChessGameCardProps> = ({
  title,
  description,
  variant = 'chess',
  onPlay,
}) => {
  return (
    <Panel
      accent={variant}
      className='group flex h-full flex-col overflow-hidden transition-transform duration-300 hover:-translate-y-0.5 hover:shadow-panel'
    >
      <div className='flex aspect-video flex-shrink-0 items-center justify-center bg-ink-800'>
        <ChessBoardPreview variant={variant} />
      </div>
      <div className='flex flex-grow flex-col p-6'>
        <h3 className='mb-3 min-h-[2rem] font-display text-2xl font-semibold text-ivory'>
          {title}
        </h3>
        <p className='mb-6 min-h-[4.5rem] flex-grow leading-relaxed text-ivory-dim'>
          {description}
        </p>
        <Button onClick={onPlay} className='mt-auto w-full'>
          Play {title}
        </Button>
      </div>
    </Panel>
  );
};

export default ChessGameCard;
```

- [ ] **Step 2: Verify build + grep gate**

Run: `cd apps/web && bun run build`
Expected: success.
Run: `grep -nE "from-purple|to-pink|glass-effect|bg-clip-text|✨" apps/web/src/components/ChessGameCard.tsx`
Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/ChessGameCard.tsx
git commit -m "feat(ui): reskin game card as Nocturne panel"
```

---

### Task 10: Homepage hero + selector

**Files:**

- Modify: `apps/web/src/components/ChessGameSelector.tsx`
- Modify: `apps/web/src/pages/index.astro`

**Interfaces:**

- Consumes: `ChessGameCard` (Task 9). Produces: selector passing a `variant` per game; homepage hero with `PageHeader`-style masthead. **`data-testid="game-cards"` + `data-hydrated` preserved. The card titles and the h1 text `Procyon Chess` are unchanged** (E2E-pinned). Tagline "Four games. One board room." added as supporting copy.

- [ ] **Step 1: Add variants in the selector**

In `ChessGameSelector.tsx`, extend each `chessGames` entry with a `variant` and pass it through. Replace the `chessGames` array and the `ChessGameCard` render:

```tsx
const chessGames = [
  {
    title: 'Standard Chess',
    description: 'Classic chess with game mode and interactive tutorials.',
    variant: 'chess' as const,
  },
  {
    title: 'Chinese Chess',
    description: 'Traditional Xiangqi with unique pieces and board layout.',
    variant: 'xiangqi' as const,
  },
  {
    title: 'Japanese Chess (Shogi)',
    description:
      'Traditional Japanese chess with unique piece movement and drops.',
    variant: 'shogi' as const,
  },
  {
    title: 'Jungle Chess (鬥獸棋)',
    description:
      'Animal-themed strategy game with unique terrain and piece hierarchy.',
    variant: 'jungle' as const,
  },
];
```

And in the `.map(...)`, pass `variant={game.variant}` to `<ChessGameCard>`. Keep the existing `data-testid='game-cards'`, `data-hydrated`, and `animate-fade-in-up` stagger wrapper. Replace the grid wrapper classes if needed but keep `data-testid`.

- [ ] **Step 2: Replace the homepage hero (`index.astro`)**

Replace the whole `<Layout>` body with:

```astro
<Layout title='Chess Games'>
  <div class='mx-auto max-w-6xl px-6 py-16 sm:py-20'>
    <header class='mb-14 animate-fade-in-up'>
      <p
        class='mb-4 font-mono text-xs uppercase tracking-[0.3em] text-ivory-dim'
      >
        The Board Room
      </p>
      <h1 class='font-display text-5xl font-semibold text-ivory sm:text-7xl'>
        Procyon Chess
      </h1>
      <p class='mt-6 max-w-xl text-lg leading-relaxed text-ivory-dim'>
        Four games. One board room. Play Chess, Xiangqi, Shogi, and Jungle
        against adaptive AI opponents.
      </p>
      <div class='mt-8 h-px w-32 bg-brass'></div>
    </header>
    <ChessGameSelector client:load />
  </div>
</Layout>
```

(Keep the `import` lines in the frontmatter.)

- [ ] **Step 3: Verify build + grep gate**

Run: `cd apps/web && bun run build`
Expected: success.
Run: `grep -nE "from-cyan|via-purple|animate-float|animate-ping|bg-clip-text|text-purple" apps/web/src/pages/index.astro apps/web/src/components/ChessGameSelector.tsx`
Expected: no output.

- [ ] **Step 4: Homepage E2E**

Run: `cd apps/web && bunx playwright test e2e/homepage.spec.ts`
Expected: PASS (`game-cards` hydrates; `Procyon Chess` heading; `Play Standard Chess`/`Play Chinese Chess` buttons resolve).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/pages/index.astro apps/web/src/components/ChessGameSelector.tsx
git commit -m "feat(ui): Nocturne homepage hero and game grid"
```

---

## Phase 3 — Game pages

### Task 11: Game page layout shell

**Files:**

- Modify: `apps/web/src/components/GamePageLayout.tsx`

**Interfaces:**

- Produces: `GamePageLayout` accepting `{ variant: 'chess'|'shogi'|'xiangqi'; title?: string; showBackButton?: boolean; children }` (adds `title?` to stop the ignored-prop drift from `xiangqi.astro`/`shogi.astro`). Removes decorative blobs; back button restyled to Nocturne; thin variant accent rule at top. Back-button text `Back to Game Selection` unchanged.

- [ ] **Step 1: Replace the component**

```tsx
import React from 'react';

interface GamePageLayoutProps {
  variant: 'chess' | 'shogi' | 'xiangqi';
  title?: string;
  showBackButton?: boolean;
  children: React.ReactNode;
}

const accentBar: Record<GamePageLayoutProps['variant'], string> = {
  chess: 'bg-chess',
  shogi: 'bg-shogi',
  xiangqi: 'bg-xiangqi',
};

export default function GamePageLayout({
  variant,
  title: _title,
  showBackButton = true,
  children,
}: GamePageLayoutProps) {
  return (
    <div className='min-h-screen'>
      <div className={`h-0.5 w-full ${accentBar[variant]}`} />
      <div className='mx-auto max-w-6xl px-4 py-8'>
        {showBackButton && (
          <a
            href='/'
            className='mb-8 inline-flex items-center gap-2 rounded-md border border-line px-4 py-2 text-sm text-ivory-dim transition-colors hover:border-line-brass hover:text-ivory'
          >
            <svg
              width='18'
              height='18'
              viewBox='0 0 24 24'
              fill='none'
              stroke='currentColor'
              strokeWidth='2'
              strokeLinecap='round'
              strokeLinejoin='round'
            >
              <path d='M19 12H5M12 19l-7-7 7-7' />
            </svg>
            Back to Game Selection
          </a>
        )}
        {children}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify build + grep gate**

Run: `cd apps/web && bun run build`
Expected: success.
Run: `grep -nE "animate-pulse|animate-ping|animate-spin|from-purple|from-red-500|glass-effect" apps/web/src/components/GamePageLayout.tsx`
Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/GamePageLayout.tsx
git commit -m "feat(ui): reskin game page layout shell"
```

---

### Task 12: Jungle page wrapper + game chrome

**Files:**

- Modify: `apps/web/src/pages/jungle.astro`
- Modify: `apps/web/src/components/JungleGame.tsx`

**Interfaces:**

- Produces: `jungle.astro` without its own purple/green gradient wrapper (consistent container, jungle accent rule); `JungleGame` chrome (headings, panels, buttons, captured/move areas) restyled via the mapping. **All control/heading text preserved.**

- [ ] **Step 1: Replace `jungle.astro` body**

```astro
<Layout title='Jungle Chess (鬥獸棋) - Procyon'>
  <main class='min-h-screen'>
    <div class='h-0.5 w-full bg-jungle'></div>
    <div class='mx-auto max-w-6xl px-4 py-8'>
      <JungleGame client:load />
    </div>
  </main>
</Layout>
```

- [ ] **Step 2: Apply the restyle mapping to `JungleGame.tsx`**

Apply the Restyle conventions table to every className in `JungleGame.tsx`. Use `accent = jungle` for emphasis (active highlights, headings rules). Wrap side/info panels in the matte panel style (`bg-ink-700 border border-line rounded-lg`). Add `font-mono` to any score/coordinate/timer text and `font-display` to the main heading. Do NOT change any button/heading text or `onClick`/state logic.

- [ ] **Step 3: Verify build + grep gate**

Run: `cd apps/web && bun run build`
Expected: success.
Run the grep gate on both files.
Expected: no output.

- [ ] **Step 4: Jungle visual check**

Visual check at `/jungle`: jungle-green accent, matte panels, no purple/green gradient, controls work and read correctly.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/pages/jungle.astro apps/web/src/components/JungleGame.tsx
git commit -m "feat(ui): Nocturne reskin for Jungle page"
```

---

### Task 13: Chess / Xiangqi / Shogi game chrome + boards

**Files:**

- Modify: `apps/web/src/components/ChessGame.tsx`
- Modify: `apps/web/src/components/XiangqiGame.tsx`
- Modify: `apps/web/src/components/ShogiGame.tsx`
- Modify: `apps/web/src/components/ChessBoard.tsx`
- Modify: `apps/web/src/components/XiangqiBoard.tsx`
- Modify: `apps/web/src/components/ShogiBoard.tsx`
- Modify: `apps/web/src/components/ShogiHand.tsx`
- Also referenced: `apps/web/src/components/AIConfigPanel.tsx`, `apps/web/src/components/game/*`, `apps/web/src/components/RatingBadge.tsx` (apply mapping if their classes match the gate)

**Interfaces:**

- Produces: fully restyled in-game chrome (move history, AI config panel, captured pieces, status banners, dialogs) and board framing/square colors for the three variants. Accent per file: ChessGame=`chess`, XiangqiGame=`xiangqi`, ShogiGame=`shogi`. **Board square/coordinate colors change; move/selection/highlight LOGIC and all text/emoji/`data-testid` stay identical.**

This is a large, mechanical reskin. Do it one file at a time, build between files.

- [ ] **Step 1: Restyle `ChessBoard.tsx`**

Apply the mapping to the board frame, border, and coordinate labels. For light/dark squares, use Nocturne board tones: light `#2A2620`, dark `#1C1916`; selected square highlight `ring-2 ring-brass` (or fill `rgba(200,162,75,0.35)`); legal-move dots `bg-brass/70`; last-move/check highlight keep behavior but recolor to brass/cinnabar. Preserve all coordinates, piece glyphs, and click handlers.

- [ ] **Step 2: Build**

Run: `cd apps/web && bun run build`
Expected: success.

- [ ] **Step 3: Restyle `ChessGame.tsx`**

Apply the full mapping to all chrome (status text, move list, captured pieces, AI settings panel, buttons). Add `font-mono` to move notation/clock/eval and `font-display` to the game title heading (`Standard Chess`/`Classical Chess`). Use `<Panel>` for grouped side content where convenient. **Do not change** any button text (`⚙️ AI Settings`, `🆕 New Game`, `🎮 Play Again`, `▶️ Start`, `📚 Tutorial Mode`, `Hint`, etc.), headings, or `data-testid`s.

- [ ] **Step 4: Build + grep gate (Chess)**

Run: `cd apps/web && bun run build`
Run the grep gate on `ChessBoard.tsx` + `ChessGame.tsx`.
Expected: success / no output.

- [ ] **Step 5: Repeat Steps 1–4 for Xiangqi**

Restyle `XiangqiBoard.tsx` (board lines/river/palace recolored to ink + cinnabar accent; keep piece text) and `XiangqiGame.tsx` (accent `xiangqi`). Preserve heading `Chinese Chess (象棋)` and all controls. Build + grep gate.

- [ ] **Step 6: Repeat Steps 1–4 for Shogi**

Restyle `ShogiBoard.tsx`, `ShogiHand.tsx`, and `ShogiGame.tsx` (accent `shogi`; indigo highlights). Preserve heading `将棋 (Shogi)`, the promotion dialog `成りますか？`, the `Promote` button, drops-from-hand behavior, and all controls. Build + grep gate.

- [ ] **Step 7: Restyle shared `AIConfigPanel.tsx` + `game/*` + `RatingBadge.tsx` if flagged**

Run the grep gate across `apps/web/src/components/AIConfigPanel.tsx apps/web/src/components/game/*.tsx apps/web/src/components/RatingBadge.tsx`. For any file with matches, apply the mapping. Preserve headings `AI Configuration`, `AI Settings`, `Saved Configurations` and buttons `Save Configuration`, `Set Active`. Build.

- [ ] **Step 8: Game E2E**

Run (servers up): `cd apps/web && bunx playwright test e2e/chess-ai-simple.spec.ts e2e/xiangqi-ai.spec.ts e2e/shogi-ai.spec.ts`
Expected: PASS.
Visual check `/chess`, `/xiangqi`, `/shogi`: correct accent, matte panels, readable boards, working controls.

- [ ] **Step 9: Commit**

```bash
git add apps/web/src/components/ChessGame.tsx apps/web/src/components/XiangqiGame.tsx apps/web/src/components/ShogiGame.tsx apps/web/src/components/ChessBoard.tsx apps/web/src/components/XiangqiBoard.tsx apps/web/src/components/ShogiBoard.tsx apps/web/src/components/ShogiHand.tsx apps/web/src/components/AIConfigPanel.tsx apps/web/src/components/game apps/web/src/components/RatingBadge.tsx
git commit -m "feat(ui): Nocturne reskin for chess/xiangqi/shogi boards and chrome"
```

---

## Phase 4 — Remaining pages

### Task 14: Auth pages (login, register, forms)

**Files:**

- Modify: `apps/web/src/pages/login.astro`
- Modify: `apps/web/src/pages/register.astro`
- Modify: `apps/web/src/components/LoginForm.tsx`
- Modify: `apps/web/src/components/RegisterForm.tsx`
- Modify: `apps/web/src/components/GoogleSignInButton.tsx`

**Interfaces:**

- Produces: Nocturne auth screens. **Preserve:** `showNav={false}`, link text `← Back to home`, the `data-testid="google-signin-button"`, and form button text (`Sign In`, `Sign Up`). The decorative particle blobs are removed; h1 keeps reading `Procyon Chess` (heading is E2E-checked elsewhere but safe to keep).

- [ ] **Step 1: Replace `login.astro` body**

```astro
<Layout title='Sign In - Procyon Chess' showNav={false}>
  <div class='flex min-h-screen items-center justify-center px-4 py-12'>
    <div class='w-full max-w-md'>
      <div class='mb-8 text-center'>
        <span
          class='mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-brass text-xl text-ink-900'
        >
          ♔
        </span>
        <h1 class='font-display text-3xl font-semibold text-ivory'>
          Procyon Chess
        </h1>
        <p class='mt-2 text-ivory-dim'>Welcome back to the board room.</p>
      </div>
      <LoginForm client:load />
      <div class='mt-8 text-center'>
        <a href='/' class='text-ivory-dim transition-colors hover:text-brass'>
          ← Back to home
        </a>
      </div>
    </div>
  </div>
</Layout>
```

- [ ] **Step 2: Replace `register.astro` body**

Same as Step 1 but `title='Sign Up - Procyon Chess'`, subhead `Join the board room.`, and `<RegisterForm client:load />`.

- [ ] **Step 3: Apply mapping to the three form components**

Apply the Restyle conventions to `LoginForm.tsx`, `RegisterForm.tsx`, `GoogleSignInButton.tsx` (use `<Panel>` for the form card, `<Input>`/`<Button>` already reskinned). Keep `data-testid="google-signin-button"` and all button text.

- [ ] **Step 4: Verify build + grep gate + E2E**

Run: `cd apps/web && bun run build` and the grep gate on all five files.
Run (servers up): `cd apps/web && bunx playwright test e2e/auth.spec.ts`
Expected: success / no output / PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/pages/login.astro apps/web/src/pages/register.astro apps/web/src/components/LoginForm.tsx apps/web/src/components/RegisterForm.tsx apps/web/src/components/GoogleSignInButton.tsx
git commit -m "feat(ui): Nocturne auth pages and forms"
```

---

### Task 15: Profile + ratings

**Files:**

- Modify: `apps/web/src/components/ProfilePage.tsx`
- Modify: `apps/web/src/components/RatingsSection.tsx`
- Modify: `apps/web/src/components/RatingBadge.tsx` (if not already done in Task 13)

**Interfaces:**

- Produces: Nocturne profile. **Preserve** `data-testid="profile-page"`, headings `Profile`, `Your Ratings`, `Access Denied`, and the rating `columnheader` `Rating`. Use `<PageHeader>` (eyebrow "Account", title `Profile`) at the top; `<Panel>` for sections; `font-mono` for all rating/ELO/numeric cells.

- [ ] **Step 1: Restyle `ProfilePage.tsx`**

Wrap the page content in `<div class='mx-auto max-w-4xl px-6 py-12'>`, add a `PageHeader` with `title="Profile"` (keep an element with the accessible heading name `Profile`), apply the mapping, and put each section in a `<Panel>`. Keep `data-testid="profile-page"` on the root.

- [ ] **Step 2: Restyle `RatingsSection.tsx` (+ `RatingBadge.tsx`)**

Apply the mapping; numbers get `font-mono`. Keep the heading `Your Ratings` and any `columnheader` named `Rating`.

- [ ] **Step 3: Verify build + grep gate + E2E**

Run: `cd apps/web && bun run build` and the grep gate.
Run (servers up): `cd apps/web && bunx playwright test e2e/rating-system.spec.ts`
Expected: success / no output / PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/ProfilePage.tsx apps/web/src/components/RatingsSection.tsx apps/web/src/components/RatingBadge.tsx
git commit -m "feat(ui): Nocturne profile and ratings"
```

---

### Task 16: Play history

**Files:**

- Modify: `apps/web/src/components/PlayHistoryPage.tsx`

**Interfaces:**

- Produces: Nocturne play-history. **Preserve** `data-testid="play-history-guest"`, headings `Play History`, `Sign in to view your play history`, and buttons `Go to Login`/`Go to Profile` if present. `PageHeader` (eyebrow "Archive", title `Play History`), `<Panel>` rows/cards, `font-mono` for dates/results/ratings.

- [ ] **Step 1: Restyle `PlayHistoryPage.tsx`**

Apply the mapping; wrap in `mx-auto max-w-4xl px-6 py-12`; add the `PageHeader`; keep all guest-state markup + `data-testid`.

- [ ] **Step 2: Verify build + grep gate + E2E**

Run: `cd apps/web && bun run build` and the grep gate.
Run (servers up): `cd apps/web && bunx playwright test e2e/game-history.spec.ts`
Expected: success / no output / PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/PlayHistoryPage.tsx
git commit -m "feat(ui): Nocturne play history"
```

---

### Task 17: Puzzles

**Files:**

- Modify: `apps/web/src/components/PuzzlesPage.tsx`
- Also: `apps/web/src/components/puzzle/*` (apply mapping where the gate flags)

**Interfaces:**

- Produces: Nocturne puzzles. **Preserve** headings `Chess Puzzles`, `Basic Piece Movement`, `Back Rank Mate`, and buttons `Hint`, `Back to puzzles`, `Close`, plus puzzle titles matched by regex (`Smothered Mate`, etc.). `PageHeader` (eyebrow "Training", title `Chess Puzzles`), `<Panel>` cards, `font-mono` for ratings/move counts.

- [ ] **Step 1: Restyle `PuzzlesPage.tsx` + `puzzle/*`**

Apply the mapping; wrap in `mx-auto max-w-5xl px-6 py-12`; add the `PageHeader`. Run the grep gate across `apps/web/src/components/puzzle/*` and restyle any flagged files. Preserve all puzzle titles/headings/buttons.

- [ ] **Step 2: Verify build + grep gate + E2E**

Run: `cd apps/web && bun run build` and the grep gate.
Run (servers up): `cd apps/web && bunx playwright test e2e/critical-user-journeys.spec.ts`
Expected: success / no output / PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/PuzzlesPage.tsx apps/web/src/components/puzzle
git commit -m "feat(ui): Nocturne puzzles"
```

---

## Phase 5 — Finalize

### Task 18: Repo-wide gate, lint, full test sweep

**Files:** none (verification only; small fixups allowed).

- [ ] **Step 1: Repo-wide grep gate**

Run:

```bash
grep -rnE "from-indigo-900|via-purple-900|from-purple-[0-9]|to-pink-[0-9]|from-cyan-|glass-effect|bg-clip-text|text-purple-[0-9]|animate-float|animated-bg" apps/web/src
```

Expected: no output. Fix any stragglers (apply mapping), rebuild, and `git add`/commit per file.

- [ ] **Step 2: Lint + format**

Run: `bun run lint`
Expected: passes (fix with `bun run lint:fix` + `bun run format` if needed).

- [ ] **Step 3: Unit tests (must be untouched/green)**

Run: `cd apps/web && bun test src`
Expected: PASS (game-logic tests unaffected).

- [ ] **Step 4: Full E2E**

Run (servers up, or rely on CI auto-start): `bun run test:e2e`
Expected: PASS. Triage any failure: if it's a selector that changed due to markup, update the test locator (allowed); if it's pinned text, restore the text.

- [ ] **Step 5: Final visual pass**

Walk every route: `/`, `/chess`, `/xiangqi`, `/shogi`, `/jungle`, `/puzzles`, `/play-history`, `/profile`, `/login`, `/register` at desktop + mobile widths. Confirm: no purple/gradient/particles; brass-on-lacquer everywhere; correct per-variant accents; sidebar (desktop) / bottom bar (mobile); fonts loaded (serif titles, grotesk body, mono numerals); focus rings brass; reduced-motion respected.

- [ ] **Step 6: Commit any fixups**

```bash
git add -A
git commit -m "chore(ui): final Nocturne cleanup, lint, and test fixups"
```

---

## Self-Review (completed during planning)

- **Spec coverage:** tokens (T1–T2), typography (T2), app-shell (T7), motion (T2 + removals throughout), page-header pattern (T6 + applied T15–17), homepage (T8–10), game pages + visual-only board reskin (T11–13), profile/history/puzzles/ratings/auth (T14–17), grain texture (T2), per-variant accents (T1 tokens + applied per page), constraints/non-goals (Global Constraints + grep gate + E2E) — all mapped to tasks.
- **Placeholder scan:** new/small files have complete code; large-file reskins reference the authoritative Restyle conventions table (concrete find/replace pairs) plus per-file specifics — no "TBD"/"handle edge cases"/vague steps.
- **Type/name consistency:** `Panel` props (`accent`, `raised`), `PageHeader` props (`eyebrow`, `title`, `titleClassName`, `accent`), `ChessBoardPreview`/`ChessGameCard` `variant`, and `GamePageLayout` added `title?` are consistent across producing and consuming tasks.
- **Constraint cross-check:** E2E-pinned strings, `data-testid`s, and the auth hydration mechanism are called out in Global Constraints and reasserted in each task that touches them.
