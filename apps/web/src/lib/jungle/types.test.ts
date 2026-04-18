import { test, expect, describe } from 'bun:test';
import {
	canCapture,
	canEnterWater,
	canJumpRiver,
	isTrapActive,
	isInDen,
	createInitialTerrain,
	PIECE_RANKS,
	JUNGLE_ROWS,
	JUNGLE_COLS,
	JUNGLE_FILES,
	JUNGLE_RANKS,
	JUNGLE_SYMBOLS,
} from './types';
import type { JunglePiece, JungleTerrain } from './types';

// ---------------------------------------------------------------------------
// Helper factories
// ---------------------------------------------------------------------------

function piece(
	type: JunglePiece['type'],
	color: JunglePiece['color']
): JunglePiece {
	return { type, color, rank: PIECE_RANKS[type] };
}

// ---------------------------------------------------------------------------
// PIECE_RANKS
// ---------------------------------------------------------------------------

describe('PIECE_RANKS', () => {
	test('elephant has rank 8 (highest)', () => {
		expect(PIECE_RANKS.elephant).toBe(8);
	});

	test('lion has rank 7', () => {
		expect(PIECE_RANKS.lion).toBe(7);
	});

	test('tiger has rank 6', () => {
		expect(PIECE_RANKS.tiger).toBe(6);
	});

	test('leopard has rank 5', () => {
		expect(PIECE_RANKS.leopard).toBe(5);
	});

	test('dog has rank 4', () => {
		expect(PIECE_RANKS.dog).toBe(4);
	});

	test('wolf has rank 3', () => {
		expect(PIECE_RANKS.wolf).toBe(3);
	});

	test('cat has rank 2', () => {
		expect(PIECE_RANKS.cat).toBe(2);
	});

	test('rat has rank 1 (lowest)', () => {
		expect(PIECE_RANKS.rat).toBe(1);
	});

	test('has exactly 8 piece types', () => {
		expect(Object.keys(PIECE_RANKS)).toHaveLength(8);
	});
});

// ---------------------------------------------------------------------------
// canCapture
// ---------------------------------------------------------------------------

describe('canCapture', () => {
	test('rat captures elephant (special rule)', () => {
		expect(canCapture(piece('rat', 'red'), piece('elephant', 'blue'))).toBe(
			true
		);
	});

	test('elephant cannot capture rat (special rule)', () => {
		expect(canCapture(piece('elephant', 'red'), piece('rat', 'blue'))).toBe(
			false
		);
	});

	test('higher rank captures lower rank (lion captures leopard)', () => {
		expect(canCapture(piece('lion', 'red'), piece('leopard', 'blue'))).toBe(
			true
		);
	});

	test('same rank captures same rank', () => {
		expect(canCapture(piece('lion', 'red'), piece('lion', 'blue'))).toBe(true);
	});

	test('lower rank cannot capture higher rank (cat vs lion)', () => {
		expect(canCapture(piece('cat', 'red'), piece('lion', 'blue'))).toBe(false);
	});

	test('rat cannot capture non-elephant higher rank piece', () => {
		expect(canCapture(piece('rat', 'red'), piece('lion', 'blue'))).toBe(false);
	});

	test('elephant captures lion', () => {
		expect(canCapture(piece('elephant', 'red'), piece('lion', 'blue'))).toBe(
			true
		);
	});

	test('wolf captures cat', () => {
		expect(canCapture(piece('wolf', 'red'), piece('cat', 'blue'))).toBe(true);
	});

	test('cat cannot capture dog', () => {
		expect(canCapture(piece('cat', 'red'), piece('dog', 'blue'))).toBe(false);
	});
});

// ---------------------------------------------------------------------------
// canEnterWater
// ---------------------------------------------------------------------------

