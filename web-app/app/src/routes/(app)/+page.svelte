<script lang="ts">
	import { Badge } from '#lib/components/ui/badge/index.js';
	import * as Card from '#lib/components/ui/card/index.js';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const isStandard = $derived(data.architectureVariant === 'standard');

	const sessionStorageLabel = $derived.by(() => {
		if (data.authMode === 'postgres-db') return 'PostgreSQL DB Session (auth schema)';
		if (data.authMode === 'e2e-memory-sqlite') return 'In-Memory SQLite (E2E)';
		return 'Encrypted JWE Cookie';
	});
</script>

<svelte:head>
	<title>Overview — Agent Ready App</title>
</svelte:head>

<div class="grid gap-4 md:grid-cols-3">
	<Card.Root id="auth">
		<Card.Header>
			<div class="flex items-center justify-between gap-2">
				<Card.Title>Session &amp; Auth</Card.Title>
				<Badge variant="secondary">{data.authMode}</Badge>
			</div>
			<Card.Description>Signed in as {data.user.email}</Card.Description>
		</Card.Header>
		<Card.Content class="flex flex-col gap-2 text-sm text-muted-foreground">
			<div class="flex items-center justify-between">
				<span>Access policy</span>
				<Badge variant="outline">{data.accessMode}</Badge>
			</div>
			<div class="flex items-center justify-between">
				<span>Session storage</span>
				<span>{sessionStorageLabel}</span>
			</div>
		</Card.Content>
	</Card.Root>

	{#if isStandard}
		<Card.Root id="datastore">
			<Card.Header>
				<div class="flex items-center justify-between gap-2">
					<Card.Title>Connect RPC + PostgreSQL</Card.Title>
					<Badge variant={data.standardStatus.apiConfigured ? 'secondary' : 'outline'}>
						{data.standardStatus.apiConfigured ? 'configured' : 'unconfigured'}
					</Badge>
				</div>
				<Card.Description>Tenant-scoped Rust API with PostgreSQL RLS</Card.Description>
			</Card.Header>
			<Card.Content class="flex flex-col gap-2 text-sm text-muted-foreground">
				<div class="flex items-center justify-between">
					<span>Auth DB</span>
					<Badge variant={data.standardStatus.authDbConfigured ? 'secondary' : 'outline'}>
						{data.standardStatus.authDbConfigured ? 'configured' : 'unconfigured'}
					</Badge>
				</div>
				<div class="flex items-center justify-between">
					<span>Active tenant</span>
					<span class="font-mono text-xs">
						{data.activeTenant ? `${data.activeTenant.name} (@${data.activeTenant.slug})` : 'not-resolved'}
					</span>
				</div>
			</Card.Content>
		</Card.Root>
	{:else}
		<Card.Root id="datastore">
			<Card.Header>
				<div class="flex items-center justify-between gap-2">
					<Card.Title>Cloud Firestore</Card.Title>
					<Badge variant={data.firestore.mode === 'unconfigured' ? 'outline' : 'secondary'}>
						{data.firestore.mode}
					</Badge>
				</div>
				<Card.Description>Server-side datastore (Standard Native)</Card.Description>
			</Card.Header>
			<Card.Content class="flex flex-col gap-2 text-sm text-muted-foreground">
				<div class="flex items-center justify-between">
					<span>Project</span>
					<span class="font-mono text-xs">{data.firestore.projectId}</span>
				</div>
				<div class="flex items-center justify-between">
					<span>Target</span>
					<span class="font-mono text-xs">
						{data.firestore.emulatorHost ?? 'GCP Native (ADC)'}
					</span>
				</div>
			</Card.Content>
		</Card.Root>
	{/if}

	<Card.Root id="compute">
		<Card.Header>
			<div class="flex items-center justify-between gap-2">
				<Card.Title>{isStandard ? 'Standard Architecture' : 'Light Architecture'}</Card.Title>
				<Badge variant="secondary">{isStandard ? 'BFF + API' : 'min = 0'}</Badge>
			</div>
			<Card.Description>
				{isStandard
					? 'SvelteKit BFF + Rust Connect RPC API'
					: 'Scale-to-zero Cloud Run v2 template'}
			</Card.Description>
		</Card.Header>
		<Card.Content class="flex flex-col gap-2 text-sm text-muted-foreground">
			<div class="flex items-center justify-between">
				<span>Runtime</span>
				<span>SvelteKit 3 + adapter-bun</span>
			</div>
			<div class="flex items-center justify-between">
				<span>Container</span>
				<span>oven/bun:distroless (nonroot)</span>
			</div>
		</Card.Content>
	</Card.Root>
</div>

<Card.Root id="architecture" class="flex-1">
	<Card.Header>
		<Card.Title>Starter Workspace</Card.Title>
		<Card.Description>
			Sidebar navigation combines shadcn-svelte <code>sidebar-07</code>, <code>dashboard-01</code>,
			and <code>sidebar-03</code>; authentication uses <code>login-03</code> with Better Auth.
		</Card.Description>
	</Card.Header>
	<Card.Content class="flex flex-col gap-3 text-sm text-muted-foreground">
		{#if isStandard}
			<p>
				Running in <strong>Standard</strong> architecture mode: Better Auth persists revocable
				sessions in PostgreSQL (<code>auth</code> schema), while SvelteKit server loaders and form
				actions call the Rust Connect RPC API with short-lived HS256 internal user JWTs and GCP OIDC
				service identity tokens.
			</p>
		{:else}
			<p>
				Replace this panel with your domain views and Firestore server loaders. In production on Cloud
				Run, set <code>ENABLE_E2E_PASSWORD_AUTH=false</code> so Better Auth runs in zero-DB Stateless
				Cookie mode with Google OAuth.
			</p>
		{/if}
		<div class="flex flex-wrap gap-2">
			<Badge variant="outline">Svelte 5 Runes</Badge>
			<Badge variant="outline">SvelteKit 3</Badge>
			<Badge variant="outline">Tailwind v4</Badge>
			{#if isStandard}
				<Badge variant="outline">Connect RPC</Badge>
				<Badge variant="outline">PostgreSQL RLS</Badge>
			{:else}
				<Badge variant="outline">Firestore Emulator Ready</Badge>
			{/if}
			<Badge variant="outline">Tauri Ready</Badge>
		</div>
	</Card.Content>
</Card.Root>
