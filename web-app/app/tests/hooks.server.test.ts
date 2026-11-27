import type { Handle } from '@sveltejs/kit/hooks';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ServerConfig } from '#lib/server/env.js';

const { getServerConfigMock, getSessionMock, svelteKitHandlerMock } = vi.hoisted(() => ({
	getServerConfigMock: vi.fn<() => ServerConfig>(),
	getSessionMock: vi.fn(),
	svelteKitHandlerMock: vi.fn()
}));

vi.mock('$app/env', () => ({ building: false }));
vi.mock('#lib/server/env.js', () => ({ getServerConfig: getServerConfigMock }));
vi.mock('#lib/server/auth.js', () => ({
	getAuth: vi.fn(async () => ({
		api: {
			getSession: getSessionMock
		}
	}))
}));
vi.mock('better-auth/svelte-kit', () => ({
	svelteKitHandler: svelteKitHandlerMock
}));

import { handle } from '../src/hooks.server.js';

function makeConfig(overrides: Partial<ServerConfig> = {}): ServerConfig {
	return {
		appUrl: 'http://localhost:5173',
		betterAuthUrl: 'http://localhost:5173',
		betterAuthSecret: 'unit-test-only-secret-0000000000',
		googleClientId: '',
		googleClientSecret: '',
		googleOAuthConfigured: false,
		authAccessMode: 'allowlist',
		allowedEmails: ['allowed@example.com'],
		allowedDomains: [],
		enableE2ePasswordAuth: false,
		e2eTestEmail: 'e2e@example.com',
		e2eTestPassword: '',
		googleCloudProject: '',
		firestoreEmulatorHost: '',
		...overrides
	};
}

function makeEvent(pathname: string) {
	const locals: App.Locals = {
		user: null,
		session: null,
		authMode: 'stateless',
		isAuthorized: false
	};
	return {
		url: new URL(`http://localhost:5173${pathname}`),
		request: new Request(`http://localhost:5173${pathname}`),
		locals
	};
}

describe('hooks.server handle', () => {
	const resolve = vi.fn(async () => new Response('ok', { status: 200 }));

	beforeEach(() => {
		vi.clearAllMocks();
		getServerConfigMock.mockReturnValue(makeConfig());
		getSessionMock.mockResolvedValue(null);
		svelteKitHandlerMock.mockResolvedValue(new Response('auth-handled', { status: 200 }));
	});

	it('delegates /api/auth/* routes directly to svelteKitHandler', async () => {
		const event = makeEvent('/api/auth/session');
		const response = await handle({
			event: event as unknown as Parameters<Handle>[0]['event'],
			resolve
		});
		expect(response.status).toBe(200);
		expect(svelteKitHandlerMock).toHaveBeenCalledTimes(1);
		expect(getSessionMock).not.toHaveBeenCalled();
	});

	it('allows public paths without session', async () => {
		for (const path of ['/api/health', '/unauthorized', '/login']) {
			const event = makeEvent(path);
			const response = await handle({
				event: event as unknown as Parameters<Handle>[0]['event'],
				resolve
			});
			expect(response.status).toBe(200);
		}
		expect(resolve).toHaveBeenCalledTimes(3);
	});

	it('redirects unauthenticated pages to /login and returns 401 JSON for /api/*', async () => {
		await expect(
			handle({
				event: makeEvent('/') as unknown as Parameters<Handle>[0]['event'],
				resolve
			})
		).rejects.toMatchObject({ status: 302, location: '/login' });

		const apiResponse = await handle({
			event: makeEvent('/api/private') as unknown as Parameters<Handle>[0]['event'],
			resolve
		});
		expect(apiResponse.status).toBe(401);
		expect(await apiResponse.json()).toEqual({ error: 'Unauthorized' });
	});

	it('redirects unauthorized users to /unauthorized and returns 403 JSON for /api/*', async () => {
		getSessionMock.mockResolvedValue({
			user: { id: 'u1', email: 'blocked@example.com', emailVerified: true, name: 'Blocked' },
			session: { id: 's1' }
		});

		await expect(
			handle({
				event: makeEvent('/') as unknown as Parameters<Handle>[0]['event'],
				resolve
			})
		).rejects.toMatchObject({ status: 302, location: '/unauthorized' });

		await expect(
			handle({
				event: makeEvent('/login') as unknown as Parameters<Handle>[0]['event'],
				resolve
			})
		).rejects.toMatchObject({ status: 302, location: '/unauthorized' });

		const apiResponse = await handle({
			event: makeEvent('/api/private') as unknown as Parameters<Handle>[0]['event'],
			resolve
		});
		expect(apiResponse.status).toBe(403);
		expect(await apiResponse.json()).toEqual({ error: 'Forbidden' });
	});

	it('populates locals and redirects /login -> / for authorized users', async () => {
		const user = { id: 'u2', email: 'allowed@example.com', emailVerified: true, name: 'Allowed' };
		const session = { id: 's2' };
		getSessionMock.mockResolvedValue({ user, session });

		await expect(
			handle({
				event: makeEvent('/login') as unknown as Parameters<Handle>[0]['event'],
				resolve
			})
		).rejects.toMatchObject({ status: 302, location: '/' });

		const homeEvent = makeEvent('/');
		const response = await handle({
			event: homeEvent as unknown as Parameters<Handle>[0]['event'],
			resolve
		});
		expect(response.status).toBe(200);
		expect(homeEvent.locals.user).toEqual(user);
		expect(homeEvent.locals.session).toEqual(session);
		expect(homeEvent.locals.isAuthorized).toBe(true);
		expect(homeEvent.locals.authMode).toBe('stateless');
	});
});
