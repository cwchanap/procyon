import { afterEach, describe, expect, test } from 'bun:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
	isTarGzPath,
	resolvePreviewAssetPath,
	serveTarGzArchive,
} from './stockfish-tar-gz-preview-headers';

describe('stockfish tar.gz preview headers', () => {
	const tempRoots: string[] = [];

	afterEach(() => {
		for (const root of tempRoots.splice(0)) {
			fs.rmSync(root, { recursive: true, force: true });
		}
	});

	test('isTarGzPath only matches .tar.gz archives', () => {
		expect(isTarGzPath('/vendor/stockfish/source/a.tar.gz')).toBe(true);
		expect(isTarGzPath('/vendor/stockfish/stockfish.js.gz')).toBe(false);
		expect(isTarGzPath('/vendor/stockfish/stockfish.wasm')).toBe(false);
	});

	test('resolvePreviewAssetPath maps preview URLs under outDir', () => {
		const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sf-preview-'));
		tempRoots.push(root);
		const outDir = 'dist';
		const relative = 'vendor/stockfish/source/archive.tar.gz';
		fs.mkdirSync(path.join(root, outDir, 'vendor/stockfish/source'), {
			recursive: true,
		});
		fs.writeFileSync(path.join(root, outDir, relative), 'payload');

		expect(resolvePreviewAssetPath(root, outDir, `/${relative}`)).toBe(
			path.join(root, outDir, relative)
		);
		expect(resolvePreviewAssetPath(root, outDir, '/evil.tar.gz')).toBe(
			path.join(root, outDir, 'evil.tar.gz')
		);
		expect(
			resolvePreviewAssetPath(root, outDir, '/../outside.tar.gz')
		).toBeNull();
		expect(resolvePreviewAssetPath(root, outDir, '/file.js')).toBeNull();
	});

	test('serveTarGzArchive writes archive bytes without Content-Encoding', () => {
		const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sf-serve-'));
		tempRoots.push(root);
		const filePath = path.join(root, 'archive.tar.gz');
		const payload = Buffer.from('fake-tar-gz-bytes');
		fs.writeFileSync(filePath, payload);

		const headers = new Map<string, string>();
		let statusCode = 0;
		let ended: Buffer | null = null;
		const res = {
			statusCode: 0,
			setHeader(name: string, value: string) {
				headers.set(name.toLowerCase(), value);
			},
			end(body: Buffer) {
				ended = body;
			},
		};
		Object.defineProperty(res, 'statusCode', {
			get: () => statusCode,
			set: (value: number) => {
				statusCode = value;
			},
		});

		expect(serveTarGzArchive(filePath, res as never)).toBe(true);
		expect(statusCode).toBe(200);
		expect(headers.get('content-type')).toBe('application/gzip');
		expect(headers.get('content-length')).toBe(String(payload.byteLength));
		expect(headers.has('content-encoding')).toBe(false);
		expect(ended?.equals(payload)).toBe(true);
	});
});
