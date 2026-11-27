import clientLicenses from '#lib/generated/client-licenses.json';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = () => {
	return {
		generatedAt: clientLicenses.generatedAt,
		packages: clientLicenses.packages
	};
};
