<!--
  A consumer that passes `strings` as an INLINE OBJECT LITERAL over reactive state,
  which is how a host spells a translated preview. The prop is then a fresh object
  whenever `label` moves and identical across reads while it does not, which is what
  tells a language switch (a real swap the preview ignores) apart from the ordinary
  re-reads the guard must stay quiet through.
-->
<script lang="ts">
	import Preview from '$lib/preview/Preview.svelte';
	import type { LiveSession } from '@quillmark/wasm';
	import type { EditorErrorHandler } from '$lib/core';

	let {
		session,
		label,
		onError
	}: {
		session: LiveSession;
		label: string;
		onError?: EditorErrorHandler;
	} = $props();
</script>

<Preview {session} {onError} strings={{ noPages: label }} />
