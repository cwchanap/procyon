import { createRemoteJWKSet, jwtVerify } from 'jose';
import { env } from '../env';

const GOOGLE_JWKS_URL = 'https://www.googleapis.com/oauth2/v3/certs';
const VALID_ISSUERS = new Set([
	'accounts.google.com',
	'https://accounts.google.com',
]);

let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;

function getJwks(): ReturnType<typeof createRemoteJWKSet> {
	if (!jwks) {
		jwks = createRemoteJWKSet(new URL(GOOGLE_JWKS_URL));
	}
	return jwks;
}

export interface GoogleClaims {
	sub: string;
	email: string;
	emailVerified: boolean;
	name?: string;
	picture?: string;
}

export async function verifyGoogleIdToken(
	idToken: string,
	options?: { clientId?: string }
): Promise<GoogleClaims> {
	const audience =
		options?.clientId || env.GOOGLE_CLIENT_ID || process.env.GOOGLE_CLIENT_ID;
	if (!audience) {
		throw new Error('GOOGLE_CLIENT_ID is not configured');
	}

	const { payload } = await jwtVerify(idToken, getJwks(), {
		algorithms: ['RS256'],
		audience,
	});

	if (typeof payload.iss !== 'string' || !VALID_ISSUERS.has(payload.iss)) {
		throw new Error('Invalid token issuer');
	}
	if (typeof payload.sub !== 'string') {
		throw new Error('Invalid token subject');
	}
	if (typeof payload.email !== 'string') {
		throw new Error('Token missing email');
	}
	if (payload.email_verified !== true) {
		throw new Error('Email not verified with Google');
	}

	return {
		sub: payload.sub,
		email: payload.email,
		emailVerified: true,
		name: typeof payload.name === 'string' ? payload.name : undefined,
		picture: typeof payload.picture === 'string' ? payload.picture : undefined,
	};
}
