import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { env } from '../env';

type SupabaseClients = {
	supabaseAdmin: SupabaseClient;
	supabaseAnon: SupabaseClient;
};

export function createSupabaseClients(
	supabaseUrl: string,
	anonKey: string,
	serviceRoleKey: string
): SupabaseClients {
	const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
		auth: {
			autoRefreshToken: false,
			persistSession: false,
		},
	});

	const supabaseAnon = createClient(supabaseUrl, anonKey, {
		auth: {
			autoRefreshToken: false,
			persistSession: false,
		},
	});

	return { supabaseAdmin, supabaseAnon };
}

// Default clients for traditional server runtime
const defaultClients = createSupabaseClients(
	env.SUPABASE_URL,
	env.SUPABASE_ANON_KEY,
	env.SUPABASE_SERVICE_ROLE_KEY
);

export const supabaseAdmin = defaultClients.supabaseAdmin;
export const supabaseAnon = defaultClients.supabaseAnon;

// Utility to create clients from request bindings (e.g., Cloudflare Workers)
export function getSupabaseClientsFromContext(context?: {
	env?: Record<string, string | undefined>;
}): SupabaseClients {
	const boundUrl = context?.env?.SUPABASE_URL;
	const boundAnon = context?.env?.SUPABASE_ANON_KEY;
	const boundService = context?.env?.SUPABASE_SERVICE_ROLE_KEY;

	if (boundUrl && boundAnon && boundService) {
		return createSupabaseClients(boundUrl, boundAnon, boundService);
	}

	return defaultClients;
}
