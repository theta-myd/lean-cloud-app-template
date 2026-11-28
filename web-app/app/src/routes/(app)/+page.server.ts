import { getServerConfig } from '#lib/server/env.js';
import { getFirestoreStatus } from '#lib/server/firestore.js';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals }) => {
	const config = getServerConfig();
	return {
		architectureVariant: config.architectureVariant ?? 'light',
		authMode: locals.authMode,
		accessMode: config.authAccessMode,
		firestore: getFirestoreStatus(),
		standardStatus: {
			apiConfigured: config.apiConfigured,
			authDbConfigured: config.authDatabaseConfigured
		}
	};
};
