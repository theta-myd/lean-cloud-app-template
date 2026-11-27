import { expect, test } from '@playwright/test';
import { AppShellPage } from './pages/app-shell-page';
import { LoginPage } from './pages/login-page';

const E2E_EMAIL = process.env.E2E_TEST_EMAIL || 'e2e@example.com';
const E2E_PASSWORD = process.env.E2E_TEST_PASSWORD || 'e2e-local-password-1234';

test.describe('Light architecture smoke tests', () => {
	test('GET /api/health returns 200 with light architecture status', async ({ request }) => {
		const response = await request.get('/api/health');
		expect(response.status()).toBe(200);

		const body = (await response.json()) as {
			status: string;
			architecture: string;
			firestore: string;
		};
		expect(body.status).toBe('ok');
		expect(body.architecture).toBe('light');
		expect(typeof body.firestore).toBe('string');
	});

	test('unauthenticated / redirects to /login', async ({ page }) => {
		const loginPage = new LoginPage(page);

		await page.goto('/');
		await expect(page).toHaveURL(/\/login$/);
		await expect(loginPage.heading).toBeVisible();
		await expect(loginPage.googleSignInButton).toBeVisible();
		await expect(loginPage.localLoginSeparator).toBeVisible();
	});

	test('login, theme switching, navigation, and sign out work end-to-end', async ({ page }) => {
		const loginPage = new LoginPage(page);
		const appShell = new AppShellPage(page);

		await loginPage.goto();

		await loginPage.selectTheme('Dark');
		await expect(loginPage.html).toHaveClass(/\bdark\b/);

		await loginPage.selectTheme('Light');
		await expect(loginPage.html).not.toHaveClass(/\bdark\b/);

		await loginPage.selectTheme('System');
		await expect(loginPage.themeMenuItem('System')).toBeHidden();

		await loginPage.signInWithEmail(E2E_EMAIL, E2E_PASSWORD);

		await expect(page).toHaveURL(/\/$/);
		await expect(appShell.breadcrumbItem('Overview')).toBeVisible();
		await expect(appShell.userMenuTrigger()).toBeVisible();

		await appShell.navigateToLicenses();
		await expect(page).toHaveURL(/\/licenses$/);
		await expect(appShell.breadcrumbItem('Licenses')).toBeVisible();

		await appShell.selectTheme('Dark');
		await expect(appShell.html).toHaveClass(/\bdark\b/);

		await appShell.signOut();
		await expect(page).toHaveURL(/\/login$/);

		await page.goto('/');
		await expect(page).toHaveURL(/\/login$/);
	});
});
