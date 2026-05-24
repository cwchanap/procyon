/**
 * Tests for env.ts using fresh dynamic imports so each test evaluates the
 * module-level code (isWorkersRuntime, getEnvNumber, getEnvBoolean, production
 * validation) against a controlled process.env / globalThis state.
 *
 * Targeted uncovered lines in env.ts:
 *   36-44  isWorkersRuntime() detection
 *   56-64  getEnvNumber() branches (empty / invalid / valid)
 *   66-68  getEnvBoolean()
 *   88-98  production validation (throws when GOOGLE_CLIENT_ID / JWT_SECRET are missing)
 */
import { describe, test, expect } from 'bun:test';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function snapshotEnv(): Record<string, string | undefined> {
	return { ...process.env };
}

function restoreEnv(saved: Record<string, string | undefined>): void {
	for (const key of Object.keys(process.env)) {
		if (!(key in saved)) delete process.env[key];
	}
	for (const [key, value] of Object.entries(saved)) {
		if (value === undefined) delete process.env[key];
		else process.env[key] = value;
	}
}

function snapshotGlobals(keys: string[]): Record<string, unknown> {
	const g = globalThis as Record<string, unknown>;
	return Object.fromEntries(keys.map(k => [k, g[k]]));
}

function restoreGlobals(saved: Record<string, unknown>): void {
	const g = globalThis as Record<string, unknown>;
	for (const [key, value] of Object.entries(saved)) {
		if (value === undefined) delete g[key];
		else g[key] = value;
	}
}

/** Set a minimal safe env so production validation never throws unexpectedly. */
function applySafeEnv(
	overrides: Record<string, string | undefined> = {}
): void {
	process.env.NODE_ENV = 'test';
	process.env.GOOGLE_CLIENT_ID = 'test-client-id';
	process.env.JWT_SECRET = 'test-jwt-secret-must-be-at-least-32-chars-long';
	for (const [key, value] of Object.entries(overrides)) {
		if (value === undefined) delete process.env[key];
		else process.env[key] = value;
	}
}

/**
 * Each call returns a freshly-evaluated copy of env.ts.
 * Bun resolves the query string as a distinct module URL, bypassing the
 * ES-module cache and re-running all module-level code against the current
 * process.env / globalThis state.
 */
async function importFreshEnv() {
	// Query string cache-busts Bun's ES module cache so each call gets a fresh evaluation
	return import(`./env.ts?t=${Date.now()}-${Math.random()}`);
}

// ---------------------------------------------------------------------------
// isWorkersRuntime — exercised indirectly via production validation
// ---------------------------------------------------------------------------
describe('isWorkersRuntime detection (via production validation)', () => {
	test('production validation passes when WebSocketPair is present (Workers runtime)', async () => {
		const savedEnv = snapshotEnv();
		const savedGlobals = snapshotGlobals(['WebSocketPair', 'caches']);

		try {
			// Simulate Cloudflare Workers environment
			(globalThis as Record<string, unknown>).WebSocketPair =
				function MockWebSocketPair() {};
			delete (globalThis as Record<string, unknown>).caches;

			// In Workers runtime isWorkersRuntime() → true, so validation is skipped
			// even when the required vars are absent
			process.env.NODE_ENV = 'production';
			delete process.env.GOOGLE_CLIENT_ID;
			delete process.env.JWT_SECRET;

			await expect(importFreshEnv()).resolves.toBeDefined();
		} finally {
			restoreGlobals(savedGlobals);
			restoreEnv(savedEnv);
		}
	});

	test('production validation throws when not on Workers runtime and GOOGLE_CLIENT_ID is missing', async () => {
		const savedEnv = snapshotEnv();
		const savedGlobals = snapshotGlobals(['WebSocketPair', 'caches']);

		try {
			delete (globalThis as Record<string, unknown>).WebSocketPair;
			delete (globalThis as Record<string, unknown>).caches;

			process.env.NODE_ENV = 'production';
			delete process.env.GOOGLE_CLIENT_ID;
			process.env.JWT_SECRET = 'test-jwt-secret-must-be-at-least-32-chars-long';

			await expect(importFreshEnv()).rejects.toThrow(
				'GOOGLE_CLIENT_ID is required in production.'
			);
		} finally {
			restoreGlobals(savedGlobals);
			restoreEnv(savedEnv);
		}
	});

	test('production validation throws when JWT_SECRET is missing', async () => {
		const savedEnv = snapshotEnv();
		const savedGlobals = snapshotGlobals(['WebSocketPair', 'caches']);

		try {
			delete (globalThis as Record<string, unknown>).WebSocketPair;
			delete (globalThis as Record<string, unknown>).caches;

			process.env.NODE_ENV = 'production';
			process.env.GOOGLE_CLIENT_ID = 'test-client-id';
			delete process.env.JWT_SECRET;

			await expect(importFreshEnv()).rejects.toThrow(
				'JWT_SECRET is required in production.'
			);
		} finally {
			restoreGlobals(savedGlobals);
			restoreEnv(savedEnv);
		}
	});

	test('production validation passes when all required vars are present', async () => {
		const savedEnv = snapshotEnv();
		const savedGlobals = snapshotGlobals(['WebSocketPair', 'caches']);

		try {
			delete (globalThis as Record<string, unknown>).WebSocketPair;
			delete (globalThis as Record<string, unknown>).caches;

			process.env.NODE_ENV = 'production';
			process.env.GOOGLE_CLIENT_ID = 'test-client-id';
			process.env.JWT_SECRET = 'test-jwt-secret-must-be-at-least-32-chars-long';

			await expect(importFreshEnv()).resolves.toBeDefined();
		} finally {
			restoreGlobals(savedGlobals);
			restoreEnv(savedEnv);
		}
	});
});

