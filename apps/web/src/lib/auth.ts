import { useEffect, useState } from 'react';
import { env } from './env';
import { supabaseClient } from './supabase';
import type { User as SupabaseUser } from '@supabase/supabase-js';

type AuthUser = {
	id: string;
	email: string;
	username: string;
	createdAt: string;
	user_metadata?: Record<string, unknown>;
};

function mapSupabaseUser(user: SupabaseUser | null): AuthUser | null {
	if (!user) return null;

	const metadata = user.user_metadata as
		| ({ username?: string } & Record<string, unknown>)
		| null;
	const rawUsername =
		metadata && typeof metadata.username === 'string'
			? metadata.username
			: undefined;
	const username =
		rawUsername && rawUsername.trim().length > 0
			? rawUsername
			: user.email?.split('@')[0] || 'Player';

	return {
		id: user.id,
		email: user.email ?? '',
		username,
		createdAt: user.created_at,
		user_metadata: user.user_metadata as Record<string, unknown> | undefined,
	};
}

type LoginResult =
	| { success: true }
	| { success: false; error: string; retryAfterMs?: number };

type RegisterResult = { success: boolean; error?: string };

function resolveApiBaseUrl(): string {
	const base = env.PUBLIC_API_URL || '/api';
	return base.replace(/\/$/, '') || '/api';
}

const API_BASE_URL = resolveApiBaseUrl();

export async function getAuthHeaders(): Promise<Record<string, string>> {
	const { data } = await supabaseClient.auth.getSession();
	const accessToken = data.session?.access_token;
	if (!accessToken) {
		return {};
	}
	return {
		Authorization: `Bearer ${accessToken}`,
	};
}

async function apiLogin(email: string, password: string): Promise<LoginResult> {
	try {
		const controller = new AbortController();
		const timeoutId = setTimeout(() => controller.abort(), 10000);

		const res = await fetch(`${API_BASE_URL}/auth/login`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ email, password }),
			signal: controller.signal,
		});

		clearTimeout(timeoutId);

		if (res.status === 429) {
			const data = await res.json().catch(() => ({}));
			return {
				success: false,
				error: data.error || 'Too many attempts. Please wait before retrying.',
				retryAfterMs: data.retryAfterMs,
			};
		}

		if (!res.ok) {
			const data = await res.json().catch(() => ({}));
			return { success: false, error: data.error || 'Login failed' };
		}

		const data = (await res.json()) as {
			access_token: string;
			refresh_token: string;
			user: AuthUser;
		};

		const { error: setSessionError } = await supabaseClient.auth.setSession({
			access_token: data.access_token,
			refresh_token: data.refresh_token,
		});

		if (setSessionError) {
			return { success: false, error: setSessionError.message };
		}

		return { success: true };
	} catch (error) {
		if (error instanceof Error) {
			if (error.name === 'AbortError') {
				return {
					success: false,
					error: 'Login request timed out. Please try again.',
				};
			}
			if (error.message.includes('fetch')) {
				return {
					success: false,
					error: 'Network error. Please check your connection.',
				};
			}
		}
		return { success: false, error: 'Login failed. Please try again.' };
	}
}

async function apiRegister(
	email: string,
	username: string,
	password: string
): Promise<RegisterResult> {
	const res = await fetch(`${API_BASE_URL}/auth/register`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ email, username, password }),
	});

	if (!res.ok) {
		const data = await res.json().catch(() => ({}));
		return { success: false, error: data.error || 'Registration failed' };
	}

	const loginResult = await apiLogin(email, password);

	if (!loginResult.success) {
		return {
			success: false,
			error:
				loginResult.error ||
				'Registration succeeded, but automatic login failed. Please log in manually.',
		};
	}

	return { success: true };
}

export function useAuth() {
	const [user, setUser] = useState<AuthUser | null>(null);
	const [loading, setLoading] = useState(true);

	useEffect(() => {
		let mounted = true;
		supabaseClient.auth
			.getSession()
			.then(({ data }) => {
				if (!mounted) return;
				setUser(mapSupabaseUser(data.session?.user ?? null));
				setLoading(false);
			})
			.catch(() => {
				if (!mounted) return;
				setUser(null);
				setLoading(false);
			});

		const { data: subscription } = supabaseClient.auth.onAuthStateChange(
			(_event, session) => {
				if (!mounted) return;
				setUser(mapSupabaseUser(session?.user ?? null));
			}
		);

		return () => {
			mounted = false;
			subscription?.subscription.unsubscribe();
		};
	}, []);

	return {
		user,
		loading,
		login: (email: string, password: string) => apiLogin(email, password),
		register: (email: string, username: string, password: string) =>
			apiRegister(email, username, password),
		logout: async () => {
			await supabaseClient.auth.signOut();
		},
		isAuthenticated: !!user,
	};
}
