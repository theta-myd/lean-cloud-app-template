export interface SecurityHeaderOptions {
	isDev?: boolean;
	isApi?: boolean;
}

export function buildContentSecurityPolicy(isDev: boolean): string {
	const connectSrc = isDev ? "'self' ws: wss:" : "'self'";
	return [
		"default-src 'self'",
		"script-src 'self' 'unsafe-inline'",
		"style-src 'self' 'unsafe-inline'",
		"img-src 'self' data: https://*.googleusercontent.com",
		"font-src 'self' data:",
		`connect-src ${connectSrc}`,
		"object-src 'none'",
		"base-uri 'self'",
		"form-action 'self' https://accounts.google.com",
		"frame-ancestors 'none'"
	].join('; ');
}

export function applySecurityHeaders(
	response: Response,
	requestUrl: URL,
	options: SecurityHeaderOptions = {}
): Response {
	const isDev = options.isDev ?? false;
	const isApi = options.isApi ?? false;
	const headers = new Headers(response.headers);

	headers.set('X-Content-Type-Options', 'nosniff');
	headers.set('X-Frame-Options', 'DENY');
	headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
	headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
	headers.set('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');
	headers.set('Content-Security-Policy', buildContentSecurityPolicy(isDev));

	if (requestUrl.protocol === 'https:') {
		headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
	}

	if (isApi && !headers.has('cache-control')) {
		headers.set('Cache-Control', 'no-store');
	}

	return new Response(response.body, {
		status: response.status,
		statusText: response.statusText,
		headers
	});
}
