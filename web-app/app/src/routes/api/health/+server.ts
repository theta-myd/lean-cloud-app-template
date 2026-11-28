import { json } from '@sveltejs/kit';
import { getServerConfig } from '#lib/server/env.js';
import { getFirestoreStatus } from '#lib/server/firestore.js';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = () => {
	const config = getServerConfig();
	if (config.architectureVariant === 'standard') {
		return json({
			status: 'ok',
			architecture: 'standard',
			api: config.apiConfigured ? 'configured' : 'unconfigured',
			authDb: config.authDatabaseConfigured ? 'configured' : 'unconfigured'
		});
	}

	return json({
		status: 'ok',
		architecture: 'light',
		firestore: getFirestoreStatus().mode
	});
};
