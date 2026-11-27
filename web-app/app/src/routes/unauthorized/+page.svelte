<script lang="ts">
	import { goto } from '$app/navigation';
	import { authClient } from '#lib/auth-client.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as Card from '#lib/components/ui/card/index.js';
	import ShieldAlertIcon from '@lucide/svelte/icons/shield-alert';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	async function handleSignOut() {
		await authClient.signOut();
		await goto('/login');
	}
</script>

<svelte:head>
	<title>Access Denied — Lean Cloud App</title>
</svelte:head>

<div class="flex min-h-svh items-center justify-center bg-muted p-6">
	<Card.Root class="w-full max-w-md">
		<Card.Header class="text-center">
			<div class="mx-auto flex size-10 items-center justify-center rounded-full bg-destructive/10 text-destructive">
				<ShieldAlertIcon class="size-5" />
			</div>
			<Card.Title class="text-xl">Access restricted</Card.Title>
			<Card.Description>
				{#if data.email}
					The account <strong>{data.email}</strong> is not in the allowlist for this application.
				{:else}
					Your account is not authorized to access this application.
				{/if}
			</Card.Description>
		</Card.Header>
		<Card.Footer class="justify-center">
			<Button variant="outline" onclick={handleSignOut}>Sign out</Button>
		</Card.Footer>
	</Card.Root>
</div>
