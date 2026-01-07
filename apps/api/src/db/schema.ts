import {
	sqliteTable,
	text,
	integer,
	index,
	uniqueIndex,
} from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
import {
	ChessVariantId,
	GameResultStatus,
	OpponentLlmId,
} from '../constants/game';

// Note: User authentication is now handled by Supabase.
// The user, session, account, and verification tables have been removed.
// User IDs (Supabase UUIDs) are stored as TEXT in application data tables.

export const aiConfigurations = sqliteTable(
	'ai_configurations',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		// Supabase user UUID stored as text (no foreign key - user data lives in Supabase)
		userId: text('user_id').notNull(),
		provider: text('provider').notNull(), // 'gemini', 'openrouter', 'openai', etc.
		modelName: text('model_name').notNull(), // 'gemini-2.0-flash', 'gpt-4o-mini', etc.
		apiKey: text('api_key').notNull(),
		isActive: integer('is_active', { mode: 'boolean' })
			.default(false)
			.notNull(),
		createdAt: text('created_at')
			.default(sql`CURRENT_TIMESTAMP`)
			.notNull(),
		updatedAt: text('updated_at')
			.default(sql`CURRENT_TIMESTAMP`)
			.notNull(),
	},
	table => ({
		userIdIdx: index('ai_configurations_user_id_idx').on(table.userId),
	})
);

export const playHistory = sqliteTable(
	'play_history',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		// Supabase user UUID stored as text (no foreign key - user data lives in Supabase)
		userId: text('user_id').notNull(),
		chessId: text('chess_id').$type<ChessVariantId>().notNull(),
		date: text('date').notNull(),
		status: text('status').$type<GameResultStatus>().notNull(),
		opponentUserId: text('opponent_user_id').$type<string | null>(),
		opponentLlmId: text('opponent_llm_id').$type<OpponentLlmId | null>(),
	},
	table => ({
		userIdIdx: index('play_history_user_id_idx').on(table.userId),
		opponentUserIdIdx: index('play_history_opponent_user_id_idx').on(
			table.opponentUserId
		),
	})
);

// Player ratings per variant
export const playerRatings = sqliteTable(
	'player_ratings',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		userId: text('user_id').notNull(),
		variantId: text('variant_id').$type<ChessVariantId>().notNull(),
		rating: integer('rating').notNull().default(1200),
		gamesPlayed: integer('games_played').notNull().default(0),
		wins: integer('wins').notNull().default(0),
		losses: integer('losses').notNull().default(0),
		draws: integer('draws').notNull().default(0),
		peakRating: integer('peak_rating').notNull().default(1200),
		createdAt: text('created_at')
			.default(sql`CURRENT_TIMESTAMP`)
			.notNull(),
		updatedAt: text('updated_at')
			.default(sql`CURRENT_TIMESTAMP`)
			.notNull(),
	},
	table => ({
		userVariantIdx: uniqueIndex('player_ratings_user_variant_idx').on(
			table.userId,
			table.variantId
		),
		ratingIdx: index('player_ratings_rating_idx').on(table.rating),
	})
);

// Rating history for tracking changes over time
export const ratingHistory = sqliteTable(
	'rating_history',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		userId: text('user_id').notNull(),
		variantId: text('variant_id').$type<ChessVariantId>().notNull(),
		playHistoryId: integer('play_history_id').notNull(),
		oldRating: integer('old_rating').notNull(),
		newRating: integer('new_rating').notNull(),
		ratingChange: integer('rating_change').notNull(),
		opponentRating: integer('opponent_rating').notNull(),
		gameResult: text('game_result').$type<GameResultStatus>().notNull(),
		createdAt: text('created_at')
			.default(sql`CURRENT_TIMESTAMP`)
			.notNull(),
	},
	table => ({
		userIdIdx: index('rating_history_user_id_idx').on(table.userId),
		playHistoryIdIdx: index('rating_history_play_history_id_idx').on(
			table.playHistoryId
		),
	})
);

// Configurable AI opponent ratings per model and variant
export const aiOpponentRatings = sqliteTable(
	'ai_opponent_ratings',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		opponentLlmId: text('opponent_llm_id').$type<OpponentLlmId>().notNull(),
		variantId: text('variant_id').$type<ChessVariantId>().notNull(),
		rating: integer('rating').notNull().default(1400),
		description: text('description'),
		updatedAt: text('updated_at')
			.default(sql`CURRENT_TIMESTAMP`)
			.notNull(),
	},
	table => ({
		llmVariantIdx: uniqueIndex('ai_opponent_ratings_llm_variant_idx').on(
			table.opponentLlmId,
			table.variantId
		),
	})
);

export type AiConfiguration = typeof aiConfigurations.$inferSelect;
export type PlayHistory = typeof playHistory.$inferSelect;
export type PlayerRating = typeof playerRatings.$inferSelect;
export type RatingHistory = typeof ratingHistory.$inferSelect;
export type AiOpponentRating = typeof aiOpponentRatings.$inferSelect;