describe('canEnterWater', () => {
	test('rat can enter water', () => {
		expect(canEnterWater(piece('rat', 'red'))).toBe(true);
	});

	test('lion cannot enter water', () => {
		expect(canEnterWater(piece('lion', 'red'))).toBe(false);
	});

	test('tiger cannot enter water', () => {
		expect(canEnterWater(piece('tiger', 'red'))).toBe(false);
	});

	test('elephant cannot enter water', () => {
		expect(canEnterWater(piece('elephant', 'red'))).toBe(false);
	});

	test('leopard cannot enter water', () => {
		expect(canEnterWater(piece('leopard', 'red'))).toBe(false);
	});

	test('dog cannot enter water', () => {
		expect(canEnterWater(piece('dog', 'red'))).toBe(false);
	});

	test('wolf cannot enter water', () => {
		expect(canEnterWater(piece('wolf', 'red'))).toBe(false);
	});

	test('cat cannot enter water', () => {
		expect(canEnterWater(piece('cat', 'red'))).toBe(false);
	});
});

// ---------------------------------------------------------------------------
// canJumpRiver
// ---------------------------------------------------------------------------

describe('canJumpRiver', () => {
	test('lion can jump river', () => {
		expect(canJumpRiver(piece('lion', 'red'))).toBe(true);
	});

	test('tiger can jump river', () => {
		expect(canJumpRiver(piece('tiger', 'red'))).toBe(true);
	});

	test('elephant cannot jump river', () => {
		expect(canJumpRiver(piece('elephant', 'red'))).toBe(false);
	});

	test('rat cannot jump river', () => {
		expect(canJumpRiver(piece('rat', 'red'))).toBe(false);
	});

	test('leopard cannot jump river', () => {
		expect(canJumpRiver(piece('leopard', 'red'))).toBe(false);
	});

	test('dog cannot jump river', () => {
		expect(canJumpRiver(piece('dog', 'red'))).toBe(false);
	});
});

// ---------------------------------------------------------------------------
// isTrapActive
// ---------------------------------------------------------------------------

describe('isTrapActive', () => {
	test('red trap is active for blue piece', () => {
		const trap: JungleTerrain = { type: 'trap', owner: 'red' };
		expect(isTrapActive(trap, piece('lion', 'blue'))).toBe(true);
	});

	test('red trap is NOT active for red piece (own trap)', () => {
		const trap: JungleTerrain = { type: 'trap', owner: 'red' };
		expect(isTrapActive(trap, piece('lion', 'red'))).toBe(false);
	});

	test('blue trap is active for red piece', () => {
		const trap: JungleTerrain = { type: 'trap', owner: 'blue' };
		expect(isTrapActive(trap, piece('rat', 'red'))).toBe(true);
	});

	test('normal terrain is never a trap', () => {
		const normal: JungleTerrain = { type: 'normal' };
		expect(isTrapActive(normal, piece('lion', 'red'))).toBe(false);
	});

	test('water terrain is never a trap', () => {
		const water: JungleTerrain = { type: 'water' };
		expect(isTrapActive(water, piece('rat', 'red'))).toBe(false);
	});

	test('den terrain is never a trap', () => {
		const den: JungleTerrain = { type: 'den', owner: 'red' };
		expect(isTrapActive(den, piece('lion', 'blue'))).toBe(false);
	});
});

// ---------------------------------------------------------------------------
// isInDen
// ---------------------------------------------------------------------------

describe('isInDen', () => {
	test('red den contains blue piece (enemy in den = win condition)', () => {
		const den: JungleTerrain = { type: 'den', owner: 'red' };
		expect(isInDen(den, piece('rat', 'blue'))).toBe(true);
	});

	test('red den does NOT contain red piece (own den)', () => {
		const den: JungleTerrain = { type: 'den', owner: 'red' };
		expect(isInDen(den, piece('lion', 'red'))).toBe(false);
	});

	test('blue den contains red piece', () => {
		const den: JungleTerrain = { type: 'den', owner: 'blue' };
		expect(isInDen(den, piece('elephant', 'red'))).toBe(true);
	});

	test('normal terrain is not a den', () => {
		const normal: JungleTerrain = { type: 'normal' };
		expect(isInDen(normal, piece('lion', 'red'))).toBe(false);
	});

	test('trap terrain is not a den', () => {
		const trap: JungleTerrain = { type: 'trap', owner: 'red' };
		expect(isInDen(trap, piece('lion', 'blue'))).toBe(false);
	});
});

// ---------------------------------------------------------------------------
// createInitialTerrain
// ---------------------------------------------------------------------------

