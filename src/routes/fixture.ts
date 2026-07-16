// Playground-only fixture loading — the browser twin of tests/helpers/fixtures.ts.
// An eager `?url` asset glob keeps the reference quill a plain input the bundler
// fingerprints as assets, not a served directory; at runtime each URL is fetched
// into raw bytes (binary-safe for the fonts and seals). Dev harness only — never
// part of the published package.
const QUILL_ROOT = '/fixtures/quills/usaf_memo/0.2.0';

const urls = import.meta.glob('/fixtures/quills/usaf_memo/0.2.0/**/*', {
	query: '?url',
	import: 'default',
	eager: true
}) as Record<string, string>;

/** Fetch the reference quill into the `Map` `Quill.fromTree` accepts (keys `"/"`-joined, relative to the quill root). */
export async function loadUsafMemoTree(): Promise<Map<string, Uint8Array>> {
	const tree = new Map<string, Uint8Array>();
	for (const [path, url] of Object.entries(urls)) {
		if (path.includes('/__golden__/')) continue; // repo schema snapshot, not part of the quill
		const key = path.slice(QUILL_ROOT.length + 1);
		const bytes = new Uint8Array(await (await fetch(url)).arrayBuffer());
		tree.set(key, bytes);
	}
	return tree;
}
