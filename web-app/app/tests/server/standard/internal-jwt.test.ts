import { describe, expect, it } from 'vitest';
import {
	INTERNAL_JWT_AUDIENCE,
	INTERNAL_JWT_ISSUER,
	signInternalUserToken,
	verifyInternalUserToken
} from '#lib/server/standard/internal-jwt.js';

const TEST_SECRET = 't'.repeat(32);

describe('internal-jwt', () => {
	it('signs and verifies an HS256 JWT with required and optional claims', () => {
		const now = 1_750_000_000;
		const token = signInternalUserToken({
			user: {
				id: 'user-123',
				email: 'alice@example.com',
				name: 'Alice Example'
			},
			tenantId: 'tenant-abc',
			secret: TEST_SECRET,
			nowSeconds: now
		});

		expect(token.split('.')).toHaveLength(3);

		const claims = verifyInternalUserToken(token, TEST_SECRET, { nowSeconds: now + 10 });
		expect(claims).toEqual({
			iss: INTERNAL_JWT_ISSUER,
			aud: INTERNAL_JWT_AUDIENCE,
			sub: 'user-123',
			email: 'alice@example.com',
			name: 'Alice Example',
			tid: 'tenant-abc',
			iat: now,
			exp: now + 60
		});
	});

	it('omits name and tid claims when not provided', () => {
		const now = 1_750_000_000;
		const token = signInternalUserToken({
			user: {
				id: 'user-456',
				email: 'bob@example.com',
				name: null
			},
			secret: TEST_SECRET,
			nowSeconds: now,
			ttlSeconds: 30
		});

		const claims = verifyInternalUserToken(token, TEST_SECRET, { nowSeconds: now });
		expect(claims).toEqual({
			iss: 'lean-cloud-app-bff',
			aud: 'lean-cloud-app-api',
			sub: 'user-456',
			email: 'bob@example.com',
			iat: now,
			exp: now + 30
		});
		expect('name' in claims).toBe(false);
		expect('tid' in claims).toBe(false);
	});

	it('rejects tokens signed with a different secret or tampered payload', () => {
		const now = 1_750_000_000;
		const token = signInternalUserToken({
			user: { id: 'user-1', email: 'alice@example.com' },
			tenantId: 'tenant-1',
			secret: TEST_SECRET,
			nowSeconds: now
		});

		expect(() =>
			verifyInternalUserToken(token, 'w'.repeat(32), { nowSeconds: now })
		).toThrow('Invalid internal JWT signature.');

		const [header, payload, signature] = token.split('.');
		const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as Record<
			string,
			unknown
		>;
		decoded.tid = 'tenant-evil';
		const tamperedPayload = Buffer.from(JSON.stringify(decoded), 'utf8').toString('base64url');

		expect(() =>
			verifyInternalUserToken(`${header}.${tamperedPayload}.${signature}`, TEST_SECRET, {
				nowSeconds: now
			})
		).toThrow('Invalid internal JWT signature.');
	});

	it('rejects alg=none headers, malformed tokens, expired tokens, and future iat', () => {
		const now = 1_750_000_000;
		const token = signInternalUserToken({
			user: { id: 'user-1', email: 'alice@example.com' },
			secret: TEST_SECRET,
			nowSeconds: now,
			ttlSeconds: 60
		});

		expect(() =>
			verifyInternalUserToken(token, TEST_SECRET, { nowSeconds: now + 60 })
		).toThrow('Internal JWT has expired.');

		expect(() =>
			verifyInternalUserToken(token, TEST_SECRET, { nowSeconds: now - 10 })
		).toThrow('Internal JWT iat is in the future.');

		const noneHeader = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' }), 'utf8').toString(
			'base64url'
		);
		const [, payload, sig] = token.split('.');
		expect(() =>
			verifyInternalUserToken(`${noneHeader}.${payload}.${sig}`, TEST_SECRET, { nowSeconds: now })
		).toThrow('Unsupported internal JWT header.');

		expect(() => verifyInternalUserToken('not-a-jwt', TEST_SECRET)).toThrow(
			'Malformed internal JWT.'
		);
	});
});
