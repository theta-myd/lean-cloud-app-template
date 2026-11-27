import { describe, expect, it, vi } from 'vitest';

const getFirestoreStatusMock = vi.hoisted(() =>
	vi.fn(() => ({
		mode: 'emulator' as const,
		projectId: 'lean-cloud-app-local',
		emulatorHost: 'localhost:8080'
	}))
);

vi.mock('#lib/server/firestore.js', () => ({
	getFirestoreStatus: getFirestoreStatusMock
}));

import { GET } from '../../src/routes/api/health/+server.js';

describe('GET /api/health', () => {
	it('returns 200 JSON with light architecture status and firestore mode', async () => {
		const response = await GET({} as Parameters<typeof GET>[0]);
		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({
			status: 'ok',
			architecture: 'light',
			firestore: 'emulator'
		});
	});
});
