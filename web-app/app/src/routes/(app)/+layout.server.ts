import { redirect } from '@sveltejs/kit';
import { resolveActiveTenantContext, type TenantSummary } from '#lib/server/api-client.js';
import { getServerConfig, type ArchitectureVariant } from '#lib/server/env.js';
import { ACTIVE_TENANT_COOKIE } from '#lib/server/todos-repo.js';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals, cookies }) => {
	if (!locals.user) {
		redirect(302, '/login');
	}

	const config = getServerConfig();
	const architectureVariant: ArchitectureVariant = config.architectureVariant ?? 'light';
	let activeTenant: TenantSummary | null = null;

	if (architectureVariant === 'standard' && config.apiConfigured) {
		try {
			const preferredTenantId = cookies?.get(ACTIVE_TENANT_COOKIE) ?? null;
			const context = await resolveActiveTenantContext(locals.user, preferredTenantId, config);
			activeTenant = context.activeTenant;
		} catch {
			// Allow shell layout to render even if the backend API is temporarily unavailable.
			activeTenant = null;
		}
	}

	return {
		user: locals.user,
		architectureVariant,
		activeTenant
	};
};
