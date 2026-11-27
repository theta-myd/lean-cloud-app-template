import { building } from '$app/env';
import { redirect } from '@sveltejs/kit';
import type { Handle } from '@sveltejs/kit/hooks';
import { svelteKitHandler } from 'better-auth/svelte-kit';
import { isEmailAllowed } from '#lib/server/allowlist.js';
import { getAuth } from '#lib/server/auth.js';
import { getServerConfig } from '#lib/server/env.js';
import { applySecurityHeaders } from '#lib/server/security-headers.js';

const PUBLIC_PATHS = ['/login', '/unauthorized', '/api/health'];

function isPublicPath(pathname: string): boolean {
	return PUBLIC_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

export const handle: Handle = async ({ event, resolve }) => {
	const config = getServerConfig();
	const auth = await getAuth();
	const { pathname } = event.url;
	const securityOptions = {
		isDev: process.env.NODE_ENV !== 'production',
		isApi: pathname.startsWith('/api/')
	};

	if (pathname.startsWith('/api/auth')) {
		const response = await svelteKitHandler({ event, resolve, auth, building });
		return applySecurityHeaders(response, event.url, securityOptions);
	}

	const sessionResult = await auth.api.getSession({
		headers: event.request.headers
	});

	event.locals.user = sessionResult?.user ?? null;
	event.locals.session = sessionResult?.session ?? null;
	event.locals.authMode = config.enableE2ePasswordAuth ? 'e2e-memory-sqlite' : 'stateless';
	event.locals.isAuthorized = sessionResult?.user
		? isEmailAllowed(sessionResult.user.email, sessionResult.user.emailVerified, config)
		: false;

	if (pathname === '/login') {
		if (event.locals.user && event.locals.isAuthorized) {
			redirect(302, '/');
		}
		if (event.locals.user && !event.locals.isAuthorized) {
			redirect(302, '/unauthorized');
		}
		return applySecurityHeaders(await resolve(event), event.url, securityOptions);
	}

	if (isPublicPath(pathname)) {
		return applySecurityHeaders(await resolve(event), event.url, securityOptions);
	}

	if (!event.locals.user) {
		if (pathname.startsWith('/api/')) {
			return applySecurityHeaders(
				new Response(JSON.stringify({ error: 'Unauthorized' }), {
					status: 401,
					headers: { 'content-type': 'application/json' }
				}),
				event.url,
				securityOptions
			);
		}
		redirect(302, '/login');
	}

	if (!event.locals.isAuthorized) {
		if (pathname.startsWith('/api/')) {
			return applySecurityHeaders(
				new Response(JSON.stringify({ error: 'Forbidden' }), {
					status: 403,
					headers: { 'content-type': 'application/json' }
				}),
				event.url,
				securityOptions
			);
		}
		redirect(302, '/unauthorized');
	}

	return applySecurityHeaders(await resolve(event), event.url, securityOptions);
};
