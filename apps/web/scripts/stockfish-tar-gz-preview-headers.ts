import fs from 'node:fs';
import path from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin, PreviewServer } from 'vite';

/**
 * Vite/sirv treats any filename ending in `.gz` as a precompressed asset and
 * sets `Content-Encoding: gzip`. That is wrong for downloadable `.tar.gz`
 * archives: browsers and fetch then gunzip the body, so clients never receive
 * the archive bytes. Serve those files ourselves during preview with correct
 * response metadata (no Content-Encoding).
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

export function stockfishTarGzPreviewHeaders(): Plugin {
	return {
		name: 'stockfish-tar-gz-preview-headers',
		configurePreviewServer(server: PreviewServer) {
			server.middlewares.use(
				(req: IncomingMessage, res: ServerResponse, next: () => void) => {
					const pathname = decodeURIComponent(
						(req.url ?? '').split('?')[0] ?? ''
					);
					const filePath = resolvePreviewAssetPath(
						server.config.root,
						server.config.build.outDir,
						pathname
					);
					if (!filePath || !serveTarGzArchive(filePath, res)) {
						next();
						return;
					}
				}
			);
		},
	};
}
