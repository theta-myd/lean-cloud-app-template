import { defineEnvVars } from '@sveltejs/kit/env';

const optionalString = (value: string | undefined): string => value?.trim() ?? '';

export const variables = defineEnvVars({
	PUBLIC_APP_URL: { schema: optionalString },
	BETTER_AUTH_URL: { schema: optionalString },
	BETTER_AUTH_SECRET: { schema: optionalString },
	GOOGLE_CLIENT_ID: { schema: optionalString },
	GOOGLE_CLIENT_SECRET: { schema: optionalString },
	AUTH_ACCESS_MODE: { schema: optionalString },
	ALLOWED_EMAILS: { schema: optionalString },
	ALLOWED_DOMAINS: { schema: optionalString },
	ENABLE_E2E_PASSWORD_AUTH: { schema: optionalString },
	E2E_TEST_EMAIL: { schema: optionalString },
	E2E_TEST_PASSWORD: { schema: optionalString },
	GOOGLE_CLOUD_PROJECT: { schema: optionalString },
	FIRESTORE_EMULATOR_HOST: { schema: optionalString }
});
