import { Firestore } from '@google-cloud/firestore';
import { getServerConfig } from './env.js';

let firestoreInstance: Firestore | null = null;
let cachedEmulatorHost: string | null = null;

export interface FirestoreStatus {
	mode: 'emulator' | 'cloud' | 'unconfigured';
	projectId: string;
	emulatorHost: string | null;
}

export interface TodoItem {
	id: string;
	title: string;
	completed: boolean;
	createdAt: string;
	updatedAt: string;
}

export class FirestoreUnavailableError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'FirestoreUnavailableError';
	}
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
	const status = getFirestoreStatus();
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

function todosCollection(userId: string) {
	return getFirestore().collection('users').doc(userId).collection('todos');
}

export async function listTodos(userId: string): Promise<TodoItem[]> {
	const snapshot = await todosCollection(userId).orderBy('createdAt', 'desc').limit(50).get();
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

export async function createTodo(userId: string, title: string): Promise<TodoItem> {
	const now = new Date().toISOString();
	const ref = todosCollection(userId).doc();
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

export async function toggleTodo(userId: string, id: string, completed: boolean): Promise<void> {
	await todosCollection(userId).doc(id).update({
		completed,
		updatedAt: new Date().toISOString()
	});
}

export async function updateTodoTitle(userId: string, id: string, title: string): Promise<void> {
	await todosCollection(userId).doc(id).update({
		title,
		updatedAt: new Date().toISOString()
	});
}

export async function deleteTodo(userId: string, id: string): Promise<void> {
	await todosCollection(userId).doc(id).delete();
}
