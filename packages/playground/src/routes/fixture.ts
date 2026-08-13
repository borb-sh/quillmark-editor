// Where the playground's quills come from: a built quiver served under `/quiver/`,
// packed from the workspace fixture tree by `scripts/build-quiver.mjs`. Pointer →
// manifest → content-addressed bundle, the browser consumer path in full
// (PLAYGROUND §"Quiver, not bundler").
//
// One `Quiver` for the page. Its quill cache is per canonical ref and lives as long
// as the quiver does, so routes share one materialization across client-side
// navigation instead of paying for their own.
import { Quiver } from '@quillmark/quiver';
import { base } from '$app/paths';

let quiverP: Promise<Quiver> | undefined;

function quiver(): Promise<Quiver> {
	return (quiverP ??= Quiver.fromBuiltUrl(`${base}/quiver/`));
}

/**
 * The reference quill's file tree, from the quiver: the `Map` `Quill.fromTree`
 * accepts, keyed `"/"`-joined relative to the quill root.
 *
 * A tree rather than the `Quill` `getQuill` hands back, because a route frees the
 * handles it opens and the quiver's cached quill is not a route's to free: it is
 * held unfreed for the page. The cost is one materialization the caller discards.
 */
export async function loadSpecimenTree(): Promise<Map<string, Uint8Array>> {
	return (await (await quiver()).getQuill('specimen')).toTree();
}
