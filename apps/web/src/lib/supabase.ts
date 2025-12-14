import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { env } from './env';

const supabaseUrl = env.PUBLIC_SUPABASE_URL;
const supabaseAnonKey = env.PUBLIC_SUPABASE_ANON_KEY;

// Lazy initialization to avoid errors during static build when env vars are missing
let _supabaseClient: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient {
	if (!_supabaseClient) {
		if (
			supabaseUrl.trim().length === 0 ||
			supabaseAnonKey.trim().length === 0
		) {
			throw new Error(
				'Supabase configuration missing. Set PUBLIC_SUPABASE_URL and PUBLIC_SUPABASE_ANON_KEY.'
			);
		}
		_supabaseClient = createClient(supabaseUrl, supabaseAnonKey);
	}
	return _supabaseClient;
}

// Legacy export for backward compatibility - will throw if env vars are missing
export const supabaseClient = (() => {
	// During static build, provide a dummy object that will fail gracefully at runtime
	if (supabaseUrl.trim().length === 0 || supabaseAnonKey.trim().length === 0) {
		// Return a proxy that throws on any access - this allows builds to complete
		// but will fail at runtime if actually used without proper configuration
		return new Proxy(
			{},
			{
				get: () => {
					throw new Error(
						'Supabase configuration missing. Set PUBLIC_SUPABASE_URL and PUBLIC_SUPABASE_ANON_KEY.'
					);
				},
			}
		) as SupabaseClient;
	}
	return getSupabaseClient();
})();
