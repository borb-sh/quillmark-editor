// The style gate — one rule over two scopes: a stylesheet reads a rung, it does not
// mint a value (SURFACES §"Preventing drift"; PLAYGROUND §"Preventing drift"). The
// axes share that rule and differ only in which properties they own and which value
// betrays a mint, so they are a table, not three scripts.
//
//   rhythm   padding / margin / gap / radius, every
//            physical, logical and corner spelling    a px|rem length
//   stroke   border / border-*-width                  a length, at any width
//   type     font                                     anything but a CSS-wide keyword
//            font-size / font-weight / font-family    a size, a weight, a family
//            line-height                              a leading off the two rungs
//   colour   color / background / border / shadow …   a hex or a colour function
//   recede   opacity                                  a step off the ladder
//   motion   transition / animation                   an s|ms time
//            …-timing-function, and the shorthands     a curve off the derived three
//            transition / transition-property         `all`
//
// Five rules sit outside the table, because they are about the scale itself rather
// than one axis:
//
//   · NOTHING casts a shadow, in either scope and in the derivations too: elevation
//     is a tone rung and a hairline, so the property is illegal rather than one of
//     its values, which is a shape the table has no column for.
//   · A private rung is DEFINED only in its scope's derivation — what makes one
//     derivation safe for every surface reading it — and never twice in one rule.
//   · The consumed `--qm-*` set EQUALS the set documented in THEMING.md, both
//     directions: an undocumented dial is drift, a documented-but-dead one is a
//     promise nothing honors.
//   · Every `--qm-*` named in `prose/canon/**` is a real dial. Canon names a subset,
//     so this way only — but it is checked, because canon rots where nothing looks.
//   · Every `.qm-*` CLASS a doc promises is carried by something in `src/`. One
//     direction only, and for a different reason than the dials': the promised set is
//     the mounted surface roots, and the classes under them are deliberately not
//     contract, so the unpromised ones are free rather than undocumented.
//
// MANY SCOPES, one table. The package derives `--_qm-*` from the dials for the
// surfaces it ships; each app derives its own scale from the same dials for the page
// it hosts them on. Every one is a closed scale a stylesheet reads rather than mints,
// so all of them answer to the same axes — a value that cannot be minted in a card
// must not become mintable one directory over. What is NOT shared is the dial
// census — a package-contract claim, measured over the package scope alone.
//
// Within a scope a violation must not become legal by FILE TYPE either. Three shapes
// carry style: a `.svelte` `<style>` block, a plain `.css` file (the shared
// recipes), and `.ts` — because `preview/paint.ts` and `preview/overlay.ts` carry
// style declarations inside JS strings and would otherwise escape. The first two are
// CSS, so the property name decides which axis owns a line; in `.ts` a declaration is
// one string among code, so the axis's own marker stands in for the property name. An
// axis carrying no marker has no `.ts` lane and runs on CSS alone.
//
// A `var()` fallback is legitimate only in a derivation, which is exempt from the
// literal rules entirely — so outside it, a literal is a literal wherever it sits.
// Zero deps; run via `npm run check:style`.

import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { ROOT, canonDocs, canonRoots, report } from './workspace.mjs';

const THEMING = join(ROOT, 'packages', 'svelte', 'THEMING.md');

/** The two closed scales, each with the tree that reads it and the one file that
 *  mints it. `census` marks the scope the dial contract is measured over — the
 *  package's, since THEMING.md documents what the PACKAGE consumes. */
const SCOPES = [
	{
		dir: 'packages/svelte/src/lib',
		prefix: '--_qm-',
		derivation: 'packages/svelte/src/lib/core/theme.css',
		doc: 'SURFACES §"Preventing drift"',
		census: true
	},
	{
		dir: 'packages/playground/src/routes',
		prefix: '--pg-',
		derivation: 'packages/playground/src/routes/playground.css',
		doc: 'PLAYGROUND §"Preventing drift"',
		census: false
	},
	{
		dir: 'packages/studio/src',
		prefix: '--st-',
		derivation: 'packages/studio/src/studio.css',
		doc: 'STUDIO §"Preventing drift"',
		census: false
	}
];

/** A colour literal: hex, or a functional notation that names a colour space. */
const COLOR_LITERAL = /#[0-9a-fA-F]{3,8}\b|\b(rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\(/;
/** A length literal, for the axes whose values are sizes. The rhythm axis keeps its
 *  own narrower shape (`px|rem`); the type and stroke axes count `em` too. */
