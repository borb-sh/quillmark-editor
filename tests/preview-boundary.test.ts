// The `/preview` reserved-package invariant, enforced (PHASE_1 §subpath skeleton,
// ARCHITECTURE §Packaging): the `/preview` subpath imports no editor-side code,
// so the eventual `@quillmark/preview` promotion is a re-export, not a refactor.
// "Editor-side" is concretely the heavy libraries a viewer-only consumer must not
// pull — ProseMirror and CodeMirror — plus the codec and the `/visual`/`/source`
// surfaces that reach them.
//
// A direct-import scan is not enough: preview importing the `/core` barrel, which
// in a later phase re-exports the codec, would slip ProseMirror in transitively.
// So this walks preview's import graph *within* `src/lib` and fails if any reached
// module imports a forbidden external. The rule holds through Phases 2–5 without a
// retroactive audit.
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve, relative } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const LIB = resolve(HERE, '..', 'src', 'lib');
const PREVIEW = join(LIB, 'preview');

// A viewer-only consumer must pull neither editor library, nor the codec /
// editor surfaces that depend on them.
const FORBIDDEN_EXTERNAL =
	/^(prosemirror-|@codemirror\/|codemirror$|@quillmark\/editor\/(visual|source))/;

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
// (a bare package, an alias we do not follow). `$lib/x` → src/lib/x.
function resolveInLib(spec: string, fromFile: string): string | null {
	let base: string | null = null;
	if (spec.startsWith('$lib/')) base = join(LIB, spec.slice('$lib/'.length));
	else if (spec === '$lib') base = LIB;
	else if (spec.startsWith('.')) base = resolve(dirname(fromFile), spec);
	else return null; // bare specifier — checked against FORBIDDEN_EXTERNAL, not walked
	for (const cand of [
		base,
		`${base}.ts`,
		`${base}.js`,
		`${base}.svelte`,
		join(base, 'index.ts'),
		join(base, 'index.js')
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

describe('/preview reserved-package boundary', () => {
	it('exists as a subpath root', () => {
		expect(existsSync(join(PREVIEW, 'index.ts'))).toBe(true);
	});

	it('never reaches ProseMirror / CodeMirror or the editor surfaces (transitively)', () => {
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
