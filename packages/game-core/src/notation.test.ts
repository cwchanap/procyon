import { describe, expect, test } from 'bun:test';
import { notationToPos, posToNotation, tryNotationToPos } from './notation';

const CHESS = {
	files: 'abcdefgh'.split(''),
	ranks: '87654321'.split(''),
};
const XIANGQI = {
	files: 'abcdefghi'.split(''),
	ranks: ['10', '9', '8', '7', '6', '5', '4', '3', '2', '1'],
};
const JUNGLE = {
	files: 'abcdefg'.split(''),
	ranks: ['9', '8', '7', '6', '5', '4', '3', '2', '1'],
};

describe('posToNotation', () => {
	test('chess single-char ranks', () => {
		expect(posToNotation(CHESS, { row: 0, col: 0 })).toBe('a8');
		expect(posToNotation(CHESS, { row: 7, col: 7 })).toBe('h1');
	});
	test('xiangqi multi-char ranks (a10, e10, i1)', () => {
		expect(posToNotation(XIANGQI, { row: 0, col: 0 })).toBe('a10');
		expect(posToNotation(XIANGQI, { row: 0, col: 4 })).toBe('e10');
		expect(posToNotation(XIANGQI, { row: 9, col: 8 })).toBe('i1');
		expect(posToNotation(XIANGQI, { row: 5, col: 4 })).toBe('e5');
	});
	test('throws on non-integer and out-of-bounds positions', () => {
		for (const pos of [
			{ row: -1, col: 0 },
			{ row: CHESS.ranks.length, col: 0 },
			{ row: 0, col: -1 },
			{ row: 0, col: CHESS.files.length },
			{ row: 0.5, col: 0 },
			{ row: 0, col: 0.5 },
		]) {
			expect(() => posToNotation(CHESS, pos)).toThrow('Invalid position');
		}
	});
});

describe('notationToPos', () => {
	test('chess round-trip', () => {
		expect(notationToPos(CHESS, 'a8')).toEqual({ row: 0, col: 0 });
		expect(notationToPos(CHESS, 'h1')).toEqual({ row: 7, col: 7 });
	});
	test('xiangqi multi-char round-trip', () => {
		expect(notationToPos(XIANGQI, 'a10')).toEqual({ row: 0, col: 0 });
		expect(notationToPos(XIANGQI, 'e10')).toEqual({ row: 0, col: 4 });
		expect(notationToPos(XIANGQI, 'i1')).toEqual({ row: 9, col: 8 });
	});
	test('throws on invalid input', () => {
		expect(() => notationToPos(CHESS, 'z9')).toThrow();
		expect(() => notationToPos(CHESS, 'a')).toThrow();
		expect(() => notationToPos(XIANGQI, 'a11')).toThrow();
		expect(() => notationToPos(XIANGQI, 'j10')).toThrow();
	});
});

describe('tryNotationToPos', () => {
	test('returns null on invalid input', () => {
		expect(tryNotationToPos(CHESS, 'z9')).toBeNull();
		expect(tryNotationToPos(CHESS, 'a')).toBeNull();
		expect(tryNotationToPos(XIANGQI, 'a11')).toBeNull();
		expect(tryNotationToPos(XIANGQI, 'j10')).toBeNull();
	});
	test('returns position on valid input', () => {
		expect(tryNotationToPos(CHESS, 'a8')).toEqual({ row: 0, col: 0 });
		expect(tryNotationToPos(XIANGQI, 'e10')).toEqual({ row: 0, col: 4 });
	});
});

describe('jungle round-trip', () => {
	test('all three coordinate lengths work', () => {
		expect(posToNotation(JUNGLE, { row: 0, col: 0 })).toBe('a9');
		expect(notationToPos(JUNGLE, 'a9')).toEqual({ row: 0, col: 0 });
	});
});
