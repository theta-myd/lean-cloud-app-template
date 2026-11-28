import type { ServerConfig } from '../env.js';
import type { ApiCaller, BackendAdapter, TodoItem, TodosLoadResult } from '../types.js';
import {
	FirestoreUnavailableError,
	createTodo as createFirestoreTodo,
	deleteTodo as deleteFirestoreTodo,
	getFirestoreStatus,
	listTodos as listFirestoreTodos,
	toggleTodo as toggleFirestoreTodo,
	updateTodoTitle as updateFirestoreTodoTitle
} from './gcp/firestore.js';

/**
 * Light architecture backend adapter (Google Cloud: Stateless JWE Cookie + Cloud Firestore).
 *
 * Cloud-specific Light implementations live under `src/lib/server/light/<cloud>/`
 * (e.g., `gcp/firestore.ts` today; future `aws/` for Aurora DSQL + DB-backed sessions).
 * This entire `light/` directory is removed when initializing a Standard project via
 * `bun run init --variant=standard`.
 */
export const lightBackend: BackendAdapter = {
	variant: 'light',
	authMode: 'stateless',

	async createAuthSessionStore() {
		return {
			authMode: 'stateless',
			cookieCacheEnabled: true
		};
	},

	getHealth(config: ServerConfig) {
		return {
			status: 'ok',
			architecture: 'light',
			firestore: getFirestoreStatus(config).mode
		};
	},

	getLightDatastoreStatus(config: ServerConfig) {
		return getFirestoreStatus(config);
	},

	async resolveOptionalActiveTenant() {
		return null;
	},

	async loadTodos(
		user: ApiCaller | null,
		_preferredTenantId: string | null | undefined,
		config: ServerConfig
	): Promise<TodosLoadResult> {
		const firestore = getFirestoreStatus(config);
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
			const todos = await listFirestoreTodos(user.id, config);
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
				connectionError: lightBackend.formatError(err, config)
			};
		}
	},

	async createTodo(
		user: ApiCaller,
		title: string,
		_preferredTenantId: string | null | undefined,
		config: ServerConfig
	): Promise<TodoItem> {
		return createFirestoreTodo(user.id, title, config);
	},

	async toggleTodo(
		user: ApiCaller,
		id: string,
		completed: boolean,
		_preferredTenantId: string | null | undefined,
		config: ServerConfig
	): Promise<void> {
		await toggleFirestoreTodo(user.id, id, completed, config);
	},

	async updateTodoTitle(
		user: ApiCaller,
		id: string,
		title: string,
		_preferredTenantId: string | null | undefined,
		config: ServerConfig
	): Promise<void> {
		await updateFirestoreTodoTitle(user.id, id, title, config);
	},

	async deleteTodo(
		user: ApiCaller,
		id: string,
		_preferredTenantId: string | null | undefined,
		config: ServerConfig
	): Promise<void> {
		await deleteFirestoreTodo(user.id, id, config);
	},

	async verifyTenantSwitch() {
		throw new Error('Tenant switching is only available in Standard architecture mode.');
	},

	formatError(err: unknown, config: ServerConfig): string {
		if (err instanceof FirestoreUnavailableError) {
			return err.message;
		}
		const detail = err instanceof Error ? err.message : String(err);
		const firestoreMode = getFirestoreStatus(config).mode;
		if (firestoreMode === 'emulator') {
			return `Could not reach the Firestore Emulator. Start it with "docker compose up -d" or "wslc run -d --rm --name firestore-emulator -p 8080:8080 gcr.io/google.com/cloudsdktool/google-cloud-cli:emulators gcloud emulators firestore start --host-port=0.0.0.0:8080". (${detail})`;
		}
		console.error('[firestore] request failed:', err);
		return 'Firestore request failed. Please try again later.';
	}
};
