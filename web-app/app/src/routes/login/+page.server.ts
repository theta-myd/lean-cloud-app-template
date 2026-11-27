import { getServerConfig } from '#lib/server/env.js';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = () => {
	const config = getServerConfig();
	return {
		enableE2ePasswordAuth: config.enableE2ePasswordAuth,
		googleOAuthConfigured: config.googleOAuthConfigured
	};
};
