<script lang="ts">
	import { cn, type WithElementRef } from "#lib/utils.js";
	import type { HTMLAttributes } from "svelte/elements";

	let {
		ref = $bindable(null),
		class: className,
		children,
		...restProps
	}: WithElementRef<HTMLAttributes<HTMLUListElement>> = $props();
</script>

<ul
	bind:this={ref}
	data-slot="sidebar-menu-sub"
	data-sidebar="menu-sub"
	class={cn(
		"border-sidebar-border mx-3.5 translate-x-px gap-1 border-l px-2.5 py-0.5 flex min-w-0 flex-col group-data-[collapsible=icon]:mx-0 group-data-[collapsible=icon]:mt-0.5 group-data-[collapsible=icon]:translate-x-0 group-data-[collapsible=icon]:border-l-2 group-data-[collapsible=icon]:border-sidebar-border/80 group-data-[collapsible=icon]:ps-0.5 group-data-[collapsible=icon]:pe-0 group-data-[collapsible=icon]:py-0.5",
		className
	)}
	{...restProps}
>
	{@render children?.()}
</ul>
