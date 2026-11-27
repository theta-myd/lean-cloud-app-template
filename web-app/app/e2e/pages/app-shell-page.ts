import type { Locator, Page } from '@playwright/test';
import type { ThemeOption } from './login-page';

export class AppShellPage {
	readonly page: Page;
	readonly html: Locator;
	readonly breadcrumb: Locator;
	readonly themeSubMenuTrigger: Locator;
	readonly licensesMenuItem: Locator;
	readonly logoutMenuItem: Locator;

	constructor(page: Page) {
		this.page = page;
		this.html = page.locator('html');
		this.breadcrumb = page.getByLabel('breadcrumb');
		this.themeSubMenuTrigger = page.getByRole('menuitem', { name: 'Theme' });
		this.licensesMenuItem = page.getByRole('menuitem', { name: 'Licenses' });
		this.logoutMenuItem = page.getByRole('menuitem', { name: 'Log out' });
	}

	breadcrumbItem(label: string): Locator {
		return this.breadcrumb.getByText(label);
	}

	userMenuTrigger(userName = 'Local E2E User'): Locator {
		return this.page.getByRole('button', { name: new RegExp(userName) });
	}

	async openUserMenu(userName?: string): Promise<void> {
		await this.userMenuTrigger(userName).click();
	}

	async navigateToLicenses(userName?: string): Promise<void> {
		await this.openUserMenu(userName);
		await this.licensesMenuItem.click();
	}

	async selectTheme(option: ThemeOption, userName?: string): Promise<void> {
		await this.openUserMenu(userName);
		await this.themeSubMenuTrigger.click();
		await this.page.getByRole('menuitem', { name: option }).click();
	}

	async signOut(userName?: string): Promise<void> {
		await this.openUserMenu(userName);
		await this.logoutMenuItem.click();
	}
}
