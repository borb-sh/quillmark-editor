// Canon spine lint — enforces the ratified shape of every `prose/canon/*.md`, in
// every tier that has one (the root's, and each package's). The spine is stated here
// and nowhere else, so the rule and its enforcement cannot drift apart. A doc that
// leaves it fails CI here instead of being caught by eye. Zero deps; run via
// `npm run check:canon`.
//
// The spine, per doc (INDEX.md excepted):
//   1. `# Title`
//   2. (blank)
//   3. `> **Implementation**: …` — a blockquote anchor, immediately after the title.
//   4. `## TL;DR` — somewhere below.
// The anchor points at FOLDERS or module names, never a source file: a folder
// survives the split and rename a filename does not, and a doc anchored at one is
// re-read rather than re-pointed. And no canon doc links into `phases/` (a plan
// tier; canon references only settled ground).

import { readFileSync, readdirSync } from 'node:fs';
import { basename, join, relative } from 'node:path';
import { ROOT, canonDocs, canonRoots, report } from './workspace.mjs';

const SOURCE_EXT = /\.(ts|tsx|js|jsx|mjs|cjs|svelte|rs|md|json|css|html|py)(?=$|[)`,\s])/;

/** Backticked tokens in a line: `foo/bar`, `@scope/pkg`, … */
function backticked(line) {
	return [...line.matchAll(/`([^`]+)`/g)].map((m) => m[1]);
}

const errors = [];
const roots = canonRoots();
const docs = roots.flatMap(canonDocs);

for (const [abs, rel] of docs) {
	const file = basename(abs);
	const lines = readFileSync(abs, 'utf8').split('\n');
	const fail = (msg) => errors.push(`${rel}: ${msg}`);

	// The no-plan-link rule holds for every canon doc, INDEX included.
	lines.forEach((line, i) => {
		if (/\]\([^)]*\bphases\//.test(line)) fail(`line ${i + 1} links into phases/ (a plan tier)`);
	});

	if (file === 'INDEX.md') continue; // the index carries no spine of its own

	if (!lines[0]?.startsWith('# ')) fail('line 1 is not a `# Title`');
	if (lines[1]?.trim() !== '') fail('line 2 should be blank (title, blank, anchor)');

	// The anchor: a `>` blockquote at line 3 that names **Implementation**.
	if (!lines[2]?.startsWith('>')) {
		fail('line 3 is not the `> **Implementation**:` anchor blockquote');
	} else {
		let i = 2;
		const block = [];
		while (lines[i]?.startsWith('>')) block.push(lines[i++]);
		const blockText = block.join('\n');
		if (!blockText.includes('**Implementation**'))
			fail('anchor blockquote lacks **Implementation**');
		for (const tok of block.flatMap(backticked)) {
			if (SOURCE_EXT.test(tok))
				fail(`anchor names a source file \`${tok}\` — anchor a folder or module`);
		}
	}

	if (!lines.some((l) => /^## TL;DR\s*$/.test(l))) fail('no `## TL;DR` section');
}

// ── The section pointer ─────────────────────────────────────────────────────
// A `<DOC> §<Section>` pointer resolves, from anywhere in the tree. The spine rules above hold
// a doc's own shape; this holds every reference INTO one, which is the half that
// rots — a heading is renamed in the commit that earns it and the pointers to it
// sit in four other packages and in the gates' own failure messages.
//
// The docs are the local ones: canon, plus the sibling contracts a comment cites
// by name. A pointer at a name not in that set is the failure that motivated the
// rule, so an unknown name is a finding rather than a skip; the sibling quillmark
// repo's canon is cited by FILENAME (`CARDS.md`) and never with a section, so it
// passes through untouched.

/** `<DOC> §<Section>`, quoted or bare, with an optional `.md` on the name. Stops at the first
 *  character no heading can carry, so a reference running on into prose
 *  (`§Chrome states`) is caught below by the word-prefix test rather than here. */
const POINTER = /\b([A-Z][A-Z_]{2,})(?:\.md)?\s*§\s*(?:"([^"]+)"|([A-Za-z][\w ;-]*))/g;

const SIDECARS = [
	[join(ROOT, 'packages', 'svelte', 'THEMING.md'), 'THEMING'],
	[join(ROOT, 'CLAUDE.md'), 'CLAUDE']
];
/** Each doc's headings, as word lists. */
const headings = new Map();
for (const [abs, name] of [...docs.map(([a]) => [a, basename(a, '.md')]), ...SIDECARS]) {
	const hs = [...readFileSync(abs, 'utf8').matchAll(/^#+\s+(.+)$/gm)].map((m) => words(m[1]));
	headings.set(name, [...(headings.get(name) ?? []), ...hs]);
}

/** A heading or a reference as comparable words: unstyled, unpunctuated, lowercase. */
function words(text) {
	return text
		.toLowerCase()
		.replace(/[`*"]/g, '')
		.split(/[\s—–-]+/)
		.map((w) => w.replace(/[^\w']+$/, ''))
		.filter(Boolean);
}

/** True when one word list is a prefix of the other: a reference may name a
 *  heading's opening words (`CODEC §Encode` for `## Encode: PM edit → …`) or run on
 *  into the sentence around it (`§Chrome states`). */
function aligns(a, b) {
	const [short, long] = a.length <= b.length ? [a, b] : [b, a];
	return short.every((w, i) => w === long[i]);
}

const SCANNED = /\.(ts|svelte|css|mjs|md)$/;
const SKIP = new Set(['node_modules', 'dist', 'site', '.git', '.svelte-kit', 'static']);

function* tree(dir) {
	for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) =>
		a.name < b.name ? -1 : 1
	)) {
		if (SKIP.has(entry.name)) continue;
		const at = join(dir, entry.name);
		if (entry.isDirectory()) yield* tree(at);
		else if (SCANNED.test(entry.name)) yield at;
	}
}

let pointers = 0;
for (const abs of tree(ROOT)) {
	const rel = relative(ROOT, abs);
	readFileSync(abs, 'utf8')
		.split('\n')
		.forEach((line, i) => {
			for (const [, doc, quoted, bare] of line.matchAll(POINTER)) {
				const hs = headings.get(doc);
				if (!hs) {
					errors.push(`${rel}:${i + 1}: \`${doc} §…\` — no such doc in this workspace`);
					continue;
				}
				pointers++;
				const ref = words(quoted ?? bare);
				if (!hs.some((h) => aligns(ref, h)))
					errors.push(`${rel}:${i + 1}: ${doc} has no section \`${(quoted ?? bare).trim()}\``);
			}
		});
}

report(
	'Canon spine check',
	errors,
	`Canon spine OK — ${docs.length} docs over ${roots.length} tier${roots.length === 1 ? '' : 's'}, ${pointers} section pointers resolved.`
);
