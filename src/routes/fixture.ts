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

// The main `date` field's declaration up to its default's value — the anchor the
// schema variant below rewrites, split here so the rewrite substitutes a value
// rather than measuring characters off the end. The indorsement card declares a
// `date` too, one indent level deeper, so the 4-space key pins this to the main
// card's.
const MAIN_DATE_KEY = '\n    date:\n      type: date\n      default: ';

/**
 * Playground-only schema variant: give the main `date` field a literal `default:`.
 * The reference quill declares `default: ""` (blank → `datetime.today()` at render,
 * which ghosts nothing), so nothing in it exercises the date control's ghosted
 * default — this rewrites that one line in the loaded bytes so the rung is
 * reachable in the browser, leaving the quill on disk alone. Throws
 * rather than silently no-op'ing if the anchor moves.
 */
export function withMainDateDefault(tree: Map<string, Uint8Array>, iso: string): void {
	const yaml = new TextDecoder().decode(tree.get('Quill.yaml'));
	const anchor = `${MAIN_DATE_KEY}""`;
	if (!yaml.includes(anchor)) throw new Error('fixture: main `date` anchor not found');
	tree.set(
		'Quill.yaml',
		new TextEncoder().encode(yaml.replace(anchor, `${MAIN_DATE_KEY}"${iso}"`))
	);
}

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