describe('createInitialTerrain', () => {
	test('creates a 9x7 terrain grid', () => {
		const terrain = createInitialTerrain();
		expect(terrain).toHaveLength(JUNGLE_ROWS);
		for (const row of terrain) {
			expect(row).toHaveLength(JUNGLE_COLS);
		}
	});

	test('red den is at row 8, col 3', () => {
		const terrain = createInitialTerrain();
		expect(terrain[8]![3]).toEqual({ type: 'den', owner: 'red' });
	});

	test('blue den is at row 0, col 3', () => {
		const terrain = createInitialTerrain();
		expect(terrain[0]![3]).toEqual({ type: 'den', owner: 'blue' });
	});

	test('red has 3 traps around its den', () => {
		const terrain = createInitialTerrain();
		expect(terrain[8]![2]).toEqual({ type: 'trap', owner: 'red' });
		expect(terrain[8]![4]).toEqual({ type: 'trap', owner: 'red' });
		expect(terrain[7]![3]).toEqual({ type: 'trap', owner: 'red' });
	});

	test('blue has 3 traps around its den', () => {
		const terrain = createInitialTerrain();
		expect(terrain[0]![2]).toEqual({ type: 'trap', owner: 'blue' });
		expect(terrain[0]![4]).toEqual({ type: 'trap', owner: 'blue' });
		expect(terrain[1]![3]).toEqual({ type: 'trap', owner: 'blue' });
	});

	test('river tiles are water (rows 3-5, cols 1-2 and 4-5)', () => {
		const terrain = createInitialTerrain();
		for (let row = 3; row <= 5; row++) {
			for (const col of [1, 2, 4, 5]) {
				expect(terrain[row]![col]?.type).toBe('water');
			}
		}
	});

	test('center column of river rows is normal terrain (col 3)', () => {
		const terrain = createInitialTerrain();
		for (let row = 3; row <= 5; row++) {
			expect(terrain[row]![3]?.type).toBe('normal');
		}
	});
});

// ---------------------------------------------------------------------------
// Board dimension constants
// ---------------------------------------------------------------------------

describe('JUNGLE_ROWS and JUNGLE_COLS', () => {
	test('board has 9 rows', () => {
		expect(JUNGLE_ROWS).toBe(9);
	});

	test('board has 7 columns', () => {
		expect(JUNGLE_COLS).toBe(7);
	});
});

describe('JUNGLE_FILES and JUNGLE_RANKS', () => {
	test('files are a-g (7 files)', () => {
		expect(JUNGLE_FILES).toHaveLength(7);
		expect(JUNGLE_FILES[0]).toBe('a');
		expect(JUNGLE_FILES[6]).toBe('g');
	});

	test('ranks are 9-1 (9 ranks)', () => {
		expect(JUNGLE_RANKS).toHaveLength(9);
		expect(JUNGLE_RANKS[0]).toBe('9');
		expect(JUNGLE_RANKS[8]).toBe('1');
	});
});

// ---------------------------------------------------------------------------
// JUNGLE_SYMBOLS
// ---------------------------------------------------------------------------

describe('JUNGLE_SYMBOLS', () => {
	test('has symbols for red and blue players', () => {
		expect(JUNGLE_SYMBOLS).toHaveProperty('red');
		expect(JUNGLE_SYMBOLS).toHaveProperty('blue');
	});

	test('each player has 8 piece symbols', () => {
		expect(Object.keys(JUNGLE_SYMBOLS.red)).toHaveLength(8);
		expect(Object.keys(JUNGLE_SYMBOLS.blue)).toHaveLength(8);
	});

	test('red and blue share the same symbols', () => {
		for (const type of Object.keys(
			JUNGLE_SYMBOLS.red
		) as JunglePiece['type'][]) {
			expect(JUNGLE_SYMBOLS.red[type]).toBe(JUNGLE_SYMBOLS.blue[type]);
		}
	});

	test('all symbols are non-empty strings', () => {
		for (const player of ['red', 'blue'] as const) {
			for (const [, symbol] of Object.entries(JUNGLE_SYMBOLS[player])) {
				expect(typeof symbol).toBe('string');
				expect(symbol.length).toBeGreaterThan(0);
			}
		}
	});
});
