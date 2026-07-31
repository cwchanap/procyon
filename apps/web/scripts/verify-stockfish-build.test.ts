import { afterEach, describe, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import {
	mkdir,
	mkdtemp,
	readFile,
	rm,
	stat,
	writeFile,
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
	prepareStockfishAssets,
	resolveDefaultStockfishComplianceRoot,
} from './prepare-stockfish';
import {
	STOCKFISH_CORRESPONDING_SOURCE_FILENAME,
	STOCKFISH_ENGINE_SOURCE_ARCHIVE,
	STOCKFISH_JS_FILENAME,
	STOCKFISH_JS_SOURCE_ARCHIVE,
	STOCKFISH_LICENSE_FILENAME,
	STOCKFISH_PUBLIC_DIRECTORY,
	STOCKFISH_WASM_FILENAME,
	resolveInstalledStockfishPackageRoot,
	resolveStockfishSourcePair,
} from './stockfish-assets';

async function sha256File(filePath: string): Promise<string> {
	return createHash('sha256')
		.update(Buffer.from(await readFile(filePath)))
		.digest('hex');
}

async function createSyntheticPackageRoot(jsContent: string): Promise<{
	packageRoot: string;
	jsPath: string;
}> {
	const packageRoot = await mkdtemp(
		path.join(os.tmpdir(), 'stockfish-verify-pkg-')
	);
	const binDirectory = path.join(packageRoot, 'bin');
	await mkdir(binDirectory, { recursive: true });

	const jsPath = path.join(binDirectory, STOCKFISH_JS_FILENAME);
	await writeFile(jsPath, jsContent);
	await writeFile(
		path.join(binDirectory, STOCKFISH_WASM_FILENAME),
		Buffer.from([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00])
	);

	return { packageRoot, jsPath };
}

async function createSyntheticComplianceRoot(): Promise<string> {
	const complianceRoot = await mkdtemp(
		path.join(os.tmpdir(), 'stockfish-verify-compliance-')
	);
	const sourceDirectory = path.join(complianceRoot, 'source');
	await mkdir(sourceDirectory, { recursive: true });
	await writeFile(
		path.join(complianceRoot, STOCKFISH_LICENSE_FILENAME),
		'GNU GENERAL PUBLIC LICENSE\nVersion 3'
	);
	await writeFile(
		path.join(complianceRoot, STOCKFISH_CORRESPONDING_SOURCE_FILENAME),
		'Corresponding Source for Stockfish browser assets'
	);
	await writeFile(
		path.join(sourceDirectory, STOCKFISH_JS_SOURCE_ARCHIVE),
		'js-source-archive'
	);
	await writeFile(
		path.join(sourceDirectory, STOCKFISH_ENGINE_SOURCE_ARCHIVE),
		'engine-source-archive'
	);
	return complianceRoot;
}

describe('Stockfish build verification', () => {
	const tempRoots: string[] = [];

	afterEach(async () => {
		await Promise.all(
			tempRoots
				.splice(0)
				.map(tempRoot => rm(tempRoot, { recursive: true, force: true }))
		);
	});

	test('recreates both installed engine files with matching SHA-256 hashes from no destination directory', async () => {
		const packageRoot = resolveInstalledStockfishPackageRoot();
		const complianceRoot = resolveDefaultStockfishComplianceRoot();
		const { jsPath, wasmPath } = resolveStockfishSourcePair(packageRoot);
		const publicRoot = await mkdtemp(
			path.join(os.tmpdir(), 'stockfish-verify-public-')
		);
		tempRoots.push(publicRoot);
		const destinationDirectory = path.join(
			publicRoot,
			STOCKFISH_PUBLIC_DIRECTORY
		);

		await expect(stat(destinationDirectory)).rejects.toThrow();

		const result = await prepareStockfishAssets({
			packageRoot,
			publicRoot,
			complianceRoot,
		});

		expect(path.basename(result.jsDestination)).toBe(STOCKFISH_JS_FILENAME);
		expect(path.basename(result.wasmDestination)).toBe(STOCKFISH_WASM_FILENAME);
		await expect(stat(result.jsDestination)).resolves.toBeDefined();
		await expect(stat(result.wasmDestination)).resolves.toBeDefined();
		expect(await sha256File(result.jsDestination)).toBe(
			await sha256File(jsPath)
		);
		expect(await sha256File(result.wasmDestination)).toBe(
			await sha256File(wasmPath)
		);
		await expect(
			stat(path.join(result.destinationDirectory, STOCKFISH_LICENSE_FILENAME))
		).resolves.toBeDefined();
		await expect(
			stat(
				path.join(
					result.destinationDirectory,
					STOCKFISH_CORRESPONDING_SOURCE_FILENAME
				)
			)
		).resolves.toBeDefined();
	});

	test('changes the destination hash when a source fixture byte changes', async () => {
		const { packageRoot, jsPath } = await createSyntheticPackageRoot('a');
		const complianceRoot = await createSyntheticComplianceRoot();
		const publicRoot = await mkdtemp(
			path.join(os.tmpdir(), 'stockfish-verify-public-')
		);
		tempRoots.push(packageRoot, complianceRoot, publicRoot);

		const first = await prepareStockfishAssets({
			packageRoot,
			publicRoot,
			complianceRoot,
		});
		const firstHash = await sha256File(first.jsDestination);

		await writeFile(jsPath, 'b');
		const second = await prepareStockfishAssets({
			packageRoot,
			publicRoot,
			complianceRoot,
		});
		const secondHash = await sha256File(second.jsDestination);

		expect(second.jsDestination).toBe(first.jsDestination);
		expect(secondHash).toBe(await sha256File(jsPath));
		expect(secondHash).not.toBe(firstHash);
	});
});
