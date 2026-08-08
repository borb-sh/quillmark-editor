// The boundary ledger, checked against the artifact it describes. The ledger
// (`packages/svelte/prose/canon/DOCUMENT_MODEL.md`) tabulates the exact `@quillmark/wasm`
// surface the Svelte binding consumes, and a table of another repo's API is a hand-kept
// list: upstream renames a verb, the row keeps naming the old one, and nothing goes red
// until a consumer's build does. Zero deps; run via `npm run check:ledger`.
//
// Two rules:
//
//   1. THE TABLE NAMES LIVE VERBS. Every API-shaped name in the "Verbs / types" column of
//      the surface table resolves in the installed artifact's types. ONE DIRECTION only:
//      the ledger names the subset V1 consumes, so a verb the artifact has and the table
//      omits is a choice, while a verb the table has and the artifact lost is rot.
//
//   2. THE STATED PIN IS THE INSTALLED PIN. A version written next to `@quillmark/wasm`
//      in the ledger equals the version resolved in `node_modules`. The ledger is the one
//      place the version coupling is recorded, so the number in the prose answers to the
//      number on disk. Only an adjacent pair is read: the doc cites other releases
//      historically ("0.100.0 extended it to the content model"), and those are prose
//      about the past, not a claim about this install.
//
// The type surface is BOTH `runtime/runtime.d.ts` and `core/wasm.d.ts`. The package
// exports one entry whose types are the former, which re-exports the classes and the
// content vocabulary from the latter, so a name a consumer can reach is in either file.
//
// A name is API-shaped when it is a call (`seedCard(kind, overlay)`), a member
// (`quill.writer`), a lone identifier in its own code span (`mapPos`), or a PascalCase
// type (`LiveSession`). Prose inside a cell is not backticked, so the shape filter is the
// whole of the extraction; what it over-collects (`Promise`, `code`) resolves anyway and
// costs nothing. What it collects that belongs to someone else is named below.
//
// Resolution is a word match over the whole type text, declarations and comments alike,
// which makes this a FLOOR rather than a proof: a verb whose name is also an ordinary word
// in the artifact's own prose (`view`) resolves against the prose and survives its own
// removal. Tightening to a declaration shape was measured and is worse — it catches no
// additional retired name and false-fails on three live ones (`DocPath`, `editor`,
// `wasm`), and a gate that cries wolf gets switched off. Against the nineteen spellings
// the 0.92 → 0.102 range retired, the floor catches eighteen.

import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { ROOT, report } from './workspace.mjs';

/** The ledger, and the heading whose table states the consumed surface. */
const LEDGER = 'packages/svelte/prose/canon/DOCUMENT_MODEL.md';
const HEADING = '## The surface V1 consumes';

/** Names the ledger cites that belong to another tool's surface, not the artifact's. */
const FOREIGN = new Set([
	'optimizeDeps' // Vite's, in the lifecycle row's note on dev-server pre-bundling.
]);

const errors = [];
const doc = readFileSync(join(ROOT, LEDGER), 'utf8');

// ── The artifact's type surface ──────────────────────────────────────────────
// The artifact exports one entry and no `./package.json`, so the root is reached through
// the entry rather than resolved directly, as `carried.mjs` reaches it.
const require = createRequire(join(ROOT, 'package.json'));
const pkgDir = join(dirname(require.resolve('@quillmark/wasm')), '..');
const installed = JSON.parse(readFileSync(join(pkgDir, 'package.json'), 'utf8')).version;

const typeFiles = ['runtime/runtime.d.ts', 'core/wasm.d.ts'].map((p) => join(pkgDir, p));
for (const f of typeFiles) {
	if (!existsSync(f)) errors.push(`${f}: the artifact's types are not where the check reads them`);
}
const surface = typeFiles
	.filter(existsSync)
	.map((f) => readFileSync(f, 'utf8'))
	.join('\n');

// ── Rule 1: the table names live verbs ───────────────────────────────────────
const lines = doc.split('\n');
const start = lines.findIndex((l) => l.startsWith(HEADING));
if (start === -1) errors.push(`${LEDGER}: no "${HEADING}" section — the check reads its table`);

const cells = [];
for (let i = start + 1; start !== -1 && i < lines.length; i++) {
	if (lines[i].startsWith('## ')) break;
	if (!lines[i].startsWith('|')) continue;
	const row = lines[i].split('|').slice(1, -1);
	// The header and its delimiter carry no verbs.
	if (row.length < 2 || /^\s*-+\s*$/.test(row[0]) || /Verbs \/ types/.test(row[1])) continue;
	cells.push(row[1]);
}
// A parse that finds nothing would pass every rule while checking none.
if (start !== -1 && cells.length === 0) {
	errors.push(`${LEDGER}: the surface table parsed to zero rows — the check is reading nothing`);
}

const named = new Set();
for (const cell of cells) {
	for (const [, span] of cell.matchAll(/`([^`]+)`/g)) {
		for (const [, n] of span.matchAll(/([A-Za-z_$][\w$]*)\s*\(/g)) named.add(n);
		for (const [, n] of span.matchAll(/\.([A-Za-z_$][\w$]*)/g)) named.add(n);
		for (const [, n] of span.matchAll(/\b([A-Z][A-Za-z0-9]{2,})\b/g)) named.add(n);
		if (/^[A-Za-z_$][\w$]*$/.test(span)) named.add(span);
	}
}
for (const name of [...named].sort()) {
	if (FOREIGN.has(name)) continue;
	if (!new RegExp(`\\b${name}\\b`).test(surface)) {
		errors.push(
			`${LEDGER}: the surface table names \`${name}\`, absent from @quillmark/wasm ${installed}`
		);
	}
}

// ── Rule 2: the stated pin is the installed pin ──────────────────────────────
const pins = [...doc.matchAll(/`@quillmark\/wasm`\s+(\d+\.\d+\.\d+)/g)].map((m) => m[1]);
for (const pin of pins) {
	if (pin !== installed) {
		errors.push(`${LEDGER}: states @quillmark/wasm ${pin}; ${installed} is installed`);
	}
}
if (start !== -1 && pins.length === 0) {
	errors.push(`${LEDGER}: names no @quillmark/wasm version — the pin is recorded here or nowhere`);
}

report(
	'check-ledger',
	errors,
	`Boundary ledger OK — ${named.size} names and ${pins.length} pin over @quillmark/wasm ${installed}.`
);
