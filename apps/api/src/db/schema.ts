import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
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

export type AiConfiguration = typeof aiConfigurations.$inferSelect;
export type PlayHistory = typeof playHistory.$inferSelect;
