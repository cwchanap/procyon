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

const normalizeEnvValue = (value: unknown): string => {
	if (typeof value !== 'string') {
		return '';
	}
	return value.trim().replace(/^["']+|["']+$/g, '');
};

const PUBLIC_API_URL =
	normalizeEnvValue(import.meta.env.PUBLIC_API_URL) || API_FALLBACK_BASE_URL;
const PUBLIC_SUPABASE_URL_RAW = import.meta.env.PUBLIC_SUPABASE_URL;
const PUBLIC_SUPABASE_ANON_KEY_RAW = import.meta.env.PUBLIC_SUPABASE_ANON_KEY;

function assertNonEmptyString(
	value: unknown,
	name: string
): asserts value is string {
	if (typeof value === 'string' && value.trim().length > 0) {
		return;
	}
	// eslint-disable-next-line no-console
	console.error(
		`Missing ${name}. Set ${name} in your environment (for example in your .env) and restart the server.`
	);
	throw new Error(
		`Missing ${name}. Set ${name} in your environment (for example in your .env) and restart the server.`
	);
}

const PUBLIC_SUPABASE_URL = normalizeEnvValue(PUBLIC_SUPABASE_URL_RAW);
const PUBLIC_SUPABASE_ANON_KEY = normalizeEnvValue(
	PUBLIC_SUPABASE_ANON_KEY_RAW
);

// Validate configuration in production
if (import.meta.env.PROD) {
	if (PUBLIC_API_URL.includes('localhost')) {
		// eslint-disable-next-line no-console
		console.error(
			'API base URL is configured to use localhost in production. This is insecure and will not work in production environments.'
		);
	}
	assertNonEmptyString(PUBLIC_SUPABASE_URL, 'PUBLIC_SUPABASE_URL');
	assertNonEmptyString(PUBLIC_SUPABASE_ANON_KEY, 'PUBLIC_SUPABASE_ANON_KEY');
}

export const env: EnvConfig = {
	PUBLIC_API_URL,
	PUBLIC_SUPABASE_URL,
	PUBLIC_SUPABASE_ANON_KEY,
};
