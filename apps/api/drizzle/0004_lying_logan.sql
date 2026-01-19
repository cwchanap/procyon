CREATE TABLE `ai_opponent_ratings` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`opponent_llm_id` text NOT NULL,
	`variant_id` text NOT NULL,
	`rating` integer DEFAULT 1400 NOT NULL,
	`description` text,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	UNIQUE(`opponent_llm_id`, `variant_id`)
);
--> statement-breakpoint
CREATE TABLE `player_ratings` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`variant_id` text NOT NULL,
	`rating` integer DEFAULT 1200 NOT NULL,
	`games_played` integer DEFAULT 0 NOT NULL,
	`wins` integer DEFAULT 0 NOT NULL,
	`losses` integer DEFAULT 0 NOT NULL,
	`draws` integer DEFAULT 0 NOT NULL,
	`peak_rating` integer DEFAULT 1200 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	UNIQUE(`user_id`, `variant_id`)
);
--> statement-breakpoint
CREATE INDEX `player_ratings_rating_idx` ON `player_ratings` (`rating`);
--> statement-breakpoint
CREATE TABLE `rating_history` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`variant_id` text NOT NULL,
	`play_history_id` integer NOT NULL,
	`old_rating` integer NOT NULL,
	`new_rating` integer NOT NULL,
	`rating_change` integer NOT NULL,
	`opponent_rating` integer NOT NULL,
	`game_result` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `rating_history_user_id_idx` ON `rating_history` (`user_id`);
--> statement-breakpoint
CREATE INDEX `rating_history_play_history_id_idx` ON `rating_history` (`play_history_id`);
