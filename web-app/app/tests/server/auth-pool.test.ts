import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockEnv: Record<string, string> = {
	PUBLIC_APP_URL: 'http://localhost:5173',
	BETTER_AUTH_URL: 'http://localhost:5173',
	BETTER_AUTH_SECRET: 'a'.repeat(32),
	GOOGLE_CLIENT_ID: '',
	GOOGLE_CLIENT_SECRET: '',
	AUTH_ACCESS_MODE: 'allowlist',
	ALLOWED_EMAILS: '',
	ALLOWED_DOMAINS: '',
	ENABLE_E2E_PASSWORD_AUTH: 'false',
	E2E_TEST_EMAIL: '',
	E2E_TEST_PASSWORD: '',
	GOOGLE_CLOUD_PROJECT: '',
	FIRESTORE_EMULATOR_HOST: '',
	ARCHITECTURE_VARIANT: 'standard',
	AUTH_DATABASE_URL: 'postgres://auth_user:local-dev-auth-password@127.0.0.1:5432/app',
	API_BASE_URL: 'http://127.0.0.1:8081',
	API_AUDIENCE: '',
	INTERNAL_API_JWT_SECRET: 'b'.repeat(32)
};
const createdPools: MockPgPool[] = [];

class MockPgPool extends EventEmitter {
	config: Record<string, unknown>;
	ended = false;

	constructor(config: Record<string, unknown>) {
		super();
		this.config = config;
		createdPools.push(this);
	}

	async end(): Promise<void> {
		this.ended = true;
	}
}

vi.mock('$app/env/private', () => mockEnv);
vi.mock('pg', () => ({ Pool: MockPgPool }));
vi.mock('better-auth', () => ({
	betterAuth: vi.fn((options: unknown) => ({ options, api: {} }))
}));

describe('Standard Better Auth pg.Pool idle error handling', () => {
	beforeEach(() => {
		vi.resetModules();
		createdPools.length = 0;
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('attaches an error listener to pg.Pool and logs idle disconnects without crashing', async () => {
		const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
		const { getAuth } = await import('#lib/server/auth.js');

		await getAuth();

		expect(createdPools).toHaveLength(1);
		const pool = createdPools[0];
		expect(pool.config).toEqual({
			connectionString: mockEnv.AUTH_DATABASE_URL,
			max: 5,
			options: '-c search_path=auth'
		});
		expect(pool.listenerCount('error')).toBe(1);

		const disconnectErr = Object.assign(
			new Error('terminating connection due to administrator command'),
			{ code: '57P01' }
		);

		expect(() => pool.emit('error', disconnectErr)).not.toThrow();
		expect(errorSpy).toHaveBeenCalledTimes(1);
		expect(errorSpy).toHaveBeenCalledWith(
			'[auth] idle PostgreSQL pool client error (57P01): terminating connection due to administrator command'
		);
		expect(String(errorSpy.mock.calls[0]?.[0])).not.toContain('local-dev-auth-password');
	});
});
