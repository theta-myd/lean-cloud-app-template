import { beforeEach, describe, expect, it, vi } from 'vitest';

const envMock = vi.hoisted(() => ({
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
	FIRESTORE_EMULATOR_HOST: undefined as string | undefined
}));

vi.mock('$app/env/private', () => envMock);

import { getServerConfig } from '#lib/server/env.js';

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
		expect(config.appUrl).toBe('http://localhost:5173');
		expect(config.betterAuthUrl).toBe('http://localhost:5173');
		expect(config.authAccessMode).toBe('allowlist');
		expect(config.googleOAuthConfigured).toBe(false);
		expect(config.allowedEmails).toEqual([]);
		expect(config.allowedDomains).toEqual([]);
		expect(config.enableE2ePasswordAuth).toBe(false);
		expect(config.e2eTestEmail).toBe('e2e@example.com');
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
});
