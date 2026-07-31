import { copyFile, mkdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as stockfishAssets from './stockfish-assets';
import {
	STOCKFISH_PUBLIC_DIRECTORY,
	validateStockfishAssetPair,
} from './stockfish-assets';

export interface PrepareStockfishOptions {
	packageRoot: string;
	publicRoot: string;
}

export async function prepareStockfishAssets(
	options: PrepareStockfishOptions
): Promise<{
	jsDestination: string;
	wasmDestination: string;
}> {
	const { jsPath, wasmPath } = stockfishAssets.resolveStockfishSourcePair(
		options.packageRoot
	);
	validateStockfishAssetPair(jsPath, wasmPath);

	const destinationDirectory = path.join(
		options.publicRoot,
		STOCKFISH_PUBLIC_DIRECTORY
	);
	await mkdir(destinationDirectory, { recursive: true });

	const jsDestination = path.join(destinationDirectory, path.basename(jsPath));
	const wasmDestination = path.join(
		destinationDirectory,
		path.basename(wasmPath)
	);

	const [jsSourceStat, wasmSourceStat] = await Promise.all([
		stat(jsPath),
		stat(wasmPath),
	]);

	if (jsSourceStat.size === 0) {
		throw new Error(`Stockfish JS source is empty: ${jsPath}`);
	}
	if (wasmSourceStat.size === 0) {
		throw new Error(`Stockfish WASM source is empty: ${wasmPath}`);
	}

	await copyFile(jsPath, jsDestination);
	await copyFile(wasmPath, wasmDestination);

	const [jsDestinationStat, wasmDestinationStat] = await Promise.all([
		stat(jsDestination),
		stat(wasmDestination),
	]);

	if (jsDestinationStat.size !== jsSourceStat.size) {
		throw new Error(
			`Stockfish JS copy size mismatch: expected ${jsSourceStat.size}, got ${jsDestinationStat.size}`
		);
	}
	if (wasmDestinationStat.size !== wasmSourceStat.size) {
		throw new Error(
			`Stockfish WASM copy size mismatch: expected ${wasmSourceStat.size}, got ${wasmDestinationStat.size}`
		);
	}

	return { jsDestination, wasmDestination };
}

async function main(): Promise<void> {
	const packageRoot = stockfishAssets.resolveInstalledStockfishPackageRoot();
	const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
	const publicRoot = path.resolve(scriptDirectory, '..', 'public');

	const { jsDestination, wasmDestination } = await prepareStockfishAssets({
		packageRoot,
		publicRoot,
	});

	console.log(jsDestination);
	console.log(wasmDestination);
}

if (import.meta.main) {
	main().catch((error: unknown) => {
		console.error(error instanceof Error ? error.message : error);
		process.exit(1);
	});
}
