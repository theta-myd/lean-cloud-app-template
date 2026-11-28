import { timestampDate, type Timestamp } from '@bufbuild/protobuf/wkt';
import { Code, ConnectError, createClient, type Interceptor } from '@connectrpc/connect';
import { createConnectTransport } from '@connectrpc/connect-web';
import { TenantRole, TenantService, type Tenant } from '#lib/gen/tenant/v1/tenant_pb.js';
import { TodoService, type Todo } from '#lib/gen/todo/v1/todo_pb.js';
import { getServerConfig, type ServerConfig } from '../env.js';
import type { ActiveTenantContext, ApiCaller, TenantSummary } from '../types.js';
import { getGcpIdToken } from './gcp-id-token.js';
import { signInternalUserToken } from './internal-jwt.js';

export type { ActiveTenantContext, ApiCaller, TenantSummary } from '../types.js';

export interface StandardTodoItem {
	id: string;
	tenantId: string;
	createdByUserId: string;
	title: string;
	completed: boolean;
	createdAt: string;
	updatedAt: string;
}

export class ApiUnavailableError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'ApiUnavailableError';
	}
}

function formatTimestamp(ts: Timestamp | undefined): string {
	if (!ts) return '';
	return timestampDate(ts).toISOString();
}

function formatTenantRole(role: TenantRole): TenantSummary['role'] {
	switch (role) {
		case TenantRole.OWNER:
			return 'owner';
		case TenantRole.ADMIN:
			return 'admin';
		case TenantRole.MEMBER:
			return 'member';
		default:
			return 'unspecified';
	}
}

function mapTenant(tenant: Tenant): TenantSummary {
	return {
		id: tenant.id,
		name: tenant.name,
		slug: tenant.slug,
		role: formatTenantRole(tenant.role),
		isPersonal: tenant.isPersonal,
		createdAt: formatTimestamp(tenant.createdAt)
	};
}

function mapTodo(todo: Todo): StandardTodoItem {
	return {
		id: todo.id,
		tenantId: todo.tenantId,
		createdByUserId: todo.createdByUserId,
		title: todo.title,
		completed: todo.completed,
		createdAt: formatTimestamp(todo.createdAt),
		updatedAt: formatTimestamp(todo.updatedAt)
	};
}

function requireApiConfig(config: ServerConfig): ServerConfig {
	if (!config.apiConfigured) {
		throw new ApiUnavailableError(
			'Standard Connect RPC API is not configured. Set API_BASE_URL (e.g. http://localhost:8081) in .env.'
		);
	}
	return config;
}

export function createApiAuthInterceptor(
	caller: ApiCaller,
	tenantId: string | null | undefined,
	config: ServerConfig
): Interceptor {
	return (next) => async (req) => {
		const userToken = signInternalUserToken({
			user: caller,
			tenantId: tenantId ?? undefined,
			secret: config.internalApiJwtSecret
		});
		req.header.set('x-app-user-token', userToken);

		const audience =
			config.apiAudience || (config.apiBaseUrl.startsWith('https://') ? config.apiBaseUrl : '');
		const idToken = await getGcpIdToken(audience);
		if (idToken) {
			req.header.set('Authorization', `Bearer ${idToken}`);
		}

		return next(req);
	};
}

export function createApiClients(
	caller: ApiCaller,
	tenantId?: string | null,
	config: ServerConfig = getServerConfig()
) {
	const validated = requireApiConfig(config);
	const transport = createConnectTransport({
		baseUrl: validated.apiBaseUrl,
		useBinaryFormat: false,
		interceptors: [createApiAuthInterceptor(caller, tenantId, validated)]
	});

	return {
		tenant: createClient(TenantService, transport),
		todo: createClient(TodoService, transport)
	};
}

export async function ensurePersonalTenant(
	caller: ApiCaller,
	displayName?: string,
	config: ServerConfig = getServerConfig()
): Promise<{ tenant: TenantSummary; created: boolean }> {
	const { tenant } = createApiClients(caller, null, config);
	const response = await tenant.ensurePersonalTenant({
		displayName: displayName?.trim() || caller.name?.trim() || ''
	});
	if (!response.tenant) {
		throw new ApiUnavailableError('API did not return a personal tenant.');
	}
	return {
		tenant: mapTenant(response.tenant),
		created: response.created
	};
}

