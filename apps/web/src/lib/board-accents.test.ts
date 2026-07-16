import { test, expect } from 'bun:test';
import { CAPTURE_RING, CAPTURE_SWATCH } from './board-accents';

test('CAPTURE_RING has all variants with expected border tokens', () => {
	expect(CAPTURE_RING.chess).toContain('border-chess');
	expect(CAPTURE_RING.xiangqi).toContain('border-xiangqi');
	expect(CAPTURE_RING.shogi).toContain('border-shogi');
	expect(CAPTURE_RING.jungle).toContain('border-jungle');
});

test('CAPTURE_SWATCH has all variants', () => {
	expect(CAPTURE_SWATCH.chess).toContain('border-chess');
	expect(CAPTURE_SWATCH.xiangqi).toContain('border-xiangqi');
	expect(CAPTURE_SWATCH.shogi).toContain('border-shogi');
	expect(CAPTURE_SWATCH.jungle).toContain('border-jungle');
});
