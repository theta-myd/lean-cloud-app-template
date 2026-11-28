import type { ServerConfig } from '../env.js';
import type { AuthSessionStore } from '../types.js';

/**
 * Creates the Better Auth PostgreSQL connection pool (`auth` schema) used in
 * Standard architecture across clouds (Cloud SQL / Aurora / Azure PostgreSQL).
 *
 * Business-domain CRUD never uses this pool — it goes exclusively through the
 * internal Rust Connect RPC API (`api-client.ts`).
 */
export async function createStandardAuthSessionStore(
	config: ServerConfig
): Promise<AuthSessionStore> {
	if (!config.authDatabaseConfigured) {
		throw new Error(
			'AUTH_DATABASE_URL must be configured when ARCHITECTURE_VARIANT=standard.'
		);
	}

	const { Pool: PgPool } = await import('pg');
	const pool = new PgPool({
		connectionString: config.authDatabaseUrl,
		max: 5,
		options: '-c search_path=auth'
	});
	pool.on('error', (err: Error & { code?: string }) => {
		const code = typeof err.code === 'string' && err.code ? ` (${err.code})` : '';
		console.error(`[auth] idle PostgreSQL pool client error${code}: ${err.message}`);
	});

	return {
		authMode: 'postgres-db',
		database: pool,
		cookieCacheEnabled: false,
		close: async () => {
			await pool.end().catch(() => {});
		}
	};
}
