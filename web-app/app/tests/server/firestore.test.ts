import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ServerConfig } from '#lib/server/env.js';

const getServerConfigMock = vi.hoisted(() => vi.fn<() => ServerConfig>());

vi.mock('#lib/server/env.js', () => ({
	getServerConfig: getServerConfigMock
}));

import {
	FirestoreUnavailableError,
	getFirestore,
	getFirestoreStatus
} from '#lib/server/firestore.js';

function baseConfig(overrides: Partial<ServerConfig> = {}): ServerConfig {
	return {
		appUrl: 'http://localhost:5173',
		betterAuthUrl: 'http://localhost:5173',
		betterAuthSecret: 'unit-test-only-secret-0000000000',
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
		...overrides
	};
}

describe('getFirestoreStatus & getFirestore', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('detects emulator mode when FIRESTORE_EMULATOR_HOST is set', () => {
		getServerConfigMock.mockReturnValue(
			baseConfig({ firestoreEmulatorHost: 'localhost:8080', googleCloudProject: '' })
		);
		expect(getFirestoreStatus()).toEqual({
			mode: 'emulator',
			projectId: 'lean-cloud-app-local',
			emulatorHost: 'localhost:8080'
		});
	});

	it('detects cloud mode when GOOGLE_CLOUD_PROJECT is real', () => {
		getServerConfigMock.mockReturnValue(
			baseConfig({ googleCloudProject: 'my-prod-project-123' })
		);
		expect(getFirestoreStatus()).toEqual({
			mode: 'cloud',
			projectId: 'my-prod-project-123',
			emulatorHost: null
		});
	});

	it('returns unconfigured for empty or placeholder project IDs and throws on getFirestore()', () => {
		getServerConfigMock.mockReturnValue(
			baseConfig({ googleCloudProject: 'your-gcp-project-id' })
		);
		expect(getFirestoreStatus()).toEqual({
			mode: 'unconfigured',
			projectId: 'not-set',
			emulatorHost: null
		});
		expect(() => getFirestore()).toThrow(FirestoreUnavailableError);
	});
});
