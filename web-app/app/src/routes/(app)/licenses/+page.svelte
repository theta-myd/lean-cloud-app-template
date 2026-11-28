<script lang="ts">
	import { Badge } from '#lib/components/ui/badge/index.js';
	import * as Card from '#lib/components/ui/card/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import ExternalLinkIcon from '@lucide/svelte/icons/external-link';
	import ScaleIcon from '@lucide/svelte/icons/scale';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	let query = $state('');

	const filteredPackages = $derived.by(() => {
		const normalized = query.trim().toLowerCase();
		if (!normalized) return data.packages;
		return data.packages.filter(
			(pkg) =>
				pkg.name.toLowerCase().includes(normalized) ||
				pkg.license.toLowerCase().includes(normalized) ||
				(pkg.author?.toLowerCase().includes(normalized) ?? false)
		);
	});
</script>

<svelte:head>
	<title>Licenses — Agent Ready App</title>
</svelte:head>

<div class="flex flex-col gap-4">
	<Card.Root>
		<Card.Header>
			<div class="flex flex-wrap items-center justify-between gap-2">
				<div class="flex items-center gap-2">
					<ScaleIcon class="size-5 text-muted-foreground" />
					<div>
						<Card.Title>Open-Source Licenses</Card.Title>
						<Card.Description>
							Third-party packages shipped to the browser. Full server &amp; client notices are
							included in <code>licenses.txt</code> on build.
						</Card.Description>
					</div>
				</div>
				<Badge variant="secondary">{filteredPackages.length} / {data.packages.length}</Badge>
			</div>
		</Card.Header>
		<Card.Content>
			<Input
				type="search"
				placeholder="Filter packages by name, SPDX license, or author..."
				bind:value={query}
			/>
		</Card.Content>
	</Card.Root>

	<div class="grid gap-3">
		{#each filteredPackages as pkg (`${pkg.name}@${pkg.version}`)}
			<Card.Root>
				<Card.Header class="pb-3">
					<div class="flex flex-wrap items-center justify-between gap-2">
						<div class="flex flex-wrap items-center gap-2">
							<Card.Title class="font-mono text-sm">{pkg.name}</Card.Title>
							<Badge variant="outline" class="font-mono text-xs">v{pkg.version}</Badge>
							<Badge variant="secondary" class="text-xs">{pkg.license}</Badge>
						</div>
						{#if pkg.repository}
							<a
								href={pkg.repository}
								target="_blank"
								rel="noopener noreferrer"
								class="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
							>
								<span>Repository</span>
								<ExternalLinkIcon class="size-3" />
							</a>
						{/if}
					</div>
					{#if pkg.author}
						<Card.Description class="text-xs">Author: {pkg.author}</Card.Description>
					{/if}
				</Card.Header>
				<Card.Content class="pt-0">
					<details class="rounded-md border border-border bg-muted/40 px-3 py-2 text-xs">
						<summary class="cursor-pointer font-medium text-muted-foreground select-none">
							View license notice
						</summary>
						<pre class="mt-2 max-h-64 overflow-auto font-mono leading-relaxed whitespace-pre-wrap text-foreground/90">{pkg.licenseText}</pre>
					</details>
				</Card.Content>
			</Card.Root>
		{/each}
	</div>
</div>
