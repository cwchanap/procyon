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

type PieceType = 'pawn' | 'knight' | 'bishop' | 'rook' | 'queen' | 'king';
type Color = 'white' | 'black';
type P = { type: PieceType; color: Color } | null;
const _ = null;

function w(type: PieceType): P {
	return { type, color: 'white' };
}
function b(type: PieceType): P {
	return { type, color: 'black' };
}

// Shorthand piece constructors
const wK = w('king');
const wQ = w('queen');
const wR = w('rook');
const wB = w('bishop');
const wN = w('knight');
const _wP = w('pawn');
const bK = b('king');
const bQ = b('queen');
const bR = b('rook');
const _bB = b('bishop');
const bN = b('knight');
const bP = b('pawn');

// Each row in board arrays = one rank, row[0] = rank 8, row[7] = rank 1

export const PUZZLE_DATA = [
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
	//    wQ a1 → e1+  skewers bK e6, bR behind on e8
	//    (bK on e6, not e5 — e5 lies on the a1 diagonal and would
	//     already be in check before White moves)
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
			[_, _, _, _, bK, _, _, _], // rank 6: bK e6
			[_, _, _, _, _, _, _, _],
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
	//    wR h1 → h8#  ladder mate: Rg7 cuts off the 7th rank,
	//    Rh8 delivers back-rank check, bK a8 has no escape.
	//    (wR must start off the 8th rank — a rook on h8 would
	//     already check bK a8 along rank 8)
	// ─────────────────────────────────────────────
	{
		slug: 'two-rooks-mate-1',
		title: 'Two Rooks Checkmate',
		description:
			'White to move. Use your second rook to deliver checkmate on the back rank.',
		difficulty: 'beginner',
		playerColor: 'white',
		board: [
			[bK, _, _, _, _, _, _, _], // rank 8: bK a8
			[bP, _, _, _, _, _, wR, _], // rank 7: bP a7, wR g7 (cuts off 7th rank)
			[_, _, _, _, _, _, _, _],
			[_, _, _, _, _, _, _, _],
			[_, _, _, _, _, _, _, _],
			[_, _, _, _, _, _, _, _],
			[_, _, _, _, _, _, _, _],
			[_, _, _, _, wK, _, _, wR], // rank 1: wK e1, wR h1
		],
		solution: [{ from: 'h1', to: 'h8' }],
		hint: { pieceSquare: { row: 7, col: 7 }, targetSquare: { row: 0, col: 7 } },
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
	//    wQ d3 → d5+  forks bK b7 (diagonal) and bR h5 (rank)
	//    (wQ on d3, not b3 — b3 already attacks bK b7 along the
	//     b-file, which would check Black before White moves)
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
			[_, _, _, wQ, _, _, _, _], // rank 3: wQ d3 (col 3)
			[_, _, _, _, _, _, _, _],
			[_, _, _, _, _, _, wK, _], // rank 1: wK g1
		],
		solution: [{ from: 'd3', to: 'd5' }],
		hint: { pieceSquare: { row: 5, col: 3 }, targetSquare: { row: 3, col: 3 } },
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
	//     wB f1 → b5  pins bN c6 to bK e8, winning the knight
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

// ─────────────────────────────────────────────
// Seed validation
// Ensures each puzzle position is a legal standard-chess position:
//   - 8×8 board
//   - exactly one king per side
//   - the side NOT to move is not in check (a position where the
//     non-moving side is already attacked is unreachable — after a
//     legal move the checked player must be the side to move)
// ─────────────────────────────────────────────

const KNIGHT_OFFSETS: [number, number][] = [
	[-2, -1],
	[-2, 1],
	[-1, -2],
	[-1, 2],
	[1, -2],
	[1, 2],
	[2, -1],
	[2, 1],
];
const KING_OFFSETS: [number, number][] = [
	[-1, -1],
	[-1, 0],
	[-1, 1],
	[0, -1],
	[0, 1],
	[1, -1],
	[1, 0],
	[1, 1],
];
const DIAGONAL_DIRS: [number, number][] = [
	[-1, -1],
	[-1, 1],
	[1, -1],
	[1, 1],
];
const ORTHOGONAL_DIRS: [number, number][] = [
	[-1, 0],
	[1, 0],
	[0, -1],
	[0, 1],
];

function inBounds(row: number, col: number): boolean {
	return row >= 0 && row < 8 && col >= 0 && col < 8;
}

/**
 * Returns true if `square` is attacked by any piece of `byColor`.
 * Board layout: row 0 = rank 8, row 7 = rank 1, col 0 = a-file.
 * White pawns capture toward row 0 (up); black pawns toward row 7.
 */
export function isSquareAttacked(
	board: P[][],
	row: number,
	col: number,
	byColor: Color
): boolean {
	// Pawn attacks
	// White pawns capture toward row 0 (up), so a white pawn attacking
	// (row, col) sits at (row+1, col±1). Black pawns capture toward
	// row 7 (down), so the attacker sits at (row-1, col±1).
	const pawnDir = byColor === 'white' ? 1 : -1;
	for (const dc of [-1, 1]) {
		const pr = row + pawnDir;
		const pc = col + dc;
		if (inBounds(pr, pc)) {
			const p = board[pr]?.[pc];
			if (p && p.color === byColor && p.type === 'pawn') return true;
		}
	}

	// Knight attacks
	for (const [dr, dc] of KNIGHT_OFFSETS) {
		const kr = row + dr;
		const kc = col + dc;
		if (inBounds(kr, kc)) {
			const p = board[kr]?.[kc];
			if (p && p.color === byColor && p.type === 'knight') return true;
		}
	}

	// King attacks
	for (const [dr, dc] of KING_OFFSETS) {
		const kr = row + dr;
		const kc = col + dc;
		if (inBounds(kr, kc)) {
			const p = board[kr]?.[kc];
			if (p && p.color === byColor && p.type === 'king') return true;
		}
	}

	// Sliding attacks: bishop/queen (diagonal), rook/queen (orthogonal)
	for (const [dr, dc] of DIAGONAL_DIRS) {
		let r = row + dr;
		let c = col + dc;
		while (inBounds(r, c)) {
			const p = board[r]?.[c];
			if (p) {
				if (p.color === byColor && (p.type === 'bishop' || p.type === 'queen'))
					return true;
				break;
			}
			r += dr;
			c += dc;
		}
	}
	for (const [dr, dc] of ORTHOGONAL_DIRS) {
		let r = row + dr;
		let c = col + dc;
		while (inBounds(r, c)) {
			const p = board[r]?.[c];
			if (p) {
				if (p.color === byColor && (p.type === 'rook' || p.type === 'queen'))
					return true;
				break;
			}
			r += dr;
			c += dc;
		}
	}

	return false;
}

export interface PuzzleSeed {
	slug: string;
	playerColor: Color;
	board: P[][];
}

/**
 * Validates a puzzle position. Throws if the board is not 8×8, does
 * not contain exactly one king per side, or the non-moving side is
 * currently in check.
 */
export function validatePuzzlePosition(puzzle: PuzzleSeed): void {
	const { board, playerColor, slug } = puzzle;
	if (board.length !== 8 || board.some(rank => rank.length !== 8)) {
		throw new Error(`Puzzle "${slug}" board must be exactly 8×8`);
	}

	const kingPos: Record<Color, [number, number] | null> = {
		white: null,
		black: null,
	};
	for (let r = 0; r < 8; r++) {
		for (let c = 0; c < 8; c++) {
			const p = board[r]?.[c];
			if (p?.type === 'king') {
				if (kingPos[p.color]) {
					throw new Error(`Puzzle "${slug}" has more than one ${p.color} king`);
				}
				kingPos[p.color] = [r, c];
			}
		}
	}
	if (!kingPos.white || !kingPos.black) {
		throw new Error(`Puzzle "${slug}" must contain exactly one king per side`);
	}

	const opponent: Color = playerColor === 'white' ? 'black' : 'white';
	const [okr, okc] = kingPos[opponent]!;
	if (isSquareAttacked(board, okr, okc, playerColor)) {
		throw new Error(
			`Puzzle "${slug}" is invalid: the ${opponent} king is already in check before ${playerColor} moves`
		);
	}
}

async function seed() {
	// Validate every puzzle position before touching the database.
	for (const puzzle of PUZZLE_DATA) {
		validatePuzzlePosition({
			slug: puzzle.slug,
			playerColor: puzzle.playerColor as Color,
			board: puzzle.board,
		});
	}

	const db = initializeLocalDB();
	console.log('Seeding chess puzzles...');

	type PuzzleValues = typeof puzzles.$inferInsert;
	const puzzleValues: PuzzleValues[] = PUZZLE_DATA.map(puzzle => ({
		slug: puzzle.slug,
		title: puzzle.title,
		description: puzzle.description,
		difficulty: puzzle.difficulty as PuzzleValues['difficulty'],
		playerColor: puzzle.playerColor as PuzzleValues['playerColor'],
		initialBoard: JSON.stringify(puzzle.board),
		solution: JSON.stringify(puzzle.solution),
		hint: JSON.stringify(puzzle.hint),
	}));

	const result = await db
		.insert(puzzles)
		.values(puzzleValues)
		.onConflictDoNothing()
		.returning();

	console.log(
		`Done. Seeded ${result.length} new puzzles (${PUZZLE_DATA.length} total).`
	);
	process.exit(0);
}

// Only run the seed when executed directly (bun src/seed/puzzles.ts),
// not when imported by tests.
if (import.meta.main) {
	seed().catch(err => {
		console.error('Seed failed:', err);
		process.exit(1);
	});
}
