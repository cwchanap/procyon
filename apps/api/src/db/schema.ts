import { sqliteTable, text, integer, unique } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
import {
	ChessVariantId,
	GameResultStatus,
	OpponentLlmId,
} from '../constants/game';

export const user = sqliteTable('user', {
	id: text('id')
		.primaryKey()
		.$defaultFn(() => crypto.randomUUID()),
	email: text('email').notNull().unique(),
	emailVerified: integer('email_verified', { mode: 'boolean' })
		.notNull()
		.default(false),
	name: text('name'),
	username: text('username').unique(), // Make nullable and unique
	displayUsername: text('display_username'),
	password: text('password'),
	image: text('image'),
	createdAt: integer('created_at', { mode: 'timestamp' })
		.notNull()
		.$defaultFn(() => new Date()),
	updatedAt: integer('updated_at', { mode: 'timestamp' })
		.notNull()
		.$defaultFn(() => new Date()),
});

export const session = sqliteTable('session', {
	id: text('id')
		.primaryKey()
		.$defaultFn(() => crypto.randomUUID()),
	expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
	token: text('token').notNull().unique(),
	ipAddress: text('ip_address'),
	userAgent: text('user_agent'),
	userId: text('user_id')
		.notNull()
		.references(() => user.id, { onDelete: 'cascade' }),
	createdAt: integer('created_at', { mode: 'timestamp' })
		.notNull()
		.$defaultFn(() => new Date()),
	updatedAt: integer('updated_at', { mode: 'timestamp' })
		.notNull()
		.$defaultFn(() => new Date()),
});

export const account = sqliteTable(
	'account',
	{
		id: text('id')
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		accountId: text('account_id').notNull(),
		providerId: text('provider_id').notNull(),
		userId: text('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		password: text('password'),
		accessToken: text('access_token'),
		refreshToken: text('refresh_token'),
		idToken: text('id_token'),
		accessTokenExpiresAt: integer('access_token_expires_at', {
			mode: 'timestamp',
		}),
		refreshTokenExpiresAt: integer('refresh_token_expires_at', {
			mode: 'timestamp',
		}),
		scope: text('scope'),
		expiresAt: integer('expires_at', { mode: 'timestamp' }),
		createdAt: integer('created_at', { mode: 'timestamp' })
			.notNull()
			.$defaultFn(() => new Date()),
		updatedAt: integer('updated_at', { mode: 'timestamp' })
			.notNull()
			.$defaultFn(() => new Date()),
	},
	table => ({
		accountProviderIdx: unique().on(table.accountId, table.providerId),
	})
);

export const verification = sqliteTable('verification', {
	id: text('id')
		.primaryKey()
		.$defaultFn(() => crypto.randomUUID()),
	identifier: text('identifier').notNull(),
	value: text('value').notNull(),
	expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
	createdAt: integer('created_at', { mode: 'timestamp' })
		.notNull()
		.$defaultFn(() => new Date()),
	updatedAt: integer('updated_at', { mode: 'timestamp' })
		.notNull()
		.$defaultFn(() => new Date()),
});

export const aiConfigurations = sqliteTable('ai_configurations', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	userId: text('user_id')
		.notNull()
		.references(() => user.id, { onDelete: 'cascade' }),
	provider: text('provider').notNull(), // 'gemini', 'openrouter', 'openai', etc.
	modelName: text('model_name').notNull(), // 'gemini-2.0-flash', 'gpt-4o-mini', etc.
	apiKey: text('api_key').notNull(),
	isActive: integer('is_active', { mode: 'boolean' }).default(false).notNull(),
	createdAt: text('created_at')
		.default(sql`CURRENT_TIMESTAMP`)
		.notNull(),
	updatedAt: text('updated_at')
		.default(sql`CURRENT_TIMESTAMP`)
		.notNull(),
});

export const playHistory = sqliteTable('play_history', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	userId: text('user_id')
		.notNull()
		.references(() => user.id, { onDelete: 'cascade' }),
	chessId: text('chess_id').$type<ChessVariantId>().notNull(),
	date: text('date').notNull(),
	status: text('status').$type<GameResultStatus>().notNull(),
	opponentUserId: integer('opponent_user_id'),
	opponentLlmId: text('opponent_llm_id').$type<OpponentLlmId | null>(),
});

export type User = typeof user.$inferSelect;
export type Session = typeof session.$inferSelect;
export type Account = typeof account.$inferSelect;
export type Verification = typeof verification.$inferSelect;
export type AiConfiguration = typeof aiConfigurations.$inferSelect;
export type PlayHistory = typeof playHistory.$inferSelect;
