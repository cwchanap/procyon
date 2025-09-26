# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Procyon is a monorepo chess platform built with TypeScript, featuring:

- **Web app** (Astro + React + Tailwind CSS) - Frontend chess interface
- **API server** (Hono) - Backend services
- **Turbo** - Monorepo build system and task orchestration
- **Bun** - Package manager and runtime (prefer over npm/node)

## Architecture

### Monorepo Structure

```
apps/
├── web/          # Astro + React frontend (port 3500)
└── api/          # Hono API server (port 3501)
packages/         # Shared packages (currently empty)
```

### Web App (`apps/web`)

- **Framework**: Astro with React integration and Tailwind CSS
- **Chess Engine**: Custom implementation in `src/lib/chess/`
    - `types.ts` - Core chess types (pieces, moves, game state)
    - `board.ts` - Board representation and manipulation
    - `game.ts` - Game logic and state management
    - `moves.ts` - Move validation and generation
- **Components**: React components in `src/components/`
    - Chess-specific components (ChessBoard, ChessGame, etc.)
    - UI components in `src/components/ui/`

### API Server (`apps/api`)

- **Framework**: Hono (lightweight web framework)
- **Server**: @hono/node-server for Node.js compatibility
- **Current endpoints**: Basic health check and user management examples

## Development Commands

**Note**: This project uses Bun as the primary runtime and package manager.

### Root-level commands (using Turbo)

```bash
bun install              # Install dependencies
bun run dev             # Start all apps in development
bun run build           # Build all apps
bun run test            # Run tests across all apps
bun run lint            # Run linting across all apps
bun run lint:fix        # Fix linting issues across all apps
bun run format          # Format code with Prettier
bun run clean           # Clean build artifacts and node_modules
```

### Individual app commands

```bash
bun run web:dev         # Start only web app
bun run api:dev         # Start only API server
```

### App-specific development

```bash
cd apps/web && bun run dev      # Web app on port 3500
cd apps/api && bun run dev      # API server on port 3501
```

## Code Standards

### Linting & Formatting

- **ESLint**: TypeScript-focused configuration with custom rules
- **Prettier**: Code formatting (runs on pre-commit via Husky)
- **Husky + lint-staged**: Pre-commit hooks for code quality

### TypeScript Configuration

- Strict TypeScript settings across the monorepo
- Shared tsconfig.json at root level
- App-specific configurations extend the root config

### Styling

- **Tailwind CSS** for styling with custom design tokens
- **class-variance-authority** and **clsx** for conditional styling
- **tailwind-merge** for class merging utilities

## Chess Engine Architecture

The chess engine is built modularly:

1. **Types** (`types.ts`) - Defines core interfaces and enums
2. **Board** (`board.ts`) - 8x8 grid representation and piece management
3. **Game** (`game.ts`) - Game state, turn management, win conditions
4. **Moves** (`moves.ts`) - Legal move generation and validation

Game state includes board position, current player, move history, and UI state (selected squares, possible moves).

## Key Dependencies

### Web App

- **Astro 4.x** - Static site generator with React integration
- **React 18** - UI library
- **Tailwind CSS** - Utility-first CSS framework

### API Server

- **Hono** - Fast web framework
- **tsx** - TypeScript execution (dev dependency)

### Development Tools

- **Turbo** - Monorepo build system
- **ESLint 9** with TypeScript support
- **Prettier** - Code formatting
- **Husky** - Git hooks
