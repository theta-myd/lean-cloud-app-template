<script lang="ts">
	import { navigating, page } from '$app/state';
	import AppSidebar from '#lib/components/app-sidebar.svelte';
	import * as Breadcrumb from '#lib/components/ui/breadcrumb/index.js';
	import { Separator } from '#lib/components/ui/separator/index.js';
	import * as Sidebar from '#lib/components/ui/sidebar/index.js';
	import { Skeleton } from '#lib/components/ui/skeleton/index.js';
	import type { LayoutProps } from './$types';

	let { data, children }: LayoutProps = $props();

	const pageTitles: Record<string, string> = {
		'/': 'Overview',
		'/todos': 'TODO Sample',
		'/licenses': 'Licenses'
	};

	const activePathname = $derived(navigating.to?.url.pathname ?? page.url.pathname);

	const currentTitle = $derived.by(() => {
		if (activePathname in pageTitles) return pageTitles[activePathname];
		const segment = activePathname.split('/').filter(Boolean).pop();
		return segment ? segment.charAt(0).toUpperCase() + segment.slice(1) : 'Overview';
	});
</script>

<Sidebar.Provider>
	<AppSidebar
		user={data.user}
		architectureVariant={data.architectureVariant}
		activeTenant={data.activeTenant}
	/>
	<Sidebar.Inset>
		<header class="flex h-12 shrink-0 items-center gap-2 transition-[width,height] ease-linear">
			<div class="flex items-center gap-2 px-4">
				<Sidebar.Trigger class="-ms-1" />
				<Separator orientation="vertical" class="me-2 data-vertical:h-4 data-vertical:self-auto" />
				<Breadcrumb.Root>
					<Breadcrumb.List>
						<Breadcrumb.Item class="hidden md:block">
							<Breadcrumb.Link href="/">Agent Ready App</Breadcrumb.Link>
						</Breadcrumb.Item>
						<Breadcrumb.Separator class="hidden md:block" />
						<Breadcrumb.Item>
							<Breadcrumb.Page>{currentTitle}</Breadcrumb.Page>
						</Breadcrumb.Item>
					</Breadcrumb.List>
				</Breadcrumb.Root>
			</div>
		</header>

		<div class="flex flex-1 flex-col gap-4 p-4 pt-0">
			{#await navigating.complete}
				<div
					class="flex flex-1 flex-col gap-4"
					role="status"
					aria-busy="true"
					aria-label="Loading page"
				>
					<div class="grid gap-4 md:grid-cols-3">
						<Skeleton class="h-36 w-full rounded-xl" />
						<Skeleton class="h-36 w-full rounded-xl" />
						<Skeleton class="h-36 w-full rounded-xl" />
					</div>
					<Skeleton class="min-h-64 flex-1 rounded-xl" />
				</div>
			{:then}
				{@render children()}
			{:catch}
				{@render children()}
			{/await}
		</div>
	</Sidebar.Inset>
</Sidebar.Provider>
