import { createClient } from '@supabase/supabase-js';
import { env } from '../env';

// Service role client for server-side operations and JWT validation
export const supabaseAdmin = createClient(
	env.SUPABASE_URL,
	env.SUPABASE_SERVICE_ROLE_KEY,
	{
		auth: {
			autoRefreshToken: false,
			persistSession: false,
		},
	}
);

// Anon client for any non-privileged server interactions (if needed)
export const supabaseAnon = createClient(
	env.SUPABASE_URL,
	env.SUPABASE_ANON_KEY,
	{
		auth: {
			autoRefreshToken: false,
			persistSession: false,
		},
	}
);
