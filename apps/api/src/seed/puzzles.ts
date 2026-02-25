/**
 * Seed script for chess puzzles.
 * Run with: bun run db:seed
 * Idempotent — uses onConflictDoNothing() keyed on slug.
 *
 * Board coordinate system (matches createInitialBoard in chess/board.ts):
 *   row 0 = rank 8 (black back rank), row 7 = rank 1 (white back rank)
 *   col 0 = a-file, col 7 = h-file
 *   e.g. a1 = {row:7,col:0}, h8 = {row:0,col:7}, e4 = {row:4,col:4}
 */
import { initializeLocalDB } from '../db/local';
import { puzzles } from '../db/schema';

type P = { type: string; color: string; hasMoved?: boolean } | null;
const _ = null;

function w(type: string): P {
	return { type, color: 'white', hasMoved: true };
}
function b(type: string): P {
	return { type, color: 'black', hasMoved: true };
}

// Shorthand piece constructors
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

// Each row in board arrays = one rank, row[0] = rank 8, row[7] = rank 1

const PUZZLE_DATA = [
	// ─────────────────────────────────────────────
	// 1. Back Rank Mate (Beginner)
	//    White rook on a1, delivers Ra8#
	//    bK e8, bP d7/e7/f7 — king smothered by own pawns
	// ─────────────────────────────────────────────
	{
		slug: 'back-rank-mate-1',
		title: 'Back Rank Mate',
		description: 'White to move. Deliver checkmate on the back rank.',
		difficulty: 'beginner',
		playerColor: 'white',
		board: [
			[_, _, _, _, bK, _, _, _], // rank 8: bK on e8 (col 4)
			[_, _, _, bP, bP, bP, _, _], // rank 7: bP on d7/e7/f7
			[_, _, _, _, _, _, _, _],
			[_, _, _, _, _, _, _, _],
			[_, _, _, _, _, _, _, _],
			[_, _, _, _, _, _, _, _],
			[_, _, _, _, _, _, _, _],
			[wR, _, _, _, _, _, wK, _], // rank 1: wR a1, wK g1
		],
		solution: [{ from: 'a1', to: 'a8' }],
		hint: { pieceSquare: { row: 7, col: 0 }, targetSquare: { row: 0, col: 0 } },
	},

	// ─────────────────────────────────────────────
	// 2. Smothered Mate (Beginner)
	//    wN g5 → f7#  (knight delivers smothered mate)
	//    bK h8, bR g8, bP g7/h7 — king trapped in corner
	// ─────────────────────────────────────────────
	{
		slug: 'smothered-mate-1',
		title: 'Smothered Mate',
		description:
			'White to move. The knight delivers a smothered mate — the king is trapped by its own pieces.',
		difficulty: 'beginner',
		playerColor: 'white',
		board: [
			[_, _, _, _, _, _, bR, bK], // rank 8: bR g8, bK h8
			[_, _, _, _, _, _, bP, bP], // rank 7: bP g7/h7
			[_, _, _, _, _, _, _, _],
			[_, _, _, _, _, _, wN, _], // rank 5: wN g5 (col 6)
			[_, _, _, _, _, _, _, _],
			[_, _, _, _, _, _, _, _],
			[_, _, _, _, _, _, _, _],
			[_, _, _, _, wK, _, _, _], // rank 1: wK e1
		],
		solution: [{ from: 'g5', to: 'f7' }],
		hint: { pieceSquare: { row: 3, col: 6 }, targetSquare: { row: 1, col: 5 } },
	},

	// ─────────────────────────────────────────────
	// 3. Knight Fork (Beginner)
	//    wN c3 → d5+  forks bK f6 and bR b6
	// ─────────────────────────────────────────────
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
			[_, bR, _, _, _, bK, _, _], // rank 6: bR b6 (col 1), bK f6 (col 5)
			[_, _, _, _, _, _, _, _],
			[_, _, _, _, _, _, _, _],
			[_, _, wN, _, _, _, _, _], // rank 3: wN c3 (col 2)
			[_, _, _, _, _, _, _, _],
			[_, _, _, _, _, _, wK, _], // rank 1: wK g1
		],
		solution: [{ from: 'c3', to: 'd5' }],
		hint: { pieceSquare: { row: 5, col: 2 }, targetSquare: { row: 3, col: 3 } },
	},

	// ─────────────────────────────────────────────
	// 4. Skewer (Intermediate)
	//    wQ a1 → e1+  skewers bK e5, bR behind on e8
	// ─────────────────────────────────────────────
	{
		slug: 'skewer-queen-1',
		title: 'Royal Skewer',
		description:
			'White to move. Skewer the king — when it moves, win the rook behind it.',
		difficulty: 'intermediate',
		playerColor: 'white',
		board: [
			[_, _, _, _, bR, _, _, _], // rank 8: bR e8
			[_, _, _, _, _, _, _, _],
			[_, _, _, _, _, _, _, _],
			[_, _, _, _, bK, _, _, _], // rank 5: bK e5
			[_, _, _, _, _, _, _, _],
			[_, _, _, _, _, _, _, _],
			[_, _, _, _, _, _, _, _],
			[wQ, _, _, _, _, _, wK, _], // rank 1: wQ a1, wK g1
		],
		solution: [{ from: 'a1', to: 'e1' }],
		hint: { pieceSquare: { row: 7, col: 0 }, targetSquare: { row: 7, col: 4 } },
	},

	// ─────────────────────────────────────────────
	// 5. Discovered Attack (Intermediate)
	//    wN d5 → c7  captures bQ AND discovers Rd1+ to bK d8
	// ─────────────────────────────────────────────
	{
		slug: 'discovered-attack-1',
		title: 'Discovered Attack',
		description:
			'White to move. Move a piece to win the queen and reveal a devastating check from behind.',
		difficulty: 'intermediate',
		playerColor: 'white',
		board: [
			[_, _, _, bK, _, _, _, _], // rank 8: bK d8
			[_, _, bQ, _, _, _, _, _], // rank 7: bQ c7
			[_, _, _, _, _, _, _, _],
			[_, _, _, wN, _, _, _, _], // rank 5: wN d5
			[_, _, _, _, _, _, _, _],
			[_, _, _, _, _, _, _, _],
			[_, _, _, _, _, _, _, _],
			[_, _, _, wR, _, _, wK, _], // rank 1: wR d1, wK g1
		],
		solution: [{ from: 'd5', to: 'c7' }],
		hint: { pieceSquare: { row: 3, col: 3 }, targetSquare: { row: 1, col: 2 } },
	},

	// ─────────────────────────────────────────────
	// 6. Two Rooks Mate (Beginner)
	//    wR b1 → b8#  second rook delivers back-rank mate
	//    bK a8 trapped by own pawns, wR h8 covers rank
	// ─────────────────────────────────────────────
	{
		slug: 'two-rooks-mate-1',
		title: 'Two Rooks Checkmate',
		description:
			'White to move. Use your second rook to deliver checkmate on the back rank.',
		difficulty: 'beginner',
		playerColor: 'white',
		board: [
			[bK, _, _, _, _, _, _, wR], // rank 8: bK a8, wR h8
			[bP, bP, _, _, _, _, _, _], // rank 7: bP a7/b7
			[_, _, _, _, _, _, _, _],
			[_, _, _, _, _, _, _, _],
			[_, _, _, _, _, _, _, _],
			[_, _, _, _, _, _, _, _],
			[_, _, _, _, _, _, _, _],
			[_, wR, _, _, wK, _, _, _], // rank 1: wR b1, wK e1
		],
		solution: [{ from: 'b1', to: 'b8' }],
		hint: { pieceSquare: { row: 7, col: 1 }, targetSquare: { row: 0, col: 1 } },
	},

	// ─────────────────────────────────────────────
	// 7. Queen Checkmate (Beginner)
	//    wQ d4 → d8#  queen slides up d-file, mates bK h8
	// ─────────────────────────────────────────────
	{
		slug: 'queen-mate-1',
		title: 'Queen Checkmate',
		description: 'White to move. Deliver checkmate with your queen.',
		difficulty: 'beginner',
		playerColor: 'white',
		board: [
			[_, _, _, _, _, _, _, bK], // rank 8: bK h8
			[_, _, _, _, _, _, bP, bP], // rank 7: bP g7/h7
			[_, _, _, _, _, _, _, _],
			[_, _, _, _, _, _, _, _],
			[_, _, _, wQ, _, _, _, _], // rank 4: wQ d4
			[_, _, _, _, _, _, _, _],
			[_, _, _, _, wK, _, _, _], // rank 2: wK e2
			[_, _, _, _, _, _, _, _],
		],
		solution: [{ from: 'd4', to: 'd8' }],
		hint: { pieceSquare: { row: 4, col: 3 }, targetSquare: { row: 0, col: 3 } },
	},

	// ─────────────────────────────────────────────
	// 8. Queen Fork (Intermediate)
	//    wQ b3 → d5+  forks bK b7 (diagonal) and bR h5 (rank)
	// ─────────────────────────────────────────────
	{
		slug: 'queen-fork-1',
		title: 'Queen Fork',
		description:
			'White to move. Fork the king and rook with a single queen move.',
		difficulty: 'intermediate',
		playerColor: 'white',
		board: [
			[_, _, _, _, _, _, _, _],
			[_, bK, _, _, _, _, _, _], // rank 7: bK b7
			[_, _, _, _, _, _, _, _],
			[_, _, _, _, _, _, _, bR], // rank 5: bR h5
			[_, _, _, _, _, _, _, _],
			[_, wQ, _, _, _, _, _, _], // rank 3: wQ b3
			[_, _, _, _, _, _, _, _],
			[_, _, _, _, _, _, wK, _], // rank 1: wK g1
		],
		solution: [{ from: 'b3', to: 'd5' }],
		hint: { pieceSquare: { row: 5, col: 1 }, targetSquare: { row: 3, col: 3 } },
	},

	// ─────────────────────────────────────────────
	// 9. Rook + King Checkmate (Beginner)
	//    wR h2 → h8#  wK b6 controls a7/b7
	// ─────────────────────────────────────────────
	{
		slug: 'rook-king-mate-1',
		title: 'Rook and King Mate',
		description:
			'White to move. Use the rook to deliver checkmate — the king supports the final blow.',
		difficulty: 'beginner',
		playerColor: 'white',
		board: [
			[bK, _, _, _, _, _, _, _], // rank 8: bK a8
			[_, _, _, _, _, _, _, _],
			[_, wK, _, _, _, _, _, _], // rank 6: wK b6
			[_, _, _, _, _, _, _, _],
			[_, _, _, _, _, _, _, _],
			[_, _, _, _, _, _, _, _],
			[_, _, _, _, _, _, _, wR], // rank 2: wR h2
			[_, _, _, _, _, _, _, _],
		],
		solution: [{ from: 'h2', to: 'h8' }],
		hint: { pieceSquare: { row: 6, col: 7 }, targetSquare: { row: 0, col: 7 } },
	},

	// ─────────────────────────────────────────────
	// 10. Pin and Win (Intermediate)
	//     wB f1 → b5+  pins bN c6 to bK e8, winning the knight
	// ─────────────────────────────────────────────
	{
		slug: 'pin-and-win-1',
		title: 'Pin and Win',
		description:
			'White to move. Pin the knight to the king — the pinned piece cannot move.',
		difficulty: 'intermediate',
		playerColor: 'white',
		board: [
			[_, _, _, _, bK, _, _, _], // rank 8: bK e8
			[_, _, _, _, _, _, _, _],
			[_, _, bN, _, _, _, _, _], // rank 6: bN c6
			[_, _, _, _, _, _, _, _],
			[_, _, _, _, _, _, _, _],
			[_, _, _, _, _, _, _, _],
			[_, _, _, _, _, _, _, _],
			[_, _, _, _, _, wB, wK, _], // rank 1: wB f1, wK g1
		],
		solution: [{ from: 'f1', to: 'b5' }],
		hint: { pieceSquare: { row: 7, col: 5 }, targetSquare: { row: 3, col: 1 } },
	},
];

async function seed() {
	const db = initializeLocalDB();
	console.log('Seeding chess puzzles...');

	for (const puzzle of PUZZLE_DATA) {
		await db
			.insert(puzzles)
			.values({
				slug: puzzle.slug,
				title: puzzle.title,
				description: puzzle.description,
				difficulty: puzzle.difficulty,
				playerColor: puzzle.playerColor,
				initialBoard: JSON.stringify(puzzle.board),
				solution: JSON.stringify(puzzle.solution),
				hint: JSON.stringify(puzzle.hint),
			})
			.onConflictDoNothing();
		console.log(`  ✓ ${puzzle.slug}`);
	}

	console.log(`Done. Seeded ${PUZZLE_DATA.length} puzzles.`);
	process.exit(0);
}

seed().catch(err => {
	console.error('Seed failed:', err);
	process.exit(1);
});
