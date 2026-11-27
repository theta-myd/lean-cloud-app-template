import type { Locator, Page } from '@playwright/test';

export type ThemeOption = 'Light' | 'Dark' | 'System';

export class LoginPage {
	readonly page: Page;
	readonly html: Locator;
	readonly heading: Locator;
	readonly googleSignInButton: Locator;
	readonly localLoginSeparator: Locator;
	readonly themeToggleButton: Locator;
	readonly emailInput: Locator;
	readonly passwordInput: Locator;
	readonly emailSignInButton: Locator;

	constructor(page: Page) {
		this.page = page;
		this.html = page.locator('html');
		this.heading = page.getByText('Welcome back');
		this.googleSignInButton = page.getByRole('button', { name: 'Continue with Google' });
		this.localLoginSeparator = page.getByText('Local / E2E Test Login');
		this.themeToggleButton = page.getByRole('button', { name: 'Toggle theme' });
		this.emailInput = page.getByLabel('Email');
		this.passwordInput = page.getByLabel('Password');
		this.emailSignInButton = page.getByRole('button', { name: 'Sign in with Email' });
	}

	async goto(): Promise<void> {
		await this.page.goto('/login');
	}

	themeMenuItem(option: ThemeOption): Locator {
		return this.page.getByRole('menuitem', { name: option });
	}

	async selectTheme(option: ThemeOption): Promise<void> {
		await this.themeToggleButton.click();
		await this.themeMenuItem(option).click();
	}

	async signInWithEmail(email: string, password: string): Promise<void> {
		await this.emailInput.fill(email);
		await this.passwordInput.fill(password);
		await this.emailSignInButton.click();
	}
}
