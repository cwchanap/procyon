# Procyon Platform Features PRD

**Product Requirements Document**

Version 1.1 | January 2025 | _Status updated: April 2026_

---

## Executive Summary

This document outlines seven proposed features for the Procyon multi-variant chess platform. These features aim to increase user engagement, retention, and skill development across Chess, Xiangqi, Shogi, and Jungle game variants.

### Feature Overview

| Feature                       | Value Proposition               | Complexity  | Priority | Status                   |
| ----------------------------- | ------------------------------- | ----------- | -------- | ------------------------ |
| Leaderboards & Rankings       | Competition and motivation      | Low-Medium  | High     | 🟡 Partially Implemented |
| AI Difficulty & Personalities | Accessibility and variety       | Medium      | High     | 🟡 Partially Implemented |
| Achievements & Progression    | Gamification and goals          | Low-Medium  | High     | 🔴 Not Started           |
| Daily Puzzles & Trainer       | Skill development and retention | Medium      | Medium   | 🟡 Partially Implemented |
| Game Analysis & Review        | Learning from games             | Medium      | Medium   | 🔴 Not Started           |
| Real-Time Multiplayer         | Community and social play       | High        | Medium   | 🔴 Not Started           |
| Opening Explorer              | Educational content             | Medium-High | Low      | 🔴 Not Started           |

---

# Feature 1: Leaderboards & Seasonal Rankings

## Implementation Status

**Status: 🟡 Partially Implemented (~35%)**

### Implemented

- Per-variant rating tracking (`playerRatings` table, `ratingHistory` table)
- Tier/division system with 5 tiers (Beginner, Intermediate, Advanced, Expert, Master) via `getRankTier()` in `apps/api/src/services/rating-service.ts`
- Rating display with tier badges (`apps/web/src/components/RatingBadge.tsx`)
- Player statistics dashboard: wins/losses/draws, peak rating, games played, win rate (`apps/web/src/components/RatingsSection.tsx`, `ProfilePage.tsx`)
- Rating history stored in DB and surfaced via `GET /api/ratings` endpoints

### Missing

- Global leaderboard page/component (top 100 per variant)
- Leaderboard UI with variant tabs, period filter, sortable table
- Seasonal rankings (soft rating reset, season-end rewards, season history)
- Weekly/monthly rotating challenges
- Promotion/demotion notifications
- "Your rank" card for users outside top 100

### Key Files

- `apps/api/src/db/schema.ts` — `playerRatings`, `ratingHistory` tables
- `apps/api/src/services/rating-service.ts` — `getRankTier()`, `getPlayerRatings()`
- `apps/api/src/routes/ratings.ts` — `/api/ratings` endpoints
- `apps/web/src/components/RatingBadge.tsx`, `RatingsSection.tsx`, `ProfilePage.tsx`

---

## Overview

Surface the existing rating system through global leaderboards, division-based rankings, and seasonal competitions to create visible goals and foster competition among players.

## Goals

- Create competition and recognition for skilled players
- Provide clear progression goals through divisions
- Drive retention through seasonal rankings and rewards
- Help players understand their skill level relative to others

## User Stories

**Competitive Player:**

- I want to see where I rank globally so I can understand my skill level
- I want to track my rating over time so I can see my improvement
- I want to compete in seasonal rankings for time-bound goals

**Casual Player:**

- I want to see my personal statistics to understand my play patterns
- I want to know what division I'm in for a sense of progression

**New Player:**

- I want to see top players so I can aspire to improve
- I want to understand the ranking system and what I'm working toward

## Functional Requirements

### Global Leaderboards

- Display top 100 players per variant (Chess, Xiangqi, Shogi, Jungle)
- Show rank, username, rating, games played, and win rate
- Filter by time period (all-time, season, month)
- Show user's rank even if outside top 100

### Division System

- Rating-based divisions: Bronze (0-999), Silver (1000-1199), Gold (1200-1399), Platinum (1400-1599), Diamond (1600-1799), Master (1800+)
- Display division badges on profiles and leaderboards
- Notify users on division promotion/demotion

### Seasonal Rankings

- 3-month seasons with soft rating reset
- Track seasonal ratings separately from all-time
- Season-end rewards based on final ranking (titles, badges, profile borders)
- Display season history with past rankings

### Personal Statistics Dashboard

- Rating history graph over time
- Games played breakdown by variant
- Win/Loss/Draw statistics per variant
- Peak rating display
- Recent games with rating changes

### Weekly/Monthly Challenges

- Rotating challenges (e.g., "Win 5 Xiangqi games")
- Challenge progress tracking
- Rewards for completion (XP, badges)

## UI/UX Specifications

### Leaderboard Page

