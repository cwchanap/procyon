/**
 * Centralized environment configuration for web app
 */

interface EnvConfig {
	PUBLIC_API_URL: string;
}

export const env: EnvConfig = {
	PUBLIC_API_URL: import.meta.env.PUBLIC_API_URL || '/api',
};
