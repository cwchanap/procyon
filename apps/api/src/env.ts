/**
 * Centralized environment configuration for API server
 */

interface EnvConfig {
	// Server
	NODE_ENV: string;
	PORT: number;

	// JWT
	JWT_SECRET: string;
	JWT_EXPIRES_IN: string;

	// Bcrypt
	BCRYPT_SALT_ROUNDS: number;

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

	JWT_SECRET: getEnv('JWT_SECRET', 'fallback-secret-for-dev'),
	JWT_EXPIRES_IN: getEnv('JWT_EXPIRES_IN', '7d'),

	BCRYPT_SALT_ROUNDS: getEnvNumber('BCRYPT_SALT_ROUNDS', 12),

	FRONTEND_URL: getEnv('FRONTEND_URL', 'http://localhost:3500'),

	CLOUDFLARE_ACCOUNT_ID: process.env.CLOUDFLARE_ACCOUNT_ID,
	CLOUDFLARE_DATABASE_ID: process.env.CLOUDFLARE_DATABASE_ID,
	CLOUDFLARE_API_TOKEN: process.env.CLOUDFLARE_API_TOKEN,

	CI: getEnvBoolean('CI'),
};

export const isDevelopment = env.NODE_ENV === 'development';
export const isProduction = env.NODE_ENV === 'production';
export const isTest = env.NODE_ENV === 'test';
