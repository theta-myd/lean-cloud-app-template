import { createHmac, timingSafeEqual } from 'node:crypto';

export const INTERNAL_JWT_ISSUER = 'agent-ready-app-bff' as const;
export const INTERNAL_JWT_AUDIENCE = 'agent-ready-app-api' as const;
export const DEFAULT_INTERNAL_JWT_TTL_SECONDS = 60;

export interface InternalUserTokenClaims {
	iss: typeof INTERNAL_JWT_ISSUER;
	aud: typeof INTERNAL_JWT_AUDIENCE;
	sub: string;
	email: string;
	name?: string;
	tid?: string;
	iat: number;
	exp: number;
}

export interface SignInternalUserTokenInput {
	user: {
		id: string;
		email: string;
		name?: string | null;
	};
	tenantId?: string | null;
	secret: string;
	nowSeconds?: number;
	ttlSeconds?: number;
}

export interface VerifyInternalUserTokenOptions {
	nowSeconds?: number;
	clockSkewSeconds?: number;
}

const JWT_HEADER_SEGMENT = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' }), 'utf8').toString(
	'base64url'
);

function signHs256(signingInput: string, secret: string): string {
	return createHmac('sha256', secret).update(signingInput, 'utf8').digest('base64url');
}

function decodeBase64UrlJson(segment: string): unknown {
	if (!/^[A-Za-z0-9_-]+$/.test(segment)) {
		throw new Error('Invalid base64url segment in internal JWT.');
	}
	const raw = Buffer.from(segment, 'base64url').toString('utf8');
	return JSON.parse(raw) as unknown;
}

/**
 * Signs a short-lived HS256 JWT asserting the authenticated BFF user identity
 * (and optional active tenant ID) for the internal Rust Connect RPC API.
 */
export function signInternalUserToken(input: SignInternalUserTokenInput): string {
	if (!input.secret) {
		throw new Error('INTERNAL_API_JWT_SECRET must not be empty.');
	}
	const sub = input.user.id.trim();
	const email = input.user.email.trim();
	if (!sub || !email) {
		throw new Error('Internal user token requires non-empty user id and email.');
	}

	const iat = input.nowSeconds ?? Math.floor(Date.now() / 1000);
	const ttlSeconds = input.ttlSeconds ?? DEFAULT_INTERNAL_JWT_TTL_SECONDS;
	const exp = iat + ttlSeconds;

	const claims: InternalUserTokenClaims = {
		iss: INTERNAL_JWT_ISSUER,
		aud: INTERNAL_JWT_AUDIENCE,
		sub,
		email,
		iat,
		exp
	};

	const trimmedName = input.user.name?.trim();
	if (trimmedName) {
		claims.name = trimmedName;
	}
	const trimmedTenantId = input.tenantId?.trim();
	if (trimmedTenantId) {
		claims.tid = trimmedTenantId;
	}

	const payloadSegment = Buffer.from(JSON.stringify(claims), 'utf8').toString('base64url');
	const signingInput = `${JWT_HEADER_SEGMENT}.${payloadSegment}`;
	const signatureSegment = signHs256(signingInput, input.secret);

	return `${signingInput}.${signatureSegment}`;
}

/**
 * Verifies an HS256 internal user JWT, checking signature, issuer, audience,
 * required claims, and expiration.
 */
export function verifyInternalUserToken(
	token: string,
	secret: string,
	options: VerifyInternalUserTokenOptions = {}
): InternalUserTokenClaims {
	if (!secret) {
		throw new Error('INTERNAL_API_JWT_SECRET must not be empty.');
	}

	const parts = token.split('.');
	if (parts.length !== 3) {
		throw new Error('Malformed internal JWT.');
	}
	const [headerSegment, payloadSegment, signatureSegment] = parts;

	const header = decodeBase64UrlJson(headerSegment);
	if (
		typeof header !== 'object' ||
		header === null ||
		(header as Record<string, unknown>).alg !== 'HS256' ||
		((header as Record<string, unknown>).typ !== undefined &&
			(header as Record<string, unknown>).typ !== 'JWT')
	) {
		throw new Error('Unsupported internal JWT header.');
	}

	const expectedSig = signHs256(`${headerSegment}.${payloadSegment}`, secret);
	const actualBuf = Buffer.from(signatureSegment, 'utf8');
	const expectedBuf = Buffer.from(expectedSig, 'utf8');
	if (actualBuf.length !== expectedBuf.length || !timingSafeEqual(actualBuf, expectedBuf)) {
		throw new Error('Invalid internal JWT signature.');
	}

	const payload = decodeBase64UrlJson(payloadSegment);
	if (typeof payload !== 'object' || payload === null) {
		throw new Error('Invalid internal JWT payload.');
	}

	const record = payload as Record<string, unknown>;
	if (record.iss !== INTERNAL_JWT_ISSUER) {
		throw new Error('Invalid internal JWT issuer.');
	}
	if (record.aud !== INTERNAL_JWT_AUDIENCE) {
		throw new Error('Invalid internal JWT audience.');
	}
	if (typeof record.sub !== 'string' || !record.sub.trim()) {
		throw new Error('Missing internal JWT subject.');
	}
	if (typeof record.email !== 'string' || !record.email.trim()) {
		throw new Error('Missing internal JWT email.');
	}
	if (typeof record.iat !== 'number' || !Number.isFinite(record.iat)) {
		throw new Error('Missing internal JWT iat claim.');
	}
	if (typeof record.exp !== 'number' || !Number.isFinite(record.exp)) {
		throw new Error('Missing internal JWT exp claim.');
	}
	if (record.name !== undefined && typeof record.name !== 'string') {
		throw new Error('Invalid internal JWT name claim.');
	}
	if (record.tid !== undefined && typeof record.tid !== 'string') {
		throw new Error('Invalid internal JWT tid claim.');
	}

	const nowSeconds = options.nowSeconds ?? Math.floor(Date.now() / 1000);
	const clockSkewSeconds = options.clockSkewSeconds ?? 0;
	if (record.exp <= nowSeconds - clockSkewSeconds) {
		throw new Error('Internal JWT has expired.');
	}
	if (record.iat > nowSeconds + clockSkewSeconds) {
		throw new Error('Internal JWT iat is in the future.');
	}

	const verified: InternalUserTokenClaims = {
		iss: INTERNAL_JWT_ISSUER,
		aud: INTERNAL_JWT_AUDIENCE,
		sub: record.sub,
		email: record.email,
		iat: record.iat,
		exp: record.exp
	};
	if (record.name !== undefined) {
		verified.name = record.name;
	}
	if (record.tid !== undefined) {
		verified.tid = record.tid;
	}
	return verified;
}