const LENGTH_LITERAL = /\b\d*\.?\d+(px|rem|em)\b/;
// THE `.ts` MARKER LANES. A `.ts` declaration is one string among code, so a marker
// on the line stands in for the property name. One marker per axis that has a lane,
// because the axes want different breadth: colour takes bare `style`, since any
// property assigned through it can carry a hue, while a geometry axis must not — a
// canvas `style.width` in px is a measured size, not a rhythm decision, and a marker
// wide enough to see it reports every paint. So the geometry lanes are
// property-named and the colour lane is not.
/** Colour properties as `Object.assign(el.style, …)` spells them — no trailing `\b`,
 *  so the camelCase compounds (`backgroundColor`, `borderTop`) match too. */
const STYLE_MARKER = /\b(style|background|border|color|outline|boxShadow|textShadow)/;
/** Rhythm properties in either spelling: `margin-top` and `marginTop`, `row-gap` and
 *  `rowGap`, `border-radius` and `borderRadius`. */
const RHYTHM_MARKER = /(padding|margin|gap|radius)/i;
/** Stroke properties, minus the corner the rhythm lane owns. */
const STROKE_MARKER = /border(?!-?radius)/i;
/** A `--x:` DEFINITION — a consumption is `var(--x)`, which has no colon. */
const privateDef = (prefix) => new RegExp(`(${prefix}[\\w-]+)\\s*:`);
const readsRung = (prefix) => new RegExp(`var\\(${prefix}`);

// Three shapes of rule. `literal` FORBIDS a pattern — most properties take values a
// literal cannot be mistaken for, so naming the bad shape is enough. `allowBare`
// REQUIRES a rung, listing the few values legitimate without one — right where any
// value at all is a scale decision (a family, a step on the recede ladder), so
// there is no literal shape to enumerate. `only` REQUIRES one of a fixed set and
// takes NO rung escape, for the one property where naming a rung is not enough to
// make a value safe.
//
// A failure reads "`prop` mints a literal — <fix>". `lead` replaces the middle for
// the axis where the value forbidden is a keyword rather than a minted number.
const AXES = [
	{
		// Every spelling of the same decision: the physical longhands, the logical ones
		// (`margin-block`, `padding-inline-start`), and the radius corners. An axis that
		// names only the physical forms is a gate a rewrite walks through — the codebase
		// already reaches for `margin-block` where a rung goes on both sides at once.
		props: /^(border(-[\w-]+)?-radius|gap|row-gap|column-gap|(padding|margin)(-[\w-]+)?)$/,
		literal: /\b\d*\.?\d+(px|rem)\b/,
		rung: '`var(--_qm-space-…)` / `var(--_qm-radius…)`',
		doc: 'SURFACES §Rhythm',
		marker: RHYTHM_MARKER
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
		marker: STROKE_MARKER
	},
	{
		props: /^font-size$/,
		literal: LENGTH_LITERAL,
		rung: '`var(--_qm-text-…)`',
		doc: 'THEMING §Typography'
	},
	{
		// The CSS-wide keywords (inherit/initial/unset) carry no hierarchy decision,
		// so they are not a scale escape and do not match.
		props: /^font-weight$/,
		literal: /\b(\d{3}|bold|bolder|lighter|normal)\b/,
		rung: '`var(--_qm-weight-…)`',
		doc: 'THEMING §Typography'
	},
	{
		// Leading has no literal shape to forbid — a bare number is exactly what a rung
		// resolves to, so the rung is REQUIRED instead. The axis fires only on a line
		// that DECLARES leading; a surface that declares none is covered by the root
		// baseline, since a unitless rung inherits (core/theme.css). `1` is the one bare
		// value that is not a step on the ramp — a line box collapsed onto its content,
		// a glyph or a button's one-line label, structural like `opacity: 0`.
		props: /^line-height$/,
		allowBare: /^1$/,
		rung: '`var(--_qm-leading-…)`',
		doc: 'SURFACES §Rhythm'
	},
	{
		// A family is a scale decision whatever it names, so the rung is required
		// rather than a shape forbidden. `inherit` is how a control defers to its
		// surface, which is reading the scale one level up.
		props: /^font-family$/,
		allowBare: /^(inherit|initial|unset|revert)$/,
		rung: '`var(--_qm-font)` / `var(--_qm-font-mono)`',
		doc: 'THEMING §"The dials"'
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
		doc: 'THEMING §"The dials"'
	},
	{
		// `0` / `1` are structural on/off, not a step on the recede ladder.
		props: /^opacity$/,
		allowBare: /^[01]$/,
		rung: '`var(--_qm-opacity-…)`',
		doc: 'THEMING.md'
	},
	{
		props:
			/^(color|fill|stroke|background|border|outline|box-shadow|text-shadow|backdrop-filter|-webkit-backdrop-filter)(-[\w-]+)?$/,
		literal: COLOR_LITERAL,
		rung: '`var(--_qm-…)`',
		doc: 'THEMING.md',
		marker: STYLE_MARKER
	},
	{
		// The axis with no natural units of its own: every value looks plausible, so a
		// surface picking its own drifts silently and unarguably. `transition: none`
		// and `animation: none` carry no time and pass.
		props: /^(transition|animation)(-(duration|delay))?$/,
		literal: /\b\d*\.?\d+m?s\b/,
		rung: '`var(--_qm-duration-…)`',
		doc: 'SURFACES §Motion'
	},
	{
		// A curve is a rung like any other value, `ease` included: SURFACES §Motion has
		// why the UA keyword is a mint rather than the absence of one.
		//
		// Forbidding the bare keyword is what the rung-REQUIRED shape cannot do here: a
		// `transition` value already reads the duration rung, so a value-level "does it
		// read a rung" test passes with the curve still spelled out beside it. The
		// lookbehind is what keeps `--_qm-ease-arrive` from matching itself.
		props: /^(transition|animation)(-timing-function)?$/,
		literal: /(?<![-\w])(ease|linear|cubic-bezier|steps|step-(start|end))\b/,
		rung: '`var(--_qm-ease-…)`',
		doc: 'SURFACES §Motion'
	},
	{
		// `all` is not a property list, it is the absence of one: it animates whatever
		// a later edit adds to either rest state, which is the one drift no reviewer
		// sees in the diff that causes it.
		props: /^(transition|transition-property)$/,
		literal: /\ball\b/,
		lead: 'animates an open set',
		fix: 'name the properties that differ between the two rest states',
		doc: 'SURFACES §Motion'
	}
];

