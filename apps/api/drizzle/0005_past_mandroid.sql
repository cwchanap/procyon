DROP INDEX `ai_opponent_ratings_llm_variant_idx`;--> statement-breakpoint
CREATE UNIQUE INDEX `ai_opponent_ratings_llm_variant_idx` ON `ai_opponent_ratings` (`opponent_llm_id`,`variant_id`);--> statement-breakpoint
DROP INDEX `player_ratings_user_variant_idx`;--> statement-breakpoint
CREATE UNIQUE INDEX `player_ratings_user_variant_idx` ON `player_ratings` (`user_id`,`variant_id`);