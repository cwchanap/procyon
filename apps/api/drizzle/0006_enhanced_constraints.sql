-- Add CHECK constraints to ensure data consistency
--> statement-breakpoint
ALTER TABLE `player_ratings` ADD CHECK (`games_played` = `wins` + `losses` + `draws`);
--> statement-breakpoint
ALTER TABLE `rating_history` ADD CHECK (`game_result` IN ('win', 'loss', 'draw'));
--> statement-breakpoint
-- Add composite index on rating_history for common query pattern
CREATE INDEX `rating_history_user_variant_idx` ON `rating_history` (`user_id`, `variant_id`);
