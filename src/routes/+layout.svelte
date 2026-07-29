<!--
  The playground shell: the host-side stylesheets, the running head every route is
  reached from, and the foot. Both stylesheets are global imports, so the shared
  chrome reaches every route's markup rather than being scoped out of it —
  `playground.css` derives the `--pg-*` scale and states what the host owes a
  mounted surface, `chrome.css` is the recipes that read it. Nothing here mounts,
  loads, or frees a session: the routes own that.
-->
<script lang="ts">
	import './playground.css';
	import './chrome.css';
	import { base } from '$app/paths';
	import { page } from '$app/state';
	import SchemeControl from './SchemeControl.svelte';

	let { children } = $props();

	// Named for what the page SHOWS, not for the phase that built it — the visitor
	// reading this bar has no phase numbering to place a page in.
	const ROUTES = [
		{ path: '/', label: 'Overview' },
		{ path: '/preview', label: 'Preview' },
		{ path: '/visual', label: 'Visual' },
		{ path: '/editor', label: 'Editor' }
	];

	// The path with the deploy's base prefix removed — a project-subpath host
	// (`/quillmark-editor`) leaves the root as the bare base, so the empty
	// remainder is `/`.
	const here = $derived(page.url.pathname.slice(base.length) || '/');
</script>

<div class="app">
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
			<SchemeControl />
		</div>
	</header>

	{@render children()}

	<footer class="foot">
		<div class="pg-width foot-row">
			<p class="pg-label">@quillmark/editor · dev playground</p>
			<nav class="foot-links" aria-label="Project">
				<a class="pg-link" href="https://github.com/borb-sh/quillmark-editor">Source</a>
				<a class="pg-link" href="https://github.com/borb-sh/quillmark-editor/blob/main/THEMING.md"
					>Theming</a
				>
				<a class="pg-link" href="https://github.com/borb-sh/quillmark">Quillmark</a>
			</nav>
		</div>
	</footer>
</div>

<style>
	/* The foot sinks to the bottom on a short route rather than following the
	   content up the page. */
	.app {
		display: grid;
		grid-template-rows: auto 1fr auto;
		min-height: 100dvh;
	}

	/* A running head: the artifact's name on the left, where it is in the document
	   on the right. It stays put while a route scrolls, so the switch between
	   surfaces is always one click away — and it carries one hairline, no fill and
	   no shadow, since it is a rule on the page rather than a bar over it. */
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

	/* The current route is marked by a rule under it, not a fill: an editor's mark
	   on the page, and the one device that still reads when the ink is the only
	   colour on it. */
	.nav-link {
		font-family: var(--pg-font-mono);
		font-size: var(--pg-text-label);
		line-height: var(--pg-leading-tight);
		color: var(--pg-ink-meta);
		text-decoration: none;
		padding-block: var(--pg-space-half);
		border-bottom: var(--pg-ring-width) solid transparent;
		transition: color var(--pg-duration) ease;
	}

	.nav-link:hover {
		color: var(--pg-ink);
	}

	.nav-link[aria-current='page'] {
		color: var(--pg-ink);
		border-bottom-color: var(--pg-ink);
	}

	.foot {
		border-top: var(--pg-border-width) solid var(--pg-border);
		margin-top: var(--pg-space-24);
	}

	.foot-row {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		justify-content: space-between;
		gap: var(--pg-space-2) var(--pg-space-6);
		padding-block: var(--pg-space-6);
	}

	.foot-links {
		display: flex;
		gap: var(--pg-space-4);
		font-size: var(--pg-text-label);
	}
</style>
