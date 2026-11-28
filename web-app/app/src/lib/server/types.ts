import type { BetterAuthOptions } from 'better-auth';
import type { ArchitectureVariant, ServerConfig } from './env.js';

export type BackendAuthMode = 'stateless' | 'postgres-db';

export interface AuthSessionStore {
	authMode: BackendAuthMode;
	database?: BetterAuthOptions['database'];
	cookieCacheEnabled: boolean;
	close?: () => Promise<void>;
}

export interface LightDatastoreStatus {
	mode: 'emulator' | 'cloud' | 'unconfigured';
	projectId: string;
	emulatorHost: string | null;
}

export const UNCONFIGURED_LIGHT_DATASTORE: LightDatastoreStatus = {
	mode: 'unconfigured',
	projectId: 'not-set',
	emulatorHost: null
};

export interface ApiCaller {
	id: string;
	email: string;
	name?: string | null;
}

export interface TenantSummary {
	id: string;
	name: string;
	slug: string;
	role: 'owner' | 'admin' | 'member' | 'unspecified';
	isPersonal: boolean;
	createdAt: string;
}

export interface ActiveTenantContext {
	activeTenant: TenantSummary;
	tenants: TenantSummary[];
}

export interface TodoItem {
	id: string;
	title: string;
	completed: boolean;
	createdAt: string;
	updatedAt: string;
	tenantId?: string;
	createdByUserId?: string;
}

export interface TodosLoadResult {
	architecture: ArchitectureVariant;
	firestore: LightDatastoreStatus;
	apiConfigured: boolean;
	activeTenant: TenantSummary | null;
	tenants: TenantSummary[];
	todos: TodoItem[];
	connectionError: string | null;
}

export type BackendHealthResponse =
	| {
			status: 'ok';
			architecture: 'light';
			firestore: LightDatastoreStatus['mode'];
	  }
	| {
			status: 'ok';
			architecture: 'standard';
			api: 'configured' | 'unconfigured';
			authDb: 'configured' | 'unconfigured';
	  };

export interface BackendAdapter {
	readonly variant: ArchitectureVariant;
	readonly authMode: BackendAuthMode;
	createAuthSessionStore(config: ServerConfig): Promise<AuthSessionStore>;
	getHealth(config: ServerConfig): BackendHealthResponse;
	getLightDatastoreStatus(config: ServerConfig): LightDatastoreStatus;
	resolveOptionalActiveTenant(
		user: ApiCaller,
		preferredTenantId: string | null | undefined,
		config: ServerConfig
	): Promise<TenantSummary | null>;
	loadTodos(
		user: ApiCaller | null,
		preferredTenantId: string | null | undefined,
		config: ServerConfig
	): Promise<TodosLoadResult>;
	createTodo(
		user: ApiCaller,
		title: string,
		preferredTenantId: string | null | undefined,
		config: ServerConfig
	): Promise<TodoItem>;
	toggleTodo(
		user: ApiCaller,
		id: string,
		completed: boolean,
		preferredTenantId: string | null | undefined,
		config: ServerConfig
	): Promise<void>;
	updateTodoTitle(
		user: ApiCaller,
		id: string,
		title: string,
		preferredTenantId: string | null | undefined,
		config: ServerConfig
	): Promise<void>;
	deleteTodo(
		user: ApiCaller,
		id: string,
		preferredTenantId: string | null | undefined,
		config: ServerConfig
	): Promise<void>;
	verifyTenantSwitch(
		user: ApiCaller,
		tenantId: string,
		config: ServerConfig
	): Promise<TenantSummary>;
	formatError(err: unknown, config: ServerConfig): string;
}

const ENTITY_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;

export function isValidEntityId(id: string): boolean {
	if (!ENTITY_ID_PATTERN.test(id)) {
		return false;
	}
	return !(id.startsWith('__') && id.endsWith('__'));
}
