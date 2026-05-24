/**
 * Centralized environment configuration for web app
 */

interface EnvConfig {
	PUBLIC_API_URL: string;
	PUBLIC_GOOGLE_CLIENT_ID: string;
}

const API_FALLBACK_BASE_URL = import.meta.env.DEV
	? 'http://localhost:3501/api'
	: '/api';

const normalizeEnvValue = (value: unknown): string => {
	if (typeof value !== 'string') return '';
	return value.trim().replace(/^["']+|["']+$/g, '');
};

const PUBLIC_API_URL =
	normalizeEnvValue(import.meta.env.PUBLIC_API_URL) || API_FALLBACK_BASE_URL;
const PUBLIC_GOOGLE_CLIENT_ID = normalizeEnvValue(
	import.meta.env.PUBLIC_GOOGLE_CLIENT_ID
);

if (import.meta.env.PROD) {
	if (PUBLIC_API_URL.includes('localhost')) {
		// eslint-disable-next-line no-console
		console.warn('PUBLIC_API_URL points at localhost in production build.');
	}
	if (!PUBLIC_GOOGLE_CLIENT_ID) {
		// eslint-disable-next-line no-console
		console.error('PUBLIC_GOOGLE_CLIENT_ID is required in production.');
	}
}

export const env: EnvConfig = {
	PUBLIC_API_URL,
	PUBLIC_GOOGLE_CLIENT_ID,
};
