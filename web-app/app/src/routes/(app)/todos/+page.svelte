<script lang="ts">
	import { enhance, type SubmitFunction } from '$app/forms';
	import * as Alert from '#lib/components/ui/alert/index.js';
	import { Badge } from '#lib/components/ui/badge/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as Card from '#lib/components/ui/card/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { Spinner } from '#lib/components/ui/spinner/index.js';
	import Building2Icon from '@lucide/svelte/icons/building-2';
	import CheckIcon from '@lucide/svelte/icons/check';
	import CircleAlertIcon from '@lucide/svelte/icons/circle-alert';
	import PencilIcon from '@lucide/svelte/icons/pencil';
	import PlusIcon from '@lucide/svelte/icons/plus';
	import Trash2Icon from '@lucide/svelte/icons/trash-2';
	import XIcon from '@lucide/svelte/icons/x';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	let newTitle = $state('');
	let creating = $state(false);
	let switchingTenantId = $state<string | null>(null);
	let editingId = $state<string | null>(null);
	let editingTitle = $state('');
	let pendingActions = $state<Record<string, 'toggle' | 'update' | 'delete'>>({});

	const isStandard = $derived(data.architecture === 'standard');
	const isBackendUnconfigured = $derived(
		isStandard ? !data.apiConfigured : data.firestore.mode === 'unconfigured'
	);
	const isSavingEdit = $derived(editingId !== null && pendingActions[editingId] === 'update');

	function startEditing(id: string, title: string) {
		if (isSavingEdit || pendingActions[id]) return;
		editingId = id;
		editingTitle = title;
	}

	function cancelEditing() {
		editingId = null;
		editingTitle = '';
	}

	const handleCreate: SubmitFunction = ({ cancel }) => {
		if (creating) {
			cancel();
			return;
		}
		creating = true;
		return async ({ result, update }) => {
			try {
				await update();
				if (result.type === 'success') {
					newTitle = '';
				}
			} finally {
				creating = false;
			}
		};
	};

	function handleSwitchTenant(tenantId: string): SubmitFunction {
		return ({ cancel }) => {
			if (switchingTenantId) {
				cancel();
				return;
			}
			switchingTenantId = tenantId;
			return async ({ update }) => {
				try {
					await update();
				} finally {
					switchingTenantId = null;
				}
			};
		};
	}

	function handleRowAction(
		id: string,
		kind: 'toggle' | 'update' | 'delete'
	): SubmitFunction {
		return ({ cancel }) => {
			if (pendingActions[id]) {
				cancel();
				return;
			}
			pendingActions[id] = kind;
			return async ({ result, update }) => {
				try {
					await update();
					if (kind === 'update' && result.type === 'success') {
						cancelEditing();
					}
				} finally {
					delete pendingActions[id];
				}
			};
		};
	}
</script>

<svelte:head>
	<title>TODO Sample — Agent Ready App</title>
</svelte:head>

