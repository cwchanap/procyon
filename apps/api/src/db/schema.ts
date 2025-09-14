import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

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

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
