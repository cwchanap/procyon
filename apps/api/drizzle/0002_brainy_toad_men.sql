PRAGMA foreign_keys=OFF;--> statement-breakpoint
DROP TABLE `account`;--> statement-breakpoint
DROP TABLE `session`;--> statement-breakpoint
DROP TABLE `user`;--> statement-breakpoint
DROP TABLE `verification`;--> statement-breakpoint
CREATE TABLE `__new_ai_configurations` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`provider` text NOT NULL,
	`model_name` text NOT NULL,
	`api_key` text NOT NULL,
	`is_active` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_ai_configurations`("id", "user_id", "provider", "model_name", "api_key", "is_active", "created_at", "updated_at") SELECT "id", "user_id", "provider", "model_name", "api_key", "is_active", "created_at", "updated_at" FROM `ai_configurations`;--> statement-breakpoint
DROP TABLE `ai_configurations`;--> statement-breakpoint
ALTER TABLE `__new_ai_configurations` RENAME TO `ai_configurations`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE TABLE `__new_play_history` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`chess_id` text NOT NULL,
	`date` text NOT NULL,
	`status` text NOT NULL,
	`opponent_user_id` integer,
	`opponent_llm_id` text
);
--> statement-breakpoint
INSERT INTO `__new_play_history`("id", "user_id", "chess_id", "date", "status", "opponent_user_id", "opponent_llm_id") SELECT "id", "user_id", "chess_id", "date", "status", "opponent_user_id", "opponent_llm_id" FROM `play_history`;--> statement-breakpoint
DROP TABLE `play_history`;--> statement-breakpoint
ALTER TABLE `__new_play_history` RENAME TO `play_history`;