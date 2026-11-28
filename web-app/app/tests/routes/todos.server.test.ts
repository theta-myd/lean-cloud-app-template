import { isActionFailure } from '@sveltejs/kit';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ServerConfig } from '#lib/server/env.js';

const {
	MockFirestoreUnavailableError,
	MockApiUnavailableError,
	getServerConfigMock,
	getFirestoreStatusMock,
	listTodosMock,
	createTodoMock,
	toggleTodoMock,
	updateTodoTitleMock,
	deleteTodoMock,
	resolveActiveTenantContextMock,
	getActiveTenantMock,
	listApiTodosMock,
	createApiTodoMock,
	toggleApiTodoMock,
	updateApiTodoMock,
	deleteApiTodoMock
} = vi.hoisted(() => {
	class MockFirestoreUnavailableError extends Error {
		constructor(message: string) {
			super(message);
			this.name = 'FirestoreUnavailableError';
		}
	}
	class MockApiUnavailableError extends Error {
		constructor(message: string) {
			super(message);
			this.name = 'ApiUnavailableError';
		}
	}
	return {
		MockFirestoreUnavailableError,
		MockApiUnavailableError,
		getServerConfigMock: vi.fn<() => ServerConfig>(),
		getFirestoreStatusMock: vi.fn(),
		listTodosMock: vi.fn(),
		createTodoMock: vi.fn(),
		toggleTodoMock: vi.fn(),
		updateTodoTitleMock: vi.fn(),
		deleteTodoMock: vi.fn(),
		resolveActiveTenantContextMock: vi.fn(),
		getActiveTenantMock: vi.fn(),
		listApiTodosMock: vi.fn(),
		createApiTodoMock: vi.fn(),
		toggleApiTodoMock: vi.fn(),
		updateApiTodoMock: vi.fn(),
		deleteApiTodoMock: vi.fn()
	};
});

vi.mock('#lib/server/env.js', () => ({
	getServerConfig: getServerConfigMock
}));

vi.mock('#lib/server/firestore.js', () => ({
	FirestoreUnavailableError: MockFirestoreUnavailableError,
	getFirestoreStatus: getFirestoreStatusMock,
	isValidFirestoreDocId: (id: string) =>
		/^[A-Za-z0-9_-]{1,128}$/.test(id) && !(id.startsWith('__') && id.endsWith('__')),
	listTodos: listTodosMock,
	createTodo: createTodoMock,
	toggleTodo: toggleTodoMock,
	updateTodoTitle: updateTodoTitleMock,
	deleteTodo: deleteTodoMock
}));

vi.mock('#lib/server/api-client.js', () => ({
	ApiUnavailableError: MockApiUnavailableError,
	resolveActiveTenantContext: resolveActiveTenantContextMock,
	getActiveTenant: getActiveTenantMock,
	listApiTodos: listApiTodosMock,
	createApiTodo: createApiTodoMock,
	toggleApiTodo: toggleApiTodoMock,
	updateApiTodo: updateApiTodoMock,
	deleteApiTodo: deleteApiTodoMock
}));

import { actions, load } from '../../src/routes/(app)/todos/+page.server.js';

function makeConfig(overrides: Partial<ServerConfig> = {}): ServerConfig {
	return {
		architectureVariant: 'light',
		appUrl: 'http://localhost:5173',
		betterAuthUrl: 'http://localhost:5173',
		betterAuthSecret: 'unit-test-only-better-auth-secret-32b',
		betterAuthSecretConfigured: true,
		googleClientId: '',
		googleClientSecret: '',
		googleOAuthConfigured: false,
		authAccessMode: 'allowlist',
		allowedEmails: [],
		allowedDomains: [],
		enableE2ePasswordAuth: false,
		e2eTestEmail: 'e2e@example.com',
		e2eTestPassword: '',
		googleCloudProject: 'lean-cloud-app-local',
		firestoreEmulatorHost: 'localhost:8080',
		authDatabaseUrl: '',
		authDatabaseConfigured: false,
		apiBaseUrl: '',
		apiConfigured: false,
		apiAudience: '',
		internalApiJwtSecret: 'unit-test-only-internal-jwt-secret-32b',
		internalApiJwtSecretConfigured: true,
		...overrides
	};
}

function makeActionEvent(
	formEntries: Record<string, string>,
	userId: string | null = 'user-1',
	cookieValues: Record<string, string> = {}
) {
	const formData = new FormData();
	for (const [k, v] of Object.entries(formEntries)) {
		formData.set(k, v);
	}
	const setMock = vi.fn();
	return {
		request: {
			formData: async () => formData
		},
		cookies: {
			get: (name: string) => cookieValues[name],
			set: setMock
		},
		locals: {
			user: userId ? { id: userId, email: 'user@example.com', name: 'Test User' } : null,
			session: null,
			authMode: 'stateless' as const,
			isAuthorized: Boolean(userId)
		},
		setMock
	};
}

