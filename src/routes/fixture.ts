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

// The main `date` field's declaration, verbatim — the anchor the schema variant
// below rewrites. The indorsement card declares a `date` too, one indent level
// deeper, so the 4-space key pins this to the main card's.
const MAIN_DATE_DEFAULT = '\n    date:\n      type: date\n      default: ""';

/**
 * Playground-only schema variant: give the main `date` field a literal `default:`.
 * The reference quill declares `default: ""` (blank → `datetime.today()` at render,
 * which ghosts nothing), so nothing in it exercises the date control's ghosted
 * default — this rewrites that one line in the loaded bytes so the rung is
 * reachable in the browser (issue #89), leaving the quill on disk alone. Throws
 * rather than silently no-op'ing if the anchor moves.
 */
export function withMainDateDefault(tree: Map<string, Uint8Array>, iso: string): void {
	const yaml = new TextDecoder().decode(tree.get('Quill.yaml'));
	if (!yaml.includes(MAIN_DATE_DEFAULT)) throw new Error('fixture: main `date` anchor not found');
	const patched = yaml.replace(MAIN_DATE_DEFAULT, `${MAIN_DATE_DEFAULT.slice(0, -2)}"${iso}"`);
	tree.set('Quill.yaml', new TextEncoder().encode(patched));
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