- Variant tabs at top for switching between games
- Period filter dropdown
- Sortable table with player stats
- Current user highlighted with sticky row
- "Your Rank" card for users outside top 100

### Statistics Dashboard

- Rating cards per variant with division badge
- Interactive rating history chart with period selector
- Statistics grid showing key metrics
- Recent games list with expandable details

### Division Badges

- Appear next to username throughout the app
- Colored border matching division tier
- Hover tooltip with division details

## Success Metrics

| Metric                      | Target                     |
| --------------------------- | -------------------------- |
| Leaderboard page views      | 40% of weekly active users |
| Stats dashboard engagement  | 30% of weekly active users |
| Games played increase       | +25% after launch          |
| Seasonal participation      | 50% of active users        |
| 7-day retention improvement | +15%                       |

## Risks & Mitigations

| Risk                                | Mitigation                                  |
| ----------------------------------- | ------------------------------------------- |
| Rating inflation over time          | Implement rating decay for inactive players |
| Leaderboard gaming (smurf accounts) | Require minimum games for eligibility       |
| Performance with large user base    | Implement caching, database indexing        |

---

# Feature 2: AI Difficulty Levels & Personality Modes

## Implementation Status

**Status: 🟡 Partially Implemented (~40%)**

### Implemented

- AI configuration management: provider, model, and API key storage (`aiConfigurations` table)
- Support for 4 providers: Gemini, OpenAI, OpenRouter, Chutes (`apps/web/src/lib/ai/`)
- AI opponent ratings table with per-variant difficulty config (`aiOpponentRatings` table)
- Full CRUD API endpoints for AI config (`apps/api/src/routes/ai-config.ts`)
- Active configuration selection and multiple model options per provider
- AI settings UI (`apps/web/src/components/AIConfigPanel.tsx`, `AISettingsDialog.tsx`)

### Missing

- Named difficulty levels tied to target ELOs (Beginner ~600 → Grandmaster ~1900)
- AI personality modes: Aggressive, Defensive, Teacher, Chaotic
- Teacher mode: move explanations panel, threat highlighting, mistake suggestions, hint system
- Difficulty recommendation based on player's current rating
- In-game difficulty/personality badge display next to AI opponent name

### Key Files

- `apps/api/src/db/schema.ts` — `aiConfigurations`, `aiOpponentRatings` tables
- `apps/api/src/routes/ai-config.ts` — AI config endpoints
- `apps/web/src/lib/ai/types.ts` — `AIConfig` interface
- `apps/web/src/components/AIConfigPanel.tsx`, `ai/AISettingsDialog.tsx`

---

## Overview

Enhance AI opponents with configurable difficulty levels and distinct personality modes, allowing players of all skill levels to find appropriately challenging and engaging opponents.

## Goals

- Make AI opponents suitable for beginners through experts
- Add variety through distinct AI play styles
- Provide educational "Teacher" mode to help players learn
- Create a skill ladder players can climb

## User Stories

**Beginner:**

- I want easy AI so I can learn without constant losses
- I want the AI to explain good moves so I understand strategy
- I want to gradually increase difficulty as I improve

**Intermediate Player:**

- I want AI matched to my skill level for competitive games
- I want different personalities so games don't feel repetitive

**Advanced Player:**

- I want challenging AI that plays at a high level
- I want the hardest difficulty to truly test my skills

## Functional Requirements

### Difficulty Levels

| Level        | Target ELO | Behavior                                      |
| ------------ | ---------- | --------------------------------------------- |
| Beginner     | ~600       | Frequent mistakes, misses threats, basic play |
| Intermediate | ~1000      | Solid fundamentals, occasional mistakes       |
| Advanced     | ~1350      | Strong play, few mistakes, good tactics       |
| Master       | ~1650      | Expert-level, strategic depth, minimal errors |
| Grandmaster  | ~1900      | Maximum strength, optimal play                |

### AI Personalities

| Personality | Description                                                      |
| ----------- | ---------------------------------------------------------------- |
| Balanced    | Default mode, adapts to position                                 |
| Aggressive  | Prioritizes attack, sacrifices material for initiative           |
| Defensive   | Solid positional play, avoids risk, prioritizes safety           |
| Teacher     | Explains moves, provides hints, slightly suboptimal for teaching |
| Chaotic     | Unpredictable, makes intentional mistakes for casual play        |

### Teacher Mode Features

- Move explanations after each AI move
- Threat highlighting for player awareness
- Suggestions when player makes mistakes
- Tactical pattern explanations (forks, pins, variant-specific tactics)

### Rating Integration

- AI difficulty has associated ELO for rating calculations
- Rating changes reflect AI difficulty (harder = more points)
- Recommend difficulty based on player rating

## UI/UX Specifications

### AI Settings Flow

