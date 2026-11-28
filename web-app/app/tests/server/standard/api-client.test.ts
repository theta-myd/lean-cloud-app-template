import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ServerConfig } from '#lib/server/env.js';
import { verifyInternalUserToken } from '#lib/server/standard/internal-jwt.js';

const getGcpIdTokenMock = vi.hoisted(() => vi.fn<() => Promise<string | null>>());

vi.mock('#lib/server/standard/gcp-id-token.js', () => ({
	getGcpIdToken: getGcpIdTokenMock
}));

import { createApiAuthInterceptor } from '#lib/server/standard/api-client.js';

function makeStandardConfig(overrides: Partial<ServerConfig> = {}): ServerConfig {
	return {
		architectureVariant: 'standard',
		appUrl: 'http://localhost:5173',
		betterAuthUrl: 'http://localhost:5173',
		betterAuthSecret: 'a'.repeat(32),
		betterAuthSecretConfigured: true,
		googleClientId: '',
		googleClientSecret: '',
		googleOAuthConfigured: false,
		authAccessMode: 'allowlist',
		allowedEmails: [],
		allowedDomains: [],
		enableE2ePasswordAuth: false,
		e2eTestEmail: 'e2e@example.com',
		e2eTestPassword: '',
		googleCloudProject: '',
		firestoreEmulatorHost: '',
		authDatabaseUrl: 'postgres://auth_user:pass@localhost:5432/app',
		authDatabaseConfigured: true,
		apiBaseUrl: 'https://api.example.run.app',
		apiConfigured: true,
		apiAudience: 'https://api.example.run.app',
		internalApiJwtSecret: 'b'.repeat(32),
		internalApiJwtSecretConfigured: true,
		...overrides
	};
}

describe('createApiAuthInterceptor', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('attaches x-app-user-token HS256 JWT and GCP OIDC Authorization header', async () => {
		getGcpIdTokenMock.mockResolvedValueOnce('gcp-oidc-token-xyz');
		const config = makeStandardConfig();
		const interceptor = createApiAuthInterceptor(
			{ id: 'user-7', email: 'dev@example.com', name: 'Dev User' },
			'tenant-42',
			config
		);

		const headers = new Headers();
		const next = vi.fn(async (req: unknown) => req);
		const runner = interceptor(next as never);
		await runner({ header: headers } as never);

		expect(next).toHaveBeenCalledTimes(1);
		expect(headers.get('Authorization')).toBe('Bearer gcp-oidc-token-xyz');

		const userToken = headers.get('x-app-user-token');
		expect(userToken).toBeTruthy();
		const claims = verifyInternalUserToken(userToken!, config.internalApiJwtSecret);
		expect(claims.sub).toBe('user-7');
		expect(claims.email).toBe('dev@example.com');
		expect(claims.name).toBe('Dev User');
		expect(claims.tid).toBe('tenant-42');
	});

	it('omits Authorization header in local dev when getGcpIdToken returns null', async () => {
		getGcpIdTokenMock.mockResolvedValueOnce(null);
		const config = makeStandardConfig({
			apiBaseUrl: 'http://localhost:8081',
			apiAudience: ''
		});
		const interceptor = createApiAuthInterceptor(
			{ id: 'user-7', email: 'dev@example.com' },
			null,
			config
		);

		const headers = new Headers();
		const next = vi.fn(async (req: unknown) => req);
		await interceptor(next as never)({ header: headers } as never);

		expect(headers.get('Authorization')).toBeNull();
		expect(headers.get('x-app-user-token')).toBeTruthy();
	});
});
