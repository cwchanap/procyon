import { createClient, type SupabaseClient } from '@supabase/supabase-js';

type SupabaseClients = {
	supabaseAdmin: SupabaseClient | null;
	supabaseAnon: SupabaseClient;
};

function getProcessEnvVar(key: string): string {
	const maybeProcess = globalThis as unknown as {
		process?: { env?: Record<string, string | undefined> };
	};
	return maybeProcess.process?.env?.[key] ?? '';
}

function normalizeEnvValue(value: string | undefined): string {
	if (!value) return '';
	return value.trim().replace(/^["']+|["']+$/g, '');
}

export function createSupabaseClients(
	supabaseUrl: string,
	anonKey: string,
	serviceRoleKey?: string
): SupabaseClients {
	const normalizedUrl = normalizeEnvValue(supabaseUrl);
	const normalizedAnonKey = normalizeEnvValue(anonKey);
	const normalizedServiceRoleKey = normalizeEnvValue(serviceRoleKey);

	if (!normalizedUrl || !normalizedAnonKey) {
		throw new Error(
			'Supabase configuration missing. Set SUPABASE_URL and SUPABASE_ANON_KEY.'
		);
	}

	const resolvedServiceRoleKey =
		typeof normalizedServiceRoleKey === 'string' &&
		normalizedServiceRoleKey.trim().length > 0
			? normalizedServiceRoleKey
			: null;

	const supabaseAdmin = resolvedServiceRoleKey
		? createClient(normalizedUrl, resolvedServiceRoleKey, {
				auth: {
					autoRefreshToken: false,
					persistSession: false,
				},
			})
		: null;

	const supabaseAnon = createClient(normalizedUrl, normalizedAnonKey, {
		auth: {
			autoRefreshToken: false,
			persistSession: false,
		},
	});

	return { supabaseAdmin, supabaseAnon };
}

let defaultClients: SupabaseClients | null = null;

function getDefaultClients(): SupabaseClients {
	if (defaultClients) return defaultClients;

	const supabaseUrl = getProcessEnvVar('SUPABASE_URL');
	const anonKey = getProcessEnvVar('SUPABASE_ANON_KEY');
	const serviceRoleKey = getProcessEnvVar('SUPABASE_SERVICE_ROLE_KEY');

	defaultClients = createSupabaseClients(supabaseUrl, anonKey, serviceRoleKey);
	return defaultClients;
}

// Utility to create clients from request bindings (e.g., Cloudflare Workers)
export function getSupabaseClientsFromContext(context?: {
	env?: Record<string, string | undefined>;
}): SupabaseClients {
	const boundUrl = context?.env?.SUPABASE_URL;
	const boundAnon = context?.env?.SUPABASE_ANON_KEY;
	const boundService = context?.env?.SUPABASE_SERVICE_ROLE_KEY;

	if (boundUrl && boundAnon) {
		return createSupabaseClients(boundUrl, boundAnon, boundService);
	}

	return getDefaultClients();
}
