// The style gate — one walk over `src/lib/**`, one rule: a component reads a rung,
// it does not mint a value (SURFACES §"Preventing drift"). The axes share that rule
// and differ only in which properties they own and which value betrays a mint, so
// they are a table, not three scripts.
//
//   rhythm   padding / margin / gap / border-radius   a px|rem length
//   type     font-size / font-weight / font-family    a size, a weight, a family
//   colour   color / background / border / shadow …   a hex or a colour function
//   recede   opacity                                  a step off the ladder
//
// Three rules sit outside the table, because they are about the scale itself rather
// than one axis:
//
//   · `--_qm-*` is DEFINED only in the derivation — what makes one derivation safe
//     for the roots that each carry its marker — and never twice in one rule.
//   · The consumed `--qm-*` set EQUALS the set documented in THEMING.md, both
//     directions: an undocumented dial is drift, a documented-but-dead one is a
//     promise nothing honors.
//   · Every `--qm-*` named in `prose/canon/**` is a real dial. Canon names a subset,
//     so this way only — but it is checked, because canon rots where nothing looks.
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
const DERIVATION = 'src/lib/core/theme.css';
const THEMING = join(ROOT, 'THEMING.md');

/** A colour literal: hex, or a functional notation that names a colour space. */
const COLOR_LITERAL = /#[0-9a-fA-F]{3,8}\b|\b(rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\(/;
/** Colour properties as `Object.assign(el.style, …)` spells them — no trailing `\b`,
 *  so the camelCase compounds (`backgroundColor`, `borderTop`) match too. */
const STYLE_MARKER = /\b(style|background|border|color|outline|boxShadow|textShadow)/;
/** A `--_qm-x:` DEFINITION — a consumption is `var(--_qm-x)`, which has no colon. */
const PRIVATE_DEF = /(--_qm-[\w-]+)\s*:/;
const READS_RUNG = /var\(--_qm-/;

// Two shapes of rule. `literal` FORBIDS a pattern — most properties take values a
// literal cannot be mistaken for, so naming the bad shape is enough. `allowBare`
// REQUIRES a rung, listing the few values legitimate without one — right where any
// value at all is a scale decision (a family, a step on the recede ladder), so
// there is no literal shape to enumerate.
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
		// A family is a scale decision whatever it names, so the rung is required
		// rather than a shape forbidden. `inherit` is how a control defers to its
		// surface, which is reading the scale one level up.
		props: /^font-family$/,
		allowBare: /^(inherit|initial|unset|revert)$/,
		rung: '`var(--_qm-font)` / `var(--_qm-font-mono)`',
		doc: 'THEMING §"The dials"',
		svelteOnly: true
	},
	{
		// `0` / `1` are structural on/off, not a step on the recede ladder.
		props: /^opacity$/,
		allowBare: /^[01]$/,
		rung: '`var(--_qm-opacity-…)`',
		doc: 'THEMING.md',
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
			else if (/\.(svelte|ts|css)$/.test(e.name)) out.push(full);
		}
	})(LIB);
	return out;
}

/** Comments blanked, line count preserved so a failure still points at its line. A
 *  comment is prose, not a declaration: `#8cf` named in one is the hue being
 *  discussed, not a hue being minted, and a gate that cannot tell them apart
 *  punishes the writing rather than the styling. */
function decomment(text) {
	return text
		.replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, ''))
		.replace(/^[ \t]*\/\/.*$/gm, '');
}

/** A file's lintable style region and the 1-based line it starts on. In `.svelte`
 *  that is the `<style>` block — script and markup literals (positions, timeouts)
 *  are none of a style gate's business. In `.ts` declarations live in strings
 *  anywhere, so the whole file is the region. */
function styleRegion(text, file) {
	if (!file.endsWith('.svelte')) return { style: decomment(text), base: 0 };
	const m = text.match(/<style[^>]*>([\s\S]*?)<\/style>/);
	if (!m) return undefined;
	return { style: decomment(m[1]), base: text.slice(0, m.index).split('\n').length };
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
			if (!owns) continue;
			const bad = axis.literal
				? axis.literal.test(svelte ? value : line)
				: !READS_RUNG.test(value) && !axis.allowBare.test(value.trim());
			if (bad)
				fail(`\`${prop ?? 'style'}\` mints a literal — read a ${axis.rung} rung (${axis.doc})`);
		}

		const def = line.match(PRIVATE_DEF);
		if (def) fail(`defines \`${def[1]}\` — the scale is minted only in ${DERIVATION}`);
	});
}

// A rung defined twice is a silent last-wins drop, and CSS raises nothing for it
// the way a duplicate object key does — so the check is explicit. The dark block
// redeclares the poles by design, so only duplicates WITHIN one rule block count.
{
	const css = readFileSync(join(ROOT, DERIVATION), 'utf8');
	for (const [, block] of css.matchAll(/\{([^{}]*)\}/g)) {
		const seen = new Set();
		for (const [, name] of block.matchAll(/^\s*(--_qm-[\w-]+)\s*:/gm))
			if (seen.has(name)) errors.push(`${DERIVATION}: \`${name}\` defined twice in one rule`);
			else seen.add(name);
	}
}

// The dial census. THEMING.md is the contract, so it must match the consumed set
// EXACTLY, both directions. Canon only ever names a subset, so it is checked one
// way — but checked, because canon rotting to dead token names is what happens when
// nothing looks: eleven names that existed nowhere in `src/` survived seventeen
// citations across the two docs a reader reaches first.
const dialsIn = (path) =>
	new Set([...readFileSync(path, 'utf8').matchAll(/`(--qm-[\w-]+)`/g)].map((m) => m[1]));

const documented = dialsIn(THEMING);
for (const t of [...consumed].filter((t) => !documented.has(t)).sort())
	errors.push(`THEMING.md: \`${t}\` consumed but undocumented`);
for (const t of [...documented].filter((t) => !consumed.has(t)).sort())
	errors.push(`THEMING.md: \`${t}\` documented but unconsumed`);

const CANON = join(ROOT, 'prose', 'canon');
for (const doc of readdirSync(CANON)
	.filter((f) => f.endsWith('.md'))
	.sort())
	for (const t of [...dialsIn(join(CANON, doc))].filter((t) => !consumed.has(t)).sort())
		errors.push(`prose/canon/${doc}: \`${t}\` named but not a dial`);

if (errors.length) {
	console.error(`Style check failed (${errors.length}):`);
	for (const e of errors) console.error(`  ✗ ${e}`);
	process.exit(1);
}
console.log(`Style OK — ${files.length} files, ${consumed.size} public dials.`);
