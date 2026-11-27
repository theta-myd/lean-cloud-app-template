declare global {
	namespace App {
		interface Locals {
			user: {
				id: string;
				email: string;
				name: string;
				image?: string | null;
				emailVerified: boolean;
			} | null;
			session: {
				id: string;
				userId: string;
				expiresAt: Date;
			} | null;
			isAuthorized: boolean;
			authMode: 'stateless' | 'e2e-memory-sqlite';
		}
	}
}

export {};
