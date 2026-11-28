import { beforeEach, describe, expect, it, vi } from 'vitest';

const getServerConfigMock = vi.hoisted(() =>
	vi.fn(() => ({
		architectureVariant: 'light' as 'light' | 'standard',
		apiConfigured: false,
		authDatabaseConfigured: false
	}))
);

const getFirestoreStatusMock = vi.hoisted(() =>
	vi.fn(() => ({
		mode: 'emulator' as const,
		projectId: 'lean-cloud-app-local',
		emulatorHost: 'localhost:8080'
	}))
);

vi.mock('#lib/server/env.js', () => ({
	getServerConfig: getServerConfigMock
}));

vi.mock('#lib/server/firestore.js', () => ({
	getFirestoreStatus: getFirestoreStatusMock
}));

import { GET } from '../../src/routes/api/health/+server.js';

describe('GET /api/health', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		getServerConfigMock.mockReturnValue({
			architectureVariant: 'light',
			apiConfigured: false,
			authDatabaseConfigured: false
		});
	});

	it('returns 200 JSON with light architecture status and firestore mode', async () => {
		const response = await GET({} as Parameters<typeof GET>[0]);
		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({
			status: 'ok',
			architecture: 'light',
			firestore: 'emulator'
		});
	});

	it('returns 200 JSON with standard architecture status without leaking URLs or secrets', async () => {
		getServerConfigMock.mockReturnValue({
			architectureVariant: 'standard',
			apiConfigured: true,
			authDatabaseConfigured: false
		});

		const response = await GET({} as Parameters<typeof GET>[0]);
		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({
			status: 'ok',
			architecture: 'standard',
			api: 'configured',
			authDb: 'unconfigured'
		});
		expect(getFirestoreStatusMock).not.toHaveBeenCalled();
	});
});
