import { redirect } from '@sveltejs/kit';
import { resolveOptionalActiveTenant } from '#lib/server/backend.js';
import { getServerConfig, type ArchitectureVariant } from '#lib/server/env.js';
import { ACTIVE_TENANT_COOKIE } from '#lib/server/todos-repo.js';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals, cookies }) => {
	if (!locals.user) {
		redirect(302, '/login');
	}

	const config = getServerConfig();
	const architectureVariant: ArchitectureVariant = config.architectureVariant ?? 'light';
	const preferredTenantId = cookies?.get(ACTIVE_TENANT_COOKIE) ?? null;
	const activeTenant = await resolveOptionalActiveTenant(locals.user, preferredTenantId, config);

	return {
		user: locals.user,
		architectureVariant,
		activeTenant
	};
};