1. Select difficulty (with recommended option highlighted based on rating)
2. Select personality (default: Balanced)
3. Advanced settings (provider, model) - collapsible

### In-Game Display

- AI difficulty badge in opponent info area
- Personality icon next to AI name
- Teacher mode: Explanation panel after each AI move

### Teacher Panel

- Appears below board after AI moves
- Shows: Why AI played the move, threats to watch for, suggestions
- Optional hint button for player's moves

## Success Metrics

| Metric                  | Target                   |
| ----------------------- | ------------------------ |
| Beginner AI adoption    | 60% of new users         |
| Personality diversity   | 50% try 2+ personalities |
| Teacher mode engagement | 30% of users try it      |
| Game completion rate    | +15% improvement         |

## Risks & Mitigations

| Risk                                      | Mitigation                                      |
| ----------------------------------------- | ----------------------------------------------- |
| AI doesn't follow difficulty instructions | Multiple prompt iterations, fallback validation |
| Teacher explanations low quality          | Curated prompt templates, quality testing       |
| Personality differences not noticeable    | Exaggerate traits in prompts                    |

---

# Feature 3: Achievement & Progression System

## Implementation Status

**Status: 🔴 Not Started (0%)**

### Implemented

- Nothing — no achievement, XP, or level infrastructure exists in the codebase.

### Missing

- `achievements`, `user_achievements`, `challenges`, `user_challenge_progress` DB tables and schema
- XP system (win/loss/draw/challenge XP rewards)
- Level system (Levels 1–50, milestone titles)
- Achievement categories: Gameplay, Variant Mastery, Rating, Learning
- Rarity tiers: Common, Rare, Epic, Legendary
- Daily (3×) and weekly (2×) rotating challenge generation
- Achievement unlock notifications (slide-in popup)
- Level-up celebration modal with confetti
- Achievement page with category tabs and progress grid
- Challenge widget (collapsible sidebar with progress bars and countdown)
- XP/level indicator in page header

### Key Files

- _None exist yet_

---

## Overview

Implement achievements, XP, leveling, and daily/weekly challenges to gamify the experience and give players visible goals beyond winning games.

## Goals

- Give players visible goals and milestones
- Create daily return habits through challenges
- Provide continuous progression feeling through XP/levels
- Celebrate accomplishments with badges and titles

## User Stories

**New Player:**

- I want clear goals so I know what to work toward
- I want to feel rewarded for learning
- I want to see my progress visually

**Regular Player:**

- I want daily reasons to play to build a habit
- I want to show off achievements to others
- I want challenging long-term goals

## Functional Requirements

### Achievement Categories

**Gameplay Achievements:**

- First Steps: Win your first game
- Variety Player: Play all four variants
- Dedicated: Play 100/500/1000 games
- Hot Streak: Win 5/10/20 games in a row

**Variant Mastery:**

- Apprentice/Expert/Master for each variant (10/50/100 wins)

**Rating Achievements:**

- Rising Star: Reach 1000 rating
- Skilled/Expert/Master/Grandmaster at rating thresholds
- Polymath: Reach 1200+ in all variants

**Learning Achievements:**

- Complete tutorials
- Solve puzzles (10/100/500)
- Play in Teacher mode

**Rarity Tiers:** Common, Rare, Epic, Legendary

### XP System

| Action                    | XP Reward             |
| ------------------------- | --------------------- |
| Win a game                | 100 XP                |
| Win vs higher-rated       | +50 XP bonus          |
| Lose/Draw                 | 25/50 XP              |
| Complete daily challenge  | 150 XP                |
| Complete weekly challenge | 500 XP                |
| Earn achievement          | 50-500 XP (by rarity) |
| First game of day         | +25 XP bonus          |

### Level System

- Levels 1-50 with increasing XP requirements
- Titles at milestone levels (Newcomer → Beginner → Novice → ... → Champion)
- Visual level display on profile

### Challenges

- **Daily:** 3 rotating challenges (e.g., "Play 3 Chess games", "Win 2 games")
- **Weekly:** 2 larger challenges (e.g., "Play 20 games", "Win 10 games of one variant")
- Progress tracking and claim rewards on completion

## UI/UX Specifications

### Achievement Notifications

- Slide-in popup from top-right on earn
- Shows badge, name, description, XP gained
- Rarity-themed border colors

### Level Display

- Header bar shows level and XP progress
- Level up celebration modal with animation
- Confetti effect for milestone levels

### Achievement Page

- Grid layout with category tabs
- Earned achievements fully colored, unearned greyed with progress
- Hidden achievements show "???" until earned

### Challenge Widget

- Collapsible sidebar panel
- Progress bars for each challenge
- Time remaining countdown
- Glowing "Claim" button when complete

## Success Metrics

