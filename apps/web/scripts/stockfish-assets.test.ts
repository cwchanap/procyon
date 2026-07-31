import { describe, expect, test } from 'bun:test';
import path from 'node:path';
import {
	STOCKFISH_PACKAGE_VERSION,
	STOCKFISH_JS_FILENAME,
	STOCKFISH_WASM_FILENAME,
	validateStockfishAssetPair,
} from './stockfish-assets';

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
