import { describe, expect, test } from 'bun:test';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import {
	AEROPLANE_CUES,
	BOARD_BACKGROUND_URL,
	cueUrl,
	spriteUrl,
	tileIconUrl,
} from './assets';
import { SKIN_CATALOG } from './rewards';
import { TYCOON_TILES } from './tycoon';
import { AEROPLANE_COLORS } from './types';

/**
 * public/ root resolved from this test file's location so the check works
 * no matter which cwd the runner was invoked from.
 */
const publicRoot = join(import.meta.dir, '../../../public');

/** Filesystem path for one served URL under the public root. */
function toFsPath(url: string): string {
	return join(publicRoot, url.slice(1));
}

/** Every file below a directory, as public-root-relative URL paths. */
function listPublicFiles(dir: string): string[] {
	const out: string[] = [];
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		const full = join(dir, entry.name);
		if (entry.isDirectory()) out.push(...listPublicFiles(full));
		else out.push(full.slice(publicRoot.length));
	}
	return out.sort();
}

describe('aeroplane URL builders', () => {
	test('emit direct public URLs for every asset kind', () => {
		expect(spriteUrl('ace', 'blue')).toBe('/aeroplane/planes/ace-blue.svg');
		expect(spriteUrl('classic', 'yellow')).toBe(
			'/aeroplane/planes/classic-yellow.svg'
		);
		expect(tileIconUrl('airport')).toBe('/aeroplane/icons/airport.svg');
		expect(tileIconUrl('coin')).toBe('/aeroplane/icons/coin.svg');
		expect(cueUrl('hop')).toBe('/aeroplane/sfx/hop.m4a');
		expect(BOARD_BACKGROUND_URL).toBe('/aeroplane/board/background.svg');
	});

	test('expose the nine reviewed cues', () => {
		expect(AEROPLANE_CUES).toEqual([
			'roll',
			'hop',
			'flight',
			'capture',
			'finish',
			'win',
			'coin-gain',
			'coin-loss',
			'trap',
		]);
	});
});

describe('aeroplane public inventory', () => {
	const urls = [
		...SKIN_CATALOG.flatMap(skin =>
			AEROPLANE_COLORS.map(color => spriteUrl(skin.id, color))
		),
		...[...new Set(TYCOON_TILES.values())].map(kind => tileIconUrl(kind)),
		tileIconUrl('coin'),
		...AEROPLANE_CUES.map(cue => cueUrl(cue)),
		BOARD_BACKGROUND_URL,
	];

	test('covers exactly the 41 approved runtime assets, all unique', () => {
		expect(urls).toHaveLength(41);
		expect(new Set(urls).size).toBe(41);
	});

	test('every production URL resolves to a file under public/', () => {
		for (const url of urls) {
			expect(existsSync(toFsPath(url))).toBe(true);
		}
	});

	test('public/aeroplane holds those files and nothing else', () => {
		expect(listPublicFiles(join(publicRoot, 'aeroplane'))).toEqual(
			[...urls].sort()
		);
	});
});
