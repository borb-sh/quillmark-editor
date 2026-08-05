// The dependency law, enforced. In a workspace a quiver↔ui edge is one relative
// path away, so the separation is held by a gate rather than by distance. Zero deps;
// run via `npm run check:deps`.
//
// Three rules, each stated once here and nowhere else:
//
//   1. THE GRAPH. `@quillmark/wasm` is external and above everything; `ui` and
//      `quiver` are siblings at one tier with NO edge between them, in either
//      direction; the composing apps are the only nodes with two inbound edges.
//      Declared dependencies and source specifiers both, since either alone is half a
//      check: an undeclared import resolves fine in a workspace, and a declared
//      dependency nothing imports is still a promise.
//
//   2. THE WASM SINGLETON. A handle minted by one copy of the linear memory and
//      handed to another is foreign. So every published package PEERS the artifact
//      and none depends on it, the range is a single `>=` comparator (loose, until
//      1.0 makes a narrow one honest), and root `overrides` pins the
//      developed-against version to exactly one. Loose ranges permit two installs
//      rather than preventing them, which is why the pin is the half that works.
//
//   3. THE `/preview` BUNDLE WEIGHT. A preview consumer does not pull ProseMirror,
//      which is what makes the subpath claim ("a bundler pulls only what the imported
//      entry reaches") true for the one surface whose audience is not editing. A
//      direct-import scan is not enough: one relative hop into the codec pulls all of
//      ProseMirror and no direct scan sees it, so this walks preview's import graph
//      within `src/lib` and fails on any reached module's forbidden external.

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { ROOT, packages, report } from './workspace.mjs';

/** The graph. An edge absent from this table is a violation; an edge in it is optional. */
const ALLOWED = {
	playground: ['@quillmark/svelte', '@quillmark/quiver'],
	studio: ['@quillmark/svelte', '@quillmark/quiver'],
	'@quillmark/svelte': [],
	'@quillmark/quiver': []
};

const WASM = '@quillmark/wasm';
const DEP_FIELDS = ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies'];

const errors = [];
const fail = (msg) => errors.push(msg);

const root = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
const PACKAGES = packages();
const names = PACKAGES.map((p) => p.json.name);

// ── 1. The graph ────────────────────────────────────────────────────────────────

for (const { dir, json } of PACKAGES) {
	const allowed = ALLOWED[json.name];
	if (!allowed) {
		fail(
			`packages/${dir}: \`${json.name}\` is not in the dependency law — state its edges in check-deps.mjs`
		);
		continue;
	}
	for (const field of DEP_FIELDS)
		for (const dep of Object.keys(json[field] ?? {}))
			if (names.includes(dep) && !allowed.includes(dep))
				fail(
					`packages/${dir}/package.json: \`${field}.${dep}\` — \`${json.name}\` has no edge to \`${dep}\``
				);
}

// ── 2. The wasm singleton ───────────────────────────────────────────────────────

const pin = root.overrides?.[WASM];
if (!pin)
	fail(
		`package.json: root \`overrides.${WASM}\` is unset — the developed-against version is pinned there`
	);
else if (!/^\d+\.\d+\.\d+(-[\w.]+)?$/.test(pin))
	fail(`package.json: \`overrides.${WASM}\` is \`${pin}\` — pin exactly one version, not a range`);

/** `>=1.2.3-0` → `[1, 2, 3]`, or null if the range is not a single `>=` comparator. */
const floorOf = (range) => {
	const m = /^>=\s*(\d+)\.(\d+)\.(\d+)(-[\w.]+)?$/.exec(range.trim());
	return m ? [+m[1], +m[2], +m[3]] : null;
};
/** Lexicographic, not per-position: `0.99.0` is above the floor `0.98.5`, and a
 *  per-position `some` would call it below on the patch. */
const below = (a, b) => {
	for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] < b[i];
	return false;
};

for (const { dir, json } of PACKAGES) {
	if (json.private) {
		// The app is not a published claim; it installs the artifact like any consumer.
		if (json.peerDependencies?.[WASM])
			fail(
				`packages/${dir}/package.json: \`${WASM}\` is a peer of a private package — depend on it`
			);
		continue;
	}
	for (const f of DEP_FIELDS)
		if (f !== 'peerDependencies' && json[f]?.[WASM])
			fail(
				`packages/${dir}/package.json: \`${f}.${WASM}\` — the artifact is peered, never depended on`
			);
	const range = json.peerDependencies?.[WASM];
	if (!range) {
		fail(
			`packages/${dir}/package.json: \`${WASM}\` is not peered — every published package claims a range`
		);
		continue;
	}
	const floor = floorOf(range);
	if (!floor)
		fail(
			`packages/${dir}/package.json: \`peerDependencies.${WASM}\` is \`${range}\` — the range is loose until wasm 1.0, one \`>=\` comparator`
		);
	else if (pin && below(pin.split('-')[0].split('.').map(Number), floor))
		fail(
			`packages/${dir}/package.json: the root pin \`${pin}\` is below this package's floor \`${range}\``
		);
}

