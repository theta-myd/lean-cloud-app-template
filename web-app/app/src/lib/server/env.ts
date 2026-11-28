import * as env from '$app/env/private';

export type AccessMode = 'open' | 'allowlist';
export type ArchitectureVariant = 'light' | 'standard';

export interface ServerConfig {
	architectureVariant: ArchitectureVariant;
	appUrl: string;
	betterAuthUrl: string;
	betterAuthSecret: string;
	betterAuthSecretConfigured: boolean;
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
	authDatabaseUrl: string;
	authDatabaseConfigured: boolean;
	apiBaseUrl: string;
	apiConfigured: boolean;
	apiAudience: string;
	internalApiJwtSecret: string;
	internalApiJwtSecretConfigured: boolean;
}

const MIN_AUTH_SECRET_LENGTH = 32;

function parseCsv(value: string | undefined): string[] {
	if (!value) return [];
	return value
		.split(',')
		.map((item) => item.trim().toLowerCase())
		.filter(Boolean);
}

function stripTrailingSlashes(url: string): string {
	return url.replace(/\/+$/, '');
}

export function getServerConfig(): ServerConfig {
	const rawVariant = env.ARCHITECTURE_VARIANT?.trim().toLowerCase();
	const architectureVariant: ArchitectureVariant =
		rawVariant === 'standard' ? 'standard' : 'light';

	const appUrl = env.PUBLIC_APP_URL?.trim() || 'http://localhost:5173';
	const betterAuthUrl = env.BETTER_AUTH_URL?.trim() || appUrl;
	const rawSecret = env.BETTER_AUTH_SECRET?.trim() || '';
	const betterAuthSecretConfigured =
		rawSecret.length >= MIN_AUTH_SECRET_LENGTH && !rawSecret.startsWith('CHANGE_ME');
	const betterAuthSecret =
		rawSecret || 'dev-fallback-secret-do-not-use-in-production-32b';
	const googleClientId = env.GOOGLE_CLIENT_ID?.trim() || '';
	const googleClientSecret = env.GOOGLE_CLIENT_SECRET?.trim() || '';
	const isRealGoogleId =
		googleClientId.length > 0 && !googleClientId.startsWith('your-google-client-id');
	const isRealGoogleSecret =
		googleClientSecret.length > 0 && !googleClientSecret.startsWith('CHANGE_ME');

	const rawAccessMode = env.AUTH_ACCESS_MODE?.trim().toLowerCase();
	const authAccessMode: AccessMode = rawAccessMode === 'open' ? 'open' : 'allowlist';

	const authDatabaseUrl = env.AUTH_DATABASE_URL?.trim() || '';
	const authDatabaseConfigured =
		authDatabaseUrl.length > 0 && !authDatabaseUrl.includes('CHANGE_ME');

	const apiBaseUrl = stripTrailingSlashes(env.API_BASE_URL?.trim() || '');
	const apiConfigured = apiBaseUrl.length > 0 && !apiBaseUrl.includes('CHANGE_ME');
	const rawApiAudience = stripTrailingSlashes(env.API_AUDIENCE?.trim() || '');
	const apiAudience =
		rawApiAudience || (apiBaseUrl.startsWith('https://') ? apiBaseUrl : '');

	const rawInternalJwtSecret = env.INTERNAL_API_JWT_SECRET?.trim() || '';
	const internalApiJwtSecretConfigured =
		rawInternalJwtSecret.length >= MIN_AUTH_SECRET_LENGTH &&
		!rawInternalJwtSecret.startsWith('CHANGE_ME');
	const internalApiJwtSecret =
		rawInternalJwtSecret || 'dev-fallback-internal-jwt-secret-not-for-prod-32b';

	return {
		architectureVariant,
		appUrl,
		betterAuthUrl,
		betterAuthSecret,
		betterAuthSecretConfigured,
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
		firestoreEmulatorHost: env.FIRESTORE_EMULATOR_HOST?.trim() || '',
		authDatabaseUrl,
		authDatabaseConfigured,
		apiBaseUrl,
		apiConfigured,
		apiAudience,
		internalApiJwtSecret,
		internalApiJwtSecretConfigured
	};
}

export function assertProductionAuthSecret(
	config: ServerConfig,
	nodeEnv: string | undefined = process.env.NODE_ENV
): void {
	if (nodeEnv !== 'production' || config.enableE2ePasswordAuth) {
		return;
	}

	if (!config.betterAuthSecretConfigured) {
		throw new Error(
			'BETTER_AUTH_SECRET must be set to a random secret of at least 32 characters in production.'
		);
	}

	if (config.architectureVariant === 'standard') {
		if (!config.authDatabaseConfigured) {
			throw new Error(
				'AUTH_DATABASE_URL must be set when ARCHITECTURE_VARIANT=standard in production.'
			);
		}
		if (!config.apiConfigured) {
			throw new Error(
				'API_BASE_URL must be set when ARCHITECTURE_VARIANT=standard in production.'
			);
		}
		if (!config.internalApiJwtSecretConfigured) {
			throw new Error(
				'INTERNAL_API_JWT_SECRET must be set to a random secret of at least 32 characters when ARCHITECTURE_VARIANT=standard in production.'
			);
		}
	}
}
