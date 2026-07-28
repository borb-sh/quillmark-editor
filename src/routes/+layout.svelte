<!--
  The playground shell. Its only job is the host-side stylesheet — a global
  import, so the shared chrome reaches every route's markup rather than being
  scoped out of it (`routes/playground.css` states what the host owes a mounted
  surface). Nothing here mounts, loads, or frees: the routes own that.
-->
<script lang="ts">
	import './playground.css';

	let { children } = $props();
</script>

{@render children()}
