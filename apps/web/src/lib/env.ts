/**
 * Centralized environment configuration for web app
 */

interface EnvConfig {
	NEXT_PUBLIC_API_URL: string;
	PUBLIC_API_URL: string;
}

const API_FALLBACK_BASE_URL = import.meta.env.DEV
	? 'http://localhost:3501/api'
	: '/api';

const API_BASE_URL =
	import.meta.env.NEXT_PUBLIC_API_URL ||
	import.meta.env.PUBLIC_API_URL ||
	API_FALLBACK_BASE_URL;

export const env: EnvConfig = {
	NEXT_PUBLIC_API_URL: API_BASE_URL,
	PUBLIC_API_URL: API_BASE_URL,
};

// Validate API URL in production to prevent insecure localhost usage
if (import.meta.env.PROD && API_BASE_URL.includes('localhost')) {
	// eslint-disable-next-line no-console
	console.error(
		'API base URL is configured to use localhost in production. This is insecure and will not work in production environments.'
	);
}
