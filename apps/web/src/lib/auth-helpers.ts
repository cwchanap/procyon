export type AuthUser = {
	id: string;
	email: string;
	username: string;
	createdAt: string;
	user_metadata?: Record<string, unknown>;
};

export type LoginResult =
	| { success: true }
	| { success: false; error: string; retryAfterMs?: number };

export type RegisterResult = { success: boolean; error?: string };

interface UserInput {
	id: string;
	email?: string;
	created_at: string;
	user_metadata?: Record<string, unknown>;
}

export function mapSupabaseUser(user: UserInput | null): AuthUser | null {
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
		user_metadata: user.user_metadata,
	};
}

export function resolveApiBaseUrl(publicApiUrl: string | undefined): string {
	const base = publicApiUrl || '/api';
	return base.replace(/\/$/, '') || '/api';
}

export function parseLoginBodyText(
	status: number,
	bodyText: string
): LoginResult {
	if (status === 429) {
		let data: { error?: string; retryAfterMs?: number } = {};
		try {
			data = JSON.parse(bodyText) as typeof data;
		} catch {
			// ignore parse errors
		}
		return {
			success: false,
			error:
				data.error ||
				bodyText ||
				'Too many attempts. Please wait before retrying.',
			retryAfterMs: data.retryAfterMs,
		};
	}

	if (status < 200 || status >= 300) {
		let data: { error?: string; message?: string } = {};
		try {
			data = JSON.parse(bodyText) as typeof data;
		} catch {
			// ignore parse errors
		}
		return {
			success: false,
			error: data.error || data.message || bodyText || 'Login failed',
		};
	}

	return { success: true };
}

export function parseRegisterBodyText(
	status: number,
	bodyText: string
): RegisterResult {
	if (status < 200 || status >= 300) {
		let data: { error?: string; message?: string } = {};
		try {
			data = JSON.parse(bodyText) as typeof data;
		} catch {
			// ignore parse errors
		}
		return {
			success: false,
			error: data.error || data.message || bodyText || 'Registration failed',
		};
	}
	return { success: true };
}
