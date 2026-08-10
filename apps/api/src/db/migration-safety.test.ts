import { describe, expect, test } from 'bun:test';
import { Database } from 'bun:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

describe('play-history identity migration', () => {
	test('0011 renames chess_id without losing existing play history', () => {
		const drizzleDir = join(import.meta.dir, '..', '..', 'drizzle');
		const file = readdirSync(drizzleDir).find(name =>
			/^0011_.*\.sql$/.test(name)
		);
		if (!file) throw new Error('0011 migration missing');
		const sql = readFileSync(join(drizzleDir, file), 'utf8');

		expect(sql).toContain('RENAME COLUMN `chess_id` TO `game_id`');
		expect(sql).not.toMatch(/DROP COLUMN [`"]?chess_id/);
		expect(sql).not.toMatch(/ADD COLUMN [`"]?game_id/);

		const db = new Database(':memory:');
		db.exec(
			'CREATE TABLE play_history (id integer PRIMARY KEY, chess_id text NOT NULL)'
		);
		db.exec("INSERT INTO play_history (id, chess_id) VALUES (1, 'chess')");
		db.exec(sql.replaceAll('--> statement-breakpoint', ''));
		const row = db
			.query('SELECT id, game_id FROM play_history WHERE id = 1')
			.get();
		expect(row).toEqual({ id: 1, game_id: 'chess' });
		db.close();
	});
});
