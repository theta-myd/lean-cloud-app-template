<script lang="ts">
	import AppSidebar from '#lib/components/app-sidebar.svelte';
	import { Badge } from '#lib/components/ui/badge/index.js';
	import * as Breadcrumb from '#lib/components/ui/breadcrumb/index.js';
	import * as Card from '#lib/components/ui/card/index.js';
	import { Separator } from '#lib/components/ui/separator/index.js';
	import * as Sidebar from '#lib/components/ui/sidebar/index.js';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<svelte:head>
	<title>Overview — Lean Cloud App</title>
</svelte:head>

<Sidebar.Provider>
	<AppSidebar user={data.user} />
	<Sidebar.Inset>
		<header
			class="flex h-16 shrink-0 items-center gap-2 transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-12"
		>
			<div class="flex items-center gap-2 px-4">
				<Sidebar.Trigger class="-ms-1" />
				<Separator orientation="vertical" class="me-2 data-vertical:h-4 data-vertical:self-auto" />
				<Breadcrumb.Root>
					<Breadcrumb.List>
						<Breadcrumb.Item class="hidden md:block">
							<Breadcrumb.Link href="/">Lean Cloud App</Breadcrumb.Link>
						</Breadcrumb.Item>
						<Breadcrumb.Separator class="hidden md:block" />
						<Breadcrumb.Item>
							<Breadcrumb.Page>Overview</Breadcrumb.Page>
						</Breadcrumb.Item>
					</Breadcrumb.List>
				</Breadcrumb.Root>
			</div>
		</header>

		<div class="flex flex-1 flex-col gap-4 p-4 pt-0">
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
							<span>{data.authMode === 'stateless' ? 'Encrypted JWE Cookie' : 'In-Memory SQLite (E2E)'}</span>
						</div>
					</Card.Content>
				</Card.Root>

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

				<Card.Root id="compute">
					<Card.Header>
						<div class="flex items-center justify-between gap-2">
							<Card.Title>Light Architecture</Card.Title>
							<Badge variant="secondary">min = 0</Badge>
						</div>
						<Card.Description>Scale-to-zero Cloud Run v2 template</Card.Description>
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
						Sidebar navigation uses shadcn-svelte <code>sidebar-07</code>; authentication uses
						<code>login-03</code> with Better Auth.
					</Card.Description>
				</Card.Header>
				<Card.Content class="flex flex-col gap-3 text-sm text-muted-foreground">
					<p>
						Replace this panel with your domain views and Firestore server loaders. In production on
						Cloud Run, set <code>ENABLE_E2E_PASSWORD_AUTH=false</code> so Better Auth runs in zero-DB
						Stateless Cookie mode with Google OAuth.
					</p>
					<div class="flex flex-wrap gap-2">
						<Badge variant="outline">Svelte 5 Runes</Badge>
						<Badge variant="outline">SvelteKit 3</Badge>
						<Badge variant="outline">Tailwind v4</Badge>
						<Badge variant="outline">Firestore Emulator Ready</Badge>
						<Badge variant="outline">Tauri Ready</Badge>
					</div>
				</Card.Content>
			</Card.Root>
		</div>
	</Sidebar.Inset>
</Sidebar.Provider>
