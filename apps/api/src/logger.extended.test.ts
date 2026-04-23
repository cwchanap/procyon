/**
 * Targets uncovered lines in logger.ts: 29-36 (safeStringify error fallback)
 */
import { describe, test, expect, beforeEach, afterEach, spyOn } from 'bun:test';
import { logger } from './logger';

type SpyInstance = ReturnType<typeof spyOn>;

describe('logger safeStringify - error fallback path', () => {
	let logSpy: SpyInstance;
	let errorSpy: SpyInstance;

	beforeEach(() => {
		logSpy = spyOn(console, 'log').mockImplementation(() => {});
		errorSpy = spyOn(console, 'error').mockImplementation(() => {});
	});

	afterEach(() => {
		logSpy.mockRestore();
		errorSpy.mockRestore();
	});

	test('logger handles circular references without throwing', () => {
		const circular: Record<string, unknown> = { a: 1 };
		circular['self'] = circular;

		// Should not throw; safeStringify detects the cycle with WeakSet
		expect(() => logger.info('circular test', circular)).not.toThrow();
		expect(logSpy).toHaveBeenCalledTimes(1);
		// The output should contain "[Circular]"
		const output = logSpy.mock.calls[0]?.[0] as string;
		expect(output).toContain('[Circular]');
	});

	test('safeStringify error branch is hit when JSON.stringify itself throws', () => {
		// Patch JSON.stringify to throw so the catch block in safeStringify is reached
		const originalStringify = JSON.stringify;
		let patchCalls = 0;
		JSON.stringify = ((...args: Parameters<typeof JSON.stringify>) => {
			patchCalls++;
			// Let the first call (inside the replacer setup) through so safeStringify
			// can set up its closure, then throw on the actual serialization call.
			if (patchCalls === 1) {
				throw new Error('forced stringify error');
			}
			return originalStringify(...args);
		}) as typeof JSON.stringify;

		try {
			expect(() => logger.info('test')).not.toThrow();
			// After the error, the fallback path constructs its own JSON via the
			// re-thrown stringify, so console.log should still be called.
			expect(logSpy).toHaveBeenCalled();
		} finally {
			JSON.stringify = originalStringify;
		}
	});

	test('logger.error with fields routes to console.error', () => {
		logger.error('something failed', { code: 42 });
		expect(errorSpy).toHaveBeenCalledTimes(1);
		const output = errorSpy.mock.calls[0]?.[0] as string;
		expect(output).toContain('"level":"error"');
		expect(output).toContain('something failed');
	});

	test('logger includes fields in output when provided', () => {
		logger.info('with fields', { key: 'value', num: 123 });
		expect(logSpy).toHaveBeenCalledTimes(1);
		const output = logSpy.mock.calls[0]?.[0] as string;
		expect(output).toContain('"key"');
		expect(output).toContain('"value"');
	});

	test('logger output without fields omits fields key', () => {
		logger.debug('no extra fields');
		const output = logSpy.mock.calls[0]?.[0] as string;
		expect(output).not.toContain('"fields"');
	});
});
