-- Migration: Add unique constraint on rating_history for idempotency
-- This prevents duplicate rating history entries for the same play history record
-- ensuring that rating changes are only applied once per game

-- Remove any existing duplicates before creating the unique index
-- Keep the row with the highest id per (user_id, play_history_id)
DELETE FROM rating_history
WHERE id NOT IN (
	SELECT id FROM (
		SELECT MAX(id) AS id
		FROM rating_history
		GROUP BY user_id, play_history_id
	) AS t
);

-- Add unique constraint on rating_history (user_id, play_history_id)
CREATE UNIQUE INDEX IF NOT EXISTS rating_history_user_playhistory_idx
ON rating_history (user_id, play_history_id);

-- Note: SQLite doesn't support adding UNIQUE constraints directly to existing tables.
-- Instead, we use a unique index which provides the same constraint semantics.
