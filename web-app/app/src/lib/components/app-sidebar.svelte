<script lang="ts" module>
	import ActivityIcon from '@lucide/svelte/icons/activity';
	import BookOpenIcon from '@lucide/svelte/icons/book-open';
	import CloudIcon from '@lucide/svelte/icons/cloud';
	import DatabaseIcon from '@lucide/svelte/icons/database';
	import GalleryVerticalEndIcon from '@lucide/svelte/icons/gallery-vertical-end';
	import HomeIcon from '@lucide/svelte/icons/home';
	import KeyRoundIcon from '@lucide/svelte/icons/key-round';
	import LayoutDashboardIcon from '@lucide/svelte/icons/layout-dashboard';
	import ListTodoIcon from '@lucide/svelte/icons/list-todo';
	import ServerIcon from '@lucide/svelte/icons/server';
	import Settings2Icon from '@lucide/svelte/icons/settings-2';
	import ShieldCheckIcon from '@lucide/svelte/icons/shield-check';
	import UserCheckIcon from '@lucide/svelte/icons/user-check';

	const lightNavData = {
		navMain: [
			{
				title: 'Workspace',
				url: '/',
				icon: LayoutDashboardIcon,
				isActive: true,
				items: [
					{ title: 'Overview', url: '/', icon: HomeIcon },
					{ title: 'TODO Sample', url: '/todos', icon: ListTodoIcon },
					{ title: 'Health Check', url: '/api/health', icon: ActivityIcon }
				]
			},
			{
				title: 'Architecture',
				url: '#architecture',
				icon: BookOpenIcon,
				items: [
					{ title: 'Cloud Run v2', url: '#compute', icon: ServerIcon },
					{ title: 'Firestore Standard', url: '#datastore', icon: DatabaseIcon },
					{ title: 'Better Auth', url: '#auth', icon: KeyRoundIcon }
				]
			},
			{
				title: 'Settings',
				url: '#settings',
				icon: Settings2Icon,
				items: [{ title: 'Access Control', url: '#auth', icon: UserCheckIcon }]
			}
		],
		projects: [
			{ name: 'Cloud Run (min=0)', url: '#compute', icon: CloudIcon },
			{ name: 'Firestore Native', url: '#datastore', icon: DatabaseIcon },
			{ name: 'Allowlist & OAuth', url: '#auth', icon: ShieldCheckIcon }
		]
	};

	const standardNavData = {
		navMain: [
			{
				title: 'Workspace',
				url: '/',
				icon: LayoutDashboardIcon,
				isActive: true,
				items: [
					{ title: 'Overview', url: '/', icon: HomeIcon },
					{ title: 'TODO Sample', url: '/todos', icon: ListTodoIcon },
					{ title: 'Health Check', url: '/api/health', icon: ActivityIcon }
				]
			},
			{
				title: 'Architecture',
				url: '#architecture',
				icon: BookOpenIcon,
				items: [
					{ title: 'Cloud Run (BFF + API)', url: '#compute', icon: ServerIcon },
					{ title: 'PostgreSQL + RLS', url: '#datastore', icon: DatabaseIcon },
					{ title: 'Better Auth (DB)', url: '#auth', icon: KeyRoundIcon }
				]
			},
			{
				title: 'Settings',
				url: '#settings',
				icon: Settings2Icon,
				items: [{ title: 'Access Control', url: '#auth', icon: UserCheckIcon }]
			}
		],
		projects: [
			{ name: 'Connect RPC API', url: '#compute', icon: CloudIcon },
			{ name: 'PostgreSQL RLS', url: '#datastore', icon: DatabaseIcon },
			{ name: 'DB Sessions & OAuth', url: '#auth', icon: ShieldCheckIcon }
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
		architectureVariant?: 'light' | 'standard';
		activeTenant?: {
			name: string;
			slug: string;
			isPersonal: boolean;
		} | null;
	}

	let {
		user,
		architectureVariant = 'light',
		activeTenant = null,
		ref = $bindable(null),
		collapsible = 'icon',
		...restProps
	}: Props = $props();

	const navData = $derived(architectureVariant === 'standard' ? standardNavData : lightNavData);
</script>

<Sidebar.Root bind:ref {collapsible} {...restProps}>
	<Sidebar.Header class="h-12 justify-center">
		<Sidebar.Menu>
			<Sidebar.MenuItem>
				<Sidebar.MenuButton class="data-[slot=sidebar-menu-button]:p-1.5!">
					{#snippet child({ props })}
						<a href="/" {...props}>
							<GalleryVerticalEndIcon class="size-5!" />
							<span class="truncate text-base font-semibold">
								{activeTenant ? activeTenant.name : 'Agent Ready App'}
							</span>
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
