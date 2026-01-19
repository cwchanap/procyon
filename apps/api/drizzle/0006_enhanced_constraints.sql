-- Add CHECK constraints to ensure data consistency
--> statement-breakpoint
BEGIN TRANSACTION;
--> statement-breakpoint
PRAGMA foreign_keys=OFF;
--> statement-breakpoint
CREATE TABLE `player_ratings__new` (
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
	CHECK (`games_played` = `wins` + `losses` + `draws`)
);
--> statement-breakpoint
INSERT INTO `player_ratings__new` (
	`id`,
	`user_id`,
	`variant_id`,
	`rating`,
	`games_played`,
	`wins`,
	`losses`,
	`draws`,
	`peak_rating`,
	`created_at`,
	`updated_at`
)
SELECT
	`id`,
	`user_id`,
	`variant_id`,
	`rating`,
	(`wins` + `losses` + `draws`) AS `games_played`,
	`wins`,
	`losses`,
	`draws`,
	`peak_rating`,
	`created_at`,
	`updated_at`
FROM `player_ratings`;
--> statement-breakpoint
DROP TABLE `player_ratings`;
--> statement-breakpoint
ALTER TABLE `player_ratings__new` RENAME TO `player_ratings`;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `player_ratings_user_variant_idx` ON `player_ratings` (`user_id`, `variant_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `player_ratings_rating_idx` ON `player_ratings` (`rating`);
--> statement-breakpoint
CREATE TABLE `rating_history__new` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`variant_id` text NOT NULL,
	`play_history_id` integer NOT NULL,
	`old_rating` integer NOT NULL,
	`new_rating` integer NOT NULL,
	`rating_change` integer NOT NULL,
	`opponent_rating` integer NOT NULL,
	`game_result` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	CHECK (`game_result` IN ('win', 'loss', 'draw'))
);
--> statement-breakpoint

-- Normalize existing game_result values to the allowed set before inserting
-- (handles case differences and common legacy variants)
WITH normalized AS (
	SELECT
		`id`,
		`user_id`,
		`variant_id`,
		`play_history_id`,
		`old_rating`,
		`new_rating`,
		`rating_change`,
		`opponent_rating`,
		CASE
			WHEN LOWER(`game_result`) IN ('win','loss','draw') THEN LOWER(`game_result`)
			WHEN LOWER(`game_result`) IN ('w') THEN 'win'
			WHEN LOWER(`game_result`) IN ('l') THEN 'loss'
			WHEN LOWER(`game_result`) IN ('d','tie') THEN 'draw'
			ELSE NULL
		END AS `game_result_normalized`,
		`created_at`
	FROM `rating_history`
)
SELECT RAISE(ABORT, 'rating_history contains invalid game_result values')
WHERE EXISTS (
	SELECT 1 FROM normalized WHERE `game_result_normalized` IS NULL
);
--> statement-breakpoint
INSERT INTO `rating_history__new` (
	`id`,
	`user_id`,
	`variant_id`,
	`play_history_id`,
	`old_rating`,
	`new_rating`,
	`rating_change`,
	`opponent_rating`,
	`game_result`,
	`created_at`
)
SELECT
	`id`,
	`user_id`,
	`variant_id`,
	`play_history_id`,
	`old_rating`,
	`new_rating`,
	`rating_change`,
	`opponent_rating`,
	CASE
		WHEN LOWER(`game_result`) IN ('win','loss','draw') THEN LOWER(`game_result`)
		WHEN LOWER(`game_result`) IN ('w') THEN 'win'
		WHEN LOWER(`game_result`) IN ('l') THEN 'loss'
		WHEN LOWER(`game_result`) IN ('d','tie') THEN 'draw'
		ELSE NULL
	END AS `game_result`,
	`created_at`
FROM `rating_history`;
--> statement-breakpoint
DROP TABLE `rating_history`;
--> statement-breakpoint
ALTER TABLE `rating_history__new` RENAME TO `rating_history`;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `rating_history_user_id_idx` ON `rating_history` (`user_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `rating_history_play_history_id_idx` ON `rating_history` (`play_history_id`);
--> statement-breakpoint
PRAGMA foreign_keys=ON;
--> statement-breakpoint
-- Add composite index on rating_history for common query pattern
CREATE INDEX IF NOT EXISTS `rating_history_user_variant_idx` ON `rating_history` (`user_id`, `variant_id`);
--> statement-breakpoint
COMMIT;
