<script lang="ts">
	import { goto } from '$app/navigation';
	import * as Alert from '#lib/components/ui/alert/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as Card from '#lib/components/ui/card/index.js';
	import {
		Field,
		FieldDescription,
		FieldGroup,
		FieldLabel,
		FieldSeparator
	} from '#lib/components/ui/field/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { authClient } from '#lib/auth-client.js';
	import { cn } from '#lib/utils.js';
	import ThemeToggle from '#lib/components/theme-toggle.svelte';
	import CircleAlertIcon from '@lucide/svelte/icons/circle-alert';
	import LoaderCircleIcon from '@lucide/svelte/icons/loader-circle';
	import type { HTMLAttributes } from 'svelte/elements';

	interface Props extends HTMLAttributes<HTMLDivElement> {
		enableE2ePasswordAuth?: boolean;
		googleOAuthConfigured?: boolean;
	}

	let {
		class: className,
		enableE2ePasswordAuth = false,
		googleOAuthConfigured = false,
		...restProps
	}: Props = $props();

	const id = $props.id();

	let email = $state('');
	let password = $state('');
	let errorMessage = $state<string | null>(null);
	let pendingMode = $state<'google' | 'password' | null>(null);

	async function handleGoogleLogin() {
		errorMessage = null;
		pendingMode = 'google';
		try {
			const res = await authClient.signIn.social({
				provider: 'google',
				callbackURL: '/'
			});
			if (res.error) {
				errorMessage = res.error.message || 'Google sign-in failed.';
			}
		} catch (err) {
			errorMessage = err instanceof Error ? err.message : 'Google sign-in failed.';
		} finally {
			pendingMode = null;
		}
	}

	async function handlePasswordLogin(event: SubmitEvent) {
		event.preventDefault();
		errorMessage = null;
		pendingMode = 'password';
		try {
			const res = await authClient.signIn.email({
				email,
				password,
				callbackURL: '/'
			});
			if (res.error) {
				errorMessage = res.error.message || 'Invalid email or password.';
				return;
			}
			await goto('/');
		} catch (err) {
			errorMessage = err instanceof Error ? err.message : 'Sign-in failed.';
		} finally {
			pendingMode = null;
		}
	}
</script>

<div class={cn('flex flex-col gap-6', className)} {...restProps}>
	<Card.Root>
		<Card.Header class="text-center">
			<div class="relative flex items-center justify-center">
				<Card.Title class="text-xl">Welcome back</Card.Title>
				<div class="absolute end-0 top-1/2 -translate-y-1/2">
					<ThemeToggle />
				</div>
			</div>
			<Card.Description>Sign in with your authorized Google account</Card.Description>
		</Card.Header>
		<Card.Content class="flex flex-col gap-4">
			{#if errorMessage}
				<Alert.Root variant="destructive">
					<CircleAlertIcon />
					<Alert.Title>Authentication error</Alert.Title>
					<Alert.Description>{errorMessage}</Alert.Description>
				</Alert.Root>
			{/if}

			<form onsubmit={handlePasswordLogin}>
				<FieldGroup>
					<Field>
						<Button
							variant="outline"
							type="button"
							disabled={pendingMode !== null || !googleOAuthConfigured}
							onclick={handleGoogleLogin}
						>
							{#if pendingMode === 'google'}
								<LoaderCircleIcon data-icon="inline-start" class="animate-spin" />
							{:else}
								<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden="true">
									<path
										d="M12.48 10.92v3.28h7.84c-.24 1.84-.853 3.187-1.787 4.133-1.147 1.147-2.933 2.4-6.053 2.4-4.827 0-8.6-3.893-8.6-8.72s3.773-8.72 8.6-8.72c2.6 0 4.507 1.027 5.907 2.347l2.307-2.307C18.747 1.44 16.133 0 12.48 0 5.867 0 .307 5.387.307 12s5.56 12 12.173 12c3.573 0 6.267-1.173 8.373-3.36 2.16-2.16 2.84-5.213 2.84-7.667 0-.76-.053-1.467-.173-2.053H12.48z"
										fill="currentColor"
									/>
								</svg>
							{/if}
							Continue with Google
						</Button>
						{#if !googleOAuthConfigured}
							<FieldDescription class="text-center">
								Set <code>GOOGLE_CLIENT_ID</code> and <code>GOOGLE_CLIENT_SECRET</code> in <code>.env</code> to enable Google OAuth.
							</FieldDescription>
						{/if}
					</Field>

					{#if enableE2ePasswordAuth}
						<FieldSeparator class="*:data-[slot=field-separator-content]:bg-card">
							Local / E2E Test Login
						</FieldSeparator>
						<Field>
							<FieldLabel for="email-{id}">Email</FieldLabel>
							<Input
								id="email-{id}"
								type="email"
								placeholder="dev@example.com"
								autocomplete="email"
								bind:value={email}
								required
							/>
						</Field>
						<Field>
							<FieldLabel for="password-{id}">Password</FieldLabel>
							<Input
								id="password-{id}"
								type="password"
								autocomplete="current-password"
								bind:value={password}
								required
							/>
						</Field>
						<Field>
							<Button type="submit" disabled={pendingMode !== null}>
								{#if pendingMode === 'password'}
									<LoaderCircleIcon data-icon="inline-start" class="animate-spin" />
								{/if}
								Sign in with Email
							</Button>
						</Field>
					{/if}
				</FieldGroup>
			</form>
		</Card.Content>
	</Card.Root>
	<FieldDescription class="px-6 text-center">
		Protected by Better Auth &amp; allowlist access control.
	</FieldDescription>
</div>
