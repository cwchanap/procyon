import { afterEach, describe, expect, mock, test } from 'bun:test';
import {
	runEnginePreflight,
	type EngineCapabilityEnvironment,
} from './engine-preflight';
import {
	STOCKFISH_JS_FILENAME,
	STOCKFISH_PUBLIC_DIRECTORY,
	STOCKFISH_WASM_FILENAME,
} from '../../../../scripts/stockfish-assets';

const stockfishJsUrl = `/${STOCKFISH_PUBLIC_DIRECTORY}/${STOCKFISH_JS_FILENAME}`;
const stockfishWasmUrl = `/${STOCKFISH_PUBLIC_DIRECTORY}/${STOCKFISH_WASM_FILENAME}`;

function createPassingEnvironment(): EngineCapabilityEnvironment {
	return {
		Worker: class MockWorker {} as typeof Worker,
		WebAssembly: {
			validate: () => true,
		} as typeof WebAssembly,
	};
}

describe('runEnginePreflight', () => {
	let fetchSpy: ReturnType<typeof mock>;
	let workerSpy: ReturnType<typeof mock>;

	afterEach(() => {
		fetchSpy?.mockRestore();
		workerSpy?.mockRestore();
	});

	test('missing Worker returns unsupported', () => {
		const result = runEnginePreflight({
			WebAssembly: {
				validate: () => true,
			} as typeof WebAssembly,
		});

		expect(result).toEqual({
			status: 'unsupported',
			message: expect.stringContaining('local chess engine'),
		});
	});

	test('missing WebAssembly returns unsupported', () => {
		const result = runEnginePreflight({
			Worker: class MockWorker {} as typeof Worker,
		});

		expect(result).toEqual({
			status: 'unsupported',
			message: expect.stringContaining('local chess engine'),
		});
	});

	test('WebAssembly.validate returning false returns unsupported', () => {
		const result = runEnginePreflight({
			Worker: class MockWorker {} as typeof Worker,
			WebAssembly: {
				validate: () => false,
			} as typeof WebAssembly,
		});

		expect(result).toEqual({
			status: 'unsupported',
			message: expect.stringContaining('local chess engine'),
		});
	});

	test('WebAssembly.validate throwing returns unsupported', () => {
		const result = runEnginePreflight({
			Worker: class MockWorker {} as typeof Worker,
			WebAssembly: {
				validate: () => {
					throw new Error('wasm unavailable');
				},
			} as typeof WebAssembly,
		});

		expect(result).toEqual({
			status: 'unsupported',
			message: expect.stringContaining('local chess engine'),
		});
	});

	test('all cheap checks pass returns supported', () => {
		const result = runEnginePreflight(createPassingEnvironment());

		expect(result).toEqual({ status: 'supported' });
	});

	test('does not construct a Worker when supported', () => {
		workerSpy = mock(() => {
			throw new Error('Worker must not be constructed during preflight');
		});
		const WorkerClass = workerSpy as unknown as typeof Worker;

		const result = runEnginePreflight({
			Worker: WorkerClass,
			WebAssembly: {
				validate: () => true,
			} as typeof WebAssembly,
		});

		expect(result).toEqual({ status: 'supported' });
		expect(workerSpy).not.toHaveBeenCalled();
	});

	test('does not call fetch when supported', () => {
		fetchSpy = mock(() => Promise.resolve(new Response('', { status: 200 })));
		globalThis.fetch = fetchSpy as typeof fetch;

		const result = runEnginePreflight(createPassingEnvironment());

		expect(result).toEqual({ status: 'supported' });
		expect(fetchSpy).not.toHaveBeenCalled();
	});

	test('does not request Stockfish asset URLs', () => {
		fetchSpy = mock((input: RequestInfo | URL) => {
			const url = String(input);
			if (url.includes(stockfishJsUrl) || url.includes(stockfishWasmUrl)) {
				throw new Error(`Stockfish asset must not be fetched: ${url}`);
			}
			return Promise.resolve(new Response('', { status: 200 }));
		});
		globalThis.fetch = fetchSpy as typeof fetch;

		const result = runEnginePreflight(createPassingEnvironment());

		expect(result).toEqual({ status: 'supported' });
		expect(fetchSpy).not.toHaveBeenCalled();
	});
});
