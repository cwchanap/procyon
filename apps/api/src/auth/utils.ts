export function extractBearerToken(header: string): string | null {
	const trimmed = header.trim();
	if (!trimmed) return null;

	const parts = trimmed.split(/\s+/);
	if (parts.length < 2) return null;

	const scheme = parts[0];
	const value = parts[1];
	if (!scheme || !value) return null;
	if (scheme.toLowerCase() !== 'bearer') return null;
	return value;
}

export function isUsernameUniqueConstraintError(error: unknown): boolean {
	if (!error || typeof error !== 'object') {
		return false;
	}

	const maybeError = error as {
		message?: unknown;
		code?: unknown;
		details?: unknown;
		detail?: unknown;
		constraint?: unknown;
		status?: unknown;
	};

	const rawMessage =
		typeof maybeError.message === 'string' ? maybeError.message : '';
	const message = rawMessage.toLowerCase();
	const code = typeof maybeError.code === 'string' ? maybeError.code : '';
	const rawDetails =
		typeof maybeError.details === 'string'
			? maybeError.details
			: typeof maybeError.detail === 'string'
				? maybeError.detail
				: '';
	const details = rawDetails.toLowerCase();
	const constraint =
		typeof maybeError.constraint === 'string' ? maybeError.constraint : '';

	const usernameConstraintNames = new Set(['auth_users_username_unique']);

	const looksLikeUniqueViolation =
		code === '23505' ||
		message.includes('23505') ||
		message.includes('duplicate key value violates unique constraint');
	if (!looksLikeUniqueViolation) {
		return false;
	}

	if (constraint && usernameConstraintNames.has(constraint)) {
		return true;
	}

	const constraintMatch = rawMessage.match(/unique constraint\s+"([^"]+)"/i);
	const matchedConstraintName = constraintMatch?.[1];
	if (
		typeof matchedConstraintName === 'string' &&
		usernameConstraintNames.has(matchedConstraintName)
	) {
		return true;
	}

	if (
		message.includes('auth_users_username_unique') ||
		details.includes('auth_users_username_unique')
	) {
		return true;
	}

	const usernameKeyPattern = /key \(.*username.*\)=/i;
	if (
		usernameKeyPattern.test(rawDetails) ||
		usernameKeyPattern.test(rawMessage)
	) {
		return true;
	}

	return false;
}
