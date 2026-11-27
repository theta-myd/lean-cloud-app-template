import type { ServerConfig } from './env.js';

export function isEmailAllowed(
	email: string | undefined | null,
	emailVerified: boolean | undefined,
	config: ServerConfig
): boolean {
	if (!email) return false;
	const normalized = email.trim().toLowerCase();

	if (config.enableE2ePasswordAuth && normalized === config.e2eTestEmail) {
		return true;
	}

	if (config.authAccessMode === 'open') {
		return emailVerified !== false;
	}

	if (emailVerified === false) {
		return false;
	}

	if (config.allowedEmails.includes(normalized)) {
		return true;
	}

	const domain = normalized.split('@')[1];
	if (domain && config.allowedDomains.includes(domain)) {
		return true;
	}

	return false;
}
