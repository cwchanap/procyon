# Procyon UI Redesign — "The Board Room" (Nocturne / Lacquer & Brass)

**Date:** 2026-06-22
**Status:** Approved design — ready for implementation planning
**Scope:** Whole app, all pages (`apps/web`)

## 1. Goal & Motivation

The current UI uses a generic, "AI-default" aesthetic: an indigo→purple→pink
gradient background, gradient-clipped text everywhere, glassmorphism cards,
animated floating/pulsing/spinning particle blobs, ✨ emoji on buttons, and
system fonts. It lacks a distinctive identity.

This redesign gives Procyon a cohesive, memorable visual identity — **Nocturne:
Lacquer & Brass** — a refined, dark "premium games room" that unifies the four
game variants (Chess, Xiangqi, Shogi, Jungle) under one board-room while letting
each keep its own jewel-tone accent. It also restructures global navigation into
a responsive **sidebar app-shell**.

This is a presentation/layout redesign. **No game logic, move validation, AI
orchestration, API, or data-model changes.** Board components are reskinned
visually only.

## 2. Aesthetic Direction

**Nocturne — Lacquer & Brass** (dark theme). Brass/gold on near-black lacquer,
warm ivory text, characterful serif display over a humanist grotesk body, deep
soft shadows, hairline borders, and a subtle film-grain texture for depth.
Restrained, intentional motion. A hard departure from the current purple look.

## 3. Design Tokens

These become CSS variables in `Layout.astro`'s global style and are surfaced
through `tailwind.config.mjs`. The existing shadcn HSL token block is replaced
by the Nocturne palette (light/`.dark` shadcn blocks removed — the app is
single-theme dark).

### Color

| Token          | Value                    | Use                             |
| -------------- | ------------------------ | ------------------------------- |
| `ink-900`      | `#0E0D0B`                | App background (lacquer black)  |
| `ink-800`      | `#141210`                | Base panel                      |
| `ink-700`      | `#1C1916`                | Raised panel                    |
| `ink-600`      | `#26221D`                | Hover / active surface          |
| `ivory`        | `#EDE6D6`                | Primary text                    |
| `ivory-dim`    | `#B8AE9C`                | Secondary / muted text          |
| `brass`        | `#C8A24B`                | House accent, active nav, CTAs  |
| `brass-bright` | `#E3C06B`                | Hover / focus of brass elements |
| `line`         | `rgba(237,230,214,0.08)` | Hairline borders                |
| `line-brass`   | `rgba(200,162,75,0.45)`  | Emphasis / active borders       |

### Per-variant accents

Each game is keyed by a single jewel tone, used for its card, page header rule,
active highlights, and board framing.

| Variant    | Token     | Value                               |
| ---------- | --------- | ----------------------------------- |
| ♔ Chess    | `chess`   | `#C8A24B` (brass — the house color) |
| 將 Xiangqi | `xiangqi` | `#C8402F` (cinnabar)                |
| 香 Shogi   | `shogi`   | `#3E5C8A` (indigo)                  |
| 虎 Jungle  | `jungle`  | `#3E8C6F` (jade)                    |

### Shape, depth, texture

- **Radius:** `--radius` = `6px` (default); `sm` 4px, `md` 6px, `lg` 10px. Some
  elements intentionally squared (0px) for an editorial feel.
- **Borders:** 1px hairline using `line`; `line-brass` for active/emphasis.
- **Shadow:** deep + soft, no glow. Panel shadow:
  `0 24px 60px -20px rgba(0,0,0,0.7)`.
- **Texture:** a single fixed, full-viewport film-grain/noise overlay at very
  low opacity (`pointer-events: none; z-index: -1`), replacing the animated
  radial-gradient blobs. Implemented as an inline SVG `feTurbulence` data-URI or
  a tiny tiled PNG — no extra runtime cost.

## 4. Typography

Loaded via Google Fonts (or self-hosted equivalents). Explicitly avoids
Inter/Roboto/Arial/Space Grotesk.

- **Display** — **Fraunces** (variable, high-contrast old-style serif).
  Wordmark, page titles, hero, large numerals.
- **Body / UI** — **Hanken Grotesk** (warm humanist grotesk). All body copy,
  labels, buttons, form fields, nav.
- **Mono** — **Spline Sans Mono**. Ratings/ELO, move notation, eval bars,
  data tables, timestamps.

Tailwind exposes these as `font-display`, `font-sans` (default), `font-mono`.
`body` font-family is updated from the current `-apple-system` stack.

## 5. App-Shell Layout

A responsive sidebar shell replaces the current fixed top bar
(`Layout.astro` nav + `AppNavBar.tsx`).

### Desktop (≥ `lg`)

- Fixed **left rail**, ~240px wide:
  - Serif "PROCYON" wordmark at top (brass king glyph + Fraunces wordmark).
  - Nav items: **Play, Puzzles, History, Ratings, Profile**. Active route marked
    by a brass vertical tick / left border + brass label; inactive = `ivory-dim`,
    hover lifts to `ivory` on `ink-600`.
  - User chip pinned to the bottom (avatar/initial + name, or "Sign in" when
    anonymous).
- Content area: a max-width column (`~`1100px) with generous top spacing.

### Mobile (< `lg`)

