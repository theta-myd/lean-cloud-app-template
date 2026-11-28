import { Code, ConnectError } from '@connectrpc/connect';
import {
	ApiUnavailableError,
	createApiTodo,
	deleteApiTodo,
	getActiveTenant,
	listApiTodos,
	resolveActiveTenantContext,
	toggleApiTodo,
	updateApiTodo,
	type ApiCaller,
	type TenantSummary
} from './api-client.js';
import { getServerConfig, type ArchitectureVariant, type ServerConfig } from './env.js';
import {
	FirestoreUnavailableError,
	createTodo as createFirestoreTodo,
	deleteTodo as deleteFirestoreTodo,
	getFirestoreStatus,
	isValidFirestoreDocId,
	listTodos as listFirestoreTodos,
	toggleTodo as toggleFirestoreTodo,
	updateTodoTitle as updateFirestoreTodoTitle,
	type FirestoreStatus,
	type TodoItem as FirestoreTodoItem
} from './firestore.js';

export const ACTIVE_TENANT_COOKIE = 'active_tenant_id';

export interface TodoItem extends FirestoreTodoItem {
	tenantId?: string;
	createdByUserId?: string;
}

export interface TodosLoadResult {
	architecture: ArchitectureVariant;
	firestore: FirestoreStatus;
	apiConfigured: boolean;
	activeTenant: TenantSummary | null;
	tenants: TenantSummary[];
	todos: TodoItem[];
	connectionError: string | null;
}

export function isValidTodoId(id: string): boolean {
	return isValidFirestoreDocId(id);
}

function isLocalApiUrl(url: string): boolean {
	return url.startsWith('http://localhost') || url.startsWith('http://127.0.0.1');
}

export function formatTodosBackendError(
	err: unknown,
	config: ServerConfig = getServerConfig(),
	firestoreMode: FirestoreStatus['mode'] = 'unconfigured'
): string {
	if (config.architectureVariant === 'standard') {
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

	if (err instanceof FirestoreUnavailableError) {
		return err.message;
	}
	const detail = err instanceof Error ? err.message : String(err);
	if (firestoreMode === 'emulator') {
		return `Could not reach the Firestore Emulator. Start it with "docker compose up -d" or "wslc run -d --rm --name firestore-emulator -p 8080:8080 gcr.io/google.com/cloudsdktool/google-cloud-cli:emulators gcloud emulators firestore start --host-port=0.0.0.0:8080". (${detail})`;
	}
	console.error('[firestore] request failed:', err);
	return 'Firestore request failed. Please try again later.';
}

async function resolveMutationTenantId(
	user: ApiCaller,
	preferredTenantId: string | null | undefined,
	config: ServerConfig
): Promise<string> {
	const { activeTenant } = await resolveActiveTenantContext(user, preferredTenantId, config);
	return activeTenant.id;
}

export async function loadUserTodos(
	user: ApiCaller | null,
	preferredTenantId?: string | null,
	config: ServerConfig = getServerConfig()
): Promise<TodosLoadResult> {
	const architecture = config.architectureVariant ?? 'light';

	if (architecture === 'standard') {
		const firestore: FirestoreStatus = {
			mode: 'unconfigured',
			projectId: 'not-set',
			emulatorHost: null
		};
		if (!config.apiConfigured || !user) {
			return {
				architecture: 'standard',
				firestore,
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
				firestore,
				apiConfigured: true,
				activeTenant,
				tenants,
				todos,
				connectionError: null
			};
		} catch (err) {
			return {
				architecture: 'standard',
				firestore,
				apiConfigured: config.apiConfigured,
				activeTenant: null,
				tenants: [],
				todos: [],
				connectionError: formatTodosBackendError(err, config)
			};
		}
	}

	const firestore = getFirestoreStatus();
	if (firestore.mode === 'unconfigured' || !user) {
		return {
			architecture: 'light',
			firestore,
			apiConfigured: false,
			activeTenant: null,
			tenants: [],
			todos: [],
			connectionError: null
		};
	}

	try {
		const todos = await listFirestoreTodos(user.id);
		return {
			architecture: 'light',
			firestore,
			apiConfigured: false,
			activeTenant: null,
			tenants: [],
			todos,
			connectionError: null
		};
	} catch (err) {
		return {
			architecture: 'light',
			firestore,
			apiConfigured: false,
			activeTenant: null,
			tenants: [],
			todos: [],
			connectionError: formatTodosBackendError(err, config, firestore.mode)
		};
	}
}

export async function createUserTodo(
	user: ApiCaller,
	title: string,
	preferredTenantId?: string | null,
	config: ServerConfig = getServerConfig()
): Promise<TodoItem> {
	if (config.architectureVariant === 'standard') {
		const tenantId = await resolveMutationTenantId(user, preferredTenantId, config);
		return createApiTodo(user, tenantId, title, config);
	}
	return createFirestoreTodo(user.id, title);
}

export async function toggleUserTodo(
	user: ApiCaller,
	id: string,
	completed: boolean,
	preferredTenantId?: string | null,
	config: ServerConfig = getServerConfig()
): Promise<void> {
	if (config.architectureVariant === 'standard') {
		const tenantId = await resolveMutationTenantId(user, preferredTenantId, config);
		await toggleApiTodo(user, tenantId, id, completed, config);
		return;
	}
	await toggleFirestoreTodo(user.id, id, completed);
}

export async function updateUserTodoTitle(
	user: ApiCaller,
	id: string,
	title: string,
	preferredTenantId?: string | null,
	config: ServerConfig = getServerConfig()
): Promise<void> {
	if (config.architectureVariant === 'standard') {
		const tenantId = await resolveMutationTenantId(user, preferredTenantId, config);
		await updateApiTodo(user, tenantId, id, title, config);
		return;
	}
	await updateFirestoreTodoTitle(user.id, id, title);
}

export async function deleteUserTodo(
	user: ApiCaller,
	id: string,
	preferredTenantId?: string | null,
	config: ServerConfig = getServerConfig()
): Promise<void> {
	if (config.architectureVariant === 'standard') {
		const tenantId = await resolveMutationTenantId(user, preferredTenantId, config);
		await deleteApiTodo(user, tenantId, id, config);
		return;
	}
	await deleteFirestoreTodo(user.id, id);
}

export async function verifyUserTenantSwitch(
	user: ApiCaller,
	tenantId: string,
	config: ServerConfig = getServerConfig()
): Promise<TenantSummary> {
	return getActiveTenant(user, tenantId, config);
}
