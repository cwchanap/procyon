import fs from 'node:fs';
import path from 'node:path';
import type { ServerResponse } from 'node:http';

/**
 * Helpers for serving downloadable `.tar.gz` archives without
 * `Content-Encoding: gzip`.
 *
 * Vite/sirv treats any filename ending in `.gz` as a precompressed asset.
 * Astro's static `astro preview` also hardcodes Vite with `configFile: false`
 * (user Vite plugins never load), so Stockfish asset e2e uses
 * `stockfish-assets-preview-server.ts` instead of `astro preview`.
 */
export function isTarGzPath(pathname: string): boolean {
	return pathname.endsWith('.tar.gz');
}

export function resolvePreviewAssetPath(
	root: string,
	outDir: string,
	pathname: string
): string | null {
	if (!isTarGzPath(pathname)) return null;

	const relative = pathname.replace(/^\/+/, '');
	const distRoot = path.resolve(root, outDir);
	const filePath = path.resolve(distRoot, relative);
	if (!filePath.startsWith(distRoot + path.sep) && filePath !== distRoot) {
		return null;
	}
	return filePath;
}

export function serveTarGzArchive(
	filePath: string,
	res: ServerResponse
): boolean {
	if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
		return false;
	}

	const body = fs.readFileSync(filePath);
	res.statusCode = 200;
	res.setHeader('Content-Type', 'application/gzip');
	res.setHeader('Content-Length', String(body.byteLength));
	res.setHeader('Cache-Control', 'no-cache');
	// Intentionally omit Content-Encoding so clients receive archive bytes.
	res.end(body);
	return true;
}
