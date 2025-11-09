import { useState, useEffect } from 'react';
import { env } from './env';

export interface User {
	id: number;
	email: string;
	username: string;
}

export interface LoginResponse {
	user: User;
	token: string;
}

export function useAuth() {
	const [user, setUser] = useState<User | null>(null);
	const [loading, setLoading] = useState(true);
	const [token, setToken] = useState<string | null>(null);

	useEffect(() => {
		// Check for existing session on mount
		checkSession();
	}, []);

	const checkSession = async () => {
		try {
			const storedToken = localStorage.getItem('auth_token');
			if (!storedToken) {
				setUser(null);
				setToken(null);
				setLoading(false);
				return;
			}

			const response = await fetch(`${env.PUBLIC_API_URL}/auth/session`, {
				method: 'GET',
				headers: {
					'Authorization': `Bearer ${storedToken}`,
				},
			});

			if (response.ok) {
				const data = await response.json();
				setUser(data.user);
				setToken(storedToken);
			} else {
				// Token might be expired, clear it
				localStorage.removeItem('auth_token');
				setUser(null);
				setToken(null);
			}
		} catch (_error) {
			localStorage.removeItem('auth_token');
			setUser(null);
			setToken(null);
		} finally {
			setLoading(false);
		}
	};

	const login = async (
		email: string,
		password: string
	): Promise<{ success: boolean; error?: string }> => {
		try {
			const response = await fetch(`${env.PUBLIC_API_URL}/auth/login`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({ email, password }),
			});

			if (!response.ok) {
				const errorData = await response.json();
				return {
					success: false,
					error: errorData.error || 'Login failed',
				};
			}

			const data: LoginResponse = await response.json();
			setUser(data.user);
			setToken(data.token);
			localStorage.setItem('auth_token', data.token);

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
			const response = await fetch(`${env.PUBLIC_API_URL}/auth/register`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({ email, username, password }),
			});

			if (!response.ok) {
				const errorData = await response.json();
				return {
					success: false,
					error: errorData.error || 'Registration failed',
				};
			}

			const data: LoginResponse = await response.json();
			setUser(data.user);
			setToken(data.token);
			localStorage.setItem('auth_token', data.token);

			return { success: true };
		} catch (_error) {
			return {
				success: false,
				error: 'Network error. Please try again.',
			};
		}
	};

	const logout = async (force = false) => {
		try {
			// Since we're using JWT, logout is just clearing local storage
			// No server request needed
			localStorage.removeItem('auth_token');
			setUser(null);
			setToken(null);
		} catch (error) {
			if (force) {
				// Allow forced local logout despite any errors
				console.warn('Logout failed, but forcing local logout:', error);
				localStorage.removeItem('auth_token');
				setUser(null);
				setToken(null);
			} else {
				// Re-throw error to prevent clearing local state
				throw error;
			}
		}
	};

	return {
		user,
		token,
		loading,
		login,
		register,
		logout,
		isAuthenticated: !!user,
	};
}
