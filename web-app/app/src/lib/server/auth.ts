import { betterAuth, type BetterAuthOptions } from 'better-auth';
import { getMigrations } from 'better-auth/db/migration';
import { createAuthSessionStore } from './backend.js';
import { assertProductionAuthSecret, getServerConfig, type ServerConfig } from './env.js';

type AuthInstance = ReturnType<typeof betterAuth<BetterAuthOptions>>;

let cachedAuthPromise: Promise<AuthInstance> | null = null;
let cachedModeKey = '';
let cachedSessionStoreClose: (() => Promise<void>) | null = null;

async function createAuth(config: ServerConfig): Promise<AuthInstance> {
	assertProductionAuthSecret(config);

	if (cachedSessionStoreClose) {
		const closePrev = cachedSessionStoreClose;
		cachedSessionStoreClose = null;
		await closePrev().catch(() => {});
	}

	const socialProviders = config.googleOAuthConfigured
		? {
				google: {
					clientId: config.googleClientId,
					clientSecret: config.googleClientSecret
				}
			}
		: undefined;

	const isDevOrE2e = config.enableE2ePasswordAuth || process.env.NODE_ENV !== 'production';
	const trustedOrigins = Array.from(
		new Set([
			config.appUrl,
			config.betterAuthUrl,
			...(isDevOrE2e ? ['http://localhost:5173'] : [])
		])
	);
	const useSecureCookies = config.betterAuthUrl.startsWith('https://');

	if (config.enableE2ePasswordAuth) {
		const { Database } = await import('bun:sqlite');
		const sqlite = new Database(':memory:');

		const options = {
			baseURL: config.betterAuthUrl,
			secret: config.betterAuthSecret,
			trustedOrigins,
			database: sqlite,
			emailAndPassword: {
				enabled: true
			},
			socialProviders,
			advanced: {
				useSecureCookies
			},
			session: {
				expiresIn: 60 * 60 * 24 * 7,
				cookieCache: {
					enabled: true,
					maxAge: 60 * 60 * 24 * 7,
					strategy: 'jwe' as const
				}
			}
		} satisfies BetterAuthOptions;

		const { runMigrations } = await getMigrations(options);
		await runMigrations();

		const auth = betterAuth(options);

		if (config.e2eTestEmail && config.e2eTestPassword) {
			try {
				await auth.api.signUpEmail({
					body: {
						name: 'Local E2E User',
						email: config.e2eTestEmail,
						password: config.e2eTestPassword
					}
				});
			} catch {
				// Ignore duplicate user error on hot reload
			}
		}

		return auth as unknown as AuthInstance;
	}

	const sessionStore = await createAuthSessionStore(config);
	cachedSessionStoreClose = sessionStore.close ?? null;

	const options: BetterAuthOptions = {
		baseURL: config.betterAuthUrl,
		secret: config.betterAuthSecret,
		trustedOrigins,
		...(sessionStore.database ? { database: sessionStore.database } : {}),
		socialProviders,
		advanced: {
			useSecureCookies
		},
		session: {
			expiresIn: 60 * 60 * 24 * 7,
			cookieCache: sessionStore.cookieCacheEnabled
				? {
						enabled: true,
						maxAge: 60 * 60 * 24 * 7,
						strategy: 'jwe' as const
					}
				: {
						enabled: false
					}
		}
	};

	return betterAuth(options);
}

export async function getAuth(): Promise<AuthInstance> {
	const config = getServerConfig();
	const modeKey = [
		config.architectureVariant,
		config.betterAuthUrl,
		config.betterAuthSecretConfigured,
		config.enableE2ePasswordAuth,
		config.e2eTestEmail,
		config.googleOAuthConfigured,
		config.authDatabaseUrl
	].join('|');

	if (!cachedAuthPromise || cachedModeKey !== modeKey) {
		cachedModeKey = modeKey;
		cachedAuthPromise = createAuth(config);
	}

	return cachedAuthPromise;
}
