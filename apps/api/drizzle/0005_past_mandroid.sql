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
  SELECT MAX(id)
  FROM ai_opponent_ratings
  GROUP BY opponent_llm_id, variant_id
);

-- Step 3: Safely replace the index (create new one first, then drop old)
CREATE UNIQUE INDEX IF NOT EXISTS `ai_opponent_ratings_llm_variant_idx_new`
ON `ai_opponent_ratings` (`opponent_llm_id`,`variant_id`);

-- Drop the old index (safe now that new one exists)
DROP INDEX IF EXISTS `ai_opponent_ratings_llm_variant_idx`;

-- Rename the new index to the original name
CREATE UNIQUE INDEX `ai_opponent_ratings_llm_variant_idx`
ON `ai_opponent_ratings` (`opponent_llm_id`,`variant_id`);

-- Step 4: Check for duplicates in player_ratings
-- Run this query first to detect any existing duplicates:
-- SELECT user_id, variant_id, COUNT(*) as count
-- FROM player_ratings
-- GROUP BY user_id, variant_id
-- HAVING COUNT(*) > 1;

-- Step 5: Deduplicate player_ratings (keep the row with the highest id)
DELETE FROM player_ratings
WHERE id NOT IN (
  SELECT MAX(id)
  FROM player_ratings
  GROUP BY user_id, variant_id
);

-- Step 6: Safely replace the index (create new one first, then drop old)
CREATE UNIQUE INDEX IF NOT EXISTS `player_ratings_user_variant_idx_new`
ON `player_ratings` (`user_id`,`variant_id`);

-- Drop the old index (safe now that new one exists)
DROP INDEX IF EXISTS `player_ratings_user_variant_idx`;

-- Rename the new index to the original name
CREATE UNIQUE INDEX `player_ratings_user_variant_idx`
ON `player_ratings` (`user_id`,`variant_id`);
