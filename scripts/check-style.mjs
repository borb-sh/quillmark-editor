// The style gate — one walk over `src/lib/**`, one rule: a component reads a rung,
// it does not mint a value (SURFACES §"Preventing drift"). The axes share that rule
// and differ only in which properties they own and which value betrays a mint, so
// they are a table, not three scripts.
//
//   rhythm   padding / margin / gap / border-radius   a px|rem length
//   stroke   border / border-*-width                  a length, at any width
//   type     font                                     anything but a CSS-wide keyword
//            font-size / font-weight / font-family    a size, a weight, a family
//            line-height                              a leading off the two rungs
//   colour   color / background / border / shadow …   a hex or a colour function
//   recede   opacity                                  a step off the ladder
//   motion   transition / animation                   an s|ms time
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
// directory, nor by FILE TYPE. Three shapes carry style: a `.svelte` `<style>`
// block, a plain `.css` file (the shared control recipes), and `.ts` — because
// `preview/paint.ts` and `preview/overlay.ts` carry style declarations inside JS
// strings and would otherwise escape. The first two are CSS, so the property name
// decides which axis owns a line; in `.ts` a declaration is one string among code,
// so a marker on the line stands in for the property name — which is why the
// property-named axes run on CSS only.
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
/** A length literal, for the axes whose values are sizes. The rhythm axis keeps its
 *  own narrower shape (`px|rem`); the type and stroke axes count `em` too. */
const LENGTH_LITERAL = /\b\d*\.?\d+(px|rem|em)\b/;
/** Colour properties as `Object.assign(el.style, …)` spells them — no trailing `\b`,
 *  so the camelCase compounds (`backgroundColor`, `borderTop`) match too. */
