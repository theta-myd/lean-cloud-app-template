<script lang="ts">
	import { page } from '$app/state';
	import AppSidebar from '#lib/components/app-sidebar.svelte';
	import * as Breadcrumb from '#lib/components/ui/breadcrumb/index.js';
	import { Separator } from '#lib/components/ui/separator/index.js';
	import * as Sidebar from '#lib/components/ui/sidebar/index.js';
	import type { LayoutProps } from './$types';

	let { data, children }: LayoutProps = $props();

	const pageTitles: Record<string, string> = {
		'/': 'Overview',
		'/todos': 'TODO Sample',
		'/licenses': 'Licenses'
	};

	const currentTitle = $derived.by(() => {
		const pathname = page.url.pathname;
		if (pathname in pageTitles) return pageTitles[pathname];
		const segment = pathname.split('/').filter(Boolean).pop();
		return segment ? segment.charAt(0).toUpperCase() + segment.slice(1) : 'Overview';
	});
</script>

<Sidebar.Provider>
	<AppSidebar user={data.user} />
	<Sidebar.Inset>
		<header class="flex h-12 shrink-0 items-center gap-2 transition-[width,height] ease-linear">
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
							<Breadcrumb.Page>{currentTitle}</Breadcrumb.Page>
						</Breadcrumb.Item>
					</Breadcrumb.List>
				</Breadcrumb.Root>
			</div>
		</header>

		<div class="flex flex-1 flex-col gap-4 p-4 pt-0">
			{@render children()}
		</div>
	</Sidebar.Inset>
</Sidebar.Provider>
