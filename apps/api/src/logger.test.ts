import { describe, test, expect, beforeEach, afterEach, spyOn } from 'bun:test';
import { logger } from './logger';

type SpyInstance = ReturnType<typeof spyOn>;

describe('logger - output routing', () => {
	let logSpy: SpyInstance;
	let warnSpy: SpyInstance;
	let errorSpy: SpyInstance;

	beforeEach(() => {
		logSpy = spyOn(console, 'log').mockImplementation(() => {});
		warnSpy = spyOn(console, 'warn').mockImplementation(() => {});
		errorSpy = spyOn(console, 'error').mockImplementation(() => {});
	});

	afterEach(() => {
		logSpy.mockRestore();
		warnSpy.mockRestore();
		errorSpy.mockRestore();
	});

	test('logger.debug calls console.log', () => {
		logger.debug('debug message');
		expect(logSpy).toHaveBeenCalledTimes(1);
		expect(warnSpy).not.toHaveBeenCalled();
		expect(errorSpy).not.toHaveBeenCalled();
	});

	test('logger.info calls console.log', () => {
		logger.info('info message');
		expect(logSpy).toHaveBeenCalledTimes(1);
		expect(warnSpy).not.toHaveBeenCalled();
		expect(errorSpy).not.toHaveBeenCalled();
	});

	test('logger.warn calls console.warn', () => {
		logger.warn('warn message');
		expect(warnSpy).toHaveBeenCalledTimes(1);
		expect(logSpy).not.toHaveBeenCalled();
		expect(errorSpy).not.toHaveBeenCalled();
	});

	test('logger.error calls console.error', () => {
		logger.error('error message');
		expect(errorSpy).toHaveBeenCalledTimes(1);
		expect(logSpy).not.toHaveBeenCalled();
		expect(warnSpy).not.toHaveBeenCalled();
	});
});

describe('logger - output structure', () => {
	let logSpy: SpyInstance;
	let warnSpy: SpyInstance;
	let errorSpy: SpyInstance;

	beforeEach(() => {
		logSpy = spyOn(console, 'log').mockImplementation(() => {});
		warnSpy = spyOn(console, 'warn').mockImplementation(() => {});
		errorSpy = spyOn(console, 'error').mockImplementation(() => {});
	});

	afterEach(() => {
		logSpy.mockRestore();
		warnSpy.mockRestore();
		errorSpy.mockRestore();
	});

	test('output is valid JSON', () => {
		logger.info('test');
		const arg = logSpy.mock.calls[0]?.[0] as string;
		expect(() => JSON.parse(arg)).not.toThrow();
	});

	test('output contains level field', () => {
		logger.info('test');
		const payload = JSON.parse(logSpy.mock.calls[0]?.[0] as string) as { level: string };
		expect(payload.level).toBe('info');
	});

	test('output contains message field', () => {
		logger.info('hello world');
		const payload = JSON.parse(logSpy.mock.calls[0]?.[0] as string) as { message: string };
		expect(payload.message).toBe('hello world');
	});

	test('output contains timestamp field', () => {
		logger.info('test');
		const payload = JSON.parse(logSpy.mock.calls[0]?.[0] as string) as { timestamp: string };
		expect(typeof payload.timestamp).toBe('string');
		expect(payload.timestamp.length).toBeGreaterThan(0);
	});

	test('timestamp is valid ISO date string', () => {
		logger.info('test');
		const payload = JSON.parse(logSpy.mock.calls[0]?.[0] as string) as { timestamp: string };
		expect(new Date(payload.timestamp).toISOString()).toBe(payload.timestamp);
	});

	test('warn output has level=warn', () => {
		logger.warn('test');
		const payload = JSON.parse(warnSpy.mock.calls[0]?.[0] as string) as { level: string };
		expect(payload.level).toBe('warn');
	});

	test('error output has level=error', () => {
		logger.error('test');
		const payload = JSON.parse(errorSpy.mock.calls[0]?.[0] as string) as { level: string };
		expect(payload.level).toBe('error');
	});

	test('debug output has level=debug', () => {
		logger.debug('test');
		const payload = JSON.parse(logSpy.mock.calls[0]?.[0] as string) as { level: string };
		expect(payload.level).toBe('debug');
	});
});

describe('logger - fields handling', () => {
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

	test('fields are included when provided', () => {
		logger.info('test', { userId: '123', action: 'login' });
		const payload = JSON.parse(logSpy.mock.calls[0]?.[0] as string) as {
			fields: { userId: string; action: string };
		};
		expect(payload.fields).toBeDefined();
		expect(payload.fields.userId).toBe('123');
		expect(payload.fields.action).toBe('login');
	});

	test('fields are not present when not provided', () => {
		logger.info('test');
		const payload = JSON.parse(logSpy.mock.calls[0]?.[0] as string) as Record<string, unknown>;
		expect(payload.fields).toBeUndefined();
	});

	test('error level with fields uses console.error', () => {
		logger.error('oops', { code: 500 });
		const payload = JSON.parse(errorSpy.mock.calls[0]?.[0] as string) as {
			level: string;
			fields: { code: number };
		};
		expect(payload.level).toBe('error');
		expect(payload.fields.code).toBe(500);
	});

	test('nested fields objects are serialized', () => {
		logger.info('test', { nested: { a: 1, b: 'two' } });
		const payload = JSON.parse(logSpy.mock.calls[0]?.[0] as string) as {
			fields: { nested: { a: number; b: string } };
		};
		expect(payload.fields.nested.a).toBe(1);
		expect(payload.fields.nested.b).toBe('two');
	});
});

describe('logger - special value serialization', () => {
	let logSpy: SpyInstance;
	let warnSpy: SpyInstance;
	let errorSpy: SpyInstance;

	beforeEach(() => {
		logSpy = spyOn(console, 'log').mockImplementation(() => {});
		warnSpy = spyOn(console, 'warn').mockImplementation(() => {});
		errorSpy = spyOn(console, 'error').mockImplementation(() => {});
	});

	afterEach(() => {
		logSpy.mockRestore();
		warnSpy.mockRestore();
		errorSpy.mockRestore();
	});

	test('bigint values are serialized as strings', () => {
		logger.info('bigint test', { big: BigInt('123456789012345678901') });
		const raw = logSpy.mock.calls[0]?.[0] as string;
		expect(() => JSON.parse(raw)).not.toThrow();
		const payload = JSON.parse(raw) as { fields: { big: string } };
		expect(payload.fields.big).toBe('123456789012345678901');
	});

	test('circular references are replaced with [Circular]', () => {
		const circular: Record<string, unknown> = { name: 'test' };
		circular['self'] = circular;
		logger.info('circular test', { circular });
		const raw = logSpy.mock.calls[0]?.[0] as string;
		expect(() => JSON.parse(raw)).not.toThrow();
		expect(raw).toContain('[Circular]');
	});

	test('array fields are serialized correctly', () => {
		logger.info('array test', { items: [1, 2, 3] });
		const payload = JSON.parse(logSpy.mock.calls[0]?.[0] as string) as {
			fields: { items: number[] };
		};
		expect(payload.fields.items).toEqual([1, 2, 3]);
	});

	test('null fields value is handled', () => {
		logger.info('null test', { value: null });
		const raw = logSpy.mock.calls[0]?.[0] as string;
		expect(() => JSON.parse(raw)).not.toThrow();
	});
});
