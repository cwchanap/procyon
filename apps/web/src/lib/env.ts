/**
 * Centralized environment configuration for web app
 */

interface EnvConfig {
	PUBLIC_API_URL: string;
	PUBLIC_SUPABASE_URL: string;
	PUBLIC_SUPABASE_ANON_KEY: string;
}

const API_FALLBACK_BASE_URL = import.meta.env.DEV
	? 'http://localhost:3501/api'
	: '/api';

const PUBLIC_API_URL = import.meta.env.PUBLIC_API_URL || API_FALLBACK_BASE_URL;
const PUBLIC_SUPABASE_URL = import.meta.env.PUBLIC_SUPABASE_URL || '';
const PUBLIC_SUPABASE_ANON_KEY = import.meta.env.PUBLIC_SUPABASE_ANON_KEY || '';

export const env: EnvConfig = {
	PUBLIC_API_URL,
	PUBLIC_SUPABASE_URL,
	PUBLIC_SUPABASE_ANON_KEY,
};

// Validate configuration in production
if (import.meta.env.PROD) {
	if (PUBLIC_API_URL.includes('localhost')) {
		// eslint-disable-next-line no-console
		console.error(
			'API base URL is configured to use localhost in production. This is insecure and will not work in production environments.'
		);
	}
	if (!PUBLIC_SUPABASE_URL) {
		// eslint-disable-next-line no-console
		console.error('PUBLIC_SUPABASE_URL is required in production.');
	}
	if (!PUBLIC_SUPABASE_ANON_KEY) {
		// eslint-disable-next-line no-console
		console.error('PUBLIC_SUPABASE_ANON_KEY is required in production.');
	}
}