| Metric                      | Target                     |
| --------------------------- | -------------------------- |
| Achievement engagement      | 70% earn one in first week |
| Daily challenge completion  | 40% completion rate        |
| Weekly challenge completion | 30% completion rate        |
| DAU increase                | +25%                       |
| Session length              | +15%                       |

## Risks & Mitigations

| Risk                                  | Mitigation                              |
| ------------------------------------- | --------------------------------------- |
| Achievement grinding devalues system  | Balance criteria, anti-farming measures |
| Notification fatigue                  | Batch notifications, user preferences   |
| Retroactive awards for existing users | Run backfill job on launch              |

---

# Feature 4: Daily Puzzles & Tactical Trainer

## Implementation Status

**Status: 🟡 Partially Implemented (~45%)**

### Implemented

- Puzzle DB schema: `puzzles` table (position, solution, difficulty, hints) and `userPuzzleProgress` table
- Puzzle seeding infrastructure (`apps/api` seed scripts)
- Puzzle API endpoints: list, get by ID, submit progress (`apps/api/src/routes/puzzles.ts`)
- Puzzle grid/list UI (`apps/web/src/components/puzzle/PuzzleGrid.tsx`)
- Puzzle solver component with board interaction (`apps/web/src/components/puzzle/PuzzleSolver.tsx`)
- Difficulty levels: beginner, intermediate, advanced
- Local and server-side progress persistence
- `usePuzzle` hook (`apps/web/src/hooks/usePuzzle.ts`)

### Missing

- Daily featured puzzle system (one per variant per day with difficulty rotation)
- Daily leaderboard by solve time
- Puzzle streak tracking and break warning
- Variant-specific puzzle categories (cannon batteries, Shogi drops, Jungle traps, etc.)
- Adaptive difficulty matching based on player puzzle performance
- Separate puzzle rating system (Glicko-2)
- Hint system with rating cost (25% rating gain per hint)
- Spaced repetition queue for failed puzzles
- Puzzle bookmarking
- Rating comparison display (your rating vs puzzle rating)
- Solution explanation shown after solve or reveal
- Timer display during solve
- Comprehensive puzzle content (500+ per variant)

### Key Files

- `apps/api/src/db/schema.ts` — `puzzles`, `userPuzzleProgress` tables
- `apps/api/src/routes/puzzles.ts` — puzzle endpoints
- `apps/web/src/components/PuzzlesPage.tsx` — main puzzle page
- `apps/web/src/components/puzzle/PuzzleSolver.tsx`, `PuzzleGrid.tsx`
- `apps/web/src/hooks/usePuzzle.ts`

---

## Overview

Add a puzzle system with daily featured puzzles, a tactical trainer with categorized puzzles for all variants, and an adaptive rating system that matches puzzle difficulty to player skill.

## Goals

- Help players improve tactical recognition
- Create daily engagement through featured puzzles
- Teach variant-specific tactics (Xiangqi cannon play, Shogi drops)
- Provide measurable skill progress through puzzle rating

## User Stories

**Player Wanting to Improve:**

- I want puzzles to recognize tactical patterns
- I want puzzles matched to my skill level
- I want to track my puzzle rating improvement

**Casual Player:**

- I want a quick daily puzzle for limited time
- I want hints when stuck
- I want to see solutions if I can't solve it

**Variant Learner:**

- I want variant-specific puzzles to learn unique tactics
- I want themed puzzles to focus on specific skills

## Functional Requirements

### Puzzle Types

**By Category:**

- Mate in 1/2/3+
- Winning Material (tactics that win pieces)
- Defensive (find the only saving move)
- Endgame conversions
- Opening traps

**By Variant:**

- Chess: Forks, pins, skewers, back rank mates
- Xiangqi: Cannon batteries, chariot tactics, palace invasions
- Shogi: Piece drop tactics, promotion threats, tsume problems
- Jungle: Trap tactics, river crossings, hierarchy exploitation

### Daily Puzzle System

- One featured puzzle per day per variant
- Track solve time and attempts
- Daily leaderboard by solve time
- Streak tracking for consecutive days solved
- Difficulty rotation (Easy Mon → Hard Fri → Easy Sun)

### Puzzle Trainer

- Infinite puzzle feed from database
- Filter by variant, category, difficulty
- Adaptive difficulty based on performance
- Separate puzzle rating (Glicko-2 system)
- Bookmarking for later review
- Spaced repetition for failed puzzles

### Puzzle Interaction

- Drag-and-drop or click-click movement
- Immediate feedback (wrong = red flash)
- Hint system (costs portion of rating gain)
- Show solution after 3 failed attempts
- Solution explanation after solve/reveal

## UI/UX Specifications

### Puzzle Page Layout

