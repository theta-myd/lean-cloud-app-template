const GCP_METADATA_IDENTITY_ENDPOINT =
	'http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/identity';

const DEFAULT_FALLBACK_TTL_MS = 50 * 60 * 1000;
const REFRESH_BUFFER_MS = 120 * 1000;

interface CachedIdToken {
	token: string;
	expiresAtMs: number;
}

export interface GcpIdTokenOptions {
	fetchImpl?: typeof fetch;
	nowMs?: () => number;
	envVars?: Record<string, string | undefined>;
}

const tokenCache = new Map<string, CachedIdToken>();

export function clearGcpIdTokenCache(): void {
	tokenCache.clear();
}

export function shouldFetchGcpIdToken(
	audience: string,
	envVars: Record<string, string | undefined> = process.env
): boolean {
	const trimmed = audience.trim();
	if (!trimmed) {
		return false;
	}
	if (trimmed.startsWith('https://')) {
		return true;
	}
	return Boolean(envVars.K_SERVICE?.trim());
}

function parseJwtExpMs(token: string, nowMs: number): number {
	const parts = token.split('.');
	if (parts.length !== 3) {
		return nowMs + DEFAULT_FALLBACK_TTL_MS;
	}
	try {
		const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')) as {
			exp?: unknown;
		};
		if (typeof payload.exp === 'number' && Number.isFinite(payload.exp)) {
			return payload.exp * 1000;
		}
	} catch {
		// Fall back to default TTL when token payload cannot be decoded
	}
	return nowMs + DEFAULT_FALLBACK_TTL_MS;
}

/**
 * Fetches a Google Cloud OIDC ID token from the Compute / Cloud Run metadata server
 * for authenticating service-to-service requests to an internal Cloud Run API.
 *
 * Returns null in local development (e.g. http://localhost:8081 without K_SERVICE).
 */
export async function getGcpIdToken(
	audience: string,
	options: GcpIdTokenOptions = {}
): Promise<string | null> {
	const trimmedAudience = audience.trim();
	const envVars = options.envVars ?? process.env;
	if (!shouldFetchGcpIdToken(trimmedAudience, envVars)) {
		return null;
	}

	const nowMs = (options.nowMs ?? Date.now)();
	const cached = tokenCache.get(trimmedAudience);
	if (cached && cached.expiresAtMs - REFRESH_BUFFER_MS > nowMs) {
		return cached.token;
	}

	const fetchImpl = options.fetchImpl ?? fetch;
	const url = `${GCP_METADATA_IDENTITY_ENDPOINT}?audience=${encodeURIComponent(trimmedAudience)}`;
	const response = await fetchImpl(url, {
		method: 'GET',
		headers: {
			'Metadata-Flavor': 'Google'
		}
	});

	if (!response.ok) {
		throw new Error(
			`Failed to fetch GCP OIDC ID token from metadata server (HTTP ${response.status}).`
		);
	}

	const token = (await response.text()).trim();
	if (!token) {
		throw new Error('GCP metadata server returned an empty OIDC ID token.');
	}

	const expiresAtMs = parseJwtExpMs(token, nowMs);
	tokenCache.set(trimmedAudience, { token, expiresAtMs });
	return token;
}
