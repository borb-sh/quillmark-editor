/**
 * The watch over an author's source tree. `node:fs` recursive watching rather than a
 * watcher dependency: the Node half runs from a published tarball, where every
 * dependency is weight an author downloads to look at a quill.
 */

import { watch } from 'node:fs';

/** One repack per settled burst: an editor's save arrives as several events. */
const SETTLE_MS = 80;

/** Everything under a generated or version-control directory. The staging trees live
 *  under `node_modules`, so the pack's own writes are ignored by the same rule. */
const IGNORED = /(^|[\\/])(node_modules|\.[^\\/]+)([\\/]|$)/;

/**
 * Watch `root`, calling `onChange` once per settled burst. Returns the stop.
 */
export function watchTree(root: string, onChange: () => void): () => void {
	let settle: ReturnType<typeof setTimeout> | undefined;
	const watcher = watch(root, { recursive: true }, (_event, path) => {
		if (path && IGNORED.test(path)) return;
		clearTimeout(settle);
		settle = setTimeout(onChange, SETTLE_MS);
	});
	return () => {
		clearTimeout(settle);
		watcher.close();
	};
}
