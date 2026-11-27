import { expect, test } from '@playwright/test';

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
		await page.goto('/');
		await expect(page).toHaveURL(/\/login$/);
		await expect(page.getByText('Welcome back')).toBeVisible();
		await expect(page.getByRole('button', { name: 'Continue with Google' })).toBeVisible();
		await expect(page.getByText('Local / E2E Test Login')).toBeVisible();
	});

	test('login, theme switching, navigation, and sign out work end-to-end', async ({ page }) => {
		await page.goto('/login');

		const html = page.locator('html');

		await page.getByRole('button', { name: 'Toggle theme' }).click();
		await page.getByRole('menuitem', { name: 'Dark' }).click();
		await expect(html).toHaveClass(/\bdark\b/);

		await page.getByRole('button', { name: 'Toggle theme' }).click();
		await page.getByRole('menuitem', { name: 'Light' }).click();
		await expect(html).not.toHaveClass(/\bdark\b/);

		await page.getByRole('button', { name: 'Toggle theme' }).click();
		await page.getByRole('menuitem', { name: 'System' }).click();
		await expect(page.getByRole('menuitem', { name: 'System' })).toBeHidden();

		await page.getByLabel('Email').fill(E2E_EMAIL);
		await page.getByLabel('Password').fill(E2E_PASSWORD);
		await page.getByRole('button', { name: 'Sign in with Email' }).click();

		await expect(page).toHaveURL(/\/$/);
		await expect(page.getByLabel('breadcrumb').getByText('Overview')).toBeVisible();

		const userMenuTrigger = page.getByRole('button', { name: /Local E2E User/ });
		await expect(userMenuTrigger).toBeVisible();

		await userMenuTrigger.click();
		await page.getByRole('menuitem', { name: 'Licenses' }).click();
		await expect(page).toHaveURL(/\/licenses$/);
		await expect(page.getByLabel('breadcrumb').getByText('Licenses')).toBeVisible();

		await userMenuTrigger.click();
		await page.getByRole('menuitem', { name: 'Theme' }).click();
		await page.getByRole('menuitem', { name: 'Dark' }).click();
		await expect(html).toHaveClass(/\bdark\b/);

		await userMenuTrigger.click();
		await page.getByRole('menuitem', { name: 'Log out' }).click();
		await expect(page).toHaveURL(/\/login$/);

		await page.goto('/');
		await expect(page).toHaveURL(/\/login$/);
	});
});
