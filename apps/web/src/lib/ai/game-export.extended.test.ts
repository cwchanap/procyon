import { test, expect, describe, beforeEach, afterEach } from 'bun:test';
import { GameExporter } from './game-export';

// ---------------------------------------------------------------------------
// Save original globals so each test can restore them after mutation
// ---------------------------------------------------------------------------
const originalBlob = (globalThis as Record<string, unknown>).Blob;
const originalURL = (globalThis as Record<string, unknown>).URL;
const originalDocument = (globalThis as Record<string, unknown>).document;

afterEach(() => {
	const g = globalThis as Record<string, unknown>;
	const restore = (key: string, value: unknown) => {
		if (value === undefined) delete g[key];
		else g[key] = value;
	};
	restore('Blob', originalBlob);
	restore('URL', originalURL);
	restore('document', originalDocument);
});

describe('GameExporter - downloadAsFile', () => {
	let exporter: GameExporter;
	let appendedChildren: HTMLAnchorElement[];
	let removedChildren: HTMLAnchorElement[];
	let createdUrls: string[];
	let revokedUrls: string[];

	beforeEach(() => {
		exporter = new GameExporter('chess');
		appendedChildren = [];
		removedChildren = [];
		createdUrls = [];
		revokedUrls = [];

		// Mock browser DOM/URL APIs
		(globalThis as Record<string, unknown>).Blob = class MockBlob {
			content: string[];
			options: { type: string };
			constructor(content: string[], options: { type: string }) {
				this.content = content;
				this.options = options;
			}
		};

		(globalThis as Record<string, unknown>).URL = {
			createObjectURL: (_blob: unknown) => {
				const url = `blob:mock-url-${createdUrls.length}`;
				createdUrls.push(url);
				return url;
			},
			revokeObjectURL: (url: string) => {
				revokedUrls.push(url);
			},
		};

		const mockLink = {
			href: '',
			download: '',
			clickCount: 0,
			click() {
				this.clickCount += 1;
			},
		} as unknown as HTMLAnchorElement & { clickCount: number };

		(globalThis as Record<string, unknown>).document = {
			createElement: (_tag: string) => mockLink,
			body: {
				appendChild: (child: HTMLAnchorElement) => appendedChildren.push(child),
				removeChild: (child: HTMLAnchorElement) => removedChildren.push(child),
			},
		};
	});

	test('downloadAsFile creates a blob, appends a link, clicks it, then removes it', () => {
		exporter.downloadAsFile('game.txt', 'content here');

		expect(createdUrls).toHaveLength(1);
		expect(revokedUrls).toHaveLength(1);
		expect(appendedChildren).toHaveLength(1);
		expect(removedChildren).toHaveLength(1);
		const clickedLink = appendedChildren[0] as HTMLAnchorElement & { clickCount: number };
		expect(clickedLink.clickCount).toBe(1);
	});

	test('downloadAsFile sets the correct download filename', () => {
		let capturedLink: { download: string; href: string } | undefined;

		(globalThis as Record<string, unknown>).document = {
			createElement: (_tag: string) => {
				const link = { href: '', download: '', click: () => {} };
				capturedLink = link;
				return link;
			},
			body: {
				appendChild: () => {},
				removeChild: () => {},
			},
		};

		exporter.downloadAsFile('my-game.txt', 'some content');
		expect(capturedLink?.download).toBe('my-game.txt');
	});
});

describe('GameExporter - exportAndDownload', () => {
	let exporter: GameExporter;
	let downloadedFilenames: string[];

	beforeEach(() => {
		exporter = new GameExporter('jungle');
		downloadedFilenames = [];

		(globalThis as Record<string, unknown>).Blob = class MockBlob {
			constructor(public content: string[], public options: { type: string }) {}
		};

		(globalThis as Record<string, unknown>).URL = {
			createObjectURL: () => 'blob:mock',
			revokeObjectURL: () => {},
		};

		(globalThis as Record<string, unknown>).document = {
			createElement: (_tag: string) => {
				const link = {
					href: '',
					download: '',
					click: () => {},
				};
				return link;
			},
			body: {
				appendChild: () => {},
				removeChild: () => {},
			},
		};

		// Intercept downloadAsFile to capture filenames
		const original = exporter.downloadAsFile.bind(exporter);
		exporter.downloadAsFile = (filename: string, content: string) => {
			downloadedFilenames.push(filename);
			original(filename, content);
		};
	});

	test('exportAndDownload defaults to text format', () => {
		exporter.addMove(1, 'light', 'a1', 'b2', 'lion');
		exporter.exportAndDownload('playing');

		expect(downloadedFilenames).toHaveLength(1);
		expect(downloadedFilenames[0]).toMatch(/\.txt$/);
		expect(downloadedFilenames[0]).toMatch(/^jungle-game-/);
	});

	test('exportAndDownload produces json file when format is json', () => {
		exporter.addMove(1, 'light', 'a1', 'b2', 'lion');
		exporter.exportAndDownload('checkmate', 'json');

		expect(downloadedFilenames).toHaveLength(1);
		expect(downloadedFilenames[0]).toMatch(/\.json$/);
	});

	test('exportAndDownload produces txt file when format is text', () => {
		exporter.exportAndDownload('playing', 'text');

		expect(downloadedFilenames).toHaveLength(1);
		expect(downloadedFilenames[0]).toMatch(/\.txt$/);
	});

	test('exportAndDownload filename contains the game variant', () => {
		exporter.exportAndDownload('playing');

		expect(downloadedFilenames[0]).toContain('jungle');
	});
});
