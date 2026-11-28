import { describe, expect, it } from 'vitest';
import { isEmailAllowed } from '#lib/server/allowlist.js';
import type { ServerConfig } from '#lib/server/env.js';

function makeConfig(overrides: Partial<ServerConfig> = {}): ServerConfig {
	return {
		architectureVariant: 'light',
		appUrl: 'http://localhost:5173',
		betterAuthUrl: 'http://localhost:5173',
		betterAuthSecret: 'unit-test-only-secret-0000000000',
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
		authDatabaseUrl: '',
		authDatabaseConfigured: false,
		apiBaseUrl: '',
		apiConfigured: false,
		apiAudience: '',
		internalApiJwtSecret: 'unit-test-only-internal-jwt-secret-32b',
		internalApiJwtSecretConfigured: true,
		...overrides
	};
}

describe('isEmailAllowed', () => {
	it('rejects null, undefined, and empty emails', () => {
		const config = makeConfig({ authAccessMode: 'open' });
		expect(isEmailAllowed(null, true, config)).toBe(false);
		expect(isEmailAllowed(undefined, true, config)).toBe(false);
		expect(isEmailAllowed('', true, config)).toBe(false);
	});

	it('allows verified emails in open mode and rejects unverified emails', () => {
		const config = makeConfig({ authAccessMode: 'open' });
		expect(isEmailAllowed('anyone@example.com', true, config)).toBe(true);
		expect(isEmailAllowed('anyone@example.com', undefined, config)).toBe(true);
		expect(isEmailAllowed('anyone@example.com', false, config)).toBe(false);
	});

	it('matches exact emails in allowlist mode with normalization', () => {
		const config = makeConfig({
			authAccessMode: 'allowlist',
			allowedEmails: ['alice@example.com']
		});
		expect(isEmailAllowed('  ALICE@Example.COM ', true, config)).toBe(true);
		expect(isEmailAllowed('bob@example.com', true, config)).toBe(false);
		expect(isEmailAllowed('alice@example.com', false, config)).toBe(false);
	});

	it('matches allowed domains in allowlist mode', () => {
		const config = makeConfig({
			authAccessMode: 'allowlist',
			allowedDomains: ['corp.example.com']
		});
		expect(isEmailAllowed('dev@corp.example.com', true, config)).toBe(true);
		expect(isEmailAllowed('dev@other.example.com', true, config)).toBe(false);
	});

	it('allows the configured E2E test account only when E2E password auth is enabled', () => {
		const enabledConfig = makeConfig({
			authAccessMode: 'allowlist',
			enableE2ePasswordAuth: true,
			e2eTestEmail: 'e2e@example.com'
		});
		expect(isEmailAllowed('E2E@example.com', false, enabledConfig)).toBe(true);

		const disabledConfig = makeConfig({
			authAccessMode: 'allowlist',
			enableE2ePasswordAuth: false,
			e2eTestEmail: 'e2e@example.com'
		});
		expect(isEmailAllowed('e2e@example.com', true, disabledConfig)).toBe(false);
	});
});
