import { describe, test, expect } from 'bun:test';
import { extractBearerToken, isUsernameUniqueConstraintError } from './utils';

describe('extractBearerToken', () => {
	test('returns null for empty string', () => {
		expect(extractBearerToken('')).toBeNull();
	});

	test('returns null for whitespace only', () => {
		expect(extractBearerToken('   ')).toBeNull();
	});

	test('returns null when no space separator', () => {
		expect(extractBearerToken('BearerABC123')).toBeNull();
	});

	test('returns null for wrong scheme (Basic)', () => {
		expect(extractBearerToken('Basic abc123')).toBeNull();
	});

	test('returns null for wrong scheme (Token)', () => {
		expect(extractBearerToken('Token abc123')).toBeNull();
	});

	test('extracts token with Bearer scheme', () => {
		expect(extractBearerToken('Bearer mytoken123')).toBe('mytoken123');
	});

	test('is case-insensitive for scheme', () => {
		expect(extractBearerToken('bearer mytoken')).toBe('mytoken');
		expect(extractBearerToken('BEARER mytoken')).toBe('mytoken');
		expect(extractBearerToken('Bearer mytoken')).toBe('mytoken');
	});

	test('handles leading/trailing whitespace on full header', () => {
		expect(extractBearerToken('  Bearer mytoken  ')).toBe('mytoken');
	});

	test('handles JWT-style token', () => {
		const jwt = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.payload.signature';
		expect(extractBearerToken(`Bearer ${jwt}`)).toBe(jwt);
	});

	test('returns first token only when multiple parts present', () => {
		// split on whitespace, takes parts[1]
		expect(extractBearerToken('Bearer token extra')).toBe('token');
	});
});

describe('isUsernameUniqueConstraintError', () => {
	// Non-object inputs
	test('returns false for null', () => {
		expect(isUsernameUniqueConstraintError(null)).toBe(false);
	});

	test('returns false for undefined', () => {
		expect(isUsernameUniqueConstraintError(undefined)).toBe(false);
	});

	test('returns false for string', () => {
		expect(isUsernameUniqueConstraintError('error string')).toBe(false);
	});

	test('returns false for number', () => {
		expect(isUsernameUniqueConstraintError(42)).toBe(false);
	});

	test('returns false for empty object (no unique violation)', () => {
		expect(isUsernameUniqueConstraintError({})).toBe(false);
	});

	test('returns false for generic error with no unique violation signal', () => {
		expect(
			isUsernameUniqueConstraintError({ message: 'some random error' })
		).toBe(false);
	});

	// Must pass unique violation check but fail username check
	test('returns false for code 23505 without any username indicator', () => {
		expect(isUsernameUniqueConstraintError({ code: '23505' })).toBe(false);
	});

	test('returns false for code 23505 with non-username constraint', () => {
		expect(
			isUsernameUniqueConstraintError({
				code: '23505',
				constraint: 'users_email_unique',
			})
		).toBe(false);
	});

	// Detection branch 1: constraint field matches known name
	test('returns true for code 23505 with exact constraint name', () => {
		expect(
			isUsernameUniqueConstraintError({
				code: '23505',
				constraint: 'auth_users_username_unique',
			})
		).toBe(true);
	});

	// Detection branch 2: regex match on constraint name in message
	test('returns true when message contains unique constraint with username constraint name', () => {
		expect(
			isUsernameUniqueConstraintError({
				message:
					'duplicate key value violates unique constraint "auth_users_username_unique"',
			})
		).toBe(true);
	});

	test('returns false when message has different constraint name in regex match', () => {
		expect(
			isUsernameUniqueConstraintError({
				message:
					'duplicate key value violates unique constraint "users_email_unique"',
			})
		).toBe(false);
	});

	// Detection branch 3: message or details includes constraint name directly
	test('returns true when message includes auth_users_username_unique', () => {
		expect(
			isUsernameUniqueConstraintError({
				code: '23505',
				message: 'ERROR: auth_users_username_unique already exists',
			})
		).toBe(true);
	});

	test('returns true when details includes auth_users_username_unique', () => {
		expect(
			isUsernameUniqueConstraintError({
				code: '23505',
				details: 'Constraint auth_users_username_unique violated',
			})
		).toBe(true);
	});

	test('returns true when detail (alternate spelling) includes constraint name', () => {
		expect(
			isUsernameUniqueConstraintError({
				message: '23505: key conflict',
				detail: 'auth_users_username_unique',
			})
		).toBe(true);
	});

	// Detection branch 4: key (username) pattern in message or details
	test('returns true when details matches key (username)= pattern', () => {
		expect(
			isUsernameUniqueConstraintError({
				code: '23505',
				details: 'Key (username)=testuser already exists',
			})
		).toBe(true);
	});

	test('returns true when message matches key (username)= pattern', () => {
		expect(
			isUsernameUniqueConstraintError({
				message: 'duplicate key value violates unique constraint',
				details: 'Key (email_username)=test already exists',
			})
		).toBe(true);
	});

	test('returns false when key pattern is for non-username field', () => {
		expect(
			isUsernameUniqueConstraintError({
				code: '23505',
				details: 'Key (email)=test@example.com already exists',
			})
		).toBe(false);
	});

	// message.includes('23505') triggers looksLikeUniqueViolation
	test('returns true via message contains 23505 and constraint name', () => {
		expect(
			isUsernameUniqueConstraintError({
				message: 'error 23505',
				constraint: 'auth_users_username_unique',
			})
		).toBe(true);
	});
});
