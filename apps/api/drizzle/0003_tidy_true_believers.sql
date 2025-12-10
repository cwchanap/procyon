PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_play_history` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`chess_id` text NOT NULL,
	`date` text NOT NULL,
	`status` text NOT NULL,
	`opponent_user_id` text,
	`opponent_llm_id` text
);
--> statement-breakpoint
INSERT INTO `__new_play_history`("id", "user_id", "chess_id", "date", "status", "opponent_user_id", "opponent_llm_id") SELECT "id", "user_id", "chess_id", "date", "status", "opponent_user_id", "opponent_llm_id" FROM `play_history`;--> statement-breakpoint
DROP TABLE `play_history`;--> statement-breakpoint
ALTER TABLE `__new_play_history` RENAME TO `play_history`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `play_history_user_id_idx` ON `play_history` (`user_id`);--> statement-breakpoint
CREATE INDEX `play_history_opponent_user_id_idx` ON `play_history` (`opponent_user_id`);--> statement-breakpoint
CREATE INDEX `ai_configurations_user_id_idx` ON `ai_configurations` (`user_id`);