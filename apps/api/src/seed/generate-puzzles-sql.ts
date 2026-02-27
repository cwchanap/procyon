/**
 * Generates puzzles.sql for D1 seeding.
 * Run with: bun src/seed/generate-puzzles-sql.ts > src/seed/puzzles.sql
 */

type P = { type: string; color: string; hasMoved?: boolean } | null;
const _ = null;

function w(type: string): P {
	return { type, color: 'white', hasMoved: true };
}
function b(type: string): P {
	return { type, color: 'black', hasMoved: true };
}

const wK = w('king');
const wQ = w('queen');
const wR = w('rook');
const wB = w('bishop');
const wN = w('knight');
const bK = b('king');
const bQ = b('queen');
const bR = b('rook');
const bN = b('knight');
const bP = b('pawn');

const PUZZLE_DATA = [
	{
		slug: 'back-rank-mate-1',
		title: 'Back Rank Mate',
		description: 'White to move. Deliver checkmate on the back rank.',
		difficulty: 'beginner',
		playerColor: 'white',
		board: [
			[_, _, _, _, bK, _, _, _],
			[_, _, _, bP, bP, bP, _, _],
			[_, _, _, _, _, _, _, _],
			[_, _, _, _, _, _, _, _],
			[_, _, _, _, _, _, _, _],
			[_, _, _, _, _, _, _, _],
			[_, _, _, _, _, _, _, _],
			[wR, _, _, _, _, _, wK, _],
		],
		solution: [{ from: 'a1', to: 'a8' }],
		hint: { pieceSquare: { row: 7, col: 0 }, targetSquare: { row: 0, col: 0 } },
	},
	{
		slug: 'smothered-mate-1',
		title: 'Smothered Mate',
		description:
			'White to move. The knight delivers a smothered mate — the king is trapped by its own pieces.',
		difficulty: 'beginner',
		playerColor: 'white',
		board: [
			[_, _, _, _, _, _, bR, bK],
			[_, _, _, _, _, _, bP, bP],
			[_, _, _, _, _, _, _, _],
			[_, _, _, _, _, _, wN, _],
			[_, _, _, _, _, _, _, _],
			[_, _, _, _, _, _, _, _],
			[_, _, _, _, _, _, _, _],
			[_, _, _, _, wK, _, _, _],
		],
		solution: [{ from: 'g5', to: 'f7' }],
		hint: { pieceSquare: { row: 3, col: 6 }, targetSquare: { row: 1, col: 5 } },
	},
	{
		slug: 'knight-fork-1',
		title: 'Knight Fork',
		description:
			'White to move. Use your knight to fork the king and rook simultaneously.',
		difficulty: 'beginner',
		playerColor: 'white',
		board: [
			[_, _, _, _, _, _, _, _],
			[_, _, _, _, _, _, _, _],
			[_, bR, _, _, _, bK, _, _],
			[_, _, _, _, _, _, _, _],
			[_, _, _, _, _, _, _, _],
			[_, _, wN, _, _, _, _, _],
			[_, _, _, _, _, _, _, _],
			[_, _, _, _, _, _, wK, _],
		],
		solution: [{ from: 'c3', to: 'd5' }],
		hint: { pieceSquare: { row: 5, col: 2 }, targetSquare: { row: 3, col: 3 } },
	},
	{
		slug: 'skewer-queen-1',
		title: 'Royal Skewer',
		description:
			'White to move. Skewer the king — when it moves, win the rook behind it.',
		difficulty: 'intermediate',
		playerColor: 'white',
		board: [
			[_, _, _, _, bR, _, _, _],
			[_, _, _, _, _, _, _, _],
			[_, _, _, _, _, _, _, _],
			[_, _, _, _, bK, _, _, _],
			[_, _, _, _, _, _, _, _],
			[_, _, _, _, _, _, _, _],
			[_, _, _, _, _, _, _, _],
			[wQ, _, _, _, _, _, wK, _],
		],
		solution: [{ from: 'a1', to: 'e1' }],
		hint: { pieceSquare: { row: 7, col: 0 }, targetSquare: { row: 7, col: 4 } },
	},
	{
		slug: 'discovered-attack-1',
		title: 'Discovered Attack',
		description:
			'White to move. Move a piece to win the queen and reveal a devastating check from behind.',
		difficulty: 'intermediate',
		playerColor: 'white',
		board: [
			[_, _, _, bK, _, _, _, _],
			[_, _, bQ, _, _, _, _, _],
			[_, _, _, _, _, _, _, _],
			[_, _, _, wN, _, _, _, _],
			[_, _, _, _, _, _, _, _],
			[_, _, _, _, _, _, _, _],
			[_, _, _, _, _, _, _, _],
			[_, _, _, wR, _, _, wK, _],
		],
		solution: [{ from: 'd5', to: 'c7' }],
		hint: { pieceSquare: { row: 3, col: 3 }, targetSquare: { row: 1, col: 2 } },
	},
	{
		slug: 'two-rooks-mate-1',
		title: 'Two Rooks Checkmate',
		description:
			'White to move. Use your second rook to deliver checkmate on the back rank.',
		difficulty: 'beginner',
		playerColor: 'white',
		board: [
			[bK, _, _, _, _, _, _, wR],
			[bP, _, _, _, _, _, _, _],
			[_, _, _, _, _, _, _, _],
			[_, _, _, _, _, _, _, _],
			[_, _, _, _, _, _, _, _],
			[_, _, _, _, _, _, _, _],
			[_, _, _, _, _, _, _, _],
			[_, wR, _, _, wK, _, _, _],
		],
		solution: [{ from: 'b1', to: 'b8' }],
		hint: { pieceSquare: { row: 7, col: 1 }, targetSquare: { row: 0, col: 1 } },
	},
	{
		slug: 'queen-mate-1',
		title: 'Queen Checkmate',
		description: 'White to move. Deliver checkmate with your queen.',
		difficulty: 'beginner',
		playerColor: 'white',
		board: [
			[_, _, _, _, _, _, _, bK],
			[_, _, _, _, _, _, bP, bP],
			[_, _, _, _, _, _, _, _],
			[_, _, _, _, _, _, _, _],
			[_, _, _, wQ, _, _, _, _],
			[_, _, _, _, _, _, _, _],
			[_, _, _, _, wK, _, _, _],
			[_, _, _, _, _, _, _, _],
		],
		solution: [{ from: 'd4', to: 'd8' }],
		hint: { pieceSquare: { row: 4, col: 3 }, targetSquare: { row: 0, col: 3 } },
	},
	{
		slug: 'queen-fork-1',
		title: 'Queen Fork',
		description:
			'White to move. Fork the king and rook with a single queen move.',
		difficulty: 'intermediate',
		playerColor: 'white',
		board: [
			[_, _, _, _, _, _, _, _],
			[_, bK, _, _, _, _, _, _],
			[_, _, _, _, _, _, _, _],
			[_, _, _, _, _, _, _, bR],
			[_, _, _, _, _, _, _, _],
			[_, wQ, _, _, _, _, _, _],
			[_, _, _, _, _, _, _, _],
			[_, _, _, _, _, _, wK, _],
		],
		solution: [{ from: 'b3', to: 'd5' }],
		hint: { pieceSquare: { row: 5, col: 1 }, targetSquare: { row: 3, col: 3 } },
	},
	{
		slug: 'rook-king-mate-1',
		title: 'Rook and King Mate',
		description:
			'White to move. Use the rook to deliver checkmate — the king supports the final blow.',
		difficulty: 'beginner',
		playerColor: 'white',
		board: [
			[bK, _, _, _, _, _, _, _],
			[_, _, _, _, _, _, _, _],
			[_, wK, _, _, _, _, _, _],
			[_, _, _, _, _, _, _, _],
			[_, _, _, _, _, _, _, _],
			[_, _, _, _, _, _, _, _],
			[_, _, _, _, _, _, _, wR],
			[_, _, _, _, _, _, _, _],
		],
		solution: [{ from: 'h2', to: 'h8' }],
		hint: { pieceSquare: { row: 6, col: 7 }, targetSquare: { row: 0, col: 7 } },
	},
	{
		slug: 'pin-and-win-1',
		title: 'Pin and Win',
		description:
			'White to move. Pin the knight to the king — the pinned piece cannot move.',
		difficulty: 'intermediate',
		playerColor: 'white',
		board: [
			[_, _, _, _, bK, _, _, _],
			[_, _, _, _, _, _, _, _],
			[_, _, bN, _, _, _, _, _],
			[_, _, _, _, _, _, _, _],
			[_, _, _, _, _, _, _, _],
			[_, _, _, _, _, _, _, _],
			[_, _, _, _, _, _, _, _],
			[_, _, _, _, _, wB, wK, _],
		],
		solution: [{ from: 'f1', to: 'b5' }],
		hint: { pieceSquare: { row: 7, col: 5 }, targetSquare: { row: 3, col: 1 } },
	},
];

function esc(s: string): string {
	return s.replace(/'/g, "''");
}

const lines: string[] = [
	'-- D1 seed for chess puzzles',
	'-- Columns: slug, title, description, difficulty, player_color, initial_board, solution, hint',
	'-- Idempotent via ON CONFLICT DO NOTHING keyed on slug',
	'',
];

for (const p of PUZZLE_DATA) {
	const board = JSON.stringify(p.board);
	const solution = JSON.stringify(p.solution);
	const hint = JSON.stringify(p.hint);
	lines.push(
		`INSERT INTO puzzles (slug, title, description, difficulty, player_color, initial_board, solution, hint)` +
			` VALUES ('${esc(p.slug)}', '${esc(p.title)}', '${esc(p.description)}', '${esc(p.difficulty)}', '${esc(p.playerColor)}', '${esc(board)}', '${esc(solution)}', '${esc(hint)}')` +
			` ON CONFLICT (slug) DO NOTHING;`
	);
}

console.log(lines.join('\n'));