- Variant tabs at top
- Interactive puzzle board
- Timer display
- Rating comparison (your rating vs puzzle rating)
- Hint and Solution buttons

### Interaction Flow

1. Load puzzle, timer starts
2. Make move → Correct (green, continue) or Wrong (red flash, try again)
3. Solve → Success animation, rating change, explanation
4. Give up → Solution plays out, explanation shown

### Hint System

- First hint: Highlights piece to move (costs 25% rating gain)
- Second hint: Shows target square (costs 25% more)
- Third click: "Show Solution" appears

### Streak Display

- Fire emoji with day count
- Glows at streak milestones (7, 30, 100 days)
- Warning if about to lose streak

## Success Metrics

| Metric                                     | Target          |
| ------------------------------------------ | --------------- |
| Daily puzzle attempts                      | 50% of DAU      |
| Trainer engagement                         | 30% weekly      |
| Average puzzles per session                | 5+              |
| Puzzle rating correlation with game rating | r > 0.7         |
| 7-day streak retention                     | 40% of starters |

## Risks & Mitigations

| Risk                             | Mitigation                                     |
| -------------------------------- | ---------------------------------------------- |
| Insufficient puzzle content      | Partner with databases, community contribution |
| Variant-specific puzzle scarcity | Prioritize Chess/Xiangqi, generate Shogi tsume |
| Puzzle difficulty miscalibrated  | A/B test, adjust based on solve rates          |

---

# Feature 5: Game Analysis & Review System

## Implementation Status

**Status: 🔴 Not Started (~10% — infrastructure only)**

### Implemented

- `playHistory` table stores completed games with full metadata (variant, result, move history, opponent, date)
- Basic play history list UI (`apps/web/src/components/PlayHistoryPage.tsx`) shows game metadata only
- `GET /api/play-history` endpoint for retrieving stored games

### Missing

- Game replay page: move-by-move navigation (forward/back, jump to move, start/end)
- Auto-play mode with adjustable speed
- Keyboard navigation (arrow keys)
- Captured pieces display at each board position
- Last-move highlight on board
- AI move evaluation engine (classify Best / Good / Inaccuracy / Mistake / Blunder)
- Evaluation bar (advantage meter) with smooth animation
- Best-move suggestion panel for critical positions
- Critical moment detection and game summary
- Shareable game links; public viewing without login; share-at-move position
- Copy FEN / download game in standard format / social preview cards
- Game library filtering (variant, result, date range), opponent search, favorites, delete

### Key Files

- `apps/api/src/db/schema.ts` — `playHistory` table
- `apps/api/src/routes/play-history.ts` — play history API
- `apps/web/src/components/PlayHistoryPage.tsx` — basic game list (no analysis)

---

## Overview

Enable players to save completed games, review them move-by-move, receive AI-powered analysis identifying mistakes and best moves, and share interesting games with others.

## Goals

- Help players learn from their mistakes
- Enable move-by-move game replay with annotations
- Provide AI-powered move evaluation
- Allow sharing of memorable games

## User Stories

**Player Wanting to Improve:**

- I want to review my games to learn from mistakes
- I want to see where I blundered
- I want AI analysis to understand better moves

**Casual Player:**

- I want to save memorable games
- I want to share exciting games with friends
- I want simple navigation to step through moves

**Content Creator:**

- I want shareable links for viewers
- I want to embed games in content
- I want clean presentation

## Functional Requirements

### Game Storage

- Auto-save all completed games (vs AI and PvP)
- Store complete move history in variant-appropriate notation
- Store metadata (date, variant, players, result, time control)
- Support manual game import (PGN for chess)

### Game Review

- Step forward/backward through moves
- Jump to any move by clicking move list
- Jump to start/end buttons
- Auto-play mode with adjustable speed
- Keyboard navigation (arrow keys)
- Show captured pieces at each position
- Highlight last move on board

### AI Analysis

- Analyze full game on demand
- Evaluate each move: Best, Good, Inaccuracy, Mistake, Blunder
- Show evaluation bar (advantage meter)
- Suggest best moves for critical positions
- Identify critical moments (turning points)
- Generate game summary with key insights

**Move Classification:**
| Category | Evaluation Loss |
|----------|----------------|
| Best | 0-10 centipawns |
| Good | 10-30 centipawns |
| Inaccuracy | 30-100 centipawns |
| Mistake | 100-300 centipawns |
| Blunder | 300+ centipawns |

### Sharing

- Generate shareable game link
- View shared games without login
- Share at specific move position
- Copy position (FEN) at any point
- Download game in standard format
- Social media preview cards

### Game Library

- List all saved games with filters (variant, result, date)
- Search by opponent name
- Mark games as favorites
- Delete games

## UI/UX Specifications

### Analysis Page Layout

