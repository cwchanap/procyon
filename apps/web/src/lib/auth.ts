import { useEffect, useState } from 'react';
import { env } from './env';
import { supabaseClient } from './supabase';

type AuthUser = {
	id: string;
	email?: string;
	user_metadata?: Record<string, unknown>;
};

type LoginResult =
	| { success: true }
	| { success: false; error: string; retryAfterMs?: number };

type RegisterResult = { success: boolean; error?: string };

function resolveApiBaseUrl(): string {
	const base = env.PUBLIC_API_URL || '/api';
	return base.replace(/\/$/, '') || '/api';
}

const API_BASE_URL = resolveApiBaseUrl();

async function apiLogin(email: string, password: string): Promise<LoginResult> {
	const res = await fetch(`${API_BASE_URL}/auth/login`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ email, password }),
	});

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
				setUser(data.session?.user ?? null);
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
				setUser(session?.user ?? null);
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
