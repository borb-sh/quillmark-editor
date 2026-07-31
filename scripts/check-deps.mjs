// The dependency law, enforced. Two repos made a quiver↔ui edge impossible for
// free; one repo makes it one relative path away, so the friction is replaced by a
// gate rather than left to erode by convenience. Zero deps; run via
// `npm run check:deps`.
//
// Three rules, each stated once here and nowhere else:
//
//   1. THE GRAPH. `@quillmark/wasm` is external and above everything; `ui` and
//      `quiver` are siblings at one tier with NO edge between them, in either
//      direction; `playground` is the only node with two inbound edges. Declared
//      dependencies and source specifiers both, since either alone is half a check —
//      an undeclared import resolves fine in a workspace, and a declared dep nothing
//      imports is still a promise.
//
//   2. THE WASM SINGLETON. A handle minted by one copy of the linear memory and
//      handed to another is foreign. So every published package PEERS the artifact
//      and none depends on it, the range is a single `>=` comparator (loose, until
//      1.0 makes a narrow one honest), and root `overrides` pins the developed-against
//      version to exactly one. Loose ranges do not prevent two installs — they permit
//      them — which is why the pin is the half that does the work.
//
//   3. THE `/preview` BUNDLE WEIGHT. A preview consumer does not pull ProseMirror.
//      That is what makes the subpath claim ("a bundler pulls only what the imported
//      entry reaches") true for the one surface whose audience is not editing, so the
//      rule outlives the package promotion it used to protect. A direct-import scan
//      is not enough — one relative hop into the codec, which preview does not take
//      today and which no direct scan would see, pulls all of ProseMirror — so this
//      walks preview's import graph within `src/lib` and fails on any reached
//      module's forbidden external.

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { ROOT } from './canon-roots.mjs';

/** The graph. An edge absent from this table is a violation; an edge in it is optional. */
const ALLOWED = {
	playground: ['@quillmark/ui', '@quillmark/quiver'],
	'@quillmark/ui': [],
	'@quillmark/quiver': []
};

const WASM = '@quillmark/wasm';
const DEP_FIELDS = ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies'];

const errors = [];
const fail = (msg) => errors.push(msg);

const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'));
const root = readJson(join(ROOT, 'package.json'));

const packages = readdirSync(join(ROOT, 'packages'))
	.sort()
	.map((dir) => ({
		dir,
		at: join(ROOT, 'packages', dir),
		json: readJson(join(ROOT, 'packages', dir, 'package.json'))
	}));

const names = new Set(packages.map((p) => p.json.name));

// ── 1. The graph ────────────────────────────────────────────────────────────────

for (const { dir, json } of packages) {
	const allowed = ALLOWED[json.name];
	if (!allowed) {
		fail(
			`packages/${dir}: \`${json.name}\` is not in the dependency law — state its edges in check-deps.mjs`
		);
		continue;
	}
	for (const field of DEP_FIELDS)
		for (const dep of Object.keys(json[field] ?? {}))
			if (names.has(dep) && !allowed.includes(dep))
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
const below = (a, b) => a.some((n, i) => n !== b[i] && n < b[i]);

for (const { dir, json } of packages) {
	const declared = DEP_FIELDS.filter((f) => json[f]?.[WASM]);
	if (json.private) {
		// The app is not a published claim; it installs the artifact like any consumer.
		if (declared.some((f) => f === 'peerDependencies'))
			fail(
				`packages/${dir}/package.json: \`${WASM}\` is a peer of a private package — depend on it`
			);
		continue;
	}
	const wrong = declared.filter((f) => f !== 'peerDependencies');
	for (const f of wrong)
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
const packageOf = (spec) => [...names].find((n) => spec === n || spec.startsWith(`${n}/`)) ?? null;

for (const { at, json } of packages) {
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

const LIB = join(ROOT, 'packages', 'ui', 'src', 'lib');
const SELF = '@quillmark/ui';
// The heavy library a viewer-only consumer must not pull, plus the codec and the
// editing surfaces, which are editor-side whether or not they carry weight of their own.
const FORBIDDEN = new RegExp(`^(prosemirror-|${SELF}/(visual|source))`);

/** Resolve a specifier to a file inside src/lib, or null if it leaves the tree. */
function resolveInLib(spec, fromFile) {
	let base = null;
	if (spec.startsWith('$lib/')) base = join(LIB, spec.slice('$lib/'.length));
	else if (spec === '$lib' || spec === SELF) base = LIB;
	else if (spec.startsWith(`${SELF}/`)) base = join(LIB, spec.slice(SELF.length + 1));
	else if (spec.startsWith('.')) base = resolve(dirname(fromFile), spec);
	else return null; // bare specifier; matched against FORBIDDEN, not walked
	// TS-ESM specifiers carry the EMITTED extension (`./paint.js` → `paint.ts`), so
	// strip it before building candidates; else a `.js` specifier resolves to nothing
	// and the transitive walk never leaves `preview/`, silently passing a relative
	// reach into the codec.
	const stem = base.replace(/\.(js|ts|svelte)$/, '');
	for (const cand of [
		base,
		`${stem}.ts`,
		`${stem}.js`,
		`${stem}.svelte`,
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

if (errors.length) {
	console.error(`Dependency law check failed (${errors.length}):`);
	for (const e of errors) console.error(`  ✗ ${e}`);
	process.exit(1);
}
console.log(
	`Dependency law OK — ${packages.length} packages, ${WASM} pinned at ${pin}, /preview reaches ${seen.size} modules.`
);