describe('todos +page.server.ts', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		getServerConfigMock.mockReturnValue(makeConfig());
		getFirestoreStatusMock.mockReturnValue({
			mode: 'emulator',
			projectId: 'lean-cloud-app-local',
			emulatorHost: 'localhost:8080'
		});
	});

	it('skips loading when firestore is unconfigured or user is missing', async () => {
		getFirestoreStatusMock.mockReturnValue({
			mode: 'unconfigured',
			projectId: 'not-set',
			emulatorHost: null
		});
		const res = await load({
			locals: { user: { id: 'u1', email: 'u1@example.com' } }
		} as unknown as Parameters<typeof load>[0]);
		expect(res).toEqual({
			architecture: 'light',
			firestore: { mode: 'unconfigured', projectId: 'not-set', emulatorHost: null },
			apiConfigured: false,
			activeTenant: null,
			tenants: [],
			todos: [],
			connectionError: null
		});
		expect(listTodosMock).not.toHaveBeenCalled();
	});

	it('loads todos and formats emulator connection errors in Light mode', async () => {
		const todos = [
			{ id: 't1', title: 'Write tests', completed: false, createdAt: 'now', updatedAt: 'now' }
		];
		listTodosMock.mockResolvedValueOnce(todos);

		const okResult = await load({
			locals: { user: { id: 'user-1', email: 'user@example.com' } }
		} as unknown as Parameters<typeof load>[0]);
		expect(okResult).toMatchObject({ architecture: 'light', todos, connectionError: null });

		listTodosMock.mockRejectedValueOnce(new Error('ECONNREFUSED'));
		const errResult = (await load({
			locals: { user: { id: 'user-1', email: 'user@example.com' } }
		} as unknown as Parameters<typeof load>[0])) as {
			todos: unknown[];
			connectionError: string | null;
		};
		expect(errResult.todos).toEqual([]);
		expect(errResult.connectionError).toContain('Could not reach the Firestore Emulator.');
		expect(errResult.connectionError).toContain('ECONNREFUSED');
	});

	it('validates create action and delegates to createTodo in Light mode', async () => {
		const unauth = await actions.create(
			makeActionEvent({ title: 'Hello' }, null) as unknown as Parameters<typeof actions.create>[0]
		);
		expect(isActionFailure(unauth) && unauth.status).toBe(401);

		const empty = await actions.create(
			makeActionEvent({ title: '   ' }) as unknown as Parameters<typeof actions.create>[0]
		);
		expect(isActionFailure(empty) && empty.status).toBe(400);

		const tooLong = await actions.create(
			makeActionEvent({ title: 'x'.repeat(201) }) as unknown as Parameters<typeof actions.create>[0]
		);
		expect(isActionFailure(tooLong) && tooLong.status).toBe(400);

		createTodoMock.mockResolvedValueOnce({ id: 't1' });
		const ok = await actions.create(
			makeActionEvent({ title: '  Buy milk  ' }) as unknown as Parameters<typeof actions.create>[0]
		);
		expect(ok).toEqual({ action: 'create', ok: true });
		expect(createTodoMock).toHaveBeenCalledWith('user-1', 'Buy milk');

		createTodoMock.mockRejectedValueOnce(new MockFirestoreUnavailableError('Not configured'));
		const failed = await actions.create(
			makeActionEvent({ title: 'Test' }) as unknown as Parameters<typeof actions.create>[0]
		);
		expect(isActionFailure(failed) && failed.status).toBe(503);
	});

	it('handles toggle, update, and delete actions in Light mode', async () => {
		toggleTodoMock.mockResolvedValueOnce(undefined);
		const toggleOk = await actions.toggle(
			makeActionEvent({ id: 't1', completed: 'true' }) as unknown as Parameters<
				typeof actions.toggle
			>[0]
		);
		expect(toggleOk).toEqual({ action: 'toggle', ok: true });
		expect(toggleTodoMock).toHaveBeenCalledWith('user-1', 't1', true);

		const updateMissing = await actions.update(
			makeActionEvent({ id: 't1', title: '' }) as unknown as Parameters<typeof actions.update>[0]
		);
		expect(isActionFailure(updateMissing) && updateMissing.status).toBe(400);

		updateTodoTitleMock.mockResolvedValueOnce(undefined);
		const updateOk = await actions.update(
			makeActionEvent({ id: 't1', title: 'Updated' }) as unknown as Parameters<
				typeof actions.update
			>[0]
		);
		expect(updateOk).toEqual({ action: 'update', ok: true });
		expect(updateTodoTitleMock).toHaveBeenCalledWith('user-1', 't1', 'Updated');

		const deleteMissing = await actions.delete(
			makeActionEvent({ id: '' }) as unknown as Parameters<typeof actions.delete>[0]
		);
		expect(isActionFailure(deleteMissing) && deleteMissing.status).toBe(400);

		deleteTodoMock.mockResolvedValueOnce(undefined);
		const deleteOk = await actions.delete(
			makeActionEvent({ id: 't1' }) as unknown as Parameters<typeof actions.delete>[0]
		);
		expect(deleteOk).toEqual({ action: 'delete', ok: true });
		expect(deleteTodoMock).toHaveBeenCalledWith('user-1', 't1');
	});

	it('rejects path-traversal task IDs and sanitizes cloud-mode errors', async () => {
		const badToggle = await actions.toggle(
			makeActionEvent({ id: '../other-user/todos/t1', completed: 'true' }) as unknown as Parameters<
				typeof actions.toggle
			>[0]
		);
		expect(isActionFailure(badToggle) && badToggle.status).toBe(400);
		expect(toggleTodoMock).not.toHaveBeenCalled();

		const badDelete = await actions.delete(
			makeActionEvent({ id: 'a/b' }) as unknown as Parameters<typeof actions.delete>[0]
		);
		expect(isActionFailure(badDelete) && badDelete.status).toBe(400);
		expect(deleteTodoMock).not.toHaveBeenCalled();

		getFirestoreStatusMock.mockReturnValue({
			mode: 'cloud',
			projectId: 'my-prod-project',
			emulatorHost: null
		});
		const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
		listTodosMock.mockRejectedValueOnce(new Error('PERMISSION_DENIED internal token detail'));

		const errResult = (await load({
			locals: { user: { id: 'user-1', email: 'user@example.com' } }
		} as unknown as Parameters<typeof load>[0])) as {
			connectionError: string | null;
		};
		expect(errResult.connectionError).toBe('Firestore request failed. Please try again later.');
		expect(errResult.connectionError).not.toContain('PERMISSION_DENIED');
		consoleSpy.mockRestore();
	});

	it('loads and mutates todos via Connect RPC and switches tenant in Standard mode', async () => {
		const standardConfig = makeConfig({
			architectureVariant: 'standard',
			apiBaseUrl: 'http://localhost:8081',
			apiConfigured: true
		});
		getServerConfigMock.mockReturnValue(standardConfig);

		const tenant = {
			id: '11111111-1111-1111-1111-111111111111',
			name: 'Personal',
			slug: 'personal',
			role: 'owner' as const,
			isPersonal: true,
			createdAt: '2026-01-01T00:00:00.000Z'
		};
		const todos = [
			{
				id: '22222222-2222-2222-2222-222222222222',
				tenantId: tenant.id,
				createdByUserId: 'user-1',
				title: 'Standard task',
				completed: false,
				createdAt: '2026-01-01T00:00:00.000Z',
				updatedAt: '2026-01-01T00:00:00.000Z'
			}
		];

		resolveActiveTenantContextMock.mockResolvedValue({ activeTenant: tenant, tenants: [tenant] });
		listApiTodosMock.mockResolvedValueOnce(todos);

		const loaded = await load({
			locals: { user: { id: 'user-1', email: 'user@example.com', name: 'Test User' } },
			cookies: { get: () => tenant.id }
		} as unknown as Parameters<typeof load>[0]);

		expect(loaded).toMatchObject({
			architecture: 'standard',
			apiConfigured: true,
			activeTenant: tenant,
			tenants: [tenant],
			todos,
			connectionError: null
		});
		expect(listTodosMock).not.toHaveBeenCalled();

		createApiTodoMock.mockResolvedValueOnce(todos[0]);
		const createEvt = makeActionEvent(
			{ title: 'New Standard Task' },
			'user-1',
			{ active_tenant_id: tenant.id }
		);
		const created = await actions.create(createEvt as unknown as Parameters<typeof actions.create>[0]);
		expect(created).toEqual({ action: 'create', ok: true });
		expect(createApiTodoMock).toHaveBeenCalledWith(
			expect.objectContaining({ id: 'user-1' }),
			tenant.id,
			'New Standard Task',
			standardConfig
		);

		const teamTenant = {
			...tenant,
			id: '33333333-3333-3333-3333-333333333333',
			name: 'Team Workspace',
			slug: 'team-workspace',
			isPersonal: false
		};
		getActiveTenantMock.mockResolvedValueOnce(teamTenant);
		const switchEvt = makeActionEvent({ tenantId: teamTenant.id });
		const switched = await actions.switchTenant(
			switchEvt as unknown as Parameters<typeof actions.switchTenant>[0]
		);
		expect(switched).toEqual({ action: 'switchTenant', ok: true, tenantId: teamTenant.id });
		expect(switchEvt.setMock).toHaveBeenCalledWith(
			'active_tenant_id',
			teamTenant.id,
			expect.objectContaining({ httpOnly: true, sameSite: 'lax', path: '/' })
		);
	});
});
