import { formatBackendError, getBackendAdapter } from './backend.js';
import { getServerConfig, type ServerConfig } from './env.js';
import {
	isValidEntityId,
	type ApiCaller,
	type TenantSummary,
	type TodoItem,
	type TodosLoadResult
} from './types.js';

export const ACTIVE_TENANT_COOKIE = 'active_tenant_id';

export type { ApiCaller, TenantSummary, TodoItem, TodosLoadResult };

export function isValidTodoId(id: string): boolean {
	return isValidEntityId(id);
}

export function formatTodosBackendError(
	err: unknown,
	config: ServerConfig = getServerConfig()
): string {
	return formatBackendError(err, config);
}

export async function loadUserTodos(
	user: ApiCaller | null,
	preferredTenantId?: string | null,
	config: ServerConfig = getServerConfig()
): Promise<TodosLoadResult> {
	return getBackendAdapter(config).loadTodos(user, preferredTenantId, config);
}

export async function createUserTodo(
	user: ApiCaller,
	title: string,
	preferredTenantId?: string | null,
	config: ServerConfig = getServerConfig()
): Promise<TodoItem> {
	return getBackendAdapter(config).createTodo(user, title, preferredTenantId, config);
}

export async function toggleUserTodo(
	user: ApiCaller,
	id: string,
	completed: boolean,
	preferredTenantId?: string | null,
	config: ServerConfig = getServerConfig()
): Promise<void> {
	return getBackendAdapter(config).toggleTodo(user, id, completed, preferredTenantId, config);
}

export async function updateUserTodoTitle(
	user: ApiCaller,
	id: string,
	title: string,
	preferredTenantId?: string | null,
	config: ServerConfig = getServerConfig()
): Promise<void> {
	return getBackendAdapter(config).updateTodoTitle(user, id, title, preferredTenantId, config);
}

export async function deleteUserTodo(
	user: ApiCaller,
	id: string,
	preferredTenantId?: string | null,
	config: ServerConfig = getServerConfig()
): Promise<void> {
	return getBackendAdapter(config).deleteTodo(user, id, preferredTenantId, config);
}

export async function verifyUserTenantSwitch(
	user: ApiCaller,
	tenantId: string,
	config: ServerConfig = getServerConfig()
): Promise<TenantSummary> {
	return getBackendAdapter(config).verifyTenantSwitch(user, tenantId, config);
}
