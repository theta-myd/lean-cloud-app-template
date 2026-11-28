import { Code, ConnectError } from '@connectrpc/connect';
import type { ServerConfig } from '../env.js';
import {
	UNCONFIGURED_LIGHT_DATASTORE,
	type ApiCaller,
	type BackendAdapter,
	type TenantSummary,
	type TodoItem,
	type TodosLoadResult
} from '../types.js';
import {
	ApiUnavailableError,
	createApiTodo,
	deleteApiTodo,
	getActiveTenant,
	listApiTodos,
	resolveActiveTenantContext,
	toggleApiTodo,
	updateApiTodo
} from './api-client.js';
import { createStandardAuthSessionStore } from './auth-db.js';

function isLocalApiUrl(url: string): boolean {
	return url.startsWith('http://localhost') || url.startsWith('http://127.0.0.1');
}

async function resolveMutationTenantId(
	user: ApiCaller,
	preferredTenantId: string | null | undefined,
	config: ServerConfig
): Promise<string> {
	const { activeTenant } = await resolveActiveTenantContext(user, preferredTenantId, config);
	return activeTenant.id;
}

/**
 * Standard architecture backend adapter (cloud-agnostic BFF -> Rust Connect RPC API -> PostgreSQL).
 *
 * Better Auth uses the dedicated `auth` schema pool (`auth-db.ts`). All business-domain
 * operations go exclusively through the internal Rust API (`api-client.ts`) — the BFF never
 * reads or writes business tables directly.
 *
 * This entire `standard/` directory (plus `src/lib/gen/`) is removed when initializing a Light
 * project via `bun run init --variant=light`.
 */
export const standardBackend: BackendAdapter = {
	variant: 'standard',
	authMode: 'postgres-db',

	createAuthSessionStore(config: ServerConfig) {
		return createStandardAuthSessionStore(config);
	},

	getHealth(config: ServerConfig) {
		return {
			status: 'ok',
			architecture: 'standard',
			api: config.apiConfigured ? 'configured' : 'unconfigured',
			authDb: config.authDatabaseConfigured ? 'configured' : 'unconfigured'
		};
	},

	getLightDatastoreStatus() {
		return UNCONFIGURED_LIGHT_DATASTORE;
	},

	async resolveOptionalActiveTenant(
		user: ApiCaller,
		preferredTenantId: string | null | undefined,
		config: ServerConfig
	): Promise<TenantSummary | null> {
		if (!config.apiConfigured) {
			return null;
		}
		try {
			const context = await resolveActiveTenantContext(user, preferredTenantId, config);
			return context.activeTenant;
		} catch {
			// Allow shell layout to render even if the backend API is temporarily unavailable.
			return null;
		}
	},

	async loadTodos(
		user: ApiCaller | null,
		preferredTenantId: string | null | undefined,
		config: ServerConfig
	): Promise<TodosLoadResult> {
		if (!config.apiConfigured || !user) {
			return {
				architecture: 'standard',
				firestore: UNCONFIGURED_LIGHT_DATASTORE,
				apiConfigured: config.apiConfigured,
				activeTenant: null,
				tenants: [],
				todos: [],
				connectionError: null
			};
		}

		try {
			const { activeTenant, tenants } = await resolveActiveTenantContext(
				user,
				preferredTenantId,
				config
			);
			const todos = await listApiTodos(user, activeTenant.id, 50, config);
			return {
				architecture: 'standard',
				firestore: UNCONFIGURED_LIGHT_DATASTORE,
				apiConfigured: true,
				activeTenant,
				tenants,
				todos,
				connectionError: null
			};
		} catch (err) {
			return {
				architecture: 'standard',
				firestore: UNCONFIGURED_LIGHT_DATASTORE,
				apiConfigured: config.apiConfigured,
				activeTenant: null,
				tenants: [],
				todos: [],
				connectionError: standardBackend.formatError(err, config)
			};
		}
	},

	async createTodo(
		user: ApiCaller,
		title: string,
		preferredTenantId: string | null | undefined,
		config: ServerConfig
	): Promise<TodoItem> {
		const tenantId = await resolveMutationTenantId(user, preferredTenantId, config);
		return createApiTodo(user, tenantId, title, config);
	},

	async toggleTodo(
		user: ApiCaller,
		id: string,
		completed: boolean,
		preferredTenantId: string | null | undefined,
		config: ServerConfig
	): Promise<void> {
		const tenantId = await resolveMutationTenantId(user, preferredTenantId, config);
		await toggleApiTodo(user, tenantId, id, completed, config);
	},

	async updateTodoTitle(
		user: ApiCaller,
		id: string,
		title: string,
		preferredTenantId: string | null | undefined,
		config: ServerConfig
	): Promise<void> {
		const tenantId = await resolveMutationTenantId(user, preferredTenantId, config);
		await updateApiTodo(user, tenantId, id, title, config);
	},

	async deleteTodo(
		user: ApiCaller,
		id: string,
		preferredTenantId: string | null | undefined,
		config: ServerConfig
	): Promise<void> {
		const tenantId = await resolveMutationTenantId(user, preferredTenantId, config);
		await deleteApiTodo(user, tenantId, id, config);
	},

	async verifyTenantSwitch(
		user: ApiCaller,
		tenantId: string,
		config: ServerConfig
	): Promise<TenantSummary> {
		return getActiveTenant(user, tenantId, config);
	},

	formatError(err: unknown, config: ServerConfig): string {
		if (err instanceof ApiUnavailableError) {
			return err.message;
		}
		if (err instanceof ConnectError && err.code === Code.PermissionDenied) {
			return 'You do not have permission to access the selected tenant.';
		}
		const detail = err instanceof Error ? err.message : String(err);
		if (isLocalApiUrl(config.apiBaseUrl)) {
			return `Could not reach the Standard Connect RPC API at ${config.apiBaseUrl}. Start PostgreSQL with "docker compose --profile standard up -d postgres" and run the Rust API server. (${detail})`;
		}
		console.error('[api] request failed:', err);
		return 'API request failed. Please try again later.';
	}
};
