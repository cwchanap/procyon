import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
	isTarGzPath,
	resolvePreviewAssetPath,
	serveTarGzArchive,
} from './stockfish-tar-gz-preview-headers';

/**
 * Static preview for Stockfish asset e2e.
 *
 * Astro's static `astro preview` boots Vite with `configFile: false` and only
 * the built-in `astro:preview` plugin, so user Vite plugins never run. Vite's
 * sirv then labels any `*.gz` path as precompressed (`Content-Encoding: gzip`),
 * which makes browsers/Playwright gunzip downloadable `.tar.gz` archives.
 *
 * This server mirrors production-like delivery: `.tar.gz` without
 * Content-Encoding, and correct MIME types for wasm/js.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const outDir = 'dist';
const distRoot = path.resolve(root, outDir);

const MIME_BY_EXT: Record<string, string> = {
	'.html': 'text/html; charset=utf-8',
	'.js': 'text/javascript; charset=utf-8',
	'.mjs': 'text/javascript; charset=utf-8',
	'.css': 'text/css; charset=utf-8',
	'.json': 'application/json',
	'.svg': 'image/svg+xml',
	'.wasm': 'application/wasm',
	'.txt': 'text/plain; charset=utf-8',
	'.map': 'application/json',
};

function contentTypeFor(filePath: string): string {
	const ext = path.extname(filePath).toLowerCase();
	return MIME_BY_EXT[ext] ?? 'application/octet-stream';
}

function safeJoinDist(pathname: string): string | null {
	const relative = decodeURIComponent(pathname.replace(/^\/+/, ''));
	const filePath = path.resolve(distRoot, relative || 'index.html');
	if (!filePath.startsWith(distRoot + path.sep) && filePath !== distRoot) {
		return null;
	}
	return filePath;
}

function sendFile(res: http.ServerResponse, filePath: string): void {
	const body = fs.readFileSync(filePath);
	res.statusCode = 200;
	res.setHeader('Content-Type', contentTypeFor(filePath));
	res.setHeader('Content-Length', String(body.byteLength));
	res.setHeader('Cache-Control', 'no-cache');
	res.end(body);
}

export function createStockfishAssetsPreviewServer(
	port: number,
	host = '127.0.0.1'
): http.Server {
	if (!fs.existsSync(distRoot)) {
		throw new Error(
			`[stockfish-assets-preview] Missing ${distRoot}. Run \`bun run build\` first.`
		);
	}

	const server = http.createServer((req, res) => {
		const pathname = (req.url ?? '/').split('?')[0] ?? '/';

		if (isTarGzPath(pathname)) {
			const archivePath = resolvePreviewAssetPath(root, outDir, pathname);
			if (archivePath && serveTarGzArchive(archivePath, res)) {
				return;
			}
			res.statusCode = 404;
			res.end('Not Found');
			return;
		}

		let filePath = safeJoinDist(pathname);
		if (!filePath) {
			res.statusCode = 403;
			res.end('Forbidden');
			return;
		}

		if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
			filePath = path.join(filePath, 'index.html');
		}

		if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
			const htmlFallback = `${filePath}.html`;
			if (fs.existsSync(htmlFallback) && fs.statSync(htmlFallback).isFile()) {
				sendFile(res, htmlFallback);
				return;
			}
			res.statusCode = 404;
			res.end('Not Found');
			return;
		}

		sendFile(res, filePath);
	});

	server.listen(port, host);
	return server;
}

const isDirectRun = process.argv[1]
	? path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
	: false;

if (isDirectRun) {
	const port = Number(process.env.PORT ?? process.argv[2] ?? 3510);
	const host = process.env.HOST ?? '127.0.0.1';
	createStockfishAssetsPreviewServer(port, host);
	console.log(`[stockfish-assets-preview] http://${host}:${port}`);
}
