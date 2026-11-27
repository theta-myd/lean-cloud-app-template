import { Firestore } from '@google-cloud/firestore';
import { getServerConfig } from './env.js';

let firestoreInstance: Firestore | null = null;

export interface FirestoreStatus {
	mode: 'emulator' | 'cloud' | 'unconfigured';
	projectId: string;
	emulatorHost: string | null;
}

export function getFirestoreStatus(): FirestoreStatus {
	const config = getServerConfig();
	if (config.firestoreEmulatorHost) {
		return {
			mode: 'emulator',
			projectId: config.googleCloudProject || 'lean-cloud-app-local',
			emulatorHost: config.firestoreEmulatorHost
		};
	}

	if (
		config.googleCloudProject &&
		!config.googleCloudProject.startsWith('your-gcp-project-id')
	) {
		return {
			mode: 'cloud',
			projectId: config.googleCloudProject,
			emulatorHost: null
		};
	}

	return {
		mode: 'unconfigured',
		projectId: 'not-set',
		emulatorHost: null
	};
}

export function getFirestore(): Firestore {
	if (!firestoreInstance) {
		const config = getServerConfig();
		firestoreInstance = new Firestore({
			projectId: config.googleCloudProject || 'lean-cloud-app-local'
		});
	}
	return firestoreInstance;
}
