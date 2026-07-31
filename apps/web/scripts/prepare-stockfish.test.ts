import { afterEach, describe, expect, spyOn, test } from 'bun:test';
import {
	mkdtemp,
	mkdir,
	readFile,
	rm,
	stat,
	writeFile,
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import * as stockfishAssets from './stockfish-assets';
import {
	STOCKFISH_JS_FILENAME,
	STOCKFISH_PUBLIC_DIRECTORY,
	STOCKFISH_PACKAGE_VERSION,
	STOCKFISH_WASM_FILENAME,
	resolveStockfishPackageRootFromEntry,
} from './stockfish-assets';
import { prepareStockfishAssets } from './prepare-stockfish';

async function createSyntheticPackageRoot(): Promise<{
	packageRoot: string;
	jsContent: string;
	wasmContent: Buffer<ArrayBuffer>;
	jsPath: string;
	wasmPath: string;
}> {
	const packageRoot = await mkdtemp(path.join(os.tmpdir(), 'stockfish-pkg-'));
	const binDir = path.join(packageRoot, 'bin');
	await mkdir(binDir, { recursive: true });

	const jsContent = 'console.log("stockfish test asset");';
	const wasmContent = Buffer.from([
		0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00,
	]);
	const jsPath = path.join(binDir, STOCKFISH_JS_FILENAME);
	const wasmPath = path.join(binDir, STOCKFISH_WASM_FILENAME);

	await writeFile(jsPath, jsContent);
	await writeFile(wasmPath, wasmContent);

	return { packageRoot, jsContent, wasmContent, jsPath, wasmPath };
}

describe('prepareStockfishAssets', () => {
	let publicRoot: string;

	afterEach(async () => {
		if (publicRoot) {
			await rm(publicRoot, { recursive: true, force: true });
			publicRoot = '';
		}
	});

	test('copies the approved pair unchanged', async () => {
		const { packageRoot, jsContent, wasmContent } =
			await createSyntheticPackageRoot();
		publicRoot = await mkdtemp(path.join(os.tmpdir(), 'stockfish-public-'));

		const result = await prepareStockfishAssets({ packageRoot, publicRoot });

		expect(await readFile(result.jsDestination, 'utf8')).toBe(jsContent);
		expect(Buffer.from(await readFile(result.wasmDestination))).toEqual(
			wasmContent
		);
	});

	test('creates the destination directory', async () => {
		const { packageRoot } = await createSyntheticPackageRoot();
		publicRoot = await mkdtemp(path.join(os.tmpdir(), 'stockfish-public-'));

		const result = await prepareStockfishAssets({ packageRoot, publicRoot });

		await expect(stat(result.jsDestination)).resolves.toBeDefined();
		await expect(stat(result.wasmDestination)).resolves.toBeDefined();
	});

	test('preserves exact filenames and bytes', async () => {
		const { packageRoot, jsContent, wasmContent } =
			await createSyntheticPackageRoot();
		publicRoot = await mkdtemp(path.join(os.tmpdir(), 'stockfish-public-'));

		const result = await prepareStockfishAssets({ packageRoot, publicRoot });

		expect(path.basename(result.jsDestination)).toBe(STOCKFISH_JS_FILENAME);
		expect(path.basename(result.wasmDestination)).toBe(STOCKFISH_WASM_FILENAME);
		expect(await readFile(result.jsDestination, 'utf8')).toBe(jsContent);
		expect(Buffer.from(await readFile(result.wasmDestination))).toEqual(
			wasmContent
		);
	});

	test('is idempotent', async () => {
		const { packageRoot, jsContent, wasmContent } =
			await createSyntheticPackageRoot();
		publicRoot = await mkdtemp(path.join(os.tmpdir(), 'stockfish-public-'));

		const first = await prepareStockfishAssets({ packageRoot, publicRoot });
		const second = await prepareStockfishAssets({ packageRoot, publicRoot });

		expect(second.jsDestination).toBe(first.jsDestination);
		expect(second.wasmDestination).toBe(first.wasmDestination);
		expect(await readFile(first.jsDestination, 'utf8')).toBe(jsContent);
		expect(Buffer.from(await readFile(first.wasmDestination))).toEqual(
			wasmContent
		);
	});

	test('fails when JS is missing', async () => {
		const { packageRoot, wasmPath } = await createSyntheticPackageRoot();
		publicRoot = await mkdtemp(path.join(os.tmpdir(), 'stockfish-public-'));
		const jsPath = path.join(packageRoot, 'bin', STOCKFISH_JS_FILENAME);
		await rm(jsPath);

		await expect(
			prepareStockfishAssets({ packageRoot, publicRoot })
		).rejects.toThrow();
		await expect(stat(wasmPath)).resolves.toBeDefined();
	});

	test('fails when WASM is missing', async () => {
		const { packageRoot, jsPath } = await createSyntheticPackageRoot();
		publicRoot = await mkdtemp(path.join(os.tmpdir(), 'stockfish-public-'));
		const wasmPath = path.join(packageRoot, 'bin', STOCKFISH_WASM_FILENAME);
		await rm(wasmPath);

		await expect(
			prepareStockfishAssets({ packageRoot, publicRoot })
		).rejects.toThrow();
		await expect(stat(jsPath)).resolves.toBeDefined();
	});

	test('fails if the pair does not have identical basenames', async () => {
		const { packageRoot, jsPath } = await createSyntheticPackageRoot();
		publicRoot = await mkdtemp(path.join(os.tmpdir(), 'stockfish-public-'));

		const resolveSpy = spyOn(
			stockfishAssets,
			'resolveStockfishSourcePair'
		).mockReturnValue({
			jsPath,
			wasmPath: path.join(path.dirname(jsPath), 'renamed.wasm'),
		});

		try {
			await expect(
				prepareStockfishAssets({ packageRoot, publicRoot })
			).rejects.toThrow(/matching basename/i);
		} finally {
			resolveSpy.mockRestore();
		}
	});

	test('removes no unrelated files outside the destination directory', async () => {
		const { packageRoot } = await createSyntheticPackageRoot();
		publicRoot = await mkdtemp(path.join(os.tmpdir(), 'stockfish-public-'));
		const unrelatedPath = path.join(publicRoot, 'unrelated.txt');
		await writeFile(unrelatedPath, 'keep me');

		await prepareStockfishAssets({ packageRoot, publicRoot });

		expect(await readFile(unrelatedPath, 'utf8')).toBe('keep me');
	});

	test('version mismatch rejects before copying assets', async () => {
		const packageRoot = await mkdtemp(
			path.join(os.tmpdir(), 'stockfish-pkg-bad-version-')
		);
		await writeFile(
			path.join(packageRoot, 'package.json'),
			JSON.stringify({ name: 'stockfish', version: '99.0.0' })
		);
		const binDirectory = path.join(packageRoot, 'bin');
		await mkdir(binDirectory, { recursive: true });
		const entryPath = path.join(binDirectory, STOCKFISH_JS_FILENAME);
		await writeFile(entryPath, 'console.log("stockfish");');
		await writeFile(
			path.join(binDirectory, STOCKFISH_WASM_FILENAME),
			Buffer.from([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00])
		);

		publicRoot = await mkdtemp(path.join(os.tmpdir(), 'stockfish-public-'));
		const destinationDirectory = path.join(
			publicRoot,
			STOCKFISH_PUBLIC_DIRECTORY
		);

		await expect(
			(async () => {
				const resolvedRoot = resolveStockfishPackageRootFromEntry(entryPath);
				await prepareStockfishAssets({
					packageRoot: resolvedRoot,
					publicRoot,
				});
			})()
		).rejects.toThrow(
			`Expected stockfish@${STOCKFISH_PACKAGE_VERSION}, found 99.0.0`
		);

		await expect(stat(destinationDirectory)).rejects.toThrow();
		await rm(packageRoot, { recursive: true, force: true });
	});
});
