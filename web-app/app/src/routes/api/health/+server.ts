import { json } from '@sveltejs/kit';
import { getBackendHealth } from '#lib/server/backend.js';
import { getServerConfig } from '#lib/server/env.js';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = () => {
	return json(getBackendHealth(getServerConfig()));
};
