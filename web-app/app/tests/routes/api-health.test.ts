import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BackendHealthResponse } from '#lib/server/types.js';

const getServerConfigMock = vi.hoisted(() =>
	vi.fn(() => ({
		architectureVariant: 'light' as 'light' | 'standard',
		apiConfigured: false,
		authDatabaseConfigured: false
	}))
);

const getBackendHealthMock = vi.hoisted(() =>
	vi.fn<() => BackendHealthResponse>(() => ({
		status: 'ok',
		architecture: 'light',
		firestore: 'emulator'
	}))
);

vi.mock('#lib/server/env.js', () => ({
	getServerConfig: getServerConfigMock
}));

vi.mock('#lib/server/backend.js', () => ({
	getBackendHealth: getBackendHealthMock
}));

import { GET } from '../../src/routes/api/health/+server.js';

describe('GET /api/health', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('returns 200 JSON with light architecture status and firestore mode', async () => {
		getBackendHealthMock.mockReturnValueOnce({
			status: 'ok',
			architecture: 'light',
			firestore: 'emulator'
		});

		const response = await GET({} as Parameters<typeof GET>[0]);
		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({
			status: 'ok',
			architecture: 'light',
			firestore: 'emulator'
		});
	});

	it('returns 200 JSON with standard architecture status without leaking URLs or secrets', async () => {
		getBackendHealthMock.mockReturnValueOnce({
			status: 'ok',
			architecture: 'standard',
			api: 'configured',
			authDb: 'unconfigured'
		});

		const response = await GET({} as Parameters<typeof GET>[0]);
		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({
			status: 'ok',
			architecture: 'standard',
			api: 'configured',
			authDb: 'unconfigured'
		});
	});
});
