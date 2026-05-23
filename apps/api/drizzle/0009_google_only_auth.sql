-- Migration: Google-only auth. Drop Supabase-keyed user data and create users table.

DELETE FROM `ai_configurations`;
--> statement-breakpoint
DELETE FROM `play_history`;
--> statement-breakpoint
DELETE FROM `player_ratings`;
--> statement-breakpoint
DELETE FROM `rating_history`;
--> statement-breakpoint
DELETE FROM `user_puzzle_progress`;
--> statement-breakpoint

CREATE TABLE `users` (
  `id` text PRIMARY KEY NOT NULL,
  `google_sub` text NOT NULL,
  `email` text NOT NULL,
  `username` text NOT NULL,
  `name` text,
  `picture` text,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL
);
--> statement-breakpoint

CREATE UNIQUE INDEX `users_google_sub_unique` ON `users` (`google_sub`);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_username_unique` ON `users` (`username`);
