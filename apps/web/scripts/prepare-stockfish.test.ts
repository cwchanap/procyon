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
	STOCKFISH_CORRESPONDING_SOURCE_FILENAME,
	STOCKFISH_ENGINE_SOURCE_ARCHIVE,
	STOCKFISH_JS_FILENAME,
	STOCKFISH_JS_SOURCE_ARCHIVE,
	STOCKFISH_LICENSE_FILENAME,
	STOCKFISH_PUBLIC_DIRECTORY,
	STOCKFISH_PACKAGE_VERSION,
	STOCKFISH_WASM_FILENAME,
	resolveStockfishPackageRootFromEntry,
} from './stockfish-assets';
import {
	prepareStockfishAssets,
	assertMatchingCopySize,
	assertNonEmptyComplianceMaterial,
	assertNonEmptySourceFile,
	reportPrepareStockfishCliFailure,
	runPrepareStockfishCli,
	main as prepareStockfishMain,
} from './prepare-stockfish';

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

async function createSyntheticComplianceRoot(): Promise<{
	complianceRoot: string;
	licenseContent: string;
	correspondingSourceContent: string;
	jsArchiveContent: string;
	engineArchiveContent: string;
}> {
	const complianceRoot = await mkdtemp(
		path.join(os.tmpdir(), 'stockfish-compliance-')
	);
	const sourceDirectory = path.join(complianceRoot, 'source');
	await mkdir(sourceDirectory, { recursive: true });

	const licenseContent = 'GNU GENERAL PUBLIC LICENSE\nVersion 3';
	const correspondingSourceContent =
		'Corresponding Source for Stockfish browser assets';
	const jsArchiveContent = 'stockfish.js corresponding source archive';
	const engineArchiveContent = 'Stockfish engine corresponding source archive';

	await writeFile(
		path.join(complianceRoot, STOCKFISH_LICENSE_FILENAME),
		licenseContent
	);
	await writeFile(
		path.join(complianceRoot, STOCKFISH_CORRESPONDING_SOURCE_FILENAME),
		correspondingSourceContent
	);
	await writeFile(
		path.join(sourceDirectory, STOCKFISH_JS_SOURCE_ARCHIVE),
		jsArchiveContent
	);
	await writeFile(
		path.join(sourceDirectory, STOCKFISH_ENGINE_SOURCE_ARCHIVE),
		engineArchiveContent
	);

	return {
		complianceRoot,
		licenseContent,
		correspondingSourceContent,
		jsArchiveContent,
		engineArchiveContent,
	};
}

