import { useState, useEffect } from 'react';
import { env } from './env';

export interface User {
	id: string;
	email: string;
	username: string;
	name?: string | null;
	emailVerified?: boolean;
}

export interface SessionResponse {
	user: User;
}

export function useAuth() {
	const [user, setUser] = useState<User | null>(null);
	const [loading, setLoading] = useState(true);

	useEffect(() => {
		// Check for existing session on mount
		checkSession();
	}, []);

	const checkSession = async () => {
		try {
			const response = await fetch(`${env.PUBLIC_API_URL}/auth/session`, {
				method: 'GET',
				credentials: 'include', // Send cookies
			});

			if (response.ok) {
				const data: SessionResponse = await response.json();
				setUser(data.user);
			} else {
				setUser(null);
			}
		} catch (_error) {
			setUser(null);
		} finally {
			setLoading(false);
		}
	};

	const login = async (
		email: string,
		password: string
	): Promise<{ success: boolean; error?: string }> => {
		try {
			const response = await fetch(`${env.PUBLIC_API_URL}/auth/sign-in/email`, {
				method: 'POST',
				credentials: 'include', // Send/receive cookies
				headers: {
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({ email, password }),
			});

			if (!response.ok) {
				const errorData = await response.json();
				return {
					success: false,
					error: errorData.message || 'Login failed',
				};
			}

			const data = await response.json();
			setUser(data.user);

			return { success: true };
		} catch (_error) {
			return {
				success: false,
				error: 'Network error. Please try again.',
			};
		}
	};

	const register = async (
		email: string,
		username: string,
		password: string
	): Promise<{ success: boolean; error?: string }> => {
		try {
			const response = await fetch(`${env.PUBLIC_API_URL}/auth/sign-up/email`, {
				method: 'POST',
				credentials: 'include', // Send/receive cookies
				headers: {
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({ email, name: username, password }),
			});

			if (!response.ok) {
				const errorData = await response.json();
				return {
					success: false,
					error: errorData.message || 'Registration failed',
				};
			}

			const data = await response.json();
			setUser(data.user);

			return { success: true };
		} catch (_error) {
			return {
				success: false,
				error: 'Network error. Please try again.',
			};
		}
	};

	const logout = async () => {
		try {
			await fetch(`${env.PUBLIC_API_URL}/auth/sign-out`, {
				method: 'POST',
				credentials: 'include',
			});
		} catch (_error) {
			// Ignore errors, clear local state anyway
		}
		setUser(null);
	};

	return {
		user,
		loading,
		login,
		register,
		logout,
		isAuthenticated: !!user,
	};
}
