import { defineConfig, devices } from '@playwright/test';

const PORT = 4173;
const BASE_URL = `http://localhost:${PORT}`;

export default defineConfig({
	testDir: './e2e',
	outputDir: '.svelte-kit/test-results',
	fullyParallel: false,
	forbidOnly: Boolean(process.env.CI),
	retries: process.env.CI ? 1 : 0,
	workers: 1,
	reporter: process.env.CI ? [['github'], ['list']] : 'list',
	use: {
		baseURL: BASE_URL,
		trace: 'on-first-retry'
	},
	projects: [
		{
			name: 'chromium',
			use: { ...devices['Desktop Chrome'] }
		}
	],
	webServer: {
		command: 'bun ./build',
		url: `${BASE_URL}/api/health`,
		reuseExistingServer: !process.env.CI,
		timeout: 30_000,
		env: {
			NODE_ENV: 'production',
			PORT: String(PORT),
			SHUTDOWN_TIMEOUT: '2',
			ORIGIN: BASE_URL,
			PUBLIC_APP_URL: BASE_URL,
			BETTER_AUTH_URL: BASE_URL,
			BETTER_AUTH_SECRET:
				process.env.BETTER_AUTH_SECRET || 'e2e-test-only-better-auth-secret-0000',
			AUTH_ACCESS_MODE: 'allowlist',
			ENABLE_E2E_PASSWORD_AUTH: 'true',
			E2E_TEST_EMAIL: process.env.E2E_TEST_EMAIL || 'e2e@example.com',
			E2E_TEST_PASSWORD: process.env.E2E_TEST_PASSWORD || 'e2e-local-password-1234'
		}
	}
});
