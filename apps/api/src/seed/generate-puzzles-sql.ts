/**
 * Generates puzzles.sql for D1 seeding.
 * Run with: bun src/seed/generate-puzzles-sql.ts > src/seed/puzzles.sql
 */
import { PUZZLE_DATA, validatePuzzlePosition } from './puzzles';

type Color = 'white' | 'black';

function esc(s: string): string {
	return s.replace(/'/g, "''");
}

const lines: string[] = [
	'-- D1 seed for chess puzzles',
	'-- Columns: slug, title, description, difficulty, player_color, initial_board, solution, hint',
	'-- Idempotent via ON CONFLICT DO UPDATE keyed on slug',
	'',
];

for (const p of PUZZLE_DATA) {
	// Validate each puzzle before emitting SQL so bad data fails the build.
	validatePuzzlePosition({
		slug: p.slug,
		playerColor: p.playerColor as Color,
		board: p.board,
	});

	const board = JSON.stringify(p.board);
	const solution = JSON.stringify(p.solution);
	const hint = JSON.stringify(p.hint);
	lines.push(
		`INSERT INTO puzzles (slug, title, description, difficulty, player_color, initial_board, solution, hint)` +
			` VALUES ('${esc(p.slug)}', '${esc(p.title)}', '${esc(p.description)}', '${esc(p.difficulty)}', '${esc(p.playerColor)}', '${esc(board)}', '${esc(solution)}', '${esc(hint)}')` +
			` ON CONFLICT (slug) DO UPDATE SET` +
			` title = excluded.title,` +
			` description = excluded.description,` +
			` difficulty = excluded.difficulty,` +
			` player_color = excluded.player_color,` +
			` initial_board = excluded.initial_board,` +
			` solution = excluded.solution,` +
			` hint = excluded.hint;`
	);
}

console.log(lines.join('\n'));
