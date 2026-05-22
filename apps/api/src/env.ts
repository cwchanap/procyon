/**
 * Centralized environment configuration for API server
 */

interface EnvConfig {
	// Server
	NODE_ENV: string;
	PORT: number;

	// Google OAuth
	GOOGLE_CLIENT_ID: string;
	JWT_SECRET: string;

	// Frontend
	FRONTEND_URL: string;

	// Cloudflare D1 (production)
	CLOUDFLARE_ACCOUNT_ID?: string;
	CLOUDFLARE_DATABASE_ID?: string;
	CLOUDFLARE_API_TOKEN?: string;

	// CI
	CI?: boolean;
}

function getProcessEnv(): Record<string, string | undefined> {
	const maybeProcess = globalThis as unknown as {
		process?: { env?: Record<string, string | undefined> };
	};
	return maybeProcess.process?.env ?? {};
}

const processEnv = getProcessEnv();

function isWorkersRuntime(): boolean {
	const g = globalThis as unknown as {
		WebSocketPair?: unknown;
		caches?: unknown;
	};
	return (
		typeof g.WebSocketPair !== 'undefined' || typeof g.caches !== 'undefined'
	);
}

function normalizeEnvValue(value: string | undefined): string {
	if (!value) return '';
	return value.trim().replace(/^["']+|["']+$/g, '');
}

function getEnv(key: string, defaultValue?: string): string {
	const raw = processEnv[key] ?? defaultValue;
	return normalizeEnvValue(raw);
}

function getEnvNumber(key: string, defaultValue: number): number {
	const value = normalizeEnvValue(processEnv[key]);
	if (!value) return defaultValue;
	const parsed = Number.parseInt(value, 10);
	return Number.isInteger(parsed) && parsed > 0 ? parsed : defaultValue;
}

function getEnvBoolean(key: string): boolean {
	return processEnv[key] === 'true' || processEnv[key] === '1';
}

export const env: EnvConfig = {
	NODE_ENV: getEnv('NODE_ENV'),
	PORT: getEnvNumber('PORT', 3501),

	GOOGLE_CLIENT_ID: getEnv('GOOGLE_CLIENT_ID'),
	JWT_SECRET: getEnv('JWT_SECRET'),

	FRONTEND_URL: getEnv('FRONTEND_URL', 'http://localhost:3500'),

	CLOUDFLARE_ACCOUNT_ID: processEnv.CLOUDFLARE_ACCOUNT_ID,
	CLOUDFLARE_DATABASE_ID: processEnv.CLOUDFLARE_DATABASE_ID,
	CLOUDFLARE_API_TOKEN: processEnv.CLOUDFLARE_API_TOKEN,

	CI: getEnvBoolean('CI'),
};

if (env.NODE_ENV === 'production' && !isWorkersRuntime()) {
	if (!env.GOOGLE_CLIENT_ID) {
		throw new Error('GOOGLE_CLIENT_ID is required in production.');
	}
	if (!env.JWT_SECRET) {
		throw new Error('JWT_SECRET is required in production.');
	}
}

export const isDevelopment =
	env.NODE_ENV === 'development' || env.NODE_ENV === 'e2e';
export const isProduction = env.NODE_ENV === 'production';
export const isTest = env.NODE_ENV === 'test' || env.NODE_ENV === 'e2e';