const STYLE_MARKER = /\b(style|background|border|color|outline|boxShadow|textShadow)/;
/** A `--_qm-x:` DEFINITION — a consumption is `var(--_qm-x)`, which has no colon. */
const PRIVATE_DEF = /(--_qm-[\w-]+)\s*:/;
const READS_RUNG = /var\(--_qm-/;

// Three shapes of rule. `literal` FORBIDS a pattern — most properties take values a
// literal cannot be mistaken for, so naming the bad shape is enough. `allowBare`
// REQUIRES a rung, listing the few values legitimate without one — right where any
// value at all is a scale decision (a family, a step on the recede ladder), so
// there is no literal shape to enumerate. `only` REQUIRES one of a fixed set and
// takes NO rung escape, for the one property where naming a rung is not enough to
// make a value safe.
const AXES = [
	{
		props: /^(border-radius|gap|row-gap|column-gap|padding|margin)(-(top|bottom|left|right))?$/,
		literal: /\b\d*\.?\d+(px|rem)\b/,
		rung: '`var(--_qm-space-…)` / `var(--_qm-radius…)`',
		doc: 'SURFACES §Rhythm',
		cssOnly: true
	},
	{
		// Stroke width, which the colour axis below does NOT see: it tests `border-*`
		// for a colour literal, so `border-left: 2px solid var(--_qm-border)` reads a
		// rung, passes, and renders at a width nothing chose — a divergent width beside
		// the hairlines with the gate green. Shorthands included, since
		// that is where the width hides. What this holds is that no width is MINTED;
		// which rung a width reads is beyond either axis shape, so a border that reads
		// `--_qm-ring-width` passes here and is review's to catch.
		props: /^border(-(top|right|bottom|left))?(-width)?$/,
		literal: LENGTH_LITERAL,
		rung: '`var(--_qm-border-width)`',
		doc: 'SURFACES §Rhythm',
		cssOnly: true
	},
	{
		props: /^font-size$/,
		literal: LENGTH_LITERAL,
		rung: '`var(--_qm-text-…)`',
		doc: 'THEMING §Typography',
		cssOnly: true
	},
	{
		// The CSS-wide keywords (inherit/initial/unset) carry no hierarchy decision,
		// so they are not a scale escape and do not match.
		props: /^font-weight$/,
		literal: /\b(\d{3}|bold|bolder|lighter|normal)\b/,
		rung: '`var(--_qm-weight-…)`',
		doc: 'THEMING §Typography',
		cssOnly: true
	},
	{
		// Leading has no literal shape to forbid — a bare number is exactly what a rung
		// resolves to, so the rung is REQUIRED instead. The axis fires only on a line
		// that DECLARES leading; a surface that declares none is covered by the root
		// baseline, since a unitless rung inherits (core/theme.css). `1` is the one bare
		// value that is not a step on the ramp — a glyph row collapsing its line box
		// onto the glyph, structural like `opacity: 0`.
		props: /^line-height$/,
		allowBare: /^1$/,
		rung: '`var(--_qm-leading-…)`',
		doc: 'SURFACES §Rhythm',
		cssOnly: true
	},
	{
		// A family is a scale decision whatever it names, so the rung is required
		// rather than a shape forbidden. `inherit` is how a control defers to its
		// surface, which is reading the scale one level up.
		props: /^font-family$/,
		allowBare: /^(inherit|initial|unset|revert)$/,
		rung: '`var(--_qm-font)` / `var(--_qm-font-mono)`',
		doc: 'THEMING §"The dials"',
		cssOnly: true
	},
	{
		// The `font` SHORTHAND sets family, size and leading in one declaration, past
		// three axes that each watch a single longhand. It takes no rung escape, which
		// is what makes it its own entry: `font: 600 12px/1.2 var(--_qm-font)` names a
		// rung and still mints a size and a leading nothing else is watching. So
		// nothing but a CSS-wide keyword is legal — a surface defers with
		// `font: inherit` and restates the rungs it wants as longhands after it, since
		// the shorthand resets whatever precedes it.
		props: /^font$/,
		only: /^(inherit|initial|unset|revert)$/,
		fix: 'defer with `font: inherit` and read the rungs as longhands after it',
		doc: 'THEMING §"The dials"',
		cssOnly: true
	},
	{
		// `0` / `1` are structural on/off, not a step on the recede ladder.
		props: /^opacity$/,
		allowBare: /^[01]$/,
		rung: '`var(--_qm-opacity-…)`',
		doc: 'THEMING.md',
		cssOnly: true
	},
	{
		props:
			/^(color|fill|stroke|background|border|outline|box-shadow|text-shadow|backdrop-filter|-webkit-backdrop-filter)(-[\w-]+)?$/,
		literal: COLOR_LITERAL,
		rung: '`var(--_qm-…)`',
		doc: 'THEMING.md',
		cssOnly: false
	},
	{
		// The axis with no natural units of its own: every value looks plausible, so a
		// surface picking its own drifts silently and unarguably. `transition: none`
		// and `animation: none` carry no time and pass.
		props: /^(transition|animation)(-(duration|delay))?$/,
		literal: /\b\d*\.?\d+m?s\b/,
		rung: '`var(--_qm-duration-…)`',
		doc: 'SURFACES §Motion',
		cssOnly: true
	}
];

/** Every `.svelte`/`.ts`/`.css` source under `src/lib`, test files excluded, sorted. */
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
 *  are none of a style gate's business. A `.css` file is style throughout, and in
 *  `.ts` declarations live in strings anywhere, so for both the whole file is the
 *  region. */
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
	// CSS syntax — a `.svelte` style block or a `.css` file. The property-named axes
	// run here; a `.ts` file's declarations are strings, matched by marker instead.
	const css = /\.(svelte|css)$/.test(full);

	region.style.split('\n').forEach((line, i) => {
		const ln = region.base + i + 1;
		const fail = (msg) => errors.push(`${file}:${ln}: ${msg}`);

		for (const m of line.matchAll(/var\(\s*(--qm-[\w-]+)/g)) consumed.add(m[1]);
		if (file === DERIVATION) return; // it IS the derivation — literals here are the defaults

		const decl = line.match(/^\s*([\w-]+)\s*:\s*([^;]*)/);
		const prop = decl?.[1];
		const value = decl?.[2] ?? '';

		for (const axis of AXES) {
			if (axis.cssOnly && !css) continue;
			// In CSS the property name decides which axis owns the line; in `.ts` a
			// style declaration is one string among code, so the marker does.
			const owns = css ? axis.props.test(prop ?? '') : STYLE_MARKER.test(line);
			if (!owns) continue;
			const bad = axis.literal
				? axis.literal.test(css ? value : line)
				: axis.only
					? !axis.only.test(value.trim())
					: !READS_RUNG.test(value) && !axis.allowBare.test(value.trim());
			if (bad)
				fail(
					`\`${prop ?? 'style'}\` mints a literal — ${axis.fix ?? `read a ${axis.rung} rung`} (${axis.doc})`
				);
		}

		const def = line.match(PRIVATE_DEF);
		if (def) fail(`defines \`${def[1]}\` — the scale is minted only in ${DERIVATION}`);
	});
}

// A rung defined twice is a silent last-wins drop, and CSS raises nothing for it
// the way a duplicate object key does — so the check is explicit. Per RULE BLOCK,
// so a rung a scoped rule legitimately retunes stays legal.
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
