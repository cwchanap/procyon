import { defineConfig } from 'drizzle-kit';
import { env } from './src/env';

// Validate required Cloudflare environment variables
function validateCloudflareEnv() {
	const missingVars: string[] = [];

	if (!env.CLOUDFLARE_ACCOUNT_ID) missingVars.push('CLOUDFLARE_ACCOUNT_ID');
	if (!env.CLOUDFLARE_DATABASE_ID) missingVars.push('CLOUDFLARE_DATABASE_ID');
	if (!env.CLOUDFLARE_API_TOKEN) missingVars.push('CLOUDFLARE_API_TOKEN');

	if (missingVars.length > 0) {
		throw new Error(
			`Missing required environment variables for Drizzle D1 configuration: ${missingVars.join(', ')}`
		);
	}

	return {
		accountId: env.CLOUDFLARE_ACCOUNT_ID as string,
		databaseId: env.CLOUDFLARE_DATABASE_ID as string,
		token: env.CLOUDFLARE_API_TOKEN as string,
	};
}

const dbCredentials = validateCloudflareEnv();

export default defineConfig({
	schema: './src/db/schema.ts',
	out: './drizzle',
	dialect: 'sqlite',
	driver: 'd1-http',
	dbCredentials,
});