// The `/preview` reserved-package invariant, enforced (ARCHITECTURE §Packaging):
// the `/preview` subpath imports no editor-side code, so a `@quillmark/preview`
// promotion is a re-export, not a refactor. "Editor-side" is concretely the heavy
// library a viewer-only consumer must not pull (ProseMirror) plus the codec and
// the `/visual`/`/source` surfaces, which are editor surfaces whether or not they
// carry weight of their own.
//
// A direct-import scan is not enough: preview importing the `/core` barrel, which
// re-exports the codec, would slip ProseMirror in transitively. So this walks
// preview's import graph *within* `src/lib` and fails if any reached module
// imports a forbidden external.
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve, relative } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const LIB = resolve(HERE, '..', 'src', 'lib');
const PREVIEW = join(LIB, 'preview');

// A viewer-only consumer must pull neither the editor library, nor the codec /
// editor surfaces that depend on it.
const FORBIDDEN_EXTERNAL = /^(prosemirror-|@quillmark\/editor\/(visual|source))/;

// Every import/export-from/dynamic-import specifier in an ESM/Svelte source.
function specifiersOf(file: string): string[] {
	const src = readFileSync(file, 'utf8');
	const out: string[] = [];
	const patterns = [
		/\bimport\s+[^'"]*?\bfrom\s*['"]([^'"]+)['"]/g,
		/\bexport\s+[^'"]*?\bfrom\s*['"]([^'"]+)['"]/g,
		/\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
		/\bimport\s*['"]([^'"]+)['"]/g
	];
	for (const re of patterns) {
		let m: RegExpExecArray | null;
		while ((m = re.exec(src))) out.push(m[1]);
	}
	return out;
}

// Resolve a specifier to a file inside src/lib, or null if it leaves the tree
// (a bare package, an alias we do not follow). `$lib/x` → src/lib/x. The
// package self-reference (`@quillmark/editor/x`, legal under Node/Vite) maps
// the same way, so it cannot smuggle the core barrel past the walk.
function resolveInLib(spec: string, fromFile: string): string | null {
	const SELF = '@quillmark/editor';
	let base: string | null = null;
	if (spec.startsWith('$lib/')) base = join(LIB, spec.slice('$lib/'.length));
	else if (spec === '$lib' || spec === SELF) base = LIB;
	else if (spec.startsWith(`${SELF}/`)) base = join(LIB, spec.slice(SELF.length + 1));
	else if (spec.startsWith('.')) base = resolve(dirname(fromFile), spec);
	else return null; // bare specifier; checked against FORBIDDEN_EXTERNAL, not walked
	// TS-ESM specifiers carry the EMITTED extension (`./paint.js` → `paint.ts`,
	// `./Preview.svelte`), so strip a trailing `.js`/`.ts`/`.svelte` before
	// building candidates; else a `.js` specifier resolves to nothing and the
	// transitive walk (this test's whole reason to exist over a grep) never leaves
	// `src/lib/preview`, silently passing a relative reach into the codec/core.
	const stem = base.replace(/\.(js|ts|svelte)$/, '');
	for (const cand of [
		base,
		`${stem}.ts`,
		`${stem}.js`,
		`${stem}.svelte`,
		join(stem, 'index.ts'),
		join(stem, 'index.js')
	]) {
		if (existsSync(cand) && statSync(cand).isFile()) return cand;
	}
	return null;
}

function collectFiles(dir: string): string[] {
	const out: string[] = [];
	for (const name of readdirSync(dir)) {
		const abs = join(dir, name);
		if (statSync(abs).isDirectory()) out.push(...collectFiles(abs));
		else if (/\.(ts|js|svelte)$/.test(abs) && !/\.(test|spec)\./.test(abs)) out.push(abs);
	}
	return out;
}

// The bundled bridge joins the two surfaces at the SHELL layer, so it must import
// neither of them: what it takes are structural handles, which is the property
// that keeps the surfaces mutually unaware while a consumer wires them in one line.
const BRIDGE = join(LIB, 'bridge');
const BRIDGE_FORBIDDEN = /^(prosemirror-|@quillmark\/editor\/(visual|source|preview))/;

describe('/preview reserved-package boundary', () => {
	it('never reaches ProseMirror or the editor surfaces (transitively)', () => {
		const seen = new Set<string>();
		const violations: string[] = [];
		const walk = (file: string): void => {
			if (seen.has(file)) return;
			seen.add(file);
			for (const spec of specifiersOf(file)) {
				if (FORBIDDEN_EXTERNAL.test(spec)) {
					violations.push(`${relative(LIB, file)} imports "${spec}"`);
					continue;
				}
				const next = resolveInLib(spec, file);
				if (next) walk(next);
			}
		};
		for (const f of collectFiles(PREVIEW)) walk(f);
		expect(violations, violations.join('\n')).toEqual([]);
	});
});

describe('/bridge couples no surface to another', () => {
	it('reaches `/core` and nothing else (transitively)', () => {
		const seen = new Set<string>();
		const violations: string[] = [];
		const walk = (file: string): void => {
			if (seen.has(file)) return;
			seen.add(file);
			const inside = relative(LIB, file);
			if (/^(visual|preview|source)\b/.test(inside)) {
				violations.push(`reaches ${inside}`);
				return;
			}
			for (const spec of specifiersOf(file)) {
				if (BRIDGE_FORBIDDEN.test(spec)) {
					violations.push(`${inside} imports "${spec}"`);
					continue;
				}
				const next = resolveInLib(spec, file);
				if (next) walk(next);
			}
		};
		for (const f of collectFiles(BRIDGE)) walk(f);
		expect(violations, violations.join('\n')).toEqual([]);
	});
});
