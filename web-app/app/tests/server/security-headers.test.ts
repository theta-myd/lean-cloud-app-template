import { describe, expect, it } from 'vitest';
import { applySecurityHeaders } from '#lib/server/security-headers.js';

describe('applySecurityHeaders', () => {
	it('adds baseline security headers and omits HSTS on HTTP', () => {
		const original = new Response('hello', { status: 200 });
		const secured = applySecurityHeaders(original, new URL('http://localhost:5173/login'), {
			isDev: false,
			isApi: false
		});

		expect(secured.headers.get('x-content-type-options')).toBe('nosniff');
		expect(secured.headers.get('x-frame-options')).toBe('DENY');
		expect(secured.headers.get('referrer-policy')).toBe('strict-origin-when-cross-origin');
		expect(secured.headers.get('permissions-policy')).toBe(
			'camera=(), microphone=(), geolocation=(), payment=()'
		);
		expect(secured.headers.get('cross-origin-opener-policy')).toBe('same-origin-allow-popups');
		expect(secured.headers.get('strict-transport-security')).toBeNull();
		expect(secured.headers.get('cache-control')).toBeNull();

		const csp = secured.headers.get('content-security-policy');
		expect(csp).toContain("default-src 'self'");
		expect(csp).toContain("frame-ancestors 'none'");
		expect(csp).toContain('connect-src \'self\'');
		expect(csp).not.toContain('ws:');
	});

	it('adds HSTS on HTTPS and allows ws/wss in dev CSP', () => {
		const original = new Response('ok', { status: 200 });
		const secured = applySecurityHeaders(
			original,
			new URL('https://lean-cloud-app.a.run.app/'),
			{ isDev: true, isApi: false }
		);

		expect(secured.headers.get('strict-transport-security')).toBe(
			'max-age=31536000; includeSubDomains'
		);
		expect(secured.headers.get('content-security-policy')).toContain(
			"connect-src 'self' ws: wss:"
		);
	});

	it('adds Cache-Control: no-store for API responses unless already specified', () => {
		const apiRes = applySecurityHeaders(
			new Response('{"status":"ok"}', { status: 200 }),
			new URL('https://lean-cloud-app.a.run.app/api/health'),
			{ isDev: false, isApi: true }
		);
		expect(apiRes.headers.get('cache-control')).toBe('no-store');

		const customRes = applySecurityHeaders(
			new Response('{"cached":true}', {
				status: 200,
				headers: { 'cache-control': 'private, max-age=60' }
			}),
			new URL('https://lean-cloud-app.a.run.app/api/custom'),
			{ isDev: false, isApi: true }
		);
		expect(customRes.headers.get('cache-control')).toBe('private, max-age=60');
	});
});
