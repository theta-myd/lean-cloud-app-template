import { getLightDatastoreStatus } from '#lib/server/backend.js';
import { getServerConfig } from '#lib/server/env.js';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals }) => {
	const config = getServerConfig();
	return {
		architectureVariant: config.architectureVariant ?? 'light',
		authMode: locals.authMode,
		accessMode: config.authAccessMode,
		firestore: getLightDatastoreStatus(config),
		standardStatus: {
			apiConfigured: config.apiConfigured,
			authDbConfigured: config.authDatabaseConfigured
		}
	};
};
