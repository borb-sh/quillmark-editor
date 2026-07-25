// Theme lint — the third gate, beside `check:geometry` (rhythm) and `check:type`
// (the size/weight ramp). Colour was the unguarded axis: geometry and type each
// pair public dials with a derived scale and a lint, while colour had flat
// literals and nothing watching. Three rules over `src/lib/**` — `.svelte`
// `<style>` blocks AND `.ts`, because `preview/paint.ts` and `preview/overlay.ts`
// carry style declarations inside JS strings and would otherwise escape:
//
//   1. No bare colour / shadow / opacity literal. A rung (`var(--_qm-…)`) is the
//      only value. `opacity: 0` / `1` are structural on/off, not a ladder step,
//      and are allowed.
//   2. The consumed `--qm-*` set EQUALS the set documented in THEMING.md. Both
//      directions: an undocumented token is drift (`--qm-required` shipped that
//      way), a documented-but-dead one is a promise nothing honors.
//   3. `core/theme.ts` is the ONLY place `--_qm-*` is DEFINED. This is what makes
//      one derivation for four detached roots safe — it replaces the older
//      "byte-identical across four mint roots" idea, which one prettier reflow
//      would have turned into a false failure. It covers all three axes, so
//      `check-geometry.mjs` no longer carries a mint rule of its own.
//
// `core/theme.ts` is exempt from rules 1 and 3: it IS the derivation, and the
// literals in it are the documented defaults each dial falls back to.
// Zero deps; run via `npm run check:theme`.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const LIB = join(ROOT, 'src', 'lib');
const DERIVATION = join(LIB, 'core', 'theme.ts');
const THEMING = join(ROOT, 'THEMING.md');

/** A colour literal: hex, or a functional notation that names a colour space. */
const COLOR_LITERAL = /#[0-9a-fA-F]{3,8}\b|\b(rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\(/;
/** The properties whose values must come from the scale, not a literal. */
const COLOR_PROP =
	/^(color|fill|stroke|background|border|outline|box-shadow|text-shadow|backdrop-filter|-webkit-backdrop-filter)(-[\w-]+)?$/;
/** Their camelCase spelling, for the `Object.assign(el.style, …)` sites in `.ts`. */
const STYLE_MARKER = /\b(background|boxShadow|border[A-Z]?|color|outline|textShadow|style)\b/;
/** A `--_qm-x:` DEFINITION — a consumption is `var(--_qm-x)` and never matches. */
const PRIVATE_DEF = /(^|[;{\s])(--_qm-[\w-]+)\s*:/;
const READS_RUNG = /var\(--_qm-/;

const errors = [];
const files = [];
(function walk(dir) {
	for (const name of readdirSync(dir).sort()) {
		const full = join(dir, name);
		if (statSync(full).isDirectory()) walk(full);
		else if (/\.(svelte|ts)$/.test(name) && !/\.(test|spec)\.ts$/.test(name)) files.push(full);
	}
})(LIB);

/** Every `--qm-*` this file consumes. */
const consumed = new Set();

for (const full of files) {
	const rel = relative(ROOT, full);
	const text = readFileSync(full, 'utf8');
	const fail = (ln, msg) => errors.push(`${rel}:${ln}: ${msg}`);
	const isDerivation = full === DERIVATION;

	for (const m of text.matchAll(/var\(\s*(--qm-[\w-]+)/g)) consumed.add(m[1]);

	// In `.svelte`, only `<style>` is style; in `.ts`, declarations live in strings
	// anywhere, so the whole file is in scope (narrowed by STYLE_MARKER below).
	const svelte = full.endsWith('.svelte');
	const style = svelte ? text.match(/<style[^>]*>([\s\S]*?)<\/style>/)?.[1] : text;
	if (!style) continue;
	const base = svelte ? text.slice(0, text.indexOf(style)).split('\n').length - 1 : 0;

	style.split('\n').forEach((line, i) => {
		const ln = base + i + 1;
		if (/^\s*(\/\/|\*|\/\*)/.test(line)) return; // a comment may name a literal
		// Strip `var(--x, fallback)` — a fallback is the one place a literal belongs.
		const bare = line.replace(/var\(\s*--[\w-]+\s*,[^)]*(\([^)]*\))?[^)]*\)/g, 'var()');

		if (!isDerivation && (svelte || STYLE_MARKER.test(line)) && COLOR_LITERAL.test(bare)) {
			const decl = bare.match(/([\w-]+)\s*:/);
			if (!svelte || (decl && COLOR_PROP.test(decl[1])))
				fail(ln, `mints a colour literal — read a \`var(--_qm-…)\` rung (THEMING.md)`);
		}

		const opacity = bare.match(/^\s*opacity\s*:\s*([^;]+)/);
		if (opacity && !READS_RUNG.test(opacity[1]) && !/^\s*[01]\s*$/.test(opacity[1]))
			fail(ln, `\`opacity\` mints a literal — read a \`var(--_qm-opacity-…)\` rung`);

		const def = line.match(PRIVATE_DEF);
		if (def && !isDerivation)
			fail(ln, `defines \`${def[2]}\` — the scale is minted only in src/lib/core/theme.ts`);
	});
}

// Rule 2 — the consumed set and the documented set must be the same set.
const documented = new Set(
	[...readFileSync(THEMING, 'utf8').matchAll(/`(--qm-[\w-]+)`/g)].map((m) => m[1])
);
for (const t of [...consumed].sort())
	if (!documented.has(t)) errors.push(`THEMING.md: \`${t}\` is consumed but undocumented`);
for (const t of [...documented].sort())
	if (!consumed.has(t)) errors.push(`THEMING.md: \`${t}\` is documented but consumed nowhere`);

if (errors.length) {
	console.error(`Theme check failed (${errors.length}):`);
	for (const e of errors) console.error(`  ✗ ${e}`);
	process.exit(1);
}
console.log(`Theme OK — ${files.length} files, ${consumed.size} public dials.`);
