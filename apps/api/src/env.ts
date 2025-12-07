/**
 * Centralized environment configuration for API server
 */

interface EnvConfig {
	// Server
	NODE_ENV: string;
	PORT: number;

	// Supabase
	SUPABASE_URL: string;
	SUPABASE_ANON_KEY: string;
	SUPABASE_SERVICE_ROLE_KEY: string;

	// Frontend
	FRONTEND_URL: string;

	// Cloudflare D1 (production)
	CLOUDFLARE_ACCOUNT_ID?: string;
	CLOUDFLARE_DATABASE_ID?: string;
	CLOUDFLARE_API_TOKEN?: string;

	// CI
	CI?: boolean;
}

function getEnv(key: string, defaultValue?: string): string {
	return process.env[key] || defaultValue || '';
}

function getEnvNumber(key: string, defaultValue: number): number {
	const value = process.env[key];
	if (!value) return defaultValue;

	const parsed = Number.parseInt(value, 10);
	return Number.isInteger(parsed) && parsed > 0 ? parsed : defaultValue;
}

function getEnvBoolean(key: string): boolean {
	return process.env[key] === 'true' || process.env[key] === '1';
}

export const env: EnvConfig = {
	NODE_ENV: getEnv('NODE_ENV'),
	PORT: getEnvNumber('PORT', 3501),

	SUPABASE_URL: getEnv('SUPABASE_URL'),
	SUPABASE_ANON_KEY: getEnv('SUPABASE_ANON_KEY'),
	SUPABASE_SERVICE_ROLE_KEY: getEnv('SUPABASE_SERVICE_ROLE_KEY'),

	FRONTEND_URL: getEnv('FRONTEND_URL', 'http://localhost:3500'),

	CLOUDFLARE_ACCOUNT_ID: process.env.CLOUDFLARE_ACCOUNT_ID,
	CLOUDFLARE_DATABASE_ID: process.env.CLOUDFLARE_DATABASE_ID,
	CLOUDFLARE_API_TOKEN: process.env.CLOUDFLARE_API_TOKEN,

	CI: getEnvBoolean('CI'),
};

// Validate critical environment variables
if (process.env.NODE_ENV === 'production') {
	if (!env.SUPABASE_URL) {
		throw new Error('SUPABASE_URL is required in production.');
	}
	if (!env.SUPABASE_ANON_KEY) {
		throw new Error('SUPABASE_ANON_KEY is required in production.');
	}
	if (!env.SUPABASE_SERVICE_ROLE_KEY) {
		throw new Error('SUPABASE_SERVICE_ROLE_KEY is required in production.');
	}
}

export const isDevelopment = env.NODE_ENV === 'development';
export const isProduction = env.NODE_ENV === 'production';
export const isTest = env.NODE_ENV === 'test';
