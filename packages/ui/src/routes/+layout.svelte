<!--
  The playground shell: the host-side stylesheets and the running head every route
  is reached from. Both stylesheets are global imports, so the shared chrome
  reaches every route's markup rather than being scoped out of it:
  `playground.css` derives the `--pg-*` scale, `chrome.css` is the recipes that
  read it. Nothing here mounts, loads, or frees a session: the routes own that.
-->
<script lang="ts">
	import './playground.css';
	import './chrome.css';
	import { base } from '$app/paths';
	import { page } from '$app/state';

	let { children } = $props();

	// Named for what the page shows.
	const ROUTES = [
		{ path: '/', label: 'Overview' },
		{ path: '/preview', label: 'Preview' },
		{ path: '/visual', label: 'Visual' },
		{ path: '/editor', label: 'Editor' }
	];

	// The path with the deploy's base prefix removed: a project-subpath host
	// (`/quillmark-js`) leaves the root as the bare base, so the empty
	// remainder is `/`.
	const here = $derived(page.url.pathname.slice(base.length) || '/');
</script>

<header class="head">
	<div class="pg-width head-row">
		<a class="mark" href="{base}/">quillmark<span class="slash">/</span>editor</a>
		<nav class="nav" aria-label="Playground">
			{#each ROUTES as route (route.path)}
				<a
					href="{base}{route.path}"
					class="nav-link"
					aria-current={here === route.path ? 'page' : undefined}>{route.label}</a
				>
			{/each}
		</nav>
	</div>
</header>

{@render children()}

<style>
	/* A running head, sticky so the switch between surfaces is always one click
	   away; one hairline, no fill; a rule on the page, not a bar over it. */
	.head {
		position: sticky;
		top: 0;
		z-index: 1;
		background: var(--pg-page);
		border-bottom: var(--pg-border-width) solid var(--pg-border);
	}

	.head-row {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--pg-space-2) var(--pg-space-6);
		padding-block: var(--pg-space-3);
	}

	.mark {
		font-family: var(--pg-font-mono);
		font-size: var(--pg-text-label);
		font-weight: var(--pg-weight-mid);
		line-height: var(--pg-leading-tight);
		color: var(--pg-ink);
		text-decoration: none;
		margin-inline-end: auto;
	}

	.slash {
		color: var(--pg-ghost);
	}

	.nav {
		display: flex;
		gap: var(--pg-space-4);
	}

	/* The current route takes a rule under it, not a fill. */
	.nav-link {
		font-family: var(--pg-font-mono);
		font-size: var(--pg-text-label);
		line-height: var(--pg-leading-tight);
		color: var(--pg-ink-meta);
		text-decoration: none;
		padding-block: var(--pg-space-half);
		border-bottom: var(--pg-ring-width) solid transparent;
		transition: color var(--pg-duration) var(--pg-ease-reverse);
	}

	.nav-link:hover {
		color: var(--pg-ink);
	}

	.nav-link[aria-current='page'] {
		color: var(--pg-ink);
		border-bottom-color: var(--pg-ink);
	}
</style>
