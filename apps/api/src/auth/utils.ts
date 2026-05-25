export const AUTH_COOKIE_NAME = 'procyon_access_token';

export function extractBearerToken(header: string): string | null {
	const trimmed = header.trim();
	if (!trimmed) return null;

	const parts = trimmed.split(/\s+/);
	if (parts.length !== 2) return null;

	const scheme = parts[0];
	const value = parts[1];
	if (!scheme || !value) return null;
	if (scheme.toLowerCase() !== 'bearer') return null;
	return value;
}

export function extractCookieToken(
	header: string,
	cookieName = AUTH_COOKIE_NAME
): string | null {
	const trimmed = header.trim();
	if (!trimmed) return null;

	for (const part of trimmed.split(';')) {
		const [rawName, ...rawValueParts] = part.trim().split('=');
		if (rawName !== cookieName) continue;
		const rawValue = rawValueParts.join('=');
		if (!rawValue) return null;
		try {
			return decodeURIComponent(rawValue);
		} catch {
			return rawValue;
		}
	}

	return null;
}
