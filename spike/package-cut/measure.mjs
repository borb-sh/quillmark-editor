// The measurements behind the package-cut discussion, as a script rather
// than a paste: every number in this directory's README comes from a run of this file,
// so a reader re-runs it instead of trusting a transcript. Zero deps.
//
// Four questions, in the order they decide anything:
//   1. What does the writer-plus-bin side of `@quillmark/quiver` actually weigh?
//   2. What does a collection install if the tool carries the dev client?
//   3. What must the library publish for `build` to live outside it?
//   4. Can a tool resolve a client that ships no importable entry?
//
// Run from the workspace root: `node spike/package-cut/measure.mjs`. Sections 1 and 2 need
// `dist/` present (`npm run build -w packages/quiver`, `npx vite build` in studio);
// they say so rather than building, since a spike that triggers a 30-second bundle is
// a spike nobody re-runs.

import {
	existsSync,
	mkdtempSync,
	readFileSync,
	readdirSync,
	rmSync,
	statSync,
	writeFileSync
} from 'node:fs';
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const kb = (n) => `${(n / 1e3).toFixed(1)} KB`;
const mb = (n) => `${(n / 1e6).toFixed(1)} MB`;

/** Every file under `dir`, recursively, as absolute paths. */
function walk(dir) {
	if (!existsSync(dir)) return [];
	return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
		e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]
	);
}

const section = (n, title) =>
	console.log(`\n── ${n}. ${title} ${'─'.repeat(Math.max(0, 60 - title.length))}`);

// ── 1. The package cut ──────────────────────────────────────────────────────────
//
// The writer side is what the cut moves out of the library. Compiled bytes are the
// honest unit: source lines count comments, and this package's comments outweigh its
// code.

section(1, 'Compiled bytes, by partition');

const QUIVER_DIST = join(ROOT, 'packages/quiver/dist');

/** The writer and its bin — what a production consumer never calls. */
const WRITER = ['build.js', 'bin/quiver.js', 'source-loader.js', 'quiver-yaml.js'];
/** Leaves both sides share: the pack format, its digest widths, its zip. */
const SHARED = ['bundle.js', 'digest.js', 'format.js', 'errors.js'];

if (!existsSync(QUIVER_DIST)) {
	console.log('  dist/ absent — run `npm run build -w packages/quiver` first.');
} else {
	const files = walk(QUIVER_DIST).filter((f) => f.endsWith('.js'));
	const bucket = { writer: 0, shared: 0, reader: 0 };
	for (const f of files) {
		const rel = relative(QUIVER_DIST, f).split('\\').join('/');
		const size = statSync(f).size;
		if (WRITER.includes(rel)) bucket.writer += size;
		else if (SHARED.includes(rel)) bucket.shared += size;
		else bucket.reader += size;
	}
	const total = bucket.writer + bucket.shared + bucket.reader;
	console.log(
		`  writer + bin  ${kb(bucket.writer).padStart(9)}  ${((bucket.writer / total) * 100).toFixed(0)}%`
	);
	console.log(
		`  shared leaves ${kb(bucket.shared).padStart(9)}  ${((bucket.shared / total) * 100).toFixed(0)}%   the format contract`
	);
	console.log(
		`  reader        ${kb(bucket.reader).padStart(9)}  ${((bucket.reader / total) * 100).toFixed(0)}%`
	);
	console.log(`  total         ${kb(total).padStart(9)}`);
	console.log('\n  A browser bundle reaches none of the writer: `index.ts` does not reach');
	console.log("  `node.ts`, and build's `node:*` imports are dynamic. The cost of the writer");
	console.log('  living in a production package is dead bytes on disk plus a linked bin.');
}

// ── 2. What the tool would carry ────────────────────────────────────────────────
//
// A merged tool is a collection's one devDependency, so whatever the
// client weighs lands in every CI install of every collection — beside the author's
// own `@quillmark/wasm`, which is the copy the gate actually renders through.

section(2, 'The dev client, by asset');

const STUDIO_DIST = join(ROOT, 'packages/studio/dist');

if (!existsSync(STUDIO_DIST)) {
	console.log('  dist/ absent — run `npx vite build` in packages/studio first.');
} else {
	const files = walk(STUDIO_DIST);
	let wasm = 0;
	let other = 0;
	const backends = [];
	for (const f of files) {
		const size = statSync(f).size;
		if (f.endsWith('.wasm')) {
			wasm += size;
			backends.push(size);
		} else other += size;
	}
	backends.sort((a, b) => a - b);
	console.log(
		`  wasm backends (${backends.length})  ${mb(wasm).padStart(9)}   ${backends.map(mb).join(' + ')}`
	);
	console.log(`  js + css + html      ${kb(other).padStart(9)}`);
	console.log(`  total                ${mb(wasm + other).padStart(9)}`);
	console.log('\n  The backends are code-split assets, so a browser fetches one. A tarball');
	console.log('  carries all three, and a gate that never opens a browser carries them too.');
}

