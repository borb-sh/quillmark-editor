// The bundle gate — what survives a consumer's bundler. One mechanism, held from both
// ends: a stylesheet a module side-effect imports is an edge carrying no binding, so a
// bundler told that module is side-effect-free prunes the edge and the surface mounts
// unstyled. Nothing upstream of a build sees it. The source imports the sheet, the
// package ships it, `publint` reads a manifest that points at it, and it is absent from
// the bytes a consumer serves. Zero deps; run via `npm run check:bundle`, after
// `npm run build`. Extra bundle directories are named as arguments, which is how CI adds
// the site laid from the tarball to the two the worktree builds.
//
// Two rules:
//
//   1. The declaration. A package whose modules side-effect import a stylesheet claims
//      `sideEffects: true`. A list is the failure whatever it names, because it inverts
//      the burden: every module the globs miss is prunable, so the list has to name each
//      importer, and it rots at the next one, silently: the package still ships the
//      sheet, the import is still in the source, and nothing errors.
//
//   2. The evidence. In a built consumer, every custom property the workspace's shipped
//      stylesheets mint and the bundle reads is defined in that bundle. An unresolved
//      `var()` is invalid at computed-value time and drops the whole declaration, so a
//      pruned derivation is a control with no border, no background and no padding.
//      Presence against absence rather than a value, so it survives a retune of every
//      dial it does not own.
//
// The rungs are discovered rather than listed: whatever a shipped stylesheet mints is
// what a bundle reading it must resolve, so a renamed scale and a new one are covered
// without a table here to keep in step with the derivations.

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { ROOT, packages, report } from './workspace.mjs';

/** The built consumers in this workspace: each app's bundler output, which is what
 *  `quillkit studio` serves, what `quillkit site` lays into a deploy, and what Pages
 *  holds. A third-party consumer takes the package the same way. */
const BUNDLES = ['packages/quillkit/dist/client', 'packages/playground/build'];

/** A bare stylesheet import: the specifier is the statement, so there is no binding to
 *  keep the edge alive by. Any other CSS import (a named one, a `?url` asset) carries a
 *  binding a bundler follows on its own. */
const SHEET_IMPORT = /\bimport\s*['"][^'"]+\.css['"]/;
/** A custom property definition. A `var()` reference is followed by `,` or `)` and
 *  never a colon, so this cannot match one. */
const DEFINES = /(--[\w-]+)\s*:/g;
/** A custom property read. */
const READS = /var\(\s*(--[\w-]+)/g;

/** Block comments blanked. A shipped stylesheet is unminified, and its prose names the
 *  properties it is about: theme.css discusses the poison case `--qm-space: 4`, which
 *  reads as a mint to any regex that cannot tell a paragraph from a declaration. */
const decomment = (css) => css.replace(/\/\*[\s\S]*?\*\//g, '');

/** Every file under `at` matching `ext`, skipping the trees a walk has no business in
 *  and any directory in `skip`, sorted. Missing directory reads as empty: the caller
 *  says whether that is a finding. */
function filesUnder(at, ext, skip = []) {
	const out = [];
	(function walk(dir) {
		if (!existsSync(dir) || skip.includes(dir)) return;
		for (const name of readdirSync(dir).sort()) {
			if (name === 'node_modules' || name.startsWith('.')) continue;
			const abs = join(dir, name);
			if (statSync(abs).isDirectory()) walk(abs);
			else if (ext.test(name)) out.push(abs);
		}
	})(at);
	return out;
}

const errors = [];
const PACKAGES = packages();
const bundles = [
	...BUNDLES.map((b) => join(ROOT, b)),
	...process.argv.slice(2).map((a) => resolve(a))
];

// ── 1. The declaration ──────────────────────────────────────────────────────────

let importers = 0;
for (const { dir, at, json } of PACKAGES) {
	// The package's own sources, build output excluded: what a bundler prunes is the
	// shipped module, and the shipped module is this one compiled.
	const carriers = filesUnder(at, /\.(ts|js|svelte)$/, [
		join(at, 'dist'),
		join(at, 'build')
	]).filter((f) => SHEET_IMPORT.test(readFileSync(f, 'utf8')));
	importers += carriers.length;
	// Absent is the default and means `true`, so it is correct; only a list is a claim
	// that some module is prunable. `false` on a package importing no stylesheet is left
	// alone: the rule is about the sheets, not about tree-shaking.
	if (!carriers.length || json.sideEffects === undefined || json.sideEffects === true) continue;
	errors.push(
		`packages/${dir}/package.json: \`sideEffects\` is ${JSON.stringify(json.sideEffects)} and ` +
			`${carriers.length} modules import a stylesheet for its effect ` +
			`(${relative(at, carriers[0])}, …) — claim \`true\`; a list has to name every importer`
	);
}

// ── 2. The evidence ─────────────────────────────────────────────────────────────

// What the workspace ships: every custom property minted by a stylesheet under a
// package's `dist`. The bundle trees are cut out of this walk: one of them sits inside a
// package's `dist`, and a bundle is what is measured rather than a source of what to
// measure.
const shipped = new Set();
for (const { at } of PACKAGES)
	for (const file of filesUnder(join(at, 'dist'), /\.css$/, bundles))
		for (const [, name] of decomment(readFileSync(file, 'utf8')).matchAll(DEFINES))
			shipped.add(name);

if (!shipped.size)
	errors.push('packages/*/dist: no shipped stylesheet mints a rung — run `npm run build` first');

let measured = 0;
for (const bundle of bundles) {
	const where = relative(ROOT, bundle) || bundle;
	if (!existsSync(bundle)) {
		errors.push(`${where}: no such directory — run \`npm run build\` first`);
		continue;
	}
	// Every text asset, not the stylesheets alone: a bundler may inline a sheet into a
	// chunk, and the paint loop and the overlay carry style declarations as JS strings,
	// so a CSS-only scan misses both.
	const defined = new Set();
	const read = new Map();
	for (const file of filesUnder(bundle, /\.(css|js|html)$/)) {
		const raw = readFileSync(file, 'utf8');
		const text = file.endsWith('.css') ? decomment(raw) : raw;
		for (const [, name] of text.matchAll(DEFINES)) defined.add(name);
		for (const [, name] of text.matchAll(READS)) if (!read.has(name)) read.set(name, file);
	}
	for (const [name, file] of [...read].sort((a, b) => (a[0] < b[0] ? -1 : 1)))
		if (shipped.has(name) && !defined.has(name))
			errors.push(
				`${relative(ROOT, file)}: reads \`${name}\`, which nothing in ${where} defines — ` +
					`the stylesheet that mints it was pruned out of the bundle`
			);
	measured++;
}

report(
	'Bundle check',
	errors,
	`Bundle OK — ${measured} bundles resolve every shipped rung they read, of the ` +
		`${shipped.size} the workspace mints across ${importers} side-effect stylesheet imports.`
);