{#snippet stableSubmitLabel(
	pending: boolean,
	idleText: string,
	pendingText: string,
	gapClass: string,
	iconSizeClass: string,
	IdleIcon: typeof PlusIcon
)}
	<span class="inline-grid place-items-center">
		<span
			class={[
				'col-start-1 row-start-1 inline-flex items-center justify-center',
				gapClass,
				pending && 'invisible'
			]}
			aria-hidden={pending ? 'true' : undefined}
		>
			<IdleIcon class={iconSizeClass} />
			<span>{idleText}</span>
		</span>
		<span
			class={[
				'col-start-1 row-start-1 inline-flex items-center justify-center',
				gapClass,
				!pending && 'invisible'
			]}
			aria-hidden={!pending ? 'true' : undefined}
		>
			{#if pending}
				<Spinner class={iconSizeClass} />
			{:else}
				<span class={['shrink-0', iconSizeClass]} aria-hidden="true"></span>
			{/if}
			<span>{pendingText}</span>
		</span>
	</span>
{/snippet}

<div class="flex flex-col gap-4">
	<Card.Root>
		<Card.Header>
			<div class="flex flex-wrap items-center justify-between gap-2">
				<div>
					<Card.Title>{isStandard ? 'TODO Sample' : 'Firestore TODO Sample'}</Card.Title>
					<Card.Description>
						Create, Read, Update, and Delete items via SvelteKit <code>load()</code> and form
						<code>actions</code>.
					</Card.Description>
				</div>
				<div class="flex flex-wrap items-center gap-2">
					{#if isStandard}
						<Badge variant={data.apiConfigured ? 'secondary' : 'outline'}>
							connect-rpc / postgres-rls
						</Badge>
						{#if data.activeTenant}
							<Badge variant="outline" class="font-mono text-xs">
								<Building2Icon data-icon="inline-start" />
								{data.activeTenant.name} (@{data.activeTenant.slug})
							</Badge>
						{/if}
					{:else}
						<Badge variant="outline">firestore</Badge>
						<Badge variant={data.firestore.mode === 'unconfigured' ? 'outline' : 'secondary'}>
							{data.firestore.mode}
						</Badge>
						{#if data.firestore.emulatorHost}
							<Badge variant="outline" class="font-mono text-xs">{data.firestore.emulatorHost}</Badge>
						{/if}
					{/if}
				</div>
			</div>
		</Card.Header>
		<Card.Content class="flex flex-col gap-4">
			{#if isStandard && data.tenants.length > 1}
				<div class="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-muted/40 p-3">
					<span class="text-xs font-medium text-muted-foreground">Workspace tenant:</span>
					<div class="flex flex-wrap items-center gap-1.5">
						{#each data.tenants as tenant (tenant.id)}
							{@const isActive = data.activeTenant?.id === tenant.id}
							<form
								method="POST"
								action="?/switchTenant"
								use:enhance={handleSwitchTenant(tenant.id)}
							>
								<input type="hidden" name="tenantId" value={tenant.id} />
								<Button
									type="submit"
									size="sm"
									variant={isActive ? 'secondary' : 'outline'}
									disabled={isActive || switchingTenantId !== null}
								>
									{#if switchingTenantId === tenant.id}
										<Spinner data-icon="inline-start" />
									{:else}
										<Building2Icon data-icon="inline-start" />
									{/if}
									{tenant.name}
								</Button>
							</form>
						{/each}
					</div>
				</div>
			{/if}

			{#if isBackendUnconfigured}
				<Alert.Root>
					<CircleAlertIcon />
					{#if isStandard}
						<Alert.Title>Connect RPC API not configured</Alert.Title>
						<Alert.Description>
							Set <code>API_BASE_URL=http://localhost:8081</code> and
							<code>INTERNAL_API_JWT_SECRET</code> in <code>.env</code> to persist tenant-scoped
							TODO items via PostgreSQL RLS.
						</Alert.Description>
					{:else}
						<Alert.Title>Firestore not configured</Alert.Title>
						<Alert.Description>
							Set <code>FIRESTORE_EMULATOR_HOST=localhost:8080</code> (with
							<code>wslc</code>) or <code>GOOGLE_CLOUD_PROJECT</code> in <code>.env</code> to persist
							TODO items.
						</Alert.Description>
					{/if}
				</Alert.Root>
			{:else if data.connectionError}
				<Alert.Root variant="destructive">
					<CircleAlertIcon />
					<Alert.Title>
						{isStandard ? 'Connect RPC API connection issue' : 'Firestore connection issue'}
					</Alert.Title>
					<Alert.Description>{data.connectionError}</Alert.Description>
				</Alert.Root>
			{/if}

			{#if form?.error}
				<Alert.Root variant="destructive">
					<CircleAlertIcon />
					<Alert.Title>Operation failed</Alert.Title>
					<Alert.Description>{form.error}</Alert.Description>
				</Alert.Root>
			{/if}

			<form method="POST" action="?/create" class="flex gap-2" use:enhance={handleCreate}>
				<Input
					name="title"
					placeholder={isStandard
						? 'Add a task to verify Connect RPC + PostgreSQL RLS CRUD...'
						: 'Add a task to verify Firestore CRUD...'}
					bind:value={newTitle}
					maxlength={200}
					disabled={isBackendUnconfigured || creating}
					required
				/>
				<Button type="submit" disabled={isBackendUnconfigured || creating}>
					{@render stableSubmitLabel(
						creating,
						'Add',
						'Adding...',
						'gap-1.5',
						'size-4',
						PlusIcon
					)}
				</Button>
			</form>
		</Card.Content>
	</Card.Root>

	<Card.Root>
		<Card.Header>
			<div class="flex items-center justify-between gap-2">
				<Card.Title class="text-base">Tasks ({data.todos.length})</Card.Title>
				<span class="font-mono text-xs text-muted-foreground">
					{#if isStandard}
						{data.activeTenant ? `tenant/${data.activeTenant.slug}/todos` : 'tenant/unresolved/todos'}
					{:else}
						users/{data.user.id}/todos
					{/if}
				</span>
			</div>
		</Card.Header>
		<Card.Content>
			{#if data.todos.length === 0}
				<p class="py-6 text-center text-sm text-muted-foreground">
					{isStandard
						? 'No tasks stored yet. Create one above to test Connect RPC + PostgreSQL RLS persistence.'
						: 'No tasks stored yet. Create one above to test Firestore persistence.'}
				</p>
			{:else}
				<ul class="divide-y divide-border">
					{#each data.todos as todo (todo.id)}
						{@const rowPending = pendingActions[todo.id]}
						<li class="flex flex-wrap items-center justify-between gap-2 py-3 first:pt-0 last:pb-0">
							{#if editingId === todo.id}
								<form
									method="POST"
									action="?/update"
									class="flex flex-1 items-center gap-2"
									use:enhance={handleRowAction(todo.id, 'update')}
								>
									<input type="hidden" name="id" value={todo.id} />
									<Input
										name="title"
										bind:value={editingTitle}
										maxlength={200}
										disabled={rowPending === 'update'}
										required
									/>
									<Button type="submit" size="sm" disabled={rowPending === 'update'}>
										{@render stableSubmitLabel(
											rowPending === 'update',
											'Save',
											'Saving...',
											'gap-1',
											'size-3.5',
											CheckIcon
										)}
									</Button>
									<Button
										type="button"
										variant="ghost"
										size="sm"
										disabled={rowPending === 'update'}
										onclick={cancelEditing}
									>
										<XIcon data-icon="inline-start" />
										Cancel
									</Button>
								</form>
							{:else}
								<div class="flex min-w-0 flex-1 items-center gap-3">
									<form method="POST" action="?/toggle" use:enhance={handleRowAction(todo.id, 'toggle')}>
										<input type="hidden" name="id" value={todo.id} />
										<input type="hidden" name="completed" value={String(!todo.completed)} />
										<Button
											type="submit"
											variant={todo.completed ? 'secondary' : 'outline'}
											size="icon-sm"
											disabled={Boolean(rowPending)}
											aria-label={todo.completed ? 'Mark as incomplete' : 'Mark as complete'}
										>
											{#if rowPending === 'toggle'}
												<Spinner />
											{:else if todo.completed}
												<CheckIcon />
											{/if}
										</Button>
									</form>
									<div class="min-w-0 flex-1">
										<p
											class={[
												'truncate text-sm font-medium',
												todo.completed && 'text-muted-foreground line-through'
											]}
										>
											{todo.title}
										</p>
										{#if todo.updatedAt}
											<p class="text-xs text-muted-foreground">Updated {todo.updatedAt}</p>
										{/if}
									</div>
								</div>
								<div class="flex items-center gap-1">
									<Button
										type="button"
										variant="ghost"
										size="icon-sm"
										aria-label="Edit task"
										disabled={Boolean(rowPending) || isSavingEdit}
										onclick={() => startEditing(todo.id, todo.title)}
									>
										<PencilIcon />
									</Button>
									<form method="POST" action="?/delete" use:enhance={handleRowAction(todo.id, 'delete')}>
										<input type="hidden" name="id" value={todo.id} />
										<Button
											type="submit"
											variant="ghost"
											size="icon-sm"
											aria-label="Delete task"
											disabled={Boolean(rowPending)}
											class="text-destructive hover:text-destructive"
										>
											{#if rowPending === 'delete'}
												<Spinner />
											{:else}
												<Trash2Icon />
											{/if}
										</Button>
									</form>
								</div>
							{/if}
						</li>
					{/each}
				</ul>
			{/if}
		</Card.Content>
	</Card.Root>
</div>
