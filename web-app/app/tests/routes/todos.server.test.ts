import { isActionFailure } from '@sveltejs/kit';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
	MockFirestoreUnavailableError,
	getFirestoreStatusMock,
	listTodosMock,
	createTodoMock,
	toggleTodoMock,
	updateTodoTitleMock,
	deleteTodoMock
} = vi.hoisted(() => {
	class MockFirestoreUnavailableError extends Error {
		constructor(message: string) {
			super(message);
			this.name = 'FirestoreUnavailableError';
		}
	}
	return {
		MockFirestoreUnavailableError,
		getFirestoreStatusMock: vi.fn(),
		listTodosMock: vi.fn(),
		createTodoMock: vi.fn(),
		toggleTodoMock: vi.fn(),
		updateTodoTitleMock: vi.fn(),
		deleteTodoMock: vi.fn()
	};
});

vi.mock('#lib/server/firestore.js', () => ({
	FirestoreUnavailableError: MockFirestoreUnavailableError,
	getFirestoreStatus: getFirestoreStatusMock,
	listTodos: listTodosMock,
	createTodo: createTodoMock,
	toggleTodo: toggleTodoMock,
	updateTodoTitle: updateTodoTitleMock,
	deleteTodo: deleteTodoMock
}));

import { actions, load } from '../../src/routes/(app)/todos/+page.server.js';

function makeActionEvent(formEntries: Record<string, string>, userId: string | null = 'user-1') {
	const formData = new FormData();
	for (const [k, v] of Object.entries(formEntries)) {
		formData.set(k, v);
	}
	return {
		request: {
			formData: async () => formData
		},
		locals: {
			user: userId ? { id: userId, email: 'user@example.com', name: 'Test User' } : null,
			session: null,
			authMode: 'stateless' as const,
			isAuthorized: Boolean(userId)
		}
	};
}

describe('todos +page.server.ts', () => {
	beforeEach(() => {
		vi.clearAllMocks();
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
			locals: { user: { id: 'u1' } }
		} as unknown as Parameters<typeof load>[0]);
		expect(res).toEqual({
			firestore: { mode: 'unconfigured', projectId: 'not-set', emulatorHost: null },
			todos: [],
			connectionError: null
		});
		expect(listTodosMock).not.toHaveBeenCalled();
	});

	it('loads todos and formats emulator connection errors', async () => {
		const todos = [
			{ id: 't1', title: 'Write tests', completed: false, createdAt: 'now', updatedAt: 'now' }
		];
		listTodosMock.mockResolvedValueOnce(todos);

		const okResult = await load({
			locals: { user: { id: 'user-1' } }
		} as unknown as Parameters<typeof load>[0]);
		expect(okResult).toMatchObject({ todos, connectionError: null });

		listTodosMock.mockRejectedValueOnce(new Error('ECONNREFUSED'));
		const errResult = (await load({
			locals: { user: { id: 'user-1' } }
		} as unknown as Parameters<typeof load>[0])) as {
			todos: unknown[];
			connectionError: string | null;
		};
		expect(errResult.todos).toEqual([]);
		expect(errResult.connectionError).toContain('Could not reach the Firestore Emulator.');
		expect(errResult.connectionError).toContain('ECONNREFUSED');
	});

	it('validates create action and delegates to createTodo', async () => {
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

	it('handles toggle, update, and delete actions', async () => {
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
});
