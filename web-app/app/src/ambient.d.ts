declare module 'bun:sqlite' {
	export class Database {
		constructor(
			filename?: string,
			options?: number | { readonly?: boolean; create?: boolean; readwrite?: boolean }
		);
		close(throwOnError?: boolean): void;
	}
}
