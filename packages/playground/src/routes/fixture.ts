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
 * Substitute `find` once in the loaded `Quill.yaml`, leaving the quill on disk alone.
 * Every schema variant below is this: the anchors differ, the mechanism does not.
 * Throws rather than silently no-op'ing if an anchor moves.
 */
function rewriteSchema(tree: Map<string, Uint8Array>, find: string, into: string): void {
	const yaml = new TextDecoder().decode(tree.get('Quill.yaml'));
	if (!yaml.includes(find)) throw new Error(`fixture: anchor not found — ${JSON.stringify(find)}`);
	tree.set('Quill.yaml', new TextEncoder().encode(yaml.replace(find, into)));
}

// The main `date` field's declaration up to its default's value: the anchor the
// schema variant below rewrites, split here so the rewrite substitutes a value
// rather than measuring characters off the end. The indorsement card declares a
// `date` too, one indent level deeper, so the 4-space key pins this to the main
// card's.
const MAIN_DATE_KEY = '\n    date:\n      type: date\n      default: ';

/**
 * Playground-only schema variant: give the main `date` field a literal `default:`.
 * The reference quill declares `default: ""` (blank → `datetime.today()` at render,
 * which ghosts nothing), so nothing in it exercises the date control's ghosted
 * default; this makes the rung reachable in the browser.
 */
export function withMainDateDefault(tree: Map<string, Uint8Array>, iso: string): void {
	rewriteSchema(tree, `${MAIN_DATE_KEY}""`, `${MAIN_DATE_KEY}"${iso}"`);
}

// The `card_kinds:` map opener, and a second kind to drop under it. The reference
// quill declares exactly ONE kind, so the add affordance's multi-kind branch (a
// menu rather than a direct insert) is a code path no fixture reaches.
// Inserted at the opener rather than appended, so it does not depend on
// `card_kinds` staying the last block in the file.
const CARD_KINDS_KEY = '\ncard_kinds:\n';
const SECOND_KIND = `  attachment:
    description: A trailing attachment block. Playground-only, to give the card stack a second kind.
    ui:
      title: Attachment
    fields:
      caption:
        type: string
        example: Slide deck
        description: What is attached.
`;

/**
 * Playground-only schema variant: declare a second card kind. The reference quill's
 * one kind means `kinds.length === 1` always wins in `VisualEditor`, so nothing on
 * disk exercises the kind menu, its dismissal, or its item chrome.
 */
export function withSecondCardKind(tree: Map<string, Uint8Array>): void {
	rewriteSchema(tree, CARD_KINDS_KEY, CARD_KINDS_KEY + SECOND_KIND);
}

/**
 * The reference quill's file tree, from the quiver: the `Map` `Quill.fromTree`
 * accepts, keyed `"/"`-joined relative to the quill root.
 *
 * A tree rather than the `Quill` `getQuill` hands back, because the two variants
 * above rewrite schema bytes and a materialized quill has no seam for that. The
 * caller mints and owns its quill; the quiver's cached one is the quiver's, held
 * unfreed for the page. The cost is one materialization the caller discards.
 */
export async function loadUsafMemoTree(): Promise<Map<string, Uint8Array>> {
	return (await (await quiver()).getQuill('usaf_memo')).toTree();
}