export async function listTenants(
	caller: ApiCaller,
	config: ServerConfig = getServerConfig()
): Promise<TenantSummary[]> {
	const { tenant } = createApiClients(caller, null, config);
	const response = await tenant.listTenants({});
	return response.tenants.map(mapTenant);
}

export async function getActiveTenant(
	caller: ApiCaller,
	preferredTenantId?: string | null,
	config: ServerConfig = getServerConfig()
): Promise<TenantSummary> {
	const tenantId = preferredTenantId?.trim() || '';
	const { tenant } = createApiClients(caller, tenantId || null, config);
	const response = await tenant.getActiveTenant({ tenantId });
	if (!response.tenant) {
		throw new ApiUnavailableError('API did not return an active tenant.');
	}
	return mapTenant(response.tenant);
}

export async function resolveActiveTenantContext(
	caller: ApiCaller,
	preferredTenantId?: string | null,
	config: ServerConfig = getServerConfig()
): Promise<ActiveTenantContext> {
	const trimmedPreferred = preferredTenantId?.trim() || '';
	let activeTenant: TenantSummary;

	if (trimmedPreferred) {
		try {
			activeTenant = await getActiveTenant(caller, trimmedPreferred, config);
		} catch (err) {
			if (
				err instanceof ConnectError &&
				(err.code === Code.NotFound ||
					err.code === Code.PermissionDenied ||
					err.code === Code.InvalidArgument)
			) {
				const ensured = await ensurePersonalTenant(caller, caller.name ?? undefined, config);
				activeTenant = ensured.tenant;
			} else {
				throw err;
			}
		}
	} else {
		const ensured = await ensurePersonalTenant(caller, caller.name ?? undefined, config);
		activeTenant = ensured.tenant;
	}

	const tenants = await listTenants(caller, config);
	const mergedTenants =
		tenants.length > 0 && tenants.some((t) => t.id === activeTenant.id)
			? tenants
			: [activeTenant, ...tenants.filter((t) => t.id !== activeTenant.id)];

	return {
		activeTenant,
		tenants: mergedTenants
	};
}

export async function listApiTodos(
	caller: ApiCaller,
	tenantId: string,
	pageSize = 50,
	config: ServerConfig = getServerConfig()
): Promise<StandardTodoItem[]> {
	const { todo } = createApiClients(caller, tenantId, config);
	const response = await todo.listTodos({ tenantId, pageSize });
	return response.todos.map(mapTodo);
}

export async function createApiTodo(
	caller: ApiCaller,
	tenantId: string,
	title: string,
	config: ServerConfig = getServerConfig()
): Promise<StandardTodoItem> {
	const { todo } = createApiClients(caller, tenantId, config);
	const response = await todo.createTodo({ tenantId, title });
	if (!response.todo) {
		throw new ApiUnavailableError('API did not return the created task.');
	}
	return mapTodo(response.todo);
}

export async function updateApiTodo(
	caller: ApiCaller,
	tenantId: string,
	id: string,
	title: string,
	config: ServerConfig = getServerConfig()
): Promise<StandardTodoItem> {
	const { todo } = createApiClients(caller, tenantId, config);
	const response = await todo.updateTodo({ tenantId, id, title });
	if (!response.todo) {
		throw new ApiUnavailableError('API did not return the updated task.');
	}
	return mapTodo(response.todo);
}

export async function toggleApiTodo(
	caller: ApiCaller,
	tenantId: string,
	id: string,
	completed: boolean,
	config: ServerConfig = getServerConfig()
): Promise<StandardTodoItem> {
	const { todo } = createApiClients(caller, tenantId, config);
	const response = await todo.toggleTodo({ tenantId, id, completed });
	if (!response.todo) {
		throw new ApiUnavailableError('API did not return the updated task.');
	}
	return mapTodo(response.todo);
}

export async function deleteApiTodo(
	caller: ApiCaller,
	tenantId: string,
	id: string,
	config: ServerConfig = getServerConfig()
): Promise<void> {
	const { todo } = createApiClients(caller, tenantId, config);
	await todo.deleteTodo({ tenantId, id });
}
