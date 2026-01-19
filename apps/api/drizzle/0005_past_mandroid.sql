-- Migration: Convert non-unique indexes to UNIQUE constraints for ratings tables
-- This migration ensures data integrity by preventing duplicate rating entries

-- Step 1: Check for duplicates in ai_opponent_ratings
-- Run this query first to detect any existing duplicates:
-- SELECT opponent_llm_id, variant_id, COUNT(*) as count
-- FROM ai_opponent_ratings
-- GROUP BY opponent_llm_id, variant_id
-- HAVING COUNT(*) > 1;

-- Step 2: Deduplicate ai_opponent_ratings (keep the row with the highest id)
DELETE FROM ai_opponent_ratings
WHERE id NOT IN (
  SELECT id FROM (
    SELECT MAX(id) AS id
    FROM ai_opponent_ratings
    GROUP BY opponent_llm_id, variant_id
  ) AS t
);

-- Step 3: Note: The UNIQUE constraint from migration 0004 already enforces
-- uniqueness on (opponent_llm_id, variant_id). No additional index replacement needed.

-- Step 4: Check for duplicates in player_ratings
-- Run this query first to detect any existing duplicates:
-- SELECT user_id, variant_id, COUNT(*) as count
-- FROM player_ratings
-- GROUP BY user_id, variant_id
-- HAVING COUNT(*) > 1;

-- Step 5: Deduplicate player_ratings (keep the row with the highest id)
DELETE FROM player_ratings
WHERE id NOT IN (
  SELECT id FROM (
    SELECT MAX(id) AS id
    FROM player_ratings
    GROUP BY user_id, variant_id
  ) AS t
);

-- Step 6: Note: The UNIQUE constraint from migration 0004 already enforces
-- uniqueness on (user_id, variant_id). No additional index replacement needed.
