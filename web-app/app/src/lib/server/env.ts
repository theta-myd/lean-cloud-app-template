import * as env from '$app/env/private';

export type AccessMode = 'open' | 'allowlist';

export interface ServerConfig {
	appUrl: string;
	betterAuthUrl: string;
	betterAuthSecret: string;
	googleClientId: string;
	googleClientSecret: string;
	googleOAuthConfigured: boolean;
	authAccessMode: AccessMode;
	allowedEmails: string[];
	allowedDomains: string[];
	enableE2ePasswordAuth: boolean;
	e2eTestEmail: string;
	e2eTestPassword: string;
	googleCloudProject: string;
	firestoreEmulatorHost: string;
}

function parseCsv(value: string | undefined): string[] {
	if (!value) return [];
	return value
		.split(',')
		.map((item) => item.trim().toLowerCase())
		.filter(Boolean);
}

export function getServerConfig(): ServerConfig {
	const appUrl = env.PUBLIC_APP_URL?.trim() || 'http://localhost:5173';
	const betterAuthUrl = env.BETTER_AUTH_URL?.trim() || appUrl;
	const betterAuthSecret =
		env.BETTER_AUTH_SECRET?.trim() || 'dev-fallback-secret-do-not-use-in-production-32b';
	const googleClientId = env.GOOGLE_CLIENT_ID?.trim() || '';
	const googleClientSecret = env.GOOGLE_CLIENT_SECRET?.trim() || '';
	const isRealGoogleId =
		googleClientId.length > 0 && !googleClientId.startsWith('your-google-client-id');
	const isRealGoogleSecret =
		googleClientSecret.length > 0 && !googleClientSecret.startsWith('CHANGE_ME');

	const rawAccessMode = env.AUTH_ACCESS_MODE?.trim().toLowerCase();
	const authAccessMode: AccessMode = rawAccessMode === 'open' ? 'open' : 'allowlist';

	return {
		appUrl,
		betterAuthUrl,
		betterAuthSecret,
		googleClientId,
		googleClientSecret,
		googleOAuthConfigured: isRealGoogleId && isRealGoogleSecret,
		authAccessMode,
		allowedEmails: parseCsv(env.ALLOWED_EMAILS),
		allowedDomains: parseCsv(env.ALLOWED_DOMAINS),
		enableE2ePasswordAuth: env.ENABLE_E2E_PASSWORD_AUTH?.trim().toLowerCase() === 'true',
		e2eTestEmail: env.E2E_TEST_EMAIL?.trim().toLowerCase() || 'e2e@example.com',
		e2eTestPassword: env.E2E_TEST_PASSWORD?.trim() || '',
		googleCloudProject: env.GOOGLE_CLOUD_PROJECT?.trim() || '',
		firestoreEmulatorHost: env.FIRESTORE_EMULATOR_HOST?.trim() || ''
	};
}
