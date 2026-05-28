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
	if (typeof value !== 'string') {
		return '';
	}
	return value.trim().replace(/^["']+|["']+$/g, '');
};

const PUBLIC_API_URL =
	normalizeEnvValue(import.meta.env.PUBLIC_API_URL) || API_FALLBACK_BASE_URL;

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

const PUBLIC_GOOGLE_CLIENT_ID = normalizeEnvValue(
	import.meta.env.PUBLIC_GOOGLE_CLIENT_ID
);

// Validate configuration in production
if (import.meta.env.PROD) {
	if (PUBLIC_API_URL.includes('localhost')) {
		// eslint-disable-next-line no-console
		console.error(
			'API base URL is configured to use localhost in production. This is insecure and will not work in production environments.'
		);
	}
	assertNonEmptyString(PUBLIC_GOOGLE_CLIENT_ID, 'PUBLIC_GOOGLE_CLIENT_ID');
}

export const env: EnvConfig = {
	PUBLIC_API_URL,
	PUBLIC_GOOGLE_CLIENT_ID,
};
