import { getServerConfig, type ServerConfig } from './env.js';
import { lightBackend } from './light/index.js';
import { standardBackend } from './standard/index.js';
import type {
	ApiCaller,
	AuthSessionStore,
	BackendAdapter,
	BackendAuthMode,
	BackendHealthResponse,
	LightDatastoreStatus,
	TenantSummary
} from './types.js';

/**
 * Single variant dispatch entry point for the BFF.
 *
 * - In the multi-variant template repository, this file routes between
 *   `lightBackend` (`./light/`) and `standardBackend` (`./standard/`) based on
 *   `ARCHITECTURE_VARIANT`.
 * - When `bun run init --variant=light|standard` is executed, this file is
 *   rewritten to import ONLY the selected backend adapter and the unused
 *   variant directory is removed.
 */
export function getBackendAdapter(config: ServerConfig = getServerConfig()): BackendAdapter {
	return config.architectureVariant === 'standard' ? standardBackend : lightBackend;
}

export function getBackendAuthMode(config: ServerConfig = getServerConfig()): BackendAuthMode {
	return getBackendAdapter(config).authMode;
}

export function createAuthSessionStore(
	config: ServerConfig = getServerConfig()
): Promise<AuthSessionStore> {
	return getBackendAdapter(config).createAuthSessionStore(config);
}

export function getBackendHealth(config: ServerConfig = getServerConfig()): BackendHealthResponse {
	return getBackendAdapter(config).getHealth(config);
}

export function getLightDatastoreStatus(
	config: ServerConfig = getServerConfig()
): LightDatastoreStatus {
	return getBackendAdapter(config).getLightDatastoreStatus(config);
}

export function resolveOptionalActiveTenant(
	user: ApiCaller,
	preferredTenantId?: string | null,
	config: ServerConfig = getServerConfig()
): Promise<TenantSummary | null> {
	return getBackendAdapter(config).resolveOptionalActiveTenant(user, preferredTenantId, config);
}

export function formatBackendError(
	err: unknown,
	config: ServerConfig = getServerConfig()
): string {
	return getBackendAdapter(config).formatError(err, config);
}
