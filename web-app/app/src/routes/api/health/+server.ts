import { json } from '@sveltejs/kit';
import { getFirestoreStatus } from '#lib/server/firestore.js';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = () => {
	return json({
		status: 'ok',
		architecture: 'light',
		firestore: getFirestoreStatus().mode
	});
};
