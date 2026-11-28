import { beforeEach, describe, expect, it, vi } from 'vitest';

const envMock = vi.hoisted(() => ({
	ARCHITECTURE_VARIANT: undefined as string | undefined,
	PUBLIC_APP_URL: undefined as string | undefined,
	BETTER_AUTH_URL: undefined as string | undefined,
	BETTER_AUTH_SECRET: undefined as string | undefined,
	GOOGLE_CLIENT_ID: undefined as string | undefined,
	GOOGLE_CLIENT_SECRET: undefined as string | undefined,
	AUTH_ACCESS_MODE: undefined as string | undefined,
	ALLOWED_EMAILS: undefined as string | undefined,
	ALLOWED_DOMAINS: undefined as string | undefined,
	ENABLE_E2E_PASSWORD_AUTH: undefined as string | undefined,
	E2E_TEST_EMAIL: undefined as string | undefined,
	E2E_TEST_PASSWORD: undefined as string | undefined,
	GOOGLE_CLOUD_PROJECT: undefined as string | undefined,
	FIRESTORE_EMULATOR_HOST: undefined as string | undefined,
	AUTH_DATABASE_URL: undefined as string | undefined,
	API_BASE_URL: undefined as string | undefined,
	API_AUDIENCE: undefined as string | undefined,
	INTERNAL_API_JWT_SECRET: undefined as string | undefined
}));

vi.mock('$app/env/private', () => envMock);

import {
	DEFAULT_ARCHITECTURE_VARIANT,
	assertProductionAuthSecret,
	getServerConfig
} from '#lib/server/env.js';

function resetEnv(overrides: Partial<typeof envMock> = {}): void {
	for (const key of Object.keys(envMock) as Array<keyof typeof envMock>) {
		envMock[key] = undefined;
	}
	Object.assign(envMock, overrides);
}