/** Every `.svelte`/`.ts`/`.css` source under a scope's tree, tests excluded, sorted. */
function sources(dir) {
	const out = [];
	(function walk(at) {
		for (const e of readdirSync(at, { withFileTypes: true }).sort((a, b) =>
			a.name < b.name ? -1 : 1
		)) {
			const full = join(at, e.name);
			if (e.isDirectory()) walk(full);
			else if (/\.spec\.ts$|\.test\.ts$/.test(e.name)) continue;
			else if (/\.(svelte|ts|css)$/.test(e.name)) out.push(full);
		}
	})(join(ROOT, dir));
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
let scanned = 0;

for (const scope of SCOPES) {
	const READS_RUNG = readsRung(scope.prefix);
	const PRIVATE_DEF = privateDef(scope.prefix);
	// The axis table names the package's rungs; a host failure points at the same
	// family under the host's prefix, and at the doc that states the rule there.
	const hint = (text) =>
		scope.prefix === '--_qm-' ? text : text.replaceAll('--_qm-', scope.prefix);

	for (const full of sources(scope.dir)) {
		const file = relative(ROOT, full);
		const region = styleRegion(readFileSync(full, 'utf8'), full);
		if (!region) continue;
		scanned++;
		// CSS syntax — a `.svelte` style block or a `.css` file. The property-named axes
		// run here; a `.ts` file's declarations are strings, matched by marker instead.
		const css = /\.(svelte|css)$/.test(full);

		// A declaration the author broke across lines is still one declaration, and the
		// property naming its axis sits on the first of them. Without this the gate is
		// bypassed by a newline: `transition:\n\tcolor 200ms ease,` carries a minted
		// duration and a minted curve on a line whose property is nothing at all — and
		// a list of transitions is exactly where a value wants to be broken up.
		let carry = null;

		region.style.split('\n').forEach((line, i) => {
			const ln = region.base + i + 1;
			const fail = (msg) => errors.push(`${file}:${ln}: ${msg}`);

			// Only the package scope feeds the dial census (see SCOPES).
			if (scope.census) for (const m of line.matchAll(/var\(\s*(--qm-[\w-]+)/g)) consumed.add(m[1]);

			// Zero shadows, and BEFORE the derivation exemption, since what is forbidden
			// is the property rather than one of its values: elevation is a tone rung and
			// a hairline, so there is no shadow rung to mint and none to read (SURFACES
			// §Elevation). The colour axis sees `box-shadow` but fires only on a hex or a
			// colour function, so `0 1px 4px black` and one mixed from `var()` rungs both
			// walk through it; that gap is why this sits outside the table. Both
			// spellings, since `preview/paint.ts` carries declarations as JS strings.
			const shade = line.match(/^\s*(box-shadow|text-shadow|boxShadow|textShadow)\s*:\s*([^;,]*)/);
			if (shade && !/^'?(none|inherit|initial|unset|revert)'?$/.test(shade[2].trim()))
				fail(
					`\`${shade[1]}\` — lift with a surface rung and a hairline, not a shadow (SURFACES §Elevation; ${scope.doc})`
				);

			if (file === scope.derivation) return; // literals here ARE the defaults

			const decl = line.match(/^\s*([\w-]+)\s*:\s*([^;]*)/);
			const prop = decl?.[1] ?? carry;
			const value = decl ? decl[2] : carry ? line : '';
			// A brace ends whatever was open: a value never spans one.
			carry = /[{}]/.test(line) || line.includes(';') ? null : (prop ?? null);

			for (const axis of AXES) {
				// In CSS the property name decides which axis owns the line; in `.ts` a
				// style declaration is one string among code, so the axis's own marker
				// does. An axis with no marker has no `.ts` lane and runs on CSS alone.
				if (!css && !axis.marker) continue;
				const owns = css ? axis.props.test(prop ?? '') : axis.marker.test(line);
				if (!owns) continue;
				const bad = axis.literal
					? axis.literal.test(css ? value : line)
					: axis.only
						? !axis.only.test(value.trim())
						: !READS_RUNG.test(value) && !axis.allowBare.test(value.trim());
				if (bad)
					fail(
						`\`${prop ?? 'style'}\` ${axis.lead ?? 'mints a literal'} — ${axis.fix ?? `read a ${hint(axis.rung)} rung`} (${axis.doc}; ${scope.doc})`
					);
			}

			const def = line.match(PRIVATE_DEF);
			if (def) fail(`defines \`${def[1]}\` — the scale is minted only in ${scope.derivation}`);
		});
	}

	// A rung defined twice is a silent last-wins drop, and CSS raises nothing for it
	// the way a duplicate object key does — so the check is explicit. Per RULE BLOCK,
	// so a rung a scoped rule legitimately retunes stays legal.
	const derivation = readFileSync(join(ROOT, scope.derivation), 'utf8');
	for (const [, block] of derivation.matchAll(/\{([^{}]*)\}/g)) {
		const seen = new Set();
		for (const [, name] of block.matchAll(new RegExp(`^\\s*(${scope.prefix}[\\w-]+)\\s*:`, 'gm')))
			if (seen.has(name)) errors.push(`${scope.derivation}: \`${name}\` defined twice in one rule`);
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

for (const [abs, rel] of canonRoots().flatMap(canonDocs))
	for (const t of [...dialsIn(abs)].filter((t) => !consumed.has(t)).sort())
		errors.push(`${rel}: \`${t}\` named but not a dial`);

// The class census, and it runs ONE direction where the dial census runs two. The
// dials are a closed contract, so a consumed-but-undocumented one is drift. The
// classes are not: the package promises the mounted surface roots and withholds
// everything under them, because a full class contract freezes internal DOM shape
// (AESTHETIC §"What a restyle keeps"). So an internal class appears, moves and
// vanishes freely, and what is checked is the half a consumer can be hurt by — a
// promised class the DOM stopped carrying. The lookbehind is what separates a class
// from a dial: `--qm-space` and `--_qm-space` both carry `qm-space` after a dash.
const CLASS_IN_SRC = /(?<![-\w])qm-[\w-]+/g;
const classes = new Set();
for (const scope of SCOPES.filter((s) => s.census))
	for (const full of sources(scope.dir))
		for (const m of readFileSync(full, 'utf8').matchAll(CLASS_IN_SRC)) classes.add(m[0]);

const promised = new Set(
	[...readFileSync(THEMING, 'utf8').matchAll(/`\.(qm-[\w-]+)`/g)].map((m) => m[1])
);
for (const c of [...promised].filter((c) => !classes.has(c)).sort())
	errors.push(`THEMING.md: \`.${c}\` promised but carried by nothing in src/`);

for (const [abs, rel] of canonRoots().flatMap(canonDocs))
	for (const m of readFileSync(abs, 'utf8').matchAll(/`\.(qm-[\w-]+)`/g))
		if (!classes.has(m[1]))
			errors.push(`${rel}: \`.${m[1]}\` named but carried by nothing in src/`);

report(
	'Style check',
	errors,
	`Style OK — ${scanned} files over ${SCOPES.length} scopes, ${consumed.size} public dials, ` +
		`${promised.size} contract classes.`
);
