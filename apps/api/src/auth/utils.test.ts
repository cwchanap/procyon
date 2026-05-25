import { describe, test, expect } from 'bun:test';
import {
	AUTH_COOKIE_NAME,
	extractBearerToken,
	extractCookieToken,
} from './utils';

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

	test('returns null when multiple parts present', () => {
		// Malformed header with extra parts should be rejected
		expect(extractBearerToken('Bearer token extra')).toBeNull();
	});
});

describe('extractCookieToken', () => {
	test('returns null for empty cookie header', () => {
		expect(extractCookieToken('')).toBeNull();
	});

	test('extracts the auth cookie value', () => {
		expect(
			extractCookieToken(`theme=dark; ${AUTH_COOKIE_NAME}=jwt-token; foo=bar`)
		).toBe('jwt-token');
	});

	test('decodes URL-encoded cookie values', () => {
		expect(
			extractCookieToken(`${AUTH_COOKIE_NAME}=jwt%2Epayload%2Esignature`)
		).toBe('jwt.payload.signature');
	});

	test('returns null when the auth cookie is absent', () => {
		expect(extractCookieToken('theme=dark; foo=bar')).toBeNull();
	});
});
