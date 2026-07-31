import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
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

function readPackageJson(packageJsonPath: string): {
	name?: string;
	version?: string;
} {
	return JSON.parse(readFileSync(packageJsonPath, 'utf8')) as {
		name?: string;
		version?: string;
	};
}

function findStockfishPackageRoot(startPath: string): string {
	let currentDir = path.dirname(startPath);

	while (true) {
		const packageJsonPath = path.join(currentDir, 'package.json');
		try {
			const packageJson = readPackageJson(packageJsonPath);
			if (packageJson.name === 'stockfish') {
				if (packageJson.version !== STOCKFISH_PACKAGE_VERSION) {
					throw new Error(
						`Expected stockfish@${STOCKFISH_PACKAGE_VERSION}, found ${packageJson.version}`
					);
				}
				return currentDir;
			}
		} catch (error) {
			if (
				error instanceof Error &&
				error.message.startsWith('Expected stockfish@')
			) {
				throw error;
			}
		}

		const parentDir = path.dirname(currentDir);
		if (parentDir === currentDir) {
			break;
		}
		currentDir = parentDir;
	}

	throw new Error('Could not resolve installed stockfish package root');
}

export function resolveInstalledStockfishPackageRoot(): string {
	const require = createRequire(import.meta.url);
	const resolvedEntry = require.resolve('stockfish');
	return findStockfishPackageRoot(resolvedEntry);
}

export function resolveStockfishSourcePair(packageRoot: string): {
	jsPath: string;
	wasmPath: string;
} {
	const binDirectory = path.join(packageRoot, 'bin');
	return {
		jsPath: path.join(binDirectory, STOCKFISH_JS_FILENAME),
		wasmPath: path.join(binDirectory, STOCKFISH_WASM_FILENAME),
	};
}
