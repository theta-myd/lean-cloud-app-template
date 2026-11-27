import { fail } from '@sveltejs/kit';
import {
	FirestoreUnavailableError,
	createTodo,
	deleteTodo,
	getFirestoreStatus,
	listTodos,
	toggleTodo,
	updateTodoTitle,
	type TodoItem
} from '#lib/server/firestore.js';
import type { Actions, PageServerLoad } from './$types';

const MAX_TITLE_LENGTH = 200;

function formatFirestoreError(err: unknown, mode: 'emulator' | 'cloud' | 'unconfigured'): string {
	if (err instanceof FirestoreUnavailableError) {
		return err.message;
	}
	const detail = err instanceof Error ? err.message : String(err);
	if (mode === 'emulator') {
		return `Could not reach the Firestore Emulator. Start it from the repository root with "wslc compose up -d". (${detail})`;
	}
	return `Firestore request failed: ${detail}`;
}

export const load: PageServerLoad = async ({ locals }) => {
	const firestore = getFirestoreStatus();
	if (firestore.mode === 'unconfigured' || !locals.user) {
		return {
			firestore,
			todos: [] as TodoItem[],
			connectionError: null as string | null
		};
	}

	try {
		const todos = await listTodos(locals.user.id);
		return {
			firestore,
			todos,
			connectionError: null as string | null
		};
	} catch (err) {
		return {
			firestore,
			todos: [] as TodoItem[],
			connectionError: formatFirestoreError(err, firestore.mode)
		};
	}
};

export const actions: Actions = {
	create: async ({ request, locals }) => {
		if (!locals.user) return fail(401, { action: 'create', error: 'Unauthorized.' });

		const data = await request.formData();
		const title = String(data.get('title') ?? '').trim();
		if (!title) {
			return fail(400, { action: 'create', error: 'Please enter a task title.' });
		}
		if (title.length > MAX_TITLE_LENGTH) {
			return fail(400, {
				action: 'create',
				error: `Title must be ${MAX_TITLE_LENGTH} characters or fewer.`
			});
		}

		const status = getFirestoreStatus();
		try {
			await createTodo(locals.user.id, title);
			return { action: 'create', ok: true };
		} catch (err) {
			return fail(503, { action: 'create', error: formatFirestoreError(err, status.mode) });
		}
	},

	toggle: async ({ request, locals }) => {
		if (!locals.user) return fail(401, { action: 'toggle', error: 'Unauthorized.' });

		const data = await request.formData();
		const id = String(data.get('id') ?? '').trim();
		const nextCompleted = String(data.get('completed') ?? '') === 'true';
		if (!id) {
			return fail(400, { action: 'toggle', error: 'Missing task id.' });
		}

		const status = getFirestoreStatus();
		try {
			await toggleTodo(locals.user.id, id, nextCompleted);
			return { action: 'toggle', ok: true };
		} catch (err) {
			return fail(503, { action: 'toggle', error: formatFirestoreError(err, status.mode) });
		}
	},

	update: async ({ request, locals }) => {
		if (!locals.user) return fail(401, { action: 'update', error: 'Unauthorized.' });

		const data = await request.formData();
		const id = String(data.get('id') ?? '').trim();
		const title = String(data.get('title') ?? '').trim();
		if (!id || !title) {
			return fail(400, { action: 'update', error: 'Task id and title are required.' });
		}
		if (title.length > MAX_TITLE_LENGTH) {
			return fail(400, {
				action: 'update',
				error: `Title must be ${MAX_TITLE_LENGTH} characters or fewer.`
			});
		}

		const status = getFirestoreStatus();
		try {
			await updateTodoTitle(locals.user.id, id, title);
			return { action: 'update', ok: true };
		} catch (err) {
			return fail(503, { action: 'update', error: formatFirestoreError(err, status.mode) });
		}
	},

	delete: async ({ request, locals }) => {
		if (!locals.user) return fail(401, { action: 'delete', error: 'Unauthorized.' });

		const data = await request.formData();
		const id = String(data.get('id') ?? '').trim();
		if (!id) {
			return fail(400, { action: 'delete', error: 'Missing task id.' });
		}

		const status = getFirestoreStatus();
		try {
			await deleteTodo(locals.user.id, id);
			return { action: 'delete', ok: true };
		} catch (err) {
			return fail(503, { action: 'delete', error: formatFirestoreError(err, status.mode) });
		}
	}
};
