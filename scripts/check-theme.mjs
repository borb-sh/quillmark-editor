// Theme lint — the colour gate, beside `check:geometry` (rhythm) and `check:type`
// (the size/weight ramp). All three axes have the same shape: public dials derive
// a private scale, components read rungs, a lint holds the line. Three rules over
// `src/lib/**` — `.svelte` `<style>` blocks AND `.ts`, because `preview/paint.ts`
// and `preview/overlay.ts` carry style declarations inside JS strings and would
// otherwise escape:
//
//   1. No bare colour / shadow / opacity literal. A rung (`var(--_qm-…)`) is the
//      only value. `opacity: 0` / `1` are structural on/off, not a ladder step,
//      and are allowed.
//   2. The consumed `--qm-*` set EQUALS the set documented in THEMING.md. Both
//      directions: an undocumented token is drift, a documented-but-dead one is a
//      promise nothing honors.
//   3. `core/theme.ts` is the ONLY place `--_qm-*` is DEFINED — what makes one
//      derivation safe for the detached roots that each set it. It covers all
//      three axes, so its siblings own only their consumption rules.
//
// `core/theme.ts` is exempt from rules 1 and 3: it IS the derivation, and the
// literals in it are the documented defaults each dial falls back to.
// Zero deps; run via `npm run check:theme`.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, gate } from './lib/style-lint.mjs';

const DERIVATION = 'src/lib/core/theme.ts';
const THEMING = join(ROOT, 'THEMING.md');

/** A colour literal: hex, or a functional notation that names a colour space. */
const COLOR_LITERAL = /#[0-9a-fA-F]{3,8}\b|\b(rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\(/;
/** The properties whose values must come from the scale, not a literal. */
const COLOR_PROP =
	/^(color|fill|stroke|background|border|outline|box-shadow|text-shadow|backdrop-filter|-webkit-backdrop-filter)(-[\w-]+)?$/;
/** The same, as `Object.assign(el.style, …)` spells them — no trailing `\b`, so
 *  the camelCase compounds (`backgroundColor`, `borderTop`) match too. */
const STYLE_MARKER = /\b(style|background|border|color|outline|boxShadow|textShadow)/;
/** A `--_qm-x:` DEFINITION — a consumption is `var(--_qm-x)`, which has no colon. */
const PRIVATE_DEF = /(--_qm-[\w-]+)\s*:/;
const READS_RUNG = /var\(--_qm-/;
/** A fallback is the one place a literal belongs, so it is not a violation. */
const stripFallbacks = (line) => line.replace(/var\(\s*--[\w-]+\s*,[^)]*\)/g, 'var()');

const consumed = new Set();

gate({
	label: 'Theme',
	rule: ({ file, line, prop, value, svelte, fail }) => {
		for (const m of line.matchAll(/var\(\s*(--qm-[\w-]+)/g)) consumed.add(m[1]);
		if (file === DERIVATION) return;

		const bare = stripFallbacks(line);
		// In `.svelte` the region is already CSS, so the property name decides; in
		// `.ts` a style declaration is one string among code, so the marker does.
		const inScope = svelte ? COLOR_PROP.test(prop ?? '') : STYLE_MARKER.test(line);
		if (inScope && COLOR_LITERAL.test(bare))
			fail('mints a colour literal — read a `var(--_qm-…)` rung (THEMING.md)');

		const opacity = prop === 'opacity' ? stripFallbacks(value) : undefined;
		if (opacity !== undefined && !READS_RUNG.test(opacity) && !/^\s*[01]\s*$/.test(opacity))
			fail('`opacity` mints a literal — read a `var(--_qm-opacity-…)` rung');

		const def = bare.match(PRIVATE_DEF);
		if (def) fail(`defines \`${def[1]}\` — the scale is minted only in ${DERIVATION}`);
	}
});

// Rule 2 — the consumed set and the documented set must be the same set.
const documented = new Set(
	[...readFileSync(THEMING, 'utf8').matchAll(/`(--qm-[\w-]+)`/g)].map((m) => m[1])
);
const errors = [
	...[...consumed]
		.filter((t) => !documented.has(t))
		.map((t) => `\`${t}\` consumed but undocumented`),
	...[...documented]
		.filter((t) => !consumed.has(t))
		.map((t) => `\`${t}\` documented but unconsumed`)
].sort();

if (errors.length) {
	console.error(`Theme check failed (${errors.length}):`);
	for (const e of errors) console.error(`  ✗ THEMING.md: ${e}`);
	process.exit(1);
}
console.log(`Theme dials OK — ${consumed.size} public dials.`);
