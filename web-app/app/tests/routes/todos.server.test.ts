import { isActionFailure } from '@sveltejs/kit';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ServerConfig } from '#lib/server/env.js';
import type { BackendAdapter } from '#lib/server/types.js';

const { getServerConfigMock, adapterMock, getBackendAdapterMock, formatBackendErrorMock } =
	vi.hoisted(() => {
		const adapter: BackendAdapter = {
			variant: 'light',
			authMode: 'stateless',
			createAuthSessionStore: vi.fn(),
			getHealth: vi.fn(),
			getLightDatastoreStatus: vi.fn(),
			resolveOptionalActiveTenant: vi.fn(),
			loadTodos: vi.fn(),
			createTodo: vi.fn(),
			toggleTodo: vi.fn(),
			updateTodoTitle: vi.fn(),
			deleteTodo: vi.fn(),
			verifyTenantSwitch: vi.fn(),
			formatError: vi.fn((err: unknown) =>
				err instanceof Error ? err.message : String(err)
			)
		};
		return {
			getServerConfigMock: vi.fn<() => ServerConfig>(),
			adapterMock: adapter,
			getBackendAdapterMock: vi.fn(() => adapter),
			formatBackendErrorMock: vi.fn((err: unknown, config?: ServerConfig) =>
				adapter.formatError(err, config as ServerConfig)
			)
		};
	});

vi.mock('#lib/server/env.js', () => ({
	getServerConfig: getServerConfigMock
}));

vi.mock('#lib/server/backend.js', () => ({
	getBackendAdapter: getBackendAdapterMock,
	formatBackendError: formatBackendErrorMock
}));

import { actions, load } from '../../src/routes/(app)/todos/+page.server.js';

function makeConfig(overrides: Partial<ServerConfig> = {}): ServerConfig {
	return {
		architectureVariant: 'light',
		appUrl: 'http://localhost:5173',
		betterAuthUrl: 'http://localhost:5173',
		betterAuthSecret: 'a'.repeat(32),
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
		internalApiJwtSecret: 'b'.repeat(32),
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
	});

	it('delegates load() to backend adapter with active_tenant_id cookie', async () => {
		const expected = {
			architecture: 'light' as const,
			firestore: {
				mode: 'emulator' as const,
				projectId: 'lean-cloud-app-local',
				emulatorHost: 'localhost:8080'
			},
			apiConfigured: false,
			activeTenant: null,
			tenants: [],
			todos: [{ id: 't1', title: 'Write tests', completed: false, createdAt: 'now', updatedAt: 'now' }],
			connectionError: null
		};
		vi.mocked(adapterMock.loadTodos).mockResolvedValueOnce(expected);

		const res = await load({
			locals: { user: { id: 'user-1', email: 'user@example.com' } },
			cookies: { get: () => 'tenant-1' }
		} as unknown as Parameters<typeof load>[0]);

		expect(res).toEqual(expected);
		expect(adapterMock.loadTodos).toHaveBeenCalledWith(
			{ id: 'user-1', email: 'user@example.com' },
			'tenant-1',
			expect.any(Object)
		);
	});

	it('validates create action and delegates to backend adapter', async () => {
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

		vi.mocked(adapterMock.createTodo).mockResolvedValueOnce({
			id: 't1',
			title: 'Buy milk',
			completed: false,
			createdAt: 'now',
			updatedAt: 'now'
		});
		const ok = await actions.create(
			makeActionEvent({ title: '  Buy milk  ' }) as unknown as Parameters<typeof actions.create>[0]
		);
		expect(ok).toEqual({ action: 'create', ok: true });
		expect(adapterMock.createTodo).toHaveBeenCalledWith(
			expect.objectContaining({ id: 'user-1' }),
			'Buy milk',
			null,
			expect.any(Object)
		);

		vi.mocked(adapterMock.createTodo).mockRejectedValueOnce(new Error('Backend unavailable'));
		const failed = await actions.create(
			makeActionEvent({ title: 'Test' }) as unknown as Parameters<typeof actions.create>[0]
		);
		expect(isActionFailure(failed) && failed.status).toBe(503);
	});

	it('handles toggle, update, delete, and path-traversal ID validation', async () => {
		vi.mocked(adapterMock.toggleTodo).mockResolvedValueOnce(undefined);
		const toggleOk = await actions.toggle(
			makeActionEvent({ id: 't1', completed: 'true' }) as unknown as Parameters<
				typeof actions.toggle
			>[0]
		);
		expect(toggleOk).toEqual({ action: 'toggle', ok: true });
		expect(adapterMock.toggleTodo).toHaveBeenCalledWith(
			expect.objectContaining({ id: 'user-1' }),
			't1',
			true,
			null,
			expect.any(Object)
		);

		const badToggle = await actions.toggle(
			makeActionEvent({ id: '../other-user/todos/t1', completed: 'true' }) as unknown as Parameters<
				typeof actions.toggle
			>[0]
		);
		expect(isActionFailure(badToggle) && badToggle.status).toBe(400);

		const updateMissing = await actions.update(
			makeActionEvent({ id: 't1', title: '' }) as unknown as Parameters<typeof actions.update>[0]
		);
		expect(isActionFailure(updateMissing) && updateMissing.status).toBe(400);

		vi.mocked(adapterMock.updateTodoTitle).mockResolvedValueOnce(undefined);
		const updateOk = await actions.update(
			makeActionEvent({ id: 't1', title: 'Updated' }) as unknown as Parameters<
				typeof actions.update
			>[0]
		);
		expect(updateOk).toEqual({ action: 'update', ok: true });

		const badDelete = await actions.delete(
			makeActionEvent({ id: 'a/b' }) as unknown as Parameters<typeof actions.delete>[0]
		);
		expect(isActionFailure(badDelete) && badDelete.status).toBe(400);

		vi.mocked(adapterMock.deleteTodo).mockResolvedValueOnce(undefined);
		const deleteOk = await actions.delete(
			makeActionEvent({ id: 't1' }) as unknown as Parameters<typeof actions.delete>[0]
		);
		expect(deleteOk).toEqual({ action: 'delete', ok: true });
	});

	it('gates switchTenant to Standard mode and persists active_tenant_id cookie', async () => {
		const lightRejected = await actions.switchTenant(
			makeActionEvent({ tenantId: '11111111-1111-1111-1111-111111111111' }) as unknown as Parameters<
				typeof actions.switchTenant
			>[0]
		);
		expect(isActionFailure(lightRejected) && lightRejected.status).toBe(400);

		const standardConfig = makeConfig({
			architectureVariant: 'standard',
			apiBaseUrl: 'http://localhost:8081',
			apiConfigured: true
		});
		getServerConfigMock.mockReturnValue(standardConfig);

		const teamTenant = {
			id: '33333333-3333-3333-3333-333333333333',
			name: 'Team Workspace',
			slug: 'team-workspace',
			role: 'owner' as const,
			isPersonal: false,
			createdAt: '2026-01-01T00:00:00.000Z'
		};
		vi.mocked(adapterMock.verifyTenantSwitch).mockResolvedValueOnce(teamTenant);

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