- Game board with navigation controls
- Move list panel (clickable to jump)
- Analysis sidebar (current move evaluation, best move suggestion)
- Summary section (game overview, critical moments)

### Evaluation Bar

- Vertical bar showing advantage
- White advantage fills from bottom, black from top
- Numeric evaluation display
- Smooth animation between positions

### Move Classification

- Color-coded in move list (green/yellow/orange/red)
- Icons: ✓ Best, ⚠️ Inaccuracy, ❌ Mistake, ‼️ Blunder

### Share Dialog

- Copy link button
- Share at current position toggle
- Social share buttons
- Embed code option

## Success Metrics

| Metric            | Target                 |
| ----------------- | ---------------------- |
| Games saved       | 100% automatic         |
| Games reviewed    | 40% of completed games |
| Analysis requests | 25% of games           |
| Share link clicks | 10% CTR                |
| Time in analysis  | 5+ min average         |

## Risks & Mitigations

| Risk                           | Mitigation                    |
| ------------------------------ | ----------------------------- |
| AI analysis costs at scale     | Rate limit, cache results     |
| Storage costs                  | Retention policy, compression |
| Analysis quality inconsistency | Prompt engineering, fallbacks |

---

# Feature 6: Real-Time Multiplayer

## Implementation Status

**Status: 🔴 Not Started (~5% — schema stubs only)**

### Implemented

- `playHistory.opponentUserId` field exists — schema ready to record PvP games
- PvP submission blocked at API level (prevents direct client-side PvP result submission)
- `updatePvpRatings()` function stub exists in `apps/api/src/services/rating-service.ts` (not integrated)

### Missing

