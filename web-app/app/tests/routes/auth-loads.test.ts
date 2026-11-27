import { describe, expect, it, vi } from 'vitest';

const getServerConfigMock = vi.hoisted(() =>
	vi.fn(() => ({
		enableE2ePasswordAuth: true,
		googleOAuthConfigured: false
	}))
);

vi.mock('#lib/server/env.js', () => ({
	getServerConfig: getServerConfigMock
}));

import { load as layoutLoad } from '../../src/routes/(app)/+layout.server.js';
import { load as loginLoad } from '../../src/routes/login/+page.server.js';
import { load as unauthorizedLoad } from '../../src/routes/unauthorized/+page.server.js';

describe('route server load guards', () => {
	it('login load exposes only E2E and Google OAuth flags', () => {
		expect(loginLoad({} as Parameters<typeof loginLoad>[0])).toEqual({
			enableE2ePasswordAuth: true,
			googleOAuthConfigured: false
		});
	});

	it('(app) layout load redirects unauthenticated requests and passes user when signed in', () => {
		expect(() =>
			layoutLoad({ locals: { user: null } } as unknown as Parameters<typeof layoutLoad>[0])
		).toThrowError(expect.objectContaining({ status: 302, location: '/login' }));

		const user = { id: 'u1', email: 'dev@example.com', name: 'Dev' };
		expect(
			layoutLoad({ locals: { user } } as unknown as Parameters<typeof layoutLoad>[0])
		).toEqual({ user });
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
