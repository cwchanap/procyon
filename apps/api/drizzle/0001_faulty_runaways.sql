DROP TABLE `users`;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_play_history` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`chess_id` text NOT NULL,
	`date` text NOT NULL,
	`status` text NOT NULL,
	`opponent_user_id` integer,
	`opponent_llm_id` text,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_play_history`("id", "user_id", "chess_id", "date", "status", "opponent_user_id", "opponent_llm_id") SELECT "id", "user_id", "chess_id", "date", "status", "opponent_user_id", "opponent_llm_id" FROM `play_history`;--> statement-breakpoint
DROP TABLE `play_history`;--> statement-breakpoint
ALTER TABLE `__new_play_history` RENAME TO `play_history`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
ALTER TABLE `user` ADD `display_username` text;