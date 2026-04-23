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
		// Patch JSON.stringify so it throws only when called with a replacer function
		// (the try-block call inside safeStringify) but passes through the catch-block
		// call (which has no replacer) so the fallback JSON can be serialized.
		const originalStringify = JSON.stringify;
		// eslint-disable-next-line no-global-assign -- Intentional mock to test safeStringify error handling
		JSON.stringify = ((...args: Parameters<typeof JSON.stringify>) => {
			if (typeof args[1] === 'function') {
				throw new Error('forced stringify error');
			}
			return originalStringify(...args);
		}) as typeof JSON.stringify;

		try {
			expect(() => logger.info('test')).not.toThrow();
			// The catch branch in safeStringify emits "Logger serialization failed"
			expect(logSpy).toHaveBeenCalled();
			const output = logSpy.mock.calls[0]?.[0] as string;
			expect(output).toContain('Logger serialization failed');
		} finally {
			// eslint-disable-next-line no-global-assign -- Restore after test
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