describe('getServerConfig', () => {
	beforeEach(() => {
		resetEnv();
	});

	it('returns safe defaults when env vars are unset', () => {
		const config = getServerConfig();
		expect(config.architectureVariant).toBe(DEFAULT_ARCHITECTURE_VARIANT);
		expect(config.appUrl).toBe('http://localhost:5173');
		expect(config.betterAuthUrl).toBe('http://localhost:5173');
		expect(config.authAccessMode).toBe('allowlist');
		expect(config.googleOAuthConfigured).toBe(false);
		expect(config.allowedEmails).toEqual([]);
		expect(config.allowedDomains).toEqual([]);
		expect(config.enableE2ePasswordAuth).toBe(false);
		expect(config.e2eTestEmail).toBe('e2e@example.com');
		expect(config.authDatabaseConfigured).toBe(false);
		expect(config.apiConfigured).toBe(false);
		expect(config.apiAudience).toBe('');
		expect(config.internalApiJwtSecretConfigured).toBe(false);
	});

	it('treats .env.example Google OAuth placeholders as unconfigured', () => {
		resetEnv({
			GOOGLE_CLIENT_ID: 'your-google-client-id.apps.googleusercontent.com',
			GOOGLE_CLIENT_SECRET: 'CHANGE_ME_GOOGLE_CLIENT_SECRET'
		});
		expect(getServerConfig().googleOAuthConfigured).toBe(false);

		resetEnv({
			GOOGLE_CLIENT_ID: 'real-client-id.apps.googleusercontent.com',
			GOOGLE_CLIENT_SECRET: 'real-client-secret-value'
		});
		expect(getServerConfig().googleOAuthConfigured).toBe(true);
	});

	it('parses CSV allowlists, normalizes casing, and handles AUTH_ACCESS_MODE', () => {
		resetEnv({
			PUBLIC_APP_URL: 'https://app.example.com',
			AUTH_ACCESS_MODE: 'OPEN',
			ALLOWED_EMAILS: ' Alice@Example.com , , bob@example.com ',
			ALLOWED_DOMAINS: ' Example.COM, corp.test ',
			ENABLE_E2E_PASSWORD_AUTH: 'TRUE',
			E2E_TEST_EMAIL: ' Test@Example.com '
		});
		const config = getServerConfig();
		expect(config.betterAuthUrl).toBe('https://app.example.com');
		expect(config.authAccessMode).toBe('open');
		expect(config.allowedEmails).toEqual(['alice@example.com', 'bob@example.com']);
		expect(config.allowedDomains).toEqual(['example.com', 'corp.test']);
		expect(config.enableE2ePasswordAuth).toBe(true);
		expect(config.e2eTestEmail).toBe('test@example.com');

		resetEnv({ AUTH_ACCESS_MODE: 'unknown-mode' });
		expect(getServerConfig().authAccessMode).toBe('allowlist');
	});

	it('parses Standard architecture config and defaults API_AUDIENCE for https:// API_BASE_URL', () => {
		resetEnv({
			ARCHITECTURE_VARIANT: 'STANDARD',
			AUTH_DATABASE_URL: 'postgres://auth_user:dev-pw@localhost:5432/app',
			API_BASE_URL: 'https://api-xyz.a.run.app/',
			INTERNAL_API_JWT_SECRET: 's'.repeat(32)
		});
		const config = getServerConfig();
		expect(config.architectureVariant).toBe('standard');
		expect(config.authDatabaseConfigured).toBe(true);
		expect(config.apiBaseUrl).toBe('https://api-xyz.a.run.app');
		expect(config.apiConfigured).toBe(true);
		expect(config.apiAudience).toBe('https://api-xyz.a.run.app');
		expect(config.internalApiJwtSecretConfigured).toBe(true);

		resetEnv({
			ARCHITECTURE_VARIANT: 'standard',
			API_BASE_URL: 'http://localhost:8081/'
		});
		const localStandard = getServerConfig();
		expect(localStandard.apiBaseUrl).toBe('http://localhost:8081');
		expect(localStandard.apiAudience).toBe('');

		resetEnv({ ARCHITECTURE_VARIANT: 'invalid-variant' });
		expect(getServerConfig().architectureVariant).toBe(DEFAULT_ARCHITECTURE_VARIANT);
	});

	it('enforces BETTER_AUTH_SECRET in production unless E2E auth is enabled', () => {
		resetEnv({ BETTER_AUTH_SECRET: 'CHANGE_ME_GENERATE_32_BYTE_RANDOM_SECRET' });
		const placeholderConfig = getServerConfig();
		expect(placeholderConfig.betterAuthSecretConfigured).toBe(false);
		expect(() => assertProductionAuthSecret(placeholderConfig, 'production')).toThrow();
		expect(() => assertProductionAuthSecret(placeholderConfig, 'development')).not.toThrow();

		resetEnv({ BETTER_AUTH_SECRET: 'short-secret' });
		expect(getServerConfig().betterAuthSecretConfigured).toBe(false);
		expect(() => assertProductionAuthSecret(getServerConfig(), 'production')).toThrow();

		resetEnv({ ENABLE_E2E_PASSWORD_AUTH: 'true' });
		expect(() => assertProductionAuthSecret(getServerConfig(), 'production')).not.toThrow();

		resetEnv({ ARCHITECTURE_VARIANT: 'light', BETTER_AUTH_SECRET: 'a'.repeat(32) });
		const validConfig = getServerConfig();
		expect(validConfig.betterAuthSecretConfigured).toBe(true);
		expect(() => assertProductionAuthSecret(validConfig, 'production')).not.toThrow();
	});

	it('enforces Standard mode production secrets and endpoints', () => {
		const validBase = {
			ARCHITECTURE_VARIANT: 'standard',
			BETTER_AUTH_SECRET: 'a'.repeat(32),
			AUTH_DATABASE_URL: 'postgres://auth_user:secret@10.0.0.5:5432/app',
			API_BASE_URL: 'https://api-xyz.a.run.app',
			INTERNAL_API_JWT_SECRET: 'b'.repeat(32)
		};

		resetEnv(validBase);
		expect(() => assertProductionAuthSecret(getServerConfig(), 'production')).not.toThrow();

		resetEnv({ ...validBase, AUTH_DATABASE_URL: '' });
		expect(() => assertProductionAuthSecret(getServerConfig(), 'production')).toThrow(
			'AUTH_DATABASE_URL'
		);

		resetEnv({ ...validBase, API_BASE_URL: '' });
		expect(() => assertProductionAuthSecret(getServerConfig(), 'production')).toThrow(
			'API_BASE_URL'
		);

		resetEnv({ ...validBase, INTERNAL_API_JWT_SECRET: 'CHANGE_ME_GENERATE_32_BYTE_SECRET' });
		expect(() => assertProductionAuthSecret(getServerConfig(), 'production')).toThrow(
			'INTERNAL_API_JWT_SECRET'
		);

		resetEnv({ ...validBase, INTERNAL_API_JWT_SECRET: 'too-short' });
		expect(() => assertProductionAuthSecret(getServerConfig(), 'production')).toThrow(
			'INTERNAL_API_JWT_SECRET'
		);

		// Allowed in development or when E2E auth is enabled
		expect(() => assertProductionAuthSecret(getServerConfig(), 'development')).not.toThrow();
		resetEnv({ ...validBase, INTERNAL_API_JWT_SECRET: '', ENABLE_E2E_PASSWORD_AUTH: 'true' });
		expect(() => assertProductionAuthSecret(getServerConfig(), 'production')).not.toThrow();
	});
});
