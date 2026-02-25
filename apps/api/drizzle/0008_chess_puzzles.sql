-- Migration: Add puzzles and user_puzzle_progress tables for Feature 4

CREATE TABLE IF NOT EXISTS `puzzles` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `slug` text NOT NULL,
  `title` text NOT NULL,
  `description` text NOT NULL,
  `difficulty` text NOT NULL,
  `player_color` text NOT NULL,
  `initial_board` text NOT NULL,
  `solution` text NOT NULL,
  `hint` text NOT NULL,
  `created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS `puzzles_slug_idx` ON `puzzles` (`slug`);
CREATE INDEX IF NOT EXISTS `puzzles_difficulty_idx` ON `puzzles` (`difficulty`);

CREATE TABLE IF NOT EXISTS `user_puzzle_progress` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `user_id` text NOT NULL,
  `puzzle_id` integer NOT NULL,
  `solved` integer DEFAULT false NOT NULL,
  `failed_attempts` integer DEFAULT 0 NOT NULL,
  `solved_at` text,
  `updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS `user_puzzle_progress_user_puzzle_idx`
  ON `user_puzzle_progress` (`user_id`, `puzzle_id`);

CREATE INDEX IF NOT EXISTS `user_puzzle_progress_user_id_idx`
  ON `user_puzzle_progress` (`user_id`);
