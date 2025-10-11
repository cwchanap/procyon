CREATE TABLE `play_history` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`chess_id` text NOT NULL,
	`date` text NOT NULL,
	`status` text NOT NULL,
	`opponent_user_id` integer,
	`opponent_llm_id` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`opponent_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
