<script lang="ts">
	import type { Component } from 'svelte';
	import { page } from '$app/state';
	import ChevronRightIcon from '@lucide/svelte/icons/chevron-right';
	import * as Collapsible from '#lib/components/ui/collapsible/index.js';
	import * as Sidebar from '#lib/components/ui/sidebar/index.js';

	interface NavItem {
		title: string;
		url: string;
		icon?: Component<{ class?: string }>;
		isActive?: boolean;
		items?: {
			title: string;
			url: string;
			icon?: Component<{ class?: string }>;
		}[];
	}

	let { items }: { items: NavItem[] } = $props();

	function isRouteActive(url: string, pathname: string): boolean {
		if (url.startsWith('#')) return false;
		if (url === '/') return pathname === '/';
		return pathname === url || pathname.startsWith(`${url}/`);
	}

	function hasActiveChild(item: NavItem, pathname: string): boolean {
		return item.items?.some((subItem) => isRouteActive(subItem.url, pathname)) ?? false;
	}
</script>

<Sidebar.Group>
	<Sidebar.GroupLabel>Platform</Sidebar.GroupLabel>
	<Sidebar.Menu>
		{#each items as item (item.title)}
			{@const groupActive = hasActiveChild(item, page.url.pathname)}
			<Collapsible.Root open={Boolean(item.isActive) || groupActive} class="group/collapsible">
				{#snippet child({ props })}
					<Sidebar.MenuItem {...props}>
						<Collapsible.Trigger>
							{#snippet child({ props })}
								<Sidebar.MenuButton {...props} tooltipContent={item.title} isActive={groupActive}>
									{#if item.icon}
										<item.icon />
									{/if}
									<span>{item.title}</span>
									<ChevronRightIcon
										class="ms-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90"
									/>
								</Sidebar.MenuButton>
							{/snippet}
						</Collapsible.Trigger>
						<Collapsible.Content>
							<Sidebar.MenuSub>
								{#each item.items ?? [] as subItem (subItem.title)}
									<Sidebar.MenuSubItem>
										<Sidebar.MenuSubButton
											isActive={isRouteActive(subItem.url, page.url.pathname)}
											tooltipContent={subItem.title}
											class="data-active:font-medium"
										>
											{#snippet child({ props })}
												<a href={subItem.url} {...props}>
													{#if subItem.icon}
														<subItem.icon />
													{/if}
													<span>{subItem.title}</span>
												</a>
											{/snippet}
										</Sidebar.MenuSubButton>
									</Sidebar.MenuSubItem>
								{/each}
							</Sidebar.MenuSub>
						</Collapsible.Content>
					</Sidebar.MenuItem>
				{/snippet}
			</Collapsible.Root>
		{/each}
	</Sidebar.Menu>
</Sidebar.Group>
