<script lang="ts">
	import CheckIcon from '@lucide/svelte/icons/check';
	import MonitorIcon from '@lucide/svelte/icons/monitor';
	import MoonIcon from '@lucide/svelte/icons/moon';
	import SunIcon from '@lucide/svelte/icons/sun';
	import { resetMode, setMode, userPrefersMode } from 'mode-watcher';
	import * as DropdownMenu from '#lib/components/ui/dropdown-menu/index.js';

	const themeOptions = [
		{ value: 'light', label: 'Light', icon: SunIcon, select: () => setMode('light') },
		{ value: 'dark', label: 'Dark', icon: MoonIcon, select: () => setMode('dark') },
		{ value: 'system', label: 'System', icon: MonitorIcon, select: () => resetMode() }
	] as const;
</script>

{#each themeOptions as option (option.value)}
	<DropdownMenu.Item onclick={option.select}>
		<option.icon />
		<span>{option.label}</span>
		{#if userPrefersMode.current === option.value}
			<CheckIcon class="ms-auto" />
		{/if}
	</DropdownMenu.Item>
{/each}
