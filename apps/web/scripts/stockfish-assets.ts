import path from 'node:path';

export const STOCKFISH_PACKAGE_VERSION = '18.0.8' as const;
export const STOCKFISH_JS_FILENAME = 'stockfish-18-lite-single.js' as const;
export const STOCKFISH_WASM_FILENAME = 'stockfish-18-lite-single.wasm' as const;
export const STOCKFISH_PUBLIC_DIRECTORY = 'vendor/stockfish' as const;

export function validateStockfishAssetPair(
	jsPath: string,
	wasmPath: string
): { basename: string; directory: string } {
	const jsDirectory = path.dirname(jsPath);
	const wasmDirectory = path.dirname(wasmPath);
	if (jsDirectory !== wasmDirectory) {
		throw new Error('Stockfish JS and WASM must be in the same directory');
	}

	const jsBasename = path.basename(jsPath, '.js');
	const wasmBasename = path.basename(wasmPath, '.wasm');
	if (jsBasename !== wasmBasename) {
		throw new Error('Stockfish JS and WASM must have a matching basename');
	}

	return { basename: jsBasename, directory: jsDirectory };
}