describe('prepareStockfishAssets', () => {
	let publicRoot: string;
	let complianceRoot: string;

	afterEach(async () => {
		if (publicRoot) {
			await rm(publicRoot, { recursive: true, force: true });
			publicRoot = '';
		}
		if (complianceRoot) {
			await rm(complianceRoot, { recursive: true, force: true });
			complianceRoot = '';
		}
	});

	test('copies the approved pair unchanged', async () => {
		const { packageRoot, jsContent, wasmContent } =
			await createSyntheticPackageRoot();
		const compliance = await createSyntheticComplianceRoot();
		complianceRoot = compliance.complianceRoot;
		publicRoot = await mkdtemp(path.join(os.tmpdir(), 'stockfish-public-'));

		const result = await prepareStockfishAssets({
			packageRoot,
			publicRoot,
			complianceRoot,
		});

		expect(await readFile(result.jsDestination, 'utf8')).toBe(jsContent);
		expect(Buffer.from(await readFile(result.wasmDestination))).toEqual(
			wasmContent
		);
	});

	test('creates the destination directory', async () => {
		const { packageRoot } = await createSyntheticPackageRoot();
		const compliance = await createSyntheticComplianceRoot();
		complianceRoot = compliance.complianceRoot;
		publicRoot = await mkdtemp(path.join(os.tmpdir(), 'stockfish-public-'));

		const result = await prepareStockfishAssets({
			packageRoot,
			publicRoot,
			complianceRoot,
		});

		await expect(stat(result.jsDestination)).resolves.toBeDefined();
		await expect(stat(result.wasmDestination)).resolves.toBeDefined();
	});

	test('preserves exact filenames and bytes', async () => {
		const { packageRoot, jsContent, wasmContent } =
			await createSyntheticPackageRoot();
		const compliance = await createSyntheticComplianceRoot();
		complianceRoot = compliance.complianceRoot;
		publicRoot = await mkdtemp(path.join(os.tmpdir(), 'stockfish-public-'));

		const result = await prepareStockfishAssets({
			packageRoot,
			publicRoot,
			complianceRoot,
		});

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
		const compliance = await createSyntheticComplianceRoot();
		complianceRoot = compliance.complianceRoot;
		publicRoot = await mkdtemp(path.join(os.tmpdir(), 'stockfish-public-'));

		const first = await prepareStockfishAssets({
			packageRoot,
			publicRoot,
			complianceRoot,
		});
		const second = await prepareStockfishAssets({
			packageRoot,
			publicRoot,
			complianceRoot,
		});

		expect(second.jsDestination).toBe(first.jsDestination);
		expect(second.wasmDestination).toBe(first.wasmDestination);
		expect(await readFile(first.jsDestination, 'utf8')).toBe(jsContent);
		expect(Buffer.from(await readFile(first.wasmDestination))).toEqual(
			wasmContent
		);
	});

	test('fails when JS is missing', async () => {
		const { packageRoot, jsPath } = await createSyntheticPackageRoot();
		await rm(jsPath);
		const compliance = await createSyntheticComplianceRoot();
		complianceRoot = compliance.complianceRoot;
		publicRoot = await mkdtemp(path.join(os.tmpdir(), 'stockfish-public-'));

		await expect(
			prepareStockfishAssets({ packageRoot, publicRoot, complianceRoot })
		).rejects.toThrow();
	});

	test('fails when JS source is empty', async () => {
		const { packageRoot, jsPath } = await createSyntheticPackageRoot();
		await writeFile(jsPath, '');
		const compliance = await createSyntheticComplianceRoot();
		complianceRoot = compliance.complianceRoot;
		publicRoot = await mkdtemp(path.join(os.tmpdir(), 'stockfish-public-'));

		await expect(
			prepareStockfishAssets({ packageRoot, publicRoot, complianceRoot })
		).rejects.toThrow(/JS source is empty/i);
	});

	test('fails when WASM is missing', async () => {
		const { packageRoot, wasmPath } = await createSyntheticPackageRoot();
		await rm(wasmPath);
		const compliance = await createSyntheticComplianceRoot();
		complianceRoot = compliance.complianceRoot;
		publicRoot = await mkdtemp(path.join(os.tmpdir(), 'stockfish-public-'));

		await expect(
			prepareStockfishAssets({ packageRoot, publicRoot, complianceRoot })
		).rejects.toThrow();
	});

	test('fails when WASM source is empty', async () => {
		const { packageRoot, wasmPath } = await createSyntheticPackageRoot();
		await writeFile(wasmPath, Buffer.alloc(0));
		const compliance = await createSyntheticComplianceRoot();
		complianceRoot = compliance.complianceRoot;
		publicRoot = await mkdtemp(path.join(os.tmpdir(), 'stockfish-public-'));

		await expect(
			prepareStockfishAssets({ packageRoot, publicRoot, complianceRoot })
		).rejects.toThrow(/WASM source is empty/i);
	});

	test('fails when a compliance material is empty', async () => {
		const { packageRoot } = await createSyntheticPackageRoot();
		const compliance = await createSyntheticComplianceRoot();
		complianceRoot = compliance.complianceRoot;
		await writeFile(path.join(complianceRoot, STOCKFISH_LICENSE_FILENAME), '');
		publicRoot = await mkdtemp(path.join(os.tmpdir(), 'stockfish-public-'));

		await expect(
			prepareStockfishAssets({ packageRoot, publicRoot, complianceRoot })
		).rejects.toThrow(/compliance material is empty/i);
	});

	test('fails if the pair does not have identical basenames', async () => {
		const { packageRoot, jsPath } = await createSyntheticPackageRoot();
		const compliance = await createSyntheticComplianceRoot();
		complianceRoot = compliance.complianceRoot;
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
				prepareStockfishAssets({ packageRoot, publicRoot, complianceRoot })
			).rejects.toThrow(/matching basename/i);
		} finally {
			resolveSpy.mockRestore();
		}
	});

	test('removes no unrelated files outside the destination directory', async () => {
		const { packageRoot } = await createSyntheticPackageRoot();
		const compliance = await createSyntheticComplianceRoot();
		complianceRoot = compliance.complianceRoot;
		publicRoot = await mkdtemp(path.join(os.tmpdir(), 'stockfish-public-'));
		const unrelatedPath = path.join(publicRoot, 'unrelated.txt');
		await writeFile(unrelatedPath, 'keep me');

		await prepareStockfishAssets({ packageRoot, publicRoot, complianceRoot });

		expect(await readFile(unrelatedPath, 'utf8')).toBe('keep me');
	});

	test('recreates the destination directory and removes stale files', async () => {
		const { packageRoot } = await createSyntheticPackageRoot();
		const compliance = await createSyntheticComplianceRoot();
		complianceRoot = compliance.complianceRoot;
		publicRoot = await mkdtemp(path.join(os.tmpdir(), 'stockfish-public-'));
		const destinationDirectory = path.join(
			publicRoot,
			STOCKFISH_PUBLIC_DIRECTORY
		);
		await mkdir(destinationDirectory, { recursive: true });
		const stalePath = path.join(destinationDirectory, 'stale-engine.wasm');
		await writeFile(stalePath, 'obsolete binary');

		await prepareStockfishAssets({ packageRoot, publicRoot, complianceRoot });

		await expect(stat(stalePath)).rejects.toThrow();
	});

	test('publishes license and corresponding-source materials beside the binaries', async () => {
		const { packageRoot } = await createSyntheticPackageRoot();
		const compliance = await createSyntheticComplianceRoot();
		complianceRoot = compliance.complianceRoot;
		publicRoot = await mkdtemp(path.join(os.tmpdir(), 'stockfish-public-'));

		const result = await prepareStockfishAssets({
			packageRoot,
			publicRoot,
			complianceRoot,
		});

		expect(
			await readFile(
				path.join(result.destinationDirectory, STOCKFISH_LICENSE_FILENAME),
				'utf8'
			)
		).toBe(compliance.licenseContent);
		expect(
			await readFile(
				path.join(
					result.destinationDirectory,
					STOCKFISH_CORRESPONDING_SOURCE_FILENAME
				),
				'utf8'
			)
		).toBe(compliance.correspondingSourceContent);
		expect(
			await readFile(
				path.join(
					result.destinationDirectory,
					'source',
					STOCKFISH_JS_SOURCE_ARCHIVE
				),
				'utf8'
			)
		).toBe(compliance.jsArchiveContent);
		expect(
			await readFile(
				path.join(
					result.destinationDirectory,
					'source',
					STOCKFISH_ENGINE_SOURCE_ARCHIVE
				),
				'utf8'
			)
		).toBe(compliance.engineArchiveContent);
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

		const compliance = await createSyntheticComplianceRoot();
		complianceRoot = compliance.complianceRoot;
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
					complianceRoot,
				});
			})()
		).rejects.toThrow(
			`Expected stockfish@${STOCKFISH_PACKAGE_VERSION}, found 99.0.0`
		);

		await expect(stat(destinationDirectory)).rejects.toThrow();
		await rm(packageRoot, { recursive: true, force: true });
	});

	test('CLI helper prepares installed assets into an override public root', async () => {
		const compliance = await createSyntheticComplianceRoot();
		complianceRoot = compliance.complianceRoot;
		publicRoot = await mkdtemp(path.join(os.tmpdir(), 'stockfish-public-'));

		const result = await runPrepareStockfishCli({
			publicRoot,
			complianceRoot,
		});

		await expect(stat(result.jsDestination)).resolves.toBeDefined();
		await expect(stat(result.wasmDestination)).resolves.toBeDefined();
		await expect(
			stat(path.join(result.destinationDirectory, STOCKFISH_LICENSE_FILENAME))
		).resolves.toBeDefined();
	});

	test('main logs prepared destinations', async () => {
		const compliance = await createSyntheticComplianceRoot();
		complianceRoot = compliance.complianceRoot;
		publicRoot = await mkdtemp(path.join(os.tmpdir(), 'stockfish-public-'));
		const logSpy = spyOn(console, 'log').mockImplementation(() => {});

		try {
			await prepareStockfishMain({
				publicRoot,
				complianceRoot,
			});

			expect(logSpy).toHaveBeenCalledTimes(3);
			expect(String(logSpy.mock.calls[0]?.[0])).toContain(
				STOCKFISH_JS_FILENAME
			);
			expect(String(logSpy.mock.calls[1]?.[0])).toContain(
				STOCKFISH_WASM_FILENAME
			);
			expect(String(logSpy.mock.calls[2]?.[0])).toContain(
				STOCKFISH_PUBLIC_DIRECTORY
			);
		} finally {
			logSpy.mockRestore();
		}
	});
});

