import { useState, useEffect } from 'react';

export interface User {
    id: string;
    email: string;
    username: string;
    createdAt: string;
}

export interface AuthResponse {
    message: string;
    token: string;
    user: User;
}

const API_BASE_URL = 'http://localhost:3501/api';

export function useAuth() {
    const [user, setUser] = useState<User | null>(null);
    const [token, setToken] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const storedToken = localStorage.getItem('auth_token');
        const storedUser = localStorage.getItem('auth_user');

        if (storedToken && storedUser) {
            setToken(storedToken);
            setUser(JSON.parse(storedUser));
        }
        setLoading(false);
    }, []);

    const login = async (
        email: string,
        password: string
    ): Promise<{ success: boolean; error?: string }> => {
        try {
            const response = await fetch(`${API_BASE_URL}/auth/login`, {
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
                    error: errorData.message || 'Login failed',
                };
            }

            const data: AuthResponse = await response.json();

            setToken(data.token);
            setUser(data.user);

            localStorage.setItem('auth_token', data.token);
            localStorage.setItem('auth_user', JSON.stringify(data.user));

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
            const response = await fetch(`${API_BASE_URL}/auth/register`, {
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
                    error: errorData.message || 'Registration failed',
                };
            }

            const data: AuthResponse = await response.json();

            setToken(data.token);
            setUser(data.user);

            localStorage.setItem('auth_token', data.token);
            localStorage.setItem('auth_user', JSON.stringify(data.user));

            return { success: true };
        } catch (_error) {
            return {
                success: false,
                error: 'Network error. Please try again.',
            };
        }
    };

    const logout = () => {
        setToken(null);
        setUser(null);
        localStorage.removeItem('auth_token');
        localStorage.removeItem('auth_user');
    };

    return {
        user,
        token,
        loading,
        login,
        register,
        logout,
        isAuthenticated: !!user && !!token,
    };
}
