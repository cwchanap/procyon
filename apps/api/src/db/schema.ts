import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
import {
    ChessVariantId,
    GameResultStatus,
    OpponentLlmId,
} from '../constants/game';

export const users = sqliteTable('users', {
    id: integer('id').primaryKey({ autoIncrement: true }),
    email: text('email').notNull().unique(),
    username: text('username').notNull().unique(),
    passwordHash: text('password_hash').notNull(),
    createdAt: text('created_at')
        .default(sql`CURRENT_TIMESTAMP`)
        .notNull(),
    updatedAt: text('updated_at')
        .default(sql`CURRENT_TIMESTAMP`)
        .notNull(),
});

export const aiConfigurations = sqliteTable('ai_configurations', {
    id: integer('id').primaryKey({ autoIncrement: true }),
    userId: integer('user_id')
        .notNull()
        .references(() => users.id, { onDelete: 'cascade' }),
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
});

export const playHistory = sqliteTable('play_history', {
    id: integer('id').primaryKey({ autoIncrement: true }),
    userId: integer('user_id')
        .notNull()
        .references(() => users.id, { onDelete: 'cascade' }),
    chessId: text('chess_id').$type<ChessVariantId>().notNull(),
    date: text('date').notNull(),
    status: text('status').$type<GameResultStatus>().notNull(),
    opponentUserId: integer('opponent_user_id').references(() => users.id, {
        onDelete: 'set null',
    }),
    opponentLlmId: text('opponent_llm_id').$type<OpponentLlmId | null>(),
});

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type AiConfiguration = typeof aiConfigurations.$inferSelect;
export type NewAiConfiguration = typeof aiConfigurations.$inferInsert;
export type PlayHistory = typeof playHistory.$inferSelect;
export type NewPlayHistory = typeof playHistory.$inferInsert;