// ── Source specifiers ───────────────────────────────────────────────────────────

/** Every import/export-from/dynamic-import specifier in an ESM/Svelte source. */
function specifiersOf(file) {
	const src = readFileSync(file, 'utf8');
	const out = [];
	const patterns = [
		/\bimport\s+[^'"]*?\bfrom\s*['"]([^'"]+)['"]/g,
		/\bexport\s+[^'"]*?\bfrom\s*['"]([^'"]+)['"]/g,
		/\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
		/\bimport\s*['"]([^'"]+)['"]/g
	];
	for (const re of patterns) {
		let m;
		while ((m = re.exec(src))) out.push(m[1]);
	}
	return out;
}

/** Every `.ts`/`.js`/`.svelte` source under `dir`, tests included, build output skipped. */
function sources(dir) {
	const out = [];
	(function walk(at) {
		for (const name of readdirSync(at).sort()) {
			if (name === 'node_modules' || name === 'dist' || name === 'build' || name.startsWith('.'))
				continue;
			const abs = join(at, name);
			if (statSync(abs).isDirectory()) walk(abs);
			else if (/\.(ts|js|svelte)$/.test(abs)) out.push(abs);
		}
	})(dir);
	return out;
}

/** The workspace package a bare specifier names, or null. */
const packageOf = (spec) => names.find((n) => spec === n || spec.startsWith(`${n}/`)) ?? null;

for (const { at, json } of PACKAGES) {
	const allowed = ALLOWED[json.name] ?? [];
	for (const file of sources(at))
		for (const spec of specifiersOf(file)) {
			const dep = packageOf(spec);
			if (dep && dep !== json.name && !allowed.includes(dep))
				fail(
					`${relative(ROOT, file)}: imports "${spec}" — \`${json.name}\` has no edge to \`${dep}\``
				);
		}
}

// ── 3. The /preview bundle weight ───────────────────────────────────────────────

const LIB = join(ROOT, 'packages', 'svelte', 'src', 'lib');
const SELF = '@quillmark/svelte';
// The subpaths a viewer may reach. Every OTHER subpath ui exports is editor-side and
// forbidden, derived rather than listed so the rule fails closed the way the graph
// rule does: a new editing surface is forbidden the moment it is exported, instead of
// waiting for someone to remember this line.
const NEUTRAL = new Set(['.', './core', './preview']);
const uiExports = PACKAGES.find((p) => p.json.name === SELF)?.json.exports ?? {};
const editorSide = Object.keys(uiExports)
	.filter((k) => !NEUTRAL.has(k))
	.map((k) => k.replace(/^\.\//, ''));
// ProseMirror is the weight itself; the editing subpaths are editor-side whether or
// not they carry weight of their own.
const FORBIDDEN = new RegExp(`^(prosemirror-|${SELF}/(${editorSide.join('|')}))`);

/** Resolve a relative specifier to a file inside src/lib, or null. `src/lib` is
 *  relative throughout, which `svelte-package` requires (it rewrites no aliases), so
 *  a relative specifier is the only kind that continues the walk; everything else is
 *  bare and answers to FORBIDDEN. */
function resolveInLib(spec, fromFile) {
	if (!spec.startsWith('.')) return null;
	// TS-ESM specifiers carry the EMITTED extension (`./paint.js` → `paint.ts`), so
	// strip it before building candidates; else a `.js` specifier resolves to nothing
	// and the transitive walk never leaves `preview/`, silently passing a relative
	// reach into the codec. `.css` is in the set because a stylesheet's `@import`
	// matches the specifier patterns too, so a sheet reaching a forbidden one is seen.
	const stem = resolve(dirname(fromFile), spec).replace(/\.(js|ts|svelte|css)$/, '');
	for (const cand of [
		`${stem}.ts`,
		`${stem}.js`,
		`${stem}.svelte`,
		`${stem}.css`,
		join(stem, 'index.ts'),
		join(stem, 'index.js')
	])
		if (existsSync(cand) && statSync(cand).isFile()) return cand;
	return null;
}

const seen = new Set();
const walk = (file) => {
	if (seen.has(file)) return;
	seen.add(file);
	for (const spec of specifiersOf(file)) {
		if (FORBIDDEN.test(spec)) {
			fail(`${relative(ROOT, file)}: imports "${spec}" — /preview stays free of editor weight`);
			continue;
		}
		const next = resolveInLib(spec, file);
		if (next) walk(next);
	}
};
// Every file in the subpath, not just its barrel: a module the barrel does not
// re-export is still shipped inside the module root a bundler pulls.
for (const file of sources(join(LIB, 'preview'))) walk(file);

report(
	'Dependency law check',
	errors,
	`Dependency law OK — ${PACKAGES.length} packages, ${WASM} pinned at ${pin}, /preview reaches ${seen.size} modules.`
);
