<script lang="ts" module>
	import BookOpenIcon from '@lucide/svelte/icons/book-open';
	import CloudIcon from '@lucide/svelte/icons/cloud';
	import DatabaseIcon from '@lucide/svelte/icons/database';
	import GalleryVerticalEndIcon from '@lucide/svelte/icons/gallery-vertical-end';
	import LayoutDashboardIcon from '@lucide/svelte/icons/layout-dashboard';
	import Settings2Icon from '@lucide/svelte/icons/settings-2';
	import ShieldCheckIcon from '@lucide/svelte/icons/shield-check';

	const navData = {
		navMain: [
			{
				title: 'Workspace',
				url: '/',
				icon: LayoutDashboardIcon,
				isActive: true,
				items: [
					{ title: 'Overview', url: '/' },
					{ title: 'Health Check', url: '/api/health' }
				]
			},
			{
				title: 'Architecture',
				url: '#architecture',
				icon: BookOpenIcon,
				items: [
					{ title: 'Cloud Run v2', url: '#compute' },
					{ title: 'Firestore Standard', url: '#datastore' },
					{ title: 'Better Auth', url: '#auth' }
				]
			},
			{
				title: 'Settings',
				url: '#settings',
				icon: Settings2Icon,
				items: [{ title: 'Access Control', url: '#auth' }]
			}
		],
		projects: [
			{ name: 'Cloud Run (min=0)', url: '#compute', icon: CloudIcon },
			{ name: 'Firestore Native', url: '#datastore', icon: DatabaseIcon },
			{ name: 'Allowlist & OAuth', url: '#auth', icon: ShieldCheckIcon }
		]
	};
</script>

<script lang="ts">
	import * as Sidebar from '#lib/components/ui/sidebar/index.js';
	import NavMain from './nav-main.svelte';
	import NavProjects from './nav-projects.svelte';
	import NavUser from './nav-user.svelte';
	import type { ComponentProps } from 'svelte';

	interface Props extends ComponentProps<typeof Sidebar.Root> {
		user: {
			name: string;
			email: string;
			image?: string | null;
		};
	}

	let {
		user,
		ref = $bindable(null),
		collapsible = 'icon',
		...restProps
	}: Props = $props();
</script>

<Sidebar.Root bind:ref {collapsible} {...restProps}>
	<Sidebar.Header class="h-12 justify-center">
		<Sidebar.Menu>
			<Sidebar.MenuItem>
				<Sidebar.MenuButton class="data-[slot=sidebar-menu-button]:p-1.5!">
					{#snippet child({ props })}
						<a href="/" {...props}>
							<GalleryVerticalEndIcon class="size-5!" />
							<span class="text-base font-semibold">Lean Cloud App</span>
						</a>
					{/snippet}
				</Sidebar.MenuButton>
			</Sidebar.MenuItem>
		</Sidebar.Menu>
	</Sidebar.Header>
	<Sidebar.Content>
		<NavMain items={navData.navMain} />
		<NavProjects projects={navData.projects} />
	</Sidebar.Content>
	<Sidebar.Footer>
		<NavUser {user} />
	</Sidebar.Footer>
	<Sidebar.Rail />
</Sidebar.Root>
