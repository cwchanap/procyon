-- Migration: Add unique constraint on rating_history for idempotency
-- This prevents duplicate rating history entries for the same play history record
-- ensuring that rating changes are only applied once per game

-- Add unique constraint on rating_history (user_id, play_history_id)
CREATE UNIQUE INDEX IF NOT EXISTS rating_history_user_playhistory_idx
ON rating_history (user_id, play_history_id);

-- Note: SQLite doesn't support adding UNIQUE constraints directly to existing tables.
-- Instead, we use a unique index which provides the same constraint semantics.