// ---------------------------------------------------------------------------
// getEnvNumber — exercised via env.PORT
// ---------------------------------------------------------------------------
describe('getEnvNumber (via env.PORT)', () => {
	test('uses default 3501 when PORT is undefined', async () => {
		const savedEnv = snapshotEnv();
		try {
			applySafeEnv({ PORT: undefined });
			const mod = await importFreshEnv();
			expect((mod as { env: { PORT: number } }).env.PORT).toBe(3501);
		} finally {
			restoreEnv(savedEnv);
		}
	});

	test('uses default 3501 when PORT is empty string', async () => {
		const savedEnv = snapshotEnv();
		try {
			applySafeEnv({ PORT: '' });
			const mod = await importFreshEnv();
			expect((mod as { env: { PORT: number } }).env.PORT).toBe(3501);
		} finally {
			restoreEnv(savedEnv);
		}
	});

	test('uses default 3501 when PORT is not a valid positive integer', async () => {
		const savedEnv = snapshotEnv();
		try {
			applySafeEnv({ PORT: 'abc' });
			const mod = await importFreshEnv();
			expect((mod as { env: { PORT: number } }).env.PORT).toBe(3501);
		} finally {
			restoreEnv(savedEnv);
		}
	});

	test('uses default 3501 when PORT is zero or negative', async () => {
		const savedEnv = snapshotEnv();
		try {
			applySafeEnv({ PORT: '0' });
			const mod0 = await importFreshEnv();
			expect((mod0 as { env: { PORT: number } }).env.PORT).toBe(3501);

			applySafeEnv({ PORT: '-5' });
			const modNeg = await importFreshEnv();
			expect((modNeg as { env: { PORT: number } }).env.PORT).toBe(3501);
		} finally {
			restoreEnv(savedEnv);
		}
	});

	test('parses valid PORT value', async () => {
		const savedEnv = snapshotEnv();
		try {
			applySafeEnv({ PORT: '8080' });
			const mod = await importFreshEnv();
			expect((mod as { env: { PORT: number } }).env.PORT).toBe(8080);
		} finally {
			restoreEnv(savedEnv);
		}
	});

	test('parses quoted PORT value', async () => {
		const savedEnv = snapshotEnv();
		try {
			applySafeEnv({ PORT: '"3600"' });
			const mod = await importFreshEnv();
			expect((mod as { env: { PORT: number } }).env.PORT).toBe(3600);
		} finally {
			restoreEnv(savedEnv);
		}
	});
});

// ---------------------------------------------------------------------------
// getEnvBoolean — exercised via env.CI
// ---------------------------------------------------------------------------
describe('getEnvBoolean (via env.CI)', () => {
	test('returns true when CI=true', async () => {
		const savedEnv = snapshotEnv();
		try {
			applySafeEnv({ CI: 'true' });
			const mod = await importFreshEnv();
			expect((mod as { env: { CI: boolean } }).env.CI).toBe(true);
		} finally {
			restoreEnv(savedEnv);
		}
	});

	test('returns true when CI=1', async () => {
		const savedEnv = snapshotEnv();
		try {
			applySafeEnv({ CI: '1' });
			const mod = await importFreshEnv();
			expect((mod as { env: { CI: boolean } }).env.CI).toBe(true);
		} finally {
			restoreEnv(savedEnv);
		}
	});

	test('returns false when CI is undefined', async () => {
		const savedEnv = snapshotEnv();
		try {
			applySafeEnv({ CI: undefined });
			const mod = await importFreshEnv();
			expect((mod as { env: { CI: boolean } }).env.CI).toBe(false);
		} finally {
			restoreEnv(savedEnv);
		}
	});

	test('returns false when CI is any other string', async () => {
		const savedEnv = snapshotEnv();
		try {
			applySafeEnv({ CI: 'yes' });
			const mod = await importFreshEnv();
			expect((mod as { env: { CI: boolean } }).env.CI).toBe(false);
		} finally {
			restoreEnv(savedEnv);
		}
	});
});
