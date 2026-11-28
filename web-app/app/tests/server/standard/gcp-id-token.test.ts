import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
	clearGcpIdTokenCache,
	getGcpIdToken,
	shouldFetchGcpIdToken
} from '#lib/server/standard/gcp-id-token.js';

function makeFakeJwt(expSeconds: number): string {
	const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
	const payload = Buffer.from(
		JSON.stringify({ iss: 'https://accounts.google.com', exp: expSeconds })
	).toString('base64url');
	return `${header}.${payload}.fake-signature`;
}

describe('gcp-id-token', () => {
	beforeEach(() => {
		clearGcpIdTokenCache();
	});

	it('skips metadata fetch for local http:// URLs when K_SERVICE is unset', async () => {
		const fetchMock = vi.fn<typeof fetch>();
		expect(shouldFetchGcpIdToken('http://localhost:8081', {})).toBe(false);
		expect(shouldFetchGcpIdToken('', {})).toBe(false);

		const token = await getGcpIdToken('http://localhost:8081', {
			fetchImpl: fetchMock,
			envVars: {}
		});
		expect(token).toBeNull();
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it('fetches from GCP metadata server for https:// audience and caches until near expiry', async () => {
		let currentMs = 1_750_000_000_000;
		const firstToken = makeFakeJwt(Math.floor(currentMs / 1000) + 3600);
		const refreshedToken = makeFakeJwt(Math.floor(currentMs / 1000) + 7200);

		const fetchMock = vi
			.fn<typeof fetch>()
			.mockResolvedValueOnce(new Response(firstToken, { status: 200 }))
			.mockResolvedValueOnce(new Response(refreshedToken, { status: 200 }));

		const audience = 'https://lean-cloud-api-xyz.a.run.app';
		const t1 = await getGcpIdToken(audience, {
			fetchImpl: fetchMock,
			nowMs: () => currentMs,
			envVars: {}
		});
		expect(t1).toBe(firstToken);
		expect(fetchMock).toHaveBeenCalledTimes(1);
		expect(fetchMock).toHaveBeenCalledWith(
			`http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/identity?audience=${encodeURIComponent(audience)}`,
			expect.objectContaining({
				method: 'GET',
				headers: { 'Metadata-Flavor': 'Google' }
			})
		);

		// Within TTL (30 minutes later): served from cache
		currentMs += 30 * 60 * 1000;
		const t2 = await getGcpIdToken(audience, {
			fetchImpl: fetchMock,
			nowMs: () => currentMs,
			envVars: {}
		});
		expect(t2).toBe(firstToken);
		expect(fetchMock).toHaveBeenCalledTimes(1);

		// Within 120s refresh buffer (59 minutes after initial fetch): refreshes
		currentMs += 29 * 60 * 1000;
		const t3 = await getGcpIdToken(audience, {
			fetchImpl: fetchMock,
			nowMs: () => currentMs,
			envVars: {}
		});
		expect(t3).toBe(refreshedToken);
		expect(fetchMock).toHaveBeenCalledTimes(2);
	});

	it('fetches when K_SERVICE is set on Cloud Run and throws on HTTP error', async () => {
		const fetchMock = vi
			.fn<typeof fetch>()
			.mockResolvedValueOnce(new Response('forbidden', { status: 403 }));

		expect(shouldFetchGcpIdToken('http://internal-api', { K_SERVICE: 'lean-cloud-app' })).toBe(
			true
		);

		await expect(
			getGcpIdToken('http://internal-api', {
				fetchImpl: fetchMock,
				envVars: { K_SERVICE: 'lean-cloud-app' }
			})
		).rejects.toThrow('HTTP 403');
	});
});
