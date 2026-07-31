import { copyFile, mkdir, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as stockfishAssets from './stockfish-assets';
import {
	STOCKFISH_CORRESPONDING_SOURCE_FILENAME,
	STOCKFISH_ENGINE_SOURCE_ARCHIVE,
	STOCKFISH_JS_SOURCE_ARCHIVE,
	STOCKFISH_LICENSE_FILENAME,
	STOCKFISH_PUBLIC_DIRECTORY,
	validateStockfishAssetPair,
} from './stockfish-assets';

export interface PrepareStockfishOptions {
	packageRoot: string;
	publicRoot: string;
	complianceRoot: string;
}

export function assertNonEmptySourceFile(
	label: string,
	filePath: string,
	size: number
): void {
	if (size === 0) {
		throw new Error(`Stockfish ${label} source is empty: ${filePath}`);
	}
}

export function assertMatchingCopySize(
	label: string,
	expectedSize: number,
	actualSize: number
): void {
	if (actualSize !== expectedSize) {
		throw new Error(
			`Stockfish ${label} copy size mismatch: expected ${expectedSize}, got ${actualSize}`
		);
	}
}

export function assertNonEmptyComplianceMaterial(
	filePath: string,
	size: number,
	phase: 'source' | 'destination' = 'source'
): void {
	if (size === 0) {
		throw new Error(
			phase === 'source'
				? `Stockfish compliance material is empty: ${filePath}`
				: `Stockfish compliance material missing after copy: ${filePath}`
		);
	}
}

export async function prepareStockfishAssets(
	options: PrepareStockfishOptions
): Promise<{
	jsDestination: string;
	wasmDestination: string;
	destinationDirectory: string;
}> {
	const { jsPath, wasmPath } = stockfishAssets.resolveStockfishSourcePair(
		options.packageRoot
	);
	validateStockfishAssetPair(jsPath, wasmPath);

	const destinationDirectory = path.join(
		options.publicRoot,
		STOCKFISH_PUBLIC_DIRECTORY
	);
	// Generated directory is exclusively owned by this script — recreate it so
	// obsolete filenames cannot linger into dist after an engine rename.
	await rm(destinationDirectory, { recursive: true, force: true });
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

	assertNonEmptySourceFile('JS', jsPath, jsSourceStat.size);
	assertNonEmptySourceFile('WASM', wasmPath, wasmSourceStat.size);

	await copyFile(jsPath, jsDestination);
	await copyFile(wasmPath, wasmDestination);

	const [jsDestinationStat, wasmDestinationStat] = await Promise.all([
		stat(jsDestination),
		stat(wasmDestination),
	]);

	assertMatchingCopySize('JS', jsSourceStat.size, jsDestinationStat.size);
	assertMatchingCopySize('WASM', wasmSourceStat.size, wasmDestinationStat.size);

	await copyComplianceMaterials(options.complianceRoot, destinationDirectory);

	return { jsDestination, wasmDestination, destinationDirectory };
}

async function copyComplianceMaterials(
	complianceRoot: string,
	destinationDirectory: string
): Promise<void> {
	const licenseSource = path.join(complianceRoot, STOCKFISH_LICENSE_FILENAME);
	const correspondingSource = path.join(
		complianceRoot,
		STOCKFISH_CORRESPONDING_SOURCE_FILENAME
	);
	const sourceDirectory = path.join(complianceRoot, 'source');
	const jsArchiveSource = path.join(
		sourceDirectory,
		STOCKFISH_JS_SOURCE_ARCHIVE
	);
	const engineArchiveSource = path.join(
		sourceDirectory,
		STOCKFISH_ENGINE_SOURCE_ARCHIVE
	);

	const requiredSources = [
		licenseSource,
		correspondingSource,
		jsArchiveSource,
		engineArchiveSource,
	] as const;

	for (const requiredPath of requiredSources) {
		const requiredStat = await stat(requiredPath);
		assertNonEmptyComplianceMaterial(requiredPath, requiredStat.size, 'source');
	}

	const licenseDestination = path.join(
		destinationDirectory,
		STOCKFISH_LICENSE_FILENAME
	);
	const correspondingSourceDestination = path.join(
		destinationDirectory,
		STOCKFISH_CORRESPONDING_SOURCE_FILENAME
	);
	const destinationSourceDirectory = path.join(destinationDirectory, 'source');
	const jsArchiveDestination = path.join(
		destinationSourceDirectory,
		STOCKFISH_JS_SOURCE_ARCHIVE
	);
	const engineArchiveDestination = path.join(
		destinationSourceDirectory,
		STOCKFISH_ENGINE_SOURCE_ARCHIVE
	);

	await mkdir(destinationSourceDirectory, { recursive: true });
	await copyFile(licenseSource, licenseDestination);
	await copyFile(correspondingSource, correspondingSourceDestination);
	await copyFile(jsArchiveSource, jsArchiveDestination);
	await copyFile(engineArchiveSource, engineArchiveDestination);

	for (const destinationPath of [
		licenseDestination,
		correspondingSourceDestination,
		jsArchiveDestination,
		engineArchiveDestination,
	]) {
		const destinationStat = await stat(destinationPath);
		assertNonEmptyComplianceMaterial(
			destinationPath,
			destinationStat.size,
			'destination'
		);
	}
}

export function resolveDefaultStockfishComplianceRoot(
	fromDirectory = path.dirname(fileURLToPath(import.meta.url))
): string {
	return path.resolve(
		fromDirectory,
		'..',
		'..',
		'..',
		'third_party',
		'licenses',
		'stockfish'
	);
}

export async function runPrepareStockfishCli(
	options?: Partial<PrepareStockfishOptions>
): Promise<{
	jsDestination: string;
	wasmDestination: string;
	destinationDirectory: string;
}> {
	const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
	const packageRoot =
		options?.packageRoot ??
		stockfishAssets.resolveInstalledStockfishPackageRoot();
	const publicRoot =
		options?.publicRoot ?? path.resolve(scriptDirectory, '..', 'public');
	const complianceRoot =
		options?.complianceRoot ??
		resolveDefaultStockfishComplianceRoot(scriptDirectory);

	return prepareStockfishAssets({
		packageRoot,
		publicRoot,
		complianceRoot,
	});
}

export function reportPrepareStockfishCliFailure(error: unknown): never {
	console.error(error instanceof Error ? error.message : error);
	process.exit(1);
}

export async function main(
	options?: Partial<PrepareStockfishOptions>
): Promise<void> {
	const { jsDestination, wasmDestination, destinationDirectory } =
		await runPrepareStockfishCli(options);

	console.log(jsDestination);
	console.log(wasmDestination);
	console.log(destinationDirectory);
}

if (import.meta.main) {
	main().catch(reportPrepareStockfishCliFailure);
}
