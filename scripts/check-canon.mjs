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
// The anchor points at FOLDERS or module names, never a source file (file paths
// rot — the pre-spine CODEC anchor already named `positions.ts`/`reconcile.ts`,
// neither of which exists). And no canon doc links into `phases/` (a plan tier;
// canon references only settled ground).

import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { canonDocs, canonRoots, report } from './workspace.mjs';

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

report(
	'Canon spine check',
	errors,
	`Canon spine OK — ${docs.length} docs over ${roots.length} tier${roots.length === 1 ? '' : 's'}.`
);
