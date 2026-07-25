// The style gate — one walk over `src/lib/**`, one rule: a component reads a rung,
// it does not mint a value (SURFACES §"Preventing drift"). Three axes share that
// rule and differ only in which properties they own and which literal they forbid,
// so they are a table, not three scripts.
//
//   rhythm   padding / margin / gap / border-radius   a px|rem length
//   type     font-size / font-weight                  a size, or a weight keyword
//   colour   color / background / border / shadow …   a hex or a colour function
//
// Two rules sit outside the table because they are about the scale itself rather
// than one axis:
//
//   · `--_qm-*` is DEFINED only in the derivation — what makes one derivation safe
//     for the detached roots that each apply it.
//   · The consumed `--qm-*` set EQUALS the set documented in THEMING.md, both
//     directions: an undocumented dial is drift, a documented-but-dead one is a
//     promise nothing honors.
//
// Scope is `src/lib/**` for every axis — a violation must not become legal by
// directory. `.svelte` `<style>` blocks and `.ts` alike, because `preview/paint.ts`
// and `preview/overlay.ts` carry style declarations inside JS strings and would
// otherwise escape; in `.ts` a declaration is one string among code, so a marker on
// the line stands in for the property name.
//
// A `var()` fallback is legitimate only in the derivation, which is exempt from the
// literal rules entirely — so outside it, a literal is a literal wherever it sits.
// Zero deps; run via `npm run check:style`.

import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const LIB = join(ROOT, 'src', 'lib');
const DERIVATION = 'src/lib/core/theme.ts';
const THEMING = join(ROOT, 'THEMING.md');

/** A colour literal: hex, or a functional notation that names a colour space. */
const COLOR_LITERAL = /#[0-9a-fA-F]{3,8}\b|\b(rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\(/;
/** Colour properties as `Object.assign(el.style, …)` spells them — no trailing `\b`,
 *  so the camelCase compounds (`backgroundColor`, `borderTop`) match too. */
const STYLE_MARKER = /\b(style|background|border|color|outline|boxShadow|textShadow)/;
/** A `--_qm-x:` DEFINITION — a consumption is `var(--_qm-x)`, which has no colon. */
const PRIVATE_DEF = /(--_qm-[\w-]+)\s*:/;
const READS_RUNG = /var\(--_qm-/;

const AXES = [
	{
		props: /^(border-radius|gap|row-gap|column-gap|padding|margin)(-(top|bottom|left|right))?$/,
		literal: /\b\d*\.?\d+(px|rem)\b/,
		rung: '`var(--_qm-space-…)` / `var(--_qm-radius…)`',
		doc: 'SURFACES §Rhythm',
		svelteOnly: true
	},
	{
		props: /^font-size$/,
		literal: /\b\d*\.?\d+(px|rem|em)\b/,
		rung: '`var(--_qm-text-…)`',
		doc: 'THEMING §Typography',
		svelteOnly: true
	},
	{
		// The CSS-wide keywords (inherit/initial/unset) carry no hierarchy decision,
		// so they are not a scale escape and do not match.
		props: /^font-weight$/,
		literal: /\b(\d{3}|bold|bolder|lighter|normal)\b/,
		rung: '`var(--_qm-weight-…)`',
		doc: 'THEMING §Typography',
		svelteOnly: true
	},
	{
		props:
			/^(color|fill|stroke|background|border|outline|box-shadow|text-shadow|backdrop-filter|-webkit-backdrop-filter)(-[\w-]+)?$/,
		literal: COLOR_LITERAL,
		rung: '`var(--_qm-…)`',
		doc: 'THEMING.md',
		svelteOnly: false
	}
];

/** Every `.svelte`/`.ts` source under `src/lib`, test files excluded, sorted. */
function sources() {
	const out = [];
	(function walk(dir) {
		for (const e of readdirSync(dir, { withFileTypes: true }).sort((a, b) =>
			a.name < b.name ? -1 : 1
		)) {
			const full = join(dir, e.name);
			if (e.isDirectory()) walk(full);
			else if (/\.spec\.ts$|\.test\.ts$/.test(e.name)) continue;
			else if (e.name.endsWith('.svelte') || e.name.endsWith('.ts')) out.push(full);
		}
	})(LIB);
	return out;
}

/** A file's lintable style region and the 1-based line it starts on. In `.svelte`
 *  that is the `<style>` block — script and markup literals (positions, timeouts)
 *  are none of a style gate's business. In `.ts` declarations live in strings
 *  anywhere, so the whole file is the region. */
function styleRegion(text, file) {
	if (!file.endsWith('.svelte')) return { style: text, base: 0 };
	const m = text.match(/<style[^>]*>([\s\S]*?)<\/style>/);
	if (!m) return undefined;
	return { style: m[1], base: text.slice(0, m.index).split('\n').length };
}

const errors = [];
const consumed = new Set();
const files = sources();

for (const full of files) {
	const file = relative(ROOT, full);
	const region = styleRegion(readFileSync(full, 'utf8'), full);
	if (!region) continue;
	const svelte = full.endsWith('.svelte');

	region.style.split('\n').forEach((line, i) => {
		const ln = region.base + i + 1;
		const fail = (msg) => errors.push(`${file}:${ln}: ${msg}`);

		for (const m of line.matchAll(/var\(\s*(--qm-[\w-]+)/g)) consumed.add(m[1]);
		if (file === DERIVATION) return; // it IS the derivation — literals here are the defaults

		const decl = line.match(/^\s*([\w-]+)\s*:\s*([^;]*)/);
		const prop = decl?.[1];
		const value = decl?.[2] ?? '';

		for (const axis of AXES) {
			if (axis.svelteOnly && !svelte) continue;
			// In `.svelte` the region is already CSS, so the property name decides; in
			// `.ts` a style declaration is one string among code, so the marker does.
			const owns = svelte ? axis.props.test(prop ?? '') : STYLE_MARKER.test(line);
			if (owns && axis.literal.test(svelte ? value : line))
				fail(`\`${prop ?? 'style'}\` mints a literal — read a ${axis.rung} rung (${axis.doc})`);
		}

		// `opacity: 0` / `1` are structural on/off, not a step on the recede ladder.
		if (prop === 'opacity' && !READS_RUNG.test(value) && !/^\s*[01]\s*$/.test(value))
			fail('`opacity` mints a literal — read a `var(--_qm-opacity-…)` rung');

		const def = line.match(PRIVATE_DEF);
		if (def) fail(`defines \`${def[1]}\` — the scale is minted only in ${DERIVATION}`);
	});
}

// The dial census — the consumed set and the documented set must be the same set.
const documented = new Set(
	[...readFileSync(THEMING, 'utf8').matchAll(/`(--qm-[\w-]+)`/g)].map((m) => m[1])
);
for (const t of [...consumed].filter((t) => !documented.has(t)).sort())
	errors.push(`THEMING.md: \`${t}\` consumed but undocumented`);
for (const t of [...documented].filter((t) => !consumed.has(t)).sort())
	errors.push(`THEMING.md: \`${t}\` documented but unconsumed`);

if (errors.length) {
	console.error(`Style check failed (${errors.length}):`);
	for (const e of errors) console.error(`  ✗ ${e}`);
	process.exit(1);
}
console.log(`Style OK — ${files.length} files, ${consumed.size} public dials.`);