// ── 3. The format seam ──────────────────────────────────────────────────────────
//
// If `build` moves into the tool, everything it reaches must be reachable from an
// `exports` entry — today none of it is. This enumerates the seam rather than
// asserting it.

section(3, 'What `build.ts` reaches, and what `exports` publishes');

const SRC = join(ROOT, 'packages/quiver/src');
const read = (p) => readFileSync(join(SRC, p), 'utf8');

/** Local specifiers a module imports, static and dynamic both. */
function localImports(source) {
	const specs = new Set();
	for (const m of source.matchAll(/(?:from|import\()\s*'(\.[^']+)'/g)) specs.add(m[1]);
	return [...specs].sort();
}

/** Named bindings a module imports, as `symbol → module`. Static and dynamic both. */
function importedSymbols(source) {
	const pairs = [];
	const patterns = [
		/import\s*\{([^}]+)\}\s*from\s*'(\.[^']+)'/g, // import { a, b } from './x.js'
		/const\s*\{([^}]+)\}\s*=\s*await\s+import\('(\.[^']+)'\)/g // await import('./x.js')
	];
	for (const re of patterns)
		for (const m of source.matchAll(re))
			for (const raw of m[1].split(','))
				pairs.push([
					raw
						.trim()
						.split(/\s+as\s+/)[0]
						.trim(),
					m[2].replace(/^\.\//, '')
				]);
	return pairs.filter(([name]) => name !== '');
}

/** Names an entry re-exports: `export { a, b }` and `export … from '…'`. */
function exportedNames(source) {
	const names = new Set();
	for (const m of source.matchAll(/export\s+(?:type\s+)?\{([^}]+)\}/g))
		for (const raw of m[1].split(',')) {
			const name = raw
				.trim()
				.split(/\s+as\s+/)
				.pop()
				?.trim();
			if (name) names.add(name);
		}
	for (const m of source.matchAll(/export\s+(?:async\s+)?function\s+(\w+)/g)) names.add(m[1]);
	return names;
}

// The question is not which modules an entry reaches — `node.ts` reaches
// `source-loader.ts` to build `fromDir` — but which SYMBOLS it hands out. A symbol
// build.ts needs and no entry re-exports is one the library must publish for `build` to
// live anywhere else.
const published = new Set([...exportedNames(read('index.ts')), ...exportedNames(read('node.ts'))]);

console.log('  symbol                 module              published by an entry?');
for (const [name, mod] of importedSymbols(read('build.ts')).sort())
	console.log(
		`    ${name.padEnd(21)}${mod.padEnd(20)}${published.has(name) ? 'yes' : 'NO — package-internal'}`
	);
console.log('\n  The construction door is the harder half: `source-loader.ts` builds through');
console.log('  `createQuiver`, which `quiver.ts` exports and no `exports` entry reaches, by');
console.log('  design. So `fromDir` cannot follow `build` out without opening it.');

// ── 4. Resolving a client that ships no importable entry ────────────────────────
//
// "Two packages, one name" needs the tool to find a client package it does not import.
// Studio ships `"exports": {}` today, which is the trap: it blocks every specifier,
// `package.json` included.

section(4, 'Client resolution, with and without an exports entry');

const tmp = mkdtempSync(join(tmpdir(), 'quiver-spike-'));
try {
	writeFileSync(join(tmp, 'package.json'), JSON.stringify({ name: 'host', version: '1.0.0' }));
	const req = createRequire(pathToFileURL(join(tmp, 'package.json')).href);

	// One package per case, never one rewritten: Node caches a directory's package.json
	// for the life of the process, so a second read of a rewritten file returns the
	// first parse and the experiment quietly measures nothing.
	const attempt = (name, label, exports) => {
		const dir = join(tmp, 'node_modules', name);
		mkdirSync(join(dir, 'dist'), { recursive: true });
		writeFileSync(join(dir, 'dist', 'index.html'), '<!doctype html>\n');
		writeFileSync(
			join(dir, 'package.json'),
			JSON.stringify({ name, version: '1.0.0', exports, files: ['dist'] })
		);
		try {
			const resolved = req.resolve(`${name}/package.json`);
			const dist = join(dirname(resolved), 'dist');
			console.log(
				`  ${label.padEnd(38)} resolves → ${existsSync(dist) ? '<pkg>/dist' : 'missing'}`
			);
		} catch (err) {
			console.log(`  ${label.padEnd(38)} ${err.code}`);
		}
	};

	attempt('client-sealed', '"exports": {}', {});
	attempt('client-open', '"exports": { "./package.json": … }', {
		'./package.json': './package.json'
	});

	console.log('\n  One entry makes the client findable while keeping it non-importable, so the');
	console.log('  bundled-terminal rule in check-deps.mjs holds: nothing imports it, and the');
	console.log('  copy it bundles still meets no other.');
} finally {
	rmSync(tmp, { recursive: true, force: true });
}

console.log('');
