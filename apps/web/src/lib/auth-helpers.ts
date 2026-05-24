export type AuthUser = {
	id: string;
	email: string;
	username: string;
	name?: string | null;
	picture?: string | null;
	createdAt?: string | Date | null;
	updatedAt?: string | Date | null;
};

export type GoogleLoginResult =
	| { success: true; user: AuthUser; accessToken: string }
	| { success: false; error: string };

export function resolveApiBaseUrl(publicApiUrl: string | undefined): string {
	const base = publicApiUrl || '/api';
	return base.replace(/\/$/, '') || '/api';
}

export function parseGoogleLoginBody(
	status: number,
	bodyText: string
): GoogleLoginResult {
	if (status < 200 || status >= 300) {
		let data: { error?: string } = {};
		try {
			data = JSON.parse(bodyText) as typeof data;
		} catch {
			// ignore
		}
		return {
			success: false,
			error: data.error || bodyText || 'Sign-in failed',
		};
	}
	let data: { access_token?: string; user?: AuthUser } = {};
	try {
		data = JSON.parse(bodyText) as typeof data;
	} catch {
		return { success: false, error: 'Unexpected response from server.' };
	}
	if (!data.access_token || !data.user) {
		return { success: false, error: 'Unexpected response from server.' };
	}
	const user = data.user;
	if (
		typeof user.id !== 'string' ||
		typeof user.email !== 'string' ||
		typeof user.username !== 'string'
	) {
		return { success: false, error: 'Unexpected response from server.' };
	}
	return {
		success: true,
		user,
		accessToken: data.access_token,
	};
}

export const ACCESS_TOKEN_KEY = 'procyon_access_token';
