import { beforeEach, describe, expect, it, vi } from 'vitest';

const getServerConfigMock = vi.hoisted(() =>
	vi.fn(() => ({
		architectureVariant: 'light' as 'light' | 'standard',
		apiConfigured: false,
		enableE2ePasswordAuth: true,
		googleOAuthConfigured: false
	}))
);

const resolveActiveTenantContextMock = vi.hoisted(() => vi.fn());

vi.mock('#lib/server/env.js', () => ({
	getServerConfig: getServerConfigMock
}));

vi.mock('#lib/server/api-client.js', () => ({
	resolveActiveTenantContext: resolveActiveTenantContextMock
}));

import { load as layoutLoad } from '../../src/routes/(app)/+layout.server.js';
import { load as loginLoad } from '../../src/routes/login/+page.server.js';
import { load as unauthorizedLoad } from '../../src/routes/unauthorized/+page.server.js';

describe('route server load guards', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		getServerConfigMock.mockReturnValue({
			architectureVariant: 'light',
			apiConfigured: false,
			enableE2ePasswordAuth: true,
			googleOAuthConfigured: false
		});
	});

	it('login load exposes only E2E and Google OAuth flags', () => {
		expect(loginLoad({} as Parameters<typeof loginLoad>[0])).toEqual({
			enableE2ePasswordAuth: true,
			googleOAuthConfigured: false
		});
	});

	it('(app) layout load redirects unauthenticated requests and passes user in Light mode', async () => {
		await expect(
			layoutLoad({ locals: { user: null } } as unknown as Parameters<typeof layoutLoad>[0])
		).rejects.toMatchObject({ status: 302, location: '/login' });

		const user = { id: 'u1', email: 'dev@example.com', name: 'Dev' };
		await expect(
			layoutLoad({ locals: { user } } as unknown as Parameters<typeof layoutLoad>[0])
		).resolves.toEqual({
			user,
			architectureVariant: 'light',
			activeTenant: null
		});
		expect(resolveActiveTenantContextMock).not.toHaveBeenCalled();
	});

	it('(app) layout load resolves active tenant in Standard mode when API is configured', async () => {
		getServerConfigMock.mockReturnValue({
			architectureVariant: 'standard',
			apiConfigured: true,
			enableE2ePasswordAuth: false,
			googleOAuthConfigured: true
		});
		const tenant = {
			id: 't-1',
			name: 'Personal',
			slug: 'personal-u1',
			role: 'owner' as const,
			isPersonal: true,
			createdAt: '2026-01-01T00:00:00.000Z'
		};
		resolveActiveTenantContextMock.mockResolvedValueOnce({
			activeTenant: tenant,
			tenants: [tenant]
		});

		const user = { id: 'u1', email: 'dev@example.com', name: 'Dev' };
		const cookies = { get: vi.fn(() => 't-1') };
		await expect(
			layoutLoad({ locals: { user }, cookies } as unknown as Parameters<typeof layoutLoad>[0])
		).resolves.toEqual({
			user,
			architectureVariant: 'standard',
			activeTenant: tenant
		});
	});

	it('unauthorized load returns email or null', () => {
		expect(
			unauthorizedLoad({ locals: { user: null } } as unknown as Parameters<
				typeof unauthorizedLoad
			>[0])
		).toEqual({ email: null });

		expect(
			unauthorizedLoad({
				locals: { user: { email: 'blocked@example.com' } }
			} as unknown as Parameters<typeof unauthorizedLoad>[0])
		).toEqual({ email: 'blocked@example.com' });
	});
});
