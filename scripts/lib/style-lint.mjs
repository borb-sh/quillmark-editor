// The shared body of the three scale gates — `check-geometry` (rhythm),
// `check-type` (the size/weight ramp), `check-theme` (colour). Each axis pairs
// public dials with a derived `--_qm-*` scale and a lint that keeps components
// reading rungs (SURFACES §"Preventing drift"); only the rules differ, so the
// walk, the `<style>` extraction, and the report live here.
//
// Scope is `src/lib/**` for every axis. A narrower per-script scope makes a
// violation legal by directory — `SourceView.svelte` is as much a surface as
// `Card.svelte`, and a rung it fails to read is drift wherever it sits.

import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const LIB = join(ROOT, 'src', 'lib');

/** Every `.svelte`/`.ts` source under `src/lib`, test files excluded, sorted. */
export function sources({ svelteOnly = false } = {}) {
	const out = [];
	(function walk(dir) {
		for (const e of readdirSync(dir, { withFileTypes: true }).sort((a, b) =>
			a.name < b.name ? -1 : 1
		)) {
			const full = join(dir, e.name);
			if (e.isDirectory()) walk(full);
			else if (/\.spec\.ts$|\.test\.ts$/.test(e.name)) continue;
			else if (e.name.endsWith('.svelte') || (!svelteOnly && e.name.endsWith('.ts')))
				out.push(full);
		}
	})(LIB);
	return out;
}

/**
 * A file's lintable style region and the 1-based line it starts on. In
 * `.svelte` that is the `<style>` block — script and markup literals (positions,
 * timeouts) are none of a style gate's business. In `.ts` declarations live in
 * strings anywhere, so the whole file is the region and the caller narrows.
 */
export function styleRegion(text, file) {
	if (!file.endsWith('.svelte')) return { style: text, base: 0 };
	const m = text.match(/<style[^>]*>([\s\S]*?)<\/style>/);
	if (!m) return undefined;
	return { style: m[1], base: text.slice(0, m.index).split('\n').length };
}

/** `prop: value` off one declaration line, or undefined when the line is not one. */
export function declaration(line) {
	const m = line.match(/^\s*([\w-]+)\s*:\s*([^;]*)/);
	return m ? { prop: m[1], value: m[2] } : undefined;
}

/**
 * Walk every source, hand each style line to `rule`, and exit non-zero on any
 * failure. `rule({ file, line, ln, prop, value, svelte, fail })` — `prop`/`value`
 * are undefined on a non-declaration line, which a `.ts` rule may still want.
 */
export function gate({ label, rule, svelteOnly = false }) {
	const errors = [];
	const files = sources({ svelteOnly });

	for (const full of files) {
		const file = relative(ROOT, full);
		const text = readFileSync(full, 'utf8');
		const region = styleRegion(text, full);
		if (!region) continue;
		const svelte = full.endsWith('.svelte');

		region.style.split('\n').forEach((line, i) => {
			const ln = region.base + i + 1;
			const decl = declaration(line);
			rule({
				file,
				line,
				ln,
				svelte,
				prop: decl?.prop,
				value: decl?.value,
				fail: (msg) => errors.push(`${file}:${ln}: ${msg}`)
			});
		});
	}

	if (errors.length) {
		console.error(`${label} check failed (${errors.length}):`);
		for (const e of errors) console.error(`  ✗ ${e}`);
		process.exit(1);
	}
	console.log(`${label} OK — ${files.length} files.`);
	return files;
}
