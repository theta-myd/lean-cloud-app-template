import { Firestore } from '@google-cloud/firestore';
import { getServerConfig, type ServerConfig } from '../../env.js';
import { isValidEntityId, type LightDatastoreStatus, type TodoItem } from '../../types.js';

let firestoreInstance: Firestore | null = null;
let cachedEmulatorHost: string | null = null;

export type FirestoreStatus = LightDatastoreStatus;

export class FirestoreUnavailableError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'FirestoreUnavailableError';
	}
}

export function getFirestoreStatus(config: ServerConfig = getServerConfig()): FirestoreStatus {
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

export function getFirestore(config: ServerConfig = getServerConfig()): Firestore {
	const status = getFirestoreStatus(config);
	if (status.mode === 'unconfigured') {
		throw new FirestoreUnavailableError(
			'Cloud Firestore is not configured. Set FIRESTORE_EMULATOR_HOST or GOOGLE_CLOUD_PROJECT in .env.'
		);
	}

	if (status.emulatorHost && process.env.FIRESTORE_EMULATOR_HOST !== status.emulatorHost) {
		process.env.FIRESTORE_EMULATOR_HOST = status.emulatorHost;
	}

	if (!firestoreInstance || cachedEmulatorHost !== status.emulatorHost) {
		cachedEmulatorHost = status.emulatorHost;
		firestoreInstance = new Firestore({
			projectId: status.projectId
		});
	}

	return firestoreInstance;
}

export function isValidFirestoreDocId(id: string): boolean {
	return isValidEntityId(id);
}

function assertValidUserId(userId: string): string {
	const trimmed = userId.trim();
	if (
		!trimmed ||
		trimmed.includes('/') ||
		trimmed === '.' ||
		trimmed === '..' ||
		(trimmed.startsWith('__') && trimmed.endsWith('__'))
	) {
		throw new Error('Invalid user id.');
	}
	return trimmed;
}

function todosCollection(userId: string, config: ServerConfig = getServerConfig()) {
	return getFirestore(config).collection('users').doc(assertValidUserId(userId)).collection('todos');
}

export async function listTodos(
	userId: string,
	config: ServerConfig = getServerConfig()
): Promise<TodoItem[]> {
	const snapshot = await todosCollection(userId, config).orderBy('createdAt', 'desc').limit(50).get();
	return snapshot.docs.map((doc) => {
		const data = doc.data();
		return {
			id: doc.id,
			title: typeof data.title === 'string' ? data.title : '',
			completed: Boolean(data.completed),
			createdAt: typeof data.createdAt === 'string' ? data.createdAt : '',
			updatedAt: typeof data.updatedAt === 'string' ? data.updatedAt : ''
		};
	});
}

export async function createTodo(
	userId: string,
	title: string,
	config: ServerConfig = getServerConfig()
): Promise<TodoItem> {
	const now = new Date().toISOString();
	const ref = todosCollection(userId, config).doc();
	const item: TodoItem = {
		id: ref.id,
		title,
		completed: false,
		createdAt: now,
		updatedAt: now
	};
	await ref.set(item);
	return item;
}

export async function toggleTodo(
	userId: string,
	id: string,
	completed: boolean,
	config: ServerConfig = getServerConfig()
): Promise<void> {
	if (!isValidFirestoreDocId(id)) {
		throw new Error('Invalid task id.');
	}
	await todosCollection(userId, config).doc(id).update({
		completed,
		updatedAt: new Date().toISOString()
	});
}

export async function updateTodoTitle(
	userId: string,
	id: string,
	title: string,
	config: ServerConfig = getServerConfig()
): Promise<void> {
	if (!isValidFirestoreDocId(id)) {
		throw new Error('Invalid task id.');
	}
	await todosCollection(userId, config).doc(id).update({
		title,
		updatedAt: new Date().toISOString()
	});
}

export async function deleteTodo(
	userId: string,
	id: string,
	config: ServerConfig = getServerConfig()
): Promise<void> {
	if (!isValidFirestoreDocId(id)) {
		throw new Error('Invalid task id.');
	}
	await todosCollection(userId, config).doc(id).delete();
}
