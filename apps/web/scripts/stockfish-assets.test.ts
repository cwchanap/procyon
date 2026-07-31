import { afterEach, describe, expect, test } from 'bun:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
	STOCKFISH_PACKAGE_VERSION,
	STOCKFISH_JS_FILENAME,
	STOCKFISH_WASM_FILENAME,
	resolveStockfishPackageRootFromEntry,
	validateStockfishAssetPair,
} from './stockfish-assets';

async function createStockfishPackageFixture(version: string): Promise<{
	packageRoot: string;
	entryPath: string;
}> {
	const packageRoot = await mkdtemp(
		path.join(os.tmpdir(), 'stockfish-resolver-')
	);
	await writeFile(
		path.join(packageRoot, 'package.json'),
		JSON.stringify({ name: 'stockfish', version })
	);
	const binDirectory = path.join(packageRoot, 'bin');
	await mkdir(binDirectory, { recursive: true });
	const entryPath = path.join(binDirectory, 'index.js');
	await writeFile(entryPath, '// stockfish entry stub');
	return { packageRoot, entryPath };
}

describe('Stockfish asset contract', () => {
	test('pins the approved package and filenames', () => {
		expect(STOCKFISH_PACKAGE_VERSION).toBe('18.0.8');
		expect(STOCKFISH_JS_FILENAME).toBe('stockfish-18-lite-single.js');
		expect(STOCKFISH_WASM_FILENAME).toBe('stockfish-18-lite-single.wasm');
	});

	test('requires colocated matching basenames', () => {
		const jsPath = '/pkg/bin/stockfish-18-lite-single.js';
		const wasmPath = '/pkg/bin/stockfish-18-lite-single.wasm';
		expect(validateStockfishAssetPair(jsPath, wasmPath)).toEqual({
			basename: 'stockfish-18-lite-single',
			directory: path.dirname(jsPath),
		});
	});

	test('rejects renamed or separated files', () => {
		expect(() =>
			validateStockfishAssetPair(
				'/pkg/bin/stockfish-18-lite-single.js',
				'/other/stockfish-18-lite-single.wasm'
			)
		).toThrow(/same directory/i);

		expect(() =>
			validateStockfishAssetPair(
				'/pkg/bin/stockfish-18-lite-single.js',
				'/pkg/bin/renamed.wasm'
			)
		).toThrow(/matching basename/i);
	});
});

describe('Stockfish package root resolution', () => {
	const fixtureRoots: string[] = [];

	afterEach(async () => {
		await Promise.all(
			fixtureRoots
				.splice(0)
				.map(fixtureRoot => rm(fixtureRoot, { recursive: true, force: true }))
		);
	});

	test('rejects a mismatched installed package version', async () => {
		const { packageRoot, entryPath } =
			await createStockfishPackageFixture('18.0.7');
		fixtureRoots.push(packageRoot);

		expect(() => resolveStockfishPackageRootFromEntry(entryPath)).toThrow(
			`Expected stockfish@${STOCKFISH_PACKAGE_VERSION}, found 18.0.7`
		);
	});

	test('accepts the pinned package version', async () => {
		const { packageRoot, entryPath } = await createStockfishPackageFixture(
			STOCKFISH_PACKAGE_VERSION
		);
		fixtureRoots.push(packageRoot);

		expect(resolveStockfishPackageRootFromEntry(entryPath)).toBe(packageRoot);
	});

	test('fails when no stockfish package.json is found', async () => {
		const orphanRoot = await mkdtemp(
			path.join(os.tmpdir(), 'stockfish-orphan-')
		);
		fixtureRoots.push(orphanRoot);
		const entryPath = path.join(orphanRoot, 'bin', 'index.js');
		await mkdir(path.dirname(entryPath), { recursive: true });
		await writeFile(entryPath, '// orphan entry');

		expect(() => resolveStockfishPackageRootFromEntry(entryPath)).toThrow(
			/Could not resolve installed stockfish package root/i
		);
	});
});
