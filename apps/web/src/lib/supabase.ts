import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { env } from './env';

const supabaseUrl = env.PUBLIC_SUPABASE_URL;
const supabaseAnonKey = env.PUBLIC_SUPABASE_ANON_KEY;

// Lazy initialization to avoid errors during static build when env vars are missing
let _supabaseClient: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient {
	if (!_supabaseClient) {
		const resolvedUrl = supabaseUrl?.trim();
		const resolvedAnonKey = supabaseAnonKey?.trim();
		if (!resolvedUrl || !resolvedAnonKey) {
			throw new Error(
				'Supabase configuration missing. Set PUBLIC_SUPABASE_URL and PUBLIC_SUPABASE_ANON_KEY.'
			);
		}
		_supabaseClient = createClient(resolvedUrl, resolvedAnonKey);
	}
	return _supabaseClient;
}

// Legacy export for backward compatibility - will throw if env vars are missing
// Use a lazy proxy so env validation happens when first accessed, but it no longer
// throws on benign truthy checks; it only throws when getSupabaseClient() runs.
export const supabaseClient: SupabaseClient = new Proxy({} as SupabaseClient, {
	get(_target, prop) {
		const client = getSupabaseClient();
		// @ts-expect-error - forwarding arbitrary property access
		return client[prop];
	},
});
