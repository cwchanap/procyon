import { SignJWT, jwtVerify } from 'jose';
import { env } from '../env';

export interface AppJwtPayload {
	sub: string;
	email: string;
	username: string;
}

function getSecretKey(secretOverride?: string): Uint8Array {
	const secret =
		secretOverride || env.JWT_SECRET || process.env.JWT_SECRET || '';
	if (!secret) {
		throw new Error('JWT_SECRET is not configured');
	}
	return new TextEncoder().encode(secret);
}

export async function signAppJwt(
	payload: AppJwtPayload,
	options?: { expiresIn?: string; secret?: string }
): Promise<string> {
	const expiresIn = options?.expiresIn ?? '7d';
	return await new SignJWT({
		email: payload.email,
		username: payload.username,
	})
		.setProtectedHeader({ alg: 'HS256' })
		.setSubject(payload.sub)
		.setIssuedAt()
		.setExpirationTime(expiresIn)
		.sign(getSecretKey(options?.secret));
}

export async function verifyAppJwt(
	token: string,
	options?: { secret?: string }
): Promise<AppJwtPayload> {
	const { payload } = await jwtVerify(token, getSecretKey(options?.secret), {
		algorithms: ['HS256'],
	});
	if (
		typeof payload.sub !== 'string' ||
		typeof payload.email !== 'string' ||
		typeof payload.username !== 'string'
	) {
		throw new Error('Invalid app JWT payload');
	}
	return {
		sub: payload.sub,
		email: payload.email,
		username: payload.username,
	};
}