- Rail collapses to a **bottom tab bar** (icon + short label) plus a slim top bar
  showing the wordmark.
- Keep the existing server/client auth-nav hydration pattern (the
  `procyon-server-auth-nav` / `procyon-client-auth-nav` swap that prevents the
  flash of unauthenticated UI) — port it to the new shell rather than discard it.

### Page-header pattern (shared)

Every content page opens with: small uppercase **eyebrow** label (`ivory-dim`,
tracked, mono or grotesk) → large **serif title** → **brass hairline rule**.
Encapsulated in a `PageHeader` component.

## 6. Motion Language

Restrained and purposeful. Honors `prefers-reduced-motion` (all non-essential
motion disabled under it).

- **Page load:** one orchestrated, staggered fade-up — header first, then content
  blocks (via `animation-delay`), ~400–600ms ease-out. Keep/repurpose the
  existing `fade-in-up` keyframe.
- **Hover:** brass underline grows; panel lifts ~2px with deepened shadow; accent
  hairline brightens. No scale transforms, no bounce.
- **Removed:** `float`, `glow`, `gradient-shift`/`animated-bg`, `shimmer`,
  `animate-ping`/`animate-spin`/`animate-bounce` decorative blobs and particles,
  purely ornamental emoji (e.g. homepage flair). Decorative emoji on buttons
  means non-functional emoji used only for visual flair; emoji that are part of
  E2E-pinned button labels (e.g. control buttons whose text Playwright asserts
  on) must be kept.

## 7. Components & Pages

### New / foundation

- **`Layout.astro`** — Nocturne tokens, font loading, grain overlay; remove
  purple gradient + radial blob `body::before`; remove the shadcn light/dark
  HSL blocks.
- **`tailwind.config.mjs`** — extend `colors` (ink/ivory/brass/line + variant
  accents), `fontFamily` (display/sans/mono), `borderRadius`, `boxShadow`.
- **AppShell** (new component) — desktop rail + mobile bottom bar; integrates the
  auth-nav hydration pattern currently in `Layout.astro` + `AppNavBar.tsx` /
  `AuthNav.tsx`.
- **`ui/Button.tsx`** — variants: `primary` (brass fill, ink text), `outline`
  (brass hairline), `ghost`. Remove gradient + scale-105.
- **`ui/Input.tsx`** — Nocturne field styling (ink surface, hairline, brass focus
  ring).
- **`Panel`** (new `ui` primitive) — matte `ink-700` surface, hairline border,
  optional variant accent edge; the standard container for cards/side panels.
- **`PageHeader`** (new component) — eyebrow + serif title + brass rule.

### Pages

- **Homepage (`index.astro` + `ChessGameSelector` + `ChessGameCard`)** — hero
  ("Four games. One board room.") + four game cards as matte panels with
  per-variant accents and board previews.
- **Game pages (`chess` / `xiangqi` / `shogi` / `jungle` + `GamePageLayout`)** —
  centered board with Nocturne side panels (move history, AI config, captured
  pieces); variant accent applied; remove decorative background blobs. **Board
  reskin is visual only** (board frame, square colors, coordinate labels, panel
  chrome) — no changes to `ChessBoard` / `XiangqiBoard` / `ShogiBoard` /
  `JungleBoard` move handling or game logic.
- **Profile (`ProfilePage`) / Play History (`PlayHistoryPage`) / Puzzles
  (`PuzzlesPage`) / Ratings (`RatingsSection`, `RatingBadge`)** — tokens applied,
  `PageHeader`, `Panel` containers, **mono numerals** in tables/stats.
- **Login / Register (`login.astro`, `register.astro`, `LoginForm`,
  `RegisterForm`, `GoogleSignInButton`)** — Nocturne form styling; keep
  `showNav=false` shell treatment but on the new background.

## 8. Implementation Sequencing

Each phase is independently testable and shippable.

1. **Foundation** — tokens, fonts, grain, `tailwind.config`, AppShell, `ui`
   primitives (Button/Input/Panel/PageHeader). Most other work depends on this.
2. **Homepage** — hero + game cards.
3. **Game pages** — `GamePageLayout` + four pages + visual board reskin.
4. **Profile / History / Puzzles / Ratings / Auth.**

## 9. Constraints & Non-Goals

- **No** changes to game/move logic, AI service/adapters/rule-guardian, API
  routes, DB schema, or auth flow behavior.
- Preserve the auth-nav hydration anti-flash mechanism.
- Existing **E2E tests must stay green**; locators/selectors may need updating
  where markup changes (treat as part of each phase). Keep stable hooks like
  `data-testid="game-cards"` (and add others as needed) so tests stay robust.
- Single-theme **dark** app (no light-mode toggle in scope).
- Accessibility: maintain sufficient contrast (ivory/brass on ink meet WCAG AA
  for text), visible focus states, keyboard-navigable nav, and
  `prefers-reduced-motion` support.

## 10. Success Criteria

- No purple gradient, gradient-clipped text, particle blobs, or ✨ emoji remain.
- Every page renders in the Nocturne palette with the shared app-shell,
  page-header pattern, and the three-font system.
- Each variant is visually distinguished by its accent.
- All existing unit + E2E tests pass.
- The redesign reads as intentional and cohesive across all pages.