describe('prepare-stockfish guards', () => {
	test('assertNonEmptySourceFile rejects empty sources', () => {
		expect(() => assertNonEmptySourceFile('JS', '/tmp/engine.js', 0)).toThrow(
			/JS source is empty/i
		);
		expect(() =>
			assertNonEmptySourceFile('WASM', '/tmp/engine.wasm', 8)
		).not.toThrow();
	});

	test('assertMatchingCopySize rejects mismatched sizes', () => {
		expect(() => assertMatchingCopySize('JS', 10, 9)).toThrow(
			/JS copy size mismatch/i
		);
		expect(() => assertMatchingCopySize('WASM', 10, 10)).not.toThrow();
	});

	test('assertNonEmptyComplianceMaterial rejects empty materials', () => {
		expect(() =>
			assertNonEmptyComplianceMaterial('/tmp/Copying.txt', 0, 'source')
		).toThrow(/compliance material is empty/i);
		expect(() =>
			assertNonEmptyComplianceMaterial('/tmp/Copying.txt', 0, 'destination')
		).toThrow(/missing after copy/i);
		expect(() =>
			assertNonEmptyComplianceMaterial('/tmp/Copying.txt', 12, 'destination')
		).not.toThrow();
	});

	test('reportPrepareStockfishCliFailure prints and exits', () => {
		const exitSpy = spyOn(process, 'exit').mockImplementation((() => {
			throw new Error('process.exit');
		}) as never);
		const errorSpy = spyOn(console, 'error').mockImplementation(() => {});

		try {
			expect(() => reportPrepareStockfishCliFailure(new Error('boom'))).toThrow(
				'process.exit'
			);
			expect(errorSpy).toHaveBeenCalledWith('boom');
			expect(exitSpy).toHaveBeenCalledWith(1);

			expect(() => reportPrepareStockfishCliFailure('raw-failure')).toThrow(
				'process.exit'
			);
			expect(errorSpy).toHaveBeenCalledWith('raw-failure');
		} finally {
			exitSpy.mockRestore();
			errorSpy.mockRestore();
		}
	});
});