- WebSocket / real-time connection layer (no WS server exists)
- Matchmaking queue: rating-based pairing (±200 ELO, expanding over time), queue status UI
- Private room creation with invite codes and ready-check flow
- Time control selection (Bullet / Blitz / Rapid / Classical / Custom)
- Server-side move validation and state synchronization
- Draw offer / resign / auto-forfeit on timeout
- Reconnection handling (60-second window, resume on rejoin)
- Clock display (both players' clocks, low-time warning)
- Spectating: real-time move stream, spectator count, featured games lobby
- In-game chat: pre-game, quick-chat, mute/report
- Separate PvP rating track; rating updates and provisional ratings after game

### Key Files

- `apps/api/src/routes/play-history.ts` — PvP rejection guard
- `apps/api/src/services/rating-service.ts` — `updatePvpRatings()` stub
- `apps/api/src/db/schema.ts` — `playHistory.opponentUserId`

---

## Overview

Enable players to compete against each other in live games with matchmaking, private rooms, time controls, spectating, and in-game chat.

## Goals

- Build a social community of chess variant players
- Enable real competitive play with live ratings
- Dramatically increase engagement and retention
- Create viral loops through invites and spectating

## User Stories

**Competitive Player:**

- I want to play against real humans to test my skills
- I want fair matchmaking with appropriate opponents
- I want my rating to update from PvP games

**Social Player:**

- I want to invite friends to play together
- I want to spectate games to watch and learn
- I want in-game chat to communicate

**Casual Player:**

- I want quick games during breaks
- I want to quit without penalty in casual mode

## Functional Requirements

### Matchmaking

- Queue for random opponent by variant
- Match by rating (within 200 points, expanding over time)
- Select time control before queueing
- Show queue status and estimated wait time
- Cancel queue anytime

### Game Rooms

- Create private room with invite code
- Join by code or direct link
- Creator selects variant and time control
- Ready check before game starts
- Random or chosen color assignment

### Time Controls

| Type      | Base Time | Increment |
| --------- | --------- | --------- |
| Bullet    | 1 min     | 0 sec     |
| Blitz     | 3 min     | 2 sec     |
| Rapid     | 10 min    | 5 sec     |
| Classical | 30 min    | 10 sec    |
| Custom    | 1-60 min  | 0-30 sec  |

### Game Flow

- Real-time move transmission
- Server-side move validation
- Game state synchronization
- Offer/accept/decline draw
- Resign game
- Auto-lose on timeout

### Reconnection Handling

- Auto-reconnect on connection drop
- Resume game state after reconnect
- Clock continues during disconnect
- 60-second window to reconnect before forfeit

### Spectating

- Spectate any ongoing public game
- See moves in real-time
- See clocks (no analysis to prevent cheating assistance)
- Spectator count visible to players
- Featured games on lobby

### Chat

- Pre-game chat in room
- In-game chat (toggleable)
- Quick chat messages (Good luck, Good game, etc.)
- Mute opponent option
- Report inappropriate chat

### Rating Integration

- Update ratings after game completion
- Separate PvP ratings from AI ratings
- Show rating change after game
- Provisional ratings for new players

## UI/UX Specifications

### Multiplayer Lobby

- Find Match section (variant, time control selection)
- Private Room section (create or join by code)
- Live Games list (spectatable games)

### Game Clock Display

- Both players' clocks visible
- Active player's clock highlighted/glowing
- Low time warning (< 30 sec)

### Game Controls

- Resign button with confirmation
- Offer Draw button
- Settings access during game

### Disconnection Handling

- Overlay showing "Opponent Disconnected"
- Countdown timer for reconnection
- "Claim Victory" button after timeout

### Chat Interface

- Collapsible sidebar (desktop) / bottom sheet (mobile)
- Quick chat buttons above text input
- Mute button in opponent info

## Success Metrics

| Metric                 | Target                 |
| ---------------------- | ---------------------- |
| Weekly PvP players     | 30% of active users    |
| Average session length | 30+ minutes            |
| Games from invites     | 20%                    |
| Spectator engagement   | 10% of games spectated |
| Matchmaking wait time  | < 60 sec average       |

## Risks & Mitigations

| Risk                         | Mitigation                                |
| ---------------------------- | ----------------------------------------- |
| Cheating (engine assistance) | Rate limiting, behavior analysis, reports |
| Connection instability       | Robust reconnection, graceful degradation |
| Player toxicity              | Chat moderation, reporting, bans          |
| Low initial player pool      | AI backfill for queues                    |

---

# Feature 7: Opening Explorer & Move Database

## Implementation Status

**Status: 🔴 Not Started (0%)**

### Implemented

- Nothing — no opening database, explorer UI, or trainer exists in the codebase.

### Missing

- Opening database schema: opening positions, move frequency, win/draw/loss stats, opening names
- Opening explorer UI: interactive board, move table (frequency + win rates), opening name display, rating-range filter, search by name, forward/back navigation
- Opening trainer: line selection, practice for both colors, spaced repetition, multiple-choice mode, progress tracking, custom repertoire building
- In-game integration: current opening name badge, "leaving theory" indicator, post-game opening summary with book moves, link to explorer
- Opening data for all 4 variants (Chess ECO, Xiangqi, Shogi joseki, Jungle patterns)

### Key Files

- _None exist yet_

---

## Overview

Build an opening explorer showing move frequency and win rates for all variants, with named opening recognition and a trainer mode for practicing specific repertoires.

## Goals

- Help players learn opening theory for each variant
- Provide reference database of named openings
- Enable focused training on specific repertoires
- Show opening names during live games

## User Stories

**Beginner:**

- I want to see popular opening moves
- I want to understand why certain moves are common
- I want to know opening names for discussion

**Intermediate Player:**

- I want to build a consistent repertoire
- I want to practice specific lines confidently
- I want to see win rates to choose effective openings

**Advanced Player:**

- I want deep analysis to find novelties
- I want to compare variations to optimize repertoire
- I want to study opponent's typical openings

## Functional Requirements

### Opening Database

**Supported Openings by Variant:**

- Chess: King's Pawn, Queen's Pawn, Flank openings (Sicilian, Queen's Gambit, etc.)
- Xiangqi: Central Cannon, Screen Horse, Elephant systems
- Shogi: Static Rook, Ranging Rook, castle formations
- Jungle: Opening strategies and patterns

### Opening Explorer

- Interactive board to explore moves
- Show all possible moves from position
- Display move frequency (% played)
- Display win/draw/loss rates for each move
- Show opening name when in known theory
- Navigate forward/backward through moves
- Filter by rating range (master games only)
- Search openings by name

### Opening Trainer

- Select an opening line to practice
- Practice playing both colors
- Spaced repetition for memorization
- Multiple choice move selection mode
- Track progress through lines
- Custom repertoire building

### In-Game Integration

- Show current opening name during game
- Indicate when leaving known theory
- Post-game: Show opening played with book moves
- Link to explorer from game

## UI/UX Specifications

### Explorer Layout

- Interactive board (click to make moves)
- Move table showing: Move, Games played, Win rate, Main line indicator
- Current opening name/variation display
- Position statistics (total games, win rates)
- Move history display

### Move Table Columns

- Move notation (clickable)
- Number of games
- Win/Draw/Loss percentages
- Star for theoretical main line

### Win Rate Bar

- Visual bar showing White/Draw/Black percentages
- Color-coded segments

### Opening Trainer

- Practice board with position
- "Your move?" prompt
- Multiple choice option with move buttons
- Progress indicator (4/12 moves)
- Feedback on correct/incorrect

### In-Game Badge

- Small badge showing current opening name
- "Move 6 · In theory" or "Left book at move 8"

## Success Metrics

| Metric                | Target                        |
| --------------------- | ----------------------------- |
| Explorer weekly users | 25% of active users           |
| Trainer engagement    | 15% weekly                    |
| Time in explorer      | 5+ min average                |
| Repertoire adoption   | 20% create repertoire         |
| Opening recognition   | 80% of games (first 10 moves) |

## Risks & Mitigations

| Risk                          | Mitigation                               |
| ----------------------------- | ---------------------------------------- |
| Variant opening data scarcity | Prioritize Chess, community contribution |
| Position transpositions       | Implement transposition detection        |
| Data quality/accuracy         | Source from reputable databases          |

---

# Implementation Roadmap

## Current Progress (as of April 2026)

| Feature                       | Status                   | Est. Completion |
| ----------------------------- | ------------------------ | --------------- |
| Leaderboards & Rankings       | 🟡 Partially Implemented | ~35%            |
| AI Difficulty & Personalities | 🟡 Partially Implemented | ~40%            |
| Achievements & Progression    | 🔴 Not Started           | 0%              |
| Daily Puzzles & Trainer       | 🟡 Partially Implemented | ~45%            |
| Game Analysis & Review        | 🔴 Not Started           | ~10%            |
| Real-Time Multiplayer         | 🔴 Not Started           | ~5%             |
| Opening Explorer              | 🔴 Not Started           | 0%              |

## Recommended Phases

### Phase 1: Foundation (Weeks 1-8)

**Features:** Leaderboards & Rankings, Achievements & Progression

These features leverage existing rating and play history data with relatively low complexity, providing immediate value.

> **Current status:** Leaderboards 35% done (ratings/tiers exist, leaderboard UI missing). Achievements 0% — highest-priority gap given it's Phase 1 and marked High priority.

### Phase 2: AI Enhancement (Weeks 9-16)

**Feature:** AI Difficulty & Personalities

Improves the core AI gameplay experience, making the platform more accessible to all skill levels.

> **Current status:** 40% done. Provider/model config works; difficulty levels and personality modes not yet implemented.

### Phase 3: Learning Features (Weeks 17-28)

**Features:** Daily Puzzles & Trainer, Game Analysis & Review

Strong retention mechanics and educational value that help players improve.

> **Current status:** Puzzles 45% done (solver + DB exist; daily system, streaks, adaptive rating missing). Analysis 10% — play history stored but no review UI or AI evaluation.

### Phase 4: Advanced Features (Weeks 29-44)

**Features:** Opening Explorer, Real-Time Multiplayer

More complex features that add significant depth. Multiplayer is transformative but requires substantial infrastructure.

> **Current status:** Both 0–5% done. Multiplayer requires WebSocket infrastructure not yet in place.

## Feature Dependencies

```
Real-Time Multiplayer
        │
        ├── Depends on: Rating System, Leaderboards
        │
Leaderboards ◄── Achievements ◄── Puzzles
        │              │
        └──────────────┴── Depend on: Play History, Rating System

Independent Features:
- AI Difficulty (can be implemented anytime)
- Opening Explorer (can be implemented anytime)
- Game Analysis (can be implemented anytime)
```

## Cross-Feature Considerations

### Shared Components

- Progress bars (achievements, puzzles, challenges)
- Leaderboard tables
- Rating displays
- Badge/icon system
- Interactive game boards

### Analytics Integration

All features should track:

- User engagement events
- Feature adoption funnels
- Performance metrics

### Content Requirements

- Achievement definitions and icons
- Puzzle database (500+ per variant)
- Opening database
- AI prompt templates

---

# Success Metrics Summary

| Feature       | Primary Metric     | Target        |
| ------------- | ------------------ | ------------- |
| Leaderboards  | Weekly page views  | 40% WAU       |
| AI Difficulty | Beginner adoption  | 60% new users |
| Achievements  | First week earning | 70% users     |
| Puzzles       | Daily attempts     | 50% DAU       |
| Analysis      | Games reviewed     | 40% completed |
| Multiplayer   | PvP participation  | 30% WAU       |
| Openings      | Explorer usage     | 25% WAU       |

### Overall Platform Goals

- **DAU Increase:** +30% after all features
- **7-Day Retention:** +20%
- **30-Day Retention:** +15%
- **Average Session Length:** +25%

---

# Appendix: Glossary

| Term     | Definition                                          |
| -------- | --------------------------------------------------- |
| ELO      | Rating system measuring player skill                |
| FEN      | Forsyth-Edwards Notation - position encoding        |
| PGN      | Portable Game Notation - game recording format      |
| WAU      | Weekly Active Users                                 |
| DAU      | Daily Active Users                                  |
| Glicko-2 | Advanced rating system with uncertainty measurement |
| Tsume    | Shogi mating puzzles                                |
| Joseki   | Established opening patterns (Shogi)                |
| ECO      | Encyclopedia of Chess Openings classification       |
