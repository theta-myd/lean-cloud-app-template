import { fail } from '@sveltejs/kit';
import { getServerConfig } from '#lib/server/env.js';
import {
	ACTIVE_TENANT_COOKIE,
	createUserTodo,
	deleteUserTodo,
	formatTodosBackendError,
	isValidTodoId,
	loadUserTodos,
	toggleUserTodo,
	updateUserTodoTitle,
	verifyUserTenantSwitch
} from '#lib/server/todos-repo.js';
import type { Actions, PageServerLoad } from './$types';

const MAX_TITLE_LENGTH = 200;

export const load: PageServerLoad = async ({ locals, cookies }) => {
	const preferredTenantId = cookies?.get(ACTIVE_TENANT_COOKIE) ?? null;
	return loadUserTodos(locals.user, preferredTenantId);
};

export const actions: Actions = {
	create: async ({ request, locals, cookies }) => {
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

		const config = getServerConfig();
		const preferredTenantId = cookies?.get(ACTIVE_TENANT_COOKIE) ?? null;
		try {
			await createUserTodo(locals.user, title, preferredTenantId, config);
			return { action: 'create', ok: true };
		} catch (err) {
			return fail(503, {
				action: 'create',
				error: formatTodosBackendError(err, config)
			});
		}
	},

	toggle: async ({ request, locals, cookies }) => {
		if (!locals.user) return fail(401, { action: 'toggle', error: 'Unauthorized.' });

		const data = await request.formData();
		const id = String(data.get('id') ?? '').trim();
		const nextCompleted = String(data.get('completed') ?? '') === 'true';
		if (!isValidTodoId(id)) {
			return fail(400, { action: 'toggle', error: 'Invalid task id.' });
		}

		const config = getServerConfig();
		const preferredTenantId = cookies?.get(ACTIVE_TENANT_COOKIE) ?? null;
		try {
			await toggleUserTodo(locals.user, id, nextCompleted, preferredTenantId, config);
			return { action: 'toggle', ok: true };
		} catch (err) {
			return fail(503, {
				action: 'toggle',
				error: formatTodosBackendError(err, config)
			});
		}
	},

	update: async ({ request, locals, cookies }) => {
		if (!locals.user) return fail(401, { action: 'update', error: 'Unauthorized.' });

		const data = await request.formData();
		const id = String(data.get('id') ?? '').trim();
		const title = String(data.get('title') ?? '').trim();
		if (!isValidTodoId(id)) {
			return fail(400, { action: 'update', error: 'Invalid task id.' });
		}
		if (!title) {
			return fail(400, { action: 'update', error: 'Task id and title are required.' });
		}
		if (title.length > MAX_TITLE_LENGTH) {
			return fail(400, {
				action: 'update',
				error: `Title must be ${MAX_TITLE_LENGTH} characters or fewer.`
			});
		}

		const config = getServerConfig();
		const preferredTenantId = cookies?.get(ACTIVE_TENANT_COOKIE) ?? null;
		try {
			await updateUserTodoTitle(locals.user, id, title, preferredTenantId, config);
			return { action: 'update', ok: true };
		} catch (err) {
			return fail(503, {
				action: 'update',
				error: formatTodosBackendError(err, config)
			});
		}
	},

	delete: async ({ request, locals, cookies }) => {
		if (!locals.user) return fail(401, { action: 'delete', error: 'Unauthorized.' });

		const data = await request.formData();
		const id = String(data.get('id') ?? '').trim();
		if (!isValidTodoId(id)) {
			return fail(400, { action: 'delete', error: 'Invalid task id.' });
		}

		const config = getServerConfig();
		const preferredTenantId = cookies?.get(ACTIVE_TENANT_COOKIE) ?? null;
		try {
			await deleteUserTodo(locals.user, id, preferredTenantId, config);
			return { action: 'delete', ok: true };
		} catch (err) {
			return fail(503, {
				action: 'delete',
				error: formatTodosBackendError(err, config)
			});
		}
	},

	switchTenant: async ({ request, locals, cookies }) => {
		if (!locals.user) return fail(401, { action: 'switchTenant', error: 'Unauthorized.' });

		const config = getServerConfig();
		if (config.architectureVariant !== 'standard') {
			return fail(400, {
				action: 'switchTenant',
				error: 'Tenant switching is only available in Standard architecture mode.'
			});
		}

		const data = await request.formData();
		const tenantId = String(data.get('tenantId') ?? '').trim();
		if (!isValidTodoId(tenantId)) {
			return fail(400, { action: 'switchTenant', error: 'Invalid tenant id.' });
		}

		try {
			const verified = await verifyUserTenantSwitch(locals.user, tenantId, config);
			cookies.set(ACTIVE_TENANT_COOKIE, verified.id, {
				path: '/',
				httpOnly: true,
				sameSite: 'lax',
				secure: config.appUrl.startsWith('https://'),
				maxAge: 60 * 60 * 24 * 30
			});
			return { action: 'switchTenant', ok: true, tenantId: verified.id };
		} catch (err) {
			return fail(503, {
				action: 'switchTenant',
				error: formatTodosBackendError(err, config)
			});
		}
	}
};
