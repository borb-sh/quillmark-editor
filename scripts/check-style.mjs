// The style gate — one rule over every scope: a stylesheet reads a rung, it does not
// mint a value (ARCHITECTURE §Styling). The axes share that rule and differ only in
// which properties they own and which value betrays a mint, so they are a table, not
// a script apiece.
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
// A line may mint anyway, by saying why: a `mint:` comment on it (`/* mint: … */` in
// CSS, `// mint: …` in `.ts`) exempts that line, and the gate counts what it let
// through. The axes are about a value nothing chose; a value someone chose and gave a
// reason is the opposite, and trying a number is how the next rung gets found. The
// mint stays in the diff, spelled as a mint, with its reason beside it — a family of
// them is a rung waiting to be cut.
//
// Four rules sit outside the table, being about the scale itself rather than one axis:
//
//   · A shadow is the lift rung or it is nothing, in either scope and in the
//     derivations too: an offset states a light source no pole carries, so what is
//     legal is one spelling rather than a range of values, which is a shape the table
//     has no column for. `text-shadow` carries no rung at all — a glyph floats over
//     nothing.
//   · A private rung is defined only in its scope's derivation — what makes one
//     derivation safe for every surface reading it — and never twice in one rule.
//   · An app does not redefine a name the preset carries: the app is meant to look
//     like the endorsed answer, and a local copy is where it stops. A name the preset
//     lacks (an app's own rail width) is the whole of what a host adds on top.
//   · Every `--qm-*` dial a surface consumes is documented in THEMING.md, and every
//     `.qm-*` class a doc promises is carried by something in `src/` — the halves a
//     consumer is hurt by. The reverse halves warn, so prose may run ahead of code.
//
// Many scopes, one table. The package derives `--_qm-*` from the dials for the
// surfaces it ships; each app derives its own from the same dials for the page it
// hosts them on. All are closed scales, so all answer to the same axes: a value that
// cannot be minted in a card must not become mintable one directory over. The dial
// census is the exception, being a package-contract claim.
//
// Nor does file type make a violation legal. Three shapes carry style: a `.svelte`
// `<style>` block, a `.css` file, and `.ts` — `preview/paint.ts` and `overlay.ts`
// carry declarations inside JS strings. The first two are CSS, so the property name
// decides which axis owns a line; in `.ts` the axis's own marker stands in for it, and
// an axis carrying no marker runs on CSS alone.
//
// A derivation is exempt from the literal rules entirely, which is what makes a
// `var()` fallback legitimate there and nowhere else. Zero deps; run via
// `npm run check:style`.

import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { ROOT, canonDocs, canonRoots, report } from './workspace.mjs';

const THEMING = join(ROOT, 'packages', 'svelte', 'THEMING.md');

/** The closed scales, each with the tree that reads it and the one file that mints it.
 *  `census` marks the scopes the dial contract is measured over: the package's, since
 *  THEMING.md documents what the package consumes, and the preset's, which consumes the
 *  same dials for the page. `host` marks the scales that dress a document rather than a
 *  mounted root, which is the set the conformance rule below runs over. `exclude` is
 *  what keeps a nested scope from being scanned twice: the preset ships from inside
 *  `src/lib`, because `svelte-package` reads no other tree, so without this its
 *  derivation is also an ordinary file under the package scope and every literal it
 *  mints fails there. */
const SCOPES = [
	{
		dir: 'packages/svelte/src/lib',
		exclude: ['packages/svelte/src/lib/preset'],
		prefix: '--_qm-',
		derivation: 'packages/svelte/src/lib/core/theme.css',
		doc: 'ARCHITECTURE §Styling',
		census: true
	},
	{
		dir: 'packages/svelte/src/lib/preset',
		prefix: '--qmh-',
		derivation: 'packages/svelte/src/lib/preset/scale.css',
		doc: 'THEMING §"Match ours"',
		census: true,
		host: true
	},
	{
		dir: 'packages/playground/src/routes',
		prefix: '--pg-',
		derivation: 'packages/playground/src/routes/playground.css',
		doc: 'ARCHITECTURE §Styling',
		census: false,
		host: true
	},
	{
		dir: 'packages/quillkit/client',
		// The dev server's packed quiver, which is generated and gitignored.
		exclude: ['packages/quillkit/client/public'],
		prefix: '--st-',
		derivation: 'packages/quillkit/client/studio.css',
		doc: 'ARCHITECTURE §Styling',
		census: false,
		host: true
	}
];

/** A colour literal: hex, or a functional notation that names a colour space. */
const COLOR_LITERAL = /#[0-9a-fA-F]{3,8}\b|\b(rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\(/;
/** A length literal, for the axes whose values are sizes. The rhythm axis keeps its
 *  own narrower shape (`px|rem`); the type and stroke axes count `em` too. */
const LENGTH_LITERAL = /\b\d*\.?\d+(px|rem|em)\b/;
// The `.ts` marker lanes. A `.ts` declaration is one string among code, so a marker
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
/** The escape: a `mint:` comment on the line, in either comment syntax, carrying a
 *  reason. The reason is the whole mechanism — a bare marker is a suppression, and a
 *  suppression is what a gate becomes when nobody has to say anything. The lookahead is
 *  what keeps a CSS comment's own closing delimiter from reading as one. */
const MINT = /(?:\/\*|\/\/)\s*mint:\s*(?!\*\/)(\S[^*\n]*)/;
/** A `--x:` definition — a consumption is `var(--x)`, which has no colon. */
const privateDef = (prefix) => new RegExp(`(${prefix}[\\w-]+)\\s*:`);
/** Reading a rung of any scale the scope is entitled to. An app reads two: the
 *  preset's, which is most of what it draws with, and its own for what it adds on
 *  top, so a rung-required axis must see both, or every `--qmh-` a migrated app reads
 *  looks like a bare literal. */
const readsRung = (prefixes) => new RegExp(`var\\((${prefixes.join('|')})`);

// Three shapes of rule. `literal` forbids a pattern — most properties take values a
// literal cannot be mistaken for, so naming the bad shape is enough. `allowBare`
// requires a rung, listing the few values legitimate without one — right where any
// value at all is a scale decision (a family, a step on the recede ladder), so
// there is no literal shape to enumerate. `only` requires one of a fixed set and
// takes no rung escape, for the one property where naming a rung is not enough to
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
		doc: 'ARCHITECTURE §Styling',
		marker: RHYTHM_MARKER
	},
	{
		// Stroke width, which the colour axis below does not see: it tests `border-*`
		// for a colour literal, so `border-left: 2px solid var(--_qm-border)` reads a
		// rung, passes, and renders at a width nothing chose — a divergent width beside
		// the hairlines with the gate green. Shorthands included, since
		// that is where the width hides. What this holds is that no width is minted;
		// which rung a width reads is beyond either axis shape, so a border that reads
		// `--_qm-ring-width` passes here and is review's to catch.
		props: /^border(-(top|right|bottom|left))?(-width)?$/,
		literal: LENGTH_LITERAL,
		rung: '`var(--_qm-border-width)`',
		doc: 'ARCHITECTURE §Styling',
		marker: STROKE_MARKER
	},
	{
		props: /^font-size$/,
		literal: LENGTH_LITERAL,
		rung: '`var(--_qm-text-…)`',
		doc: 'THEMING §"The dials"'
	},
	{
		// The CSS-wide keywords (inherit/initial/unset) carry no hierarchy decision,
		// so they are not a scale escape and do not match.
		props: /^font-weight$/,
		literal: /\b(\d{3}|bold|bolder|lighter|normal)\b/,
		rung: '`var(--_qm-weight-…)`',
		doc: 'THEMING §"The dials"'
	},
	{
		// Leading has no literal shape to forbid — a bare number is exactly what a rung
		// resolves to, so the rung is required instead. The axis fires only on a line
		// that declares leading; a surface that declares none is covered by the root
		// baseline, since a unitless rung inherits (core/theme.css). `1` is the one bare
		// value that is not a step on the ramp — a line box collapsed onto its content,
		// a glyph or a button's one-line label, structural like `opacity: 0`.
		props: /^line-height$/,
		allowBare: /^1$/,
		rung: '`var(--_qm-leading-…)`',
		doc: 'ARCHITECTURE §Styling'
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
		// The `font` shorthand sets family, size and leading in one declaration, past
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
		doc: 'ARCHITECTURE §Styling'
	},
	{
		// A curve is a rung like any other value, `ease` included: the UA keyword is a
		// curve the surface chose, not the absence of one.
		//
		// Forbidding the bare keyword is what the rung-REQUIRED shape cannot do here: a
		// `transition` value already reads the duration rung, so a value-level "does it
		// read a rung" test passes with the curve still spelled out beside it. The
		// lookbehind is what keeps `--_qm-ease-arrive` from matching itself.
		props: /^(transition|animation)(-timing-function)?$/,
		literal: /(?<![-\w])(ease|linear|cubic-bezier|steps|step-(start|end))\b/,
		rung: '`var(--_qm-ease-…)`',
		doc: 'ARCHITECTURE §Styling'
	},
	{
		// `all` is not a property list, it is the absence of one: it animates whatever
		// a later edit adds to either rest state, which is the one drift no reviewer
		// sees in the diff that causes it.
		props: /^(transition|transition-property)$/,
		literal: /\ball\b/,
		lead: 'animates an open set',
		fix: 'name the properties that differ between the two rest states',
		doc: 'ARCHITECTURE §Styling'
	}
];

/** Every `.svelte`/`.ts`/`.css` source under a scope's tree, tests and any nested scope
 *  excluded, sorted. */
function sources(dir, exclude = []) {
	const skip = exclude.map((d) => join(ROOT, d));
	const out = [];
	(function walk(at) {
		if (skip.includes(at)) return;
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
 *  region.
 *
 *  `mints` is read off the region before the comments are blanked, since the escape is
 *  itself a comment: index of an exempt line within the region → the reason it gave. */
function styleRegion(text, file) {
	const svelte = file.endsWith('.svelte');
	const block = svelte ? text.match(/<style[^>]*>([\s\S]*?)<\/style>/) : null;
	if (svelte && !block) return undefined;
	const body = svelte ? block[1] : text;
	const mints = new Map();
	body.split('\n').forEach((line, i) => {
		const m = line.match(MINT);
		if (m) mints.set(i, m[1].trim());
	});
	return {
		style: decomment(body),
		base: svelte ? text.slice(0, block.index).split('\n').length : 0,
		mints
	};
}

const errors = [];
const warnings = [];
const consumed = new Set();
const hostScales = [];
const mints = [];
let scanned = 0;

for (const scope of SCOPES) {
	// An app scale sits on the preset, so both are legible to it; the preset and the
	// package each read one scale only.
	const reads = scope.host && scope.prefix !== '--qmh-' ? [scope.prefix, '--qmh-'] : [scope.prefix];
	const READS_RUNG = readsRung(reads);
	const PRIVATE_DEF = privateDef(scope.prefix);
	// The axis table names the package's rungs; a failure elsewhere points at the same
	// family under the prefix that scope draws with, and at the doc that states the
	// rule there. For an app that is the preset's prefix rather than its own: the
	// families the axes name (type, colour, motion) are the endorsed look's, and an
	// app's own rungs are the handful it adds beside them.
	const hint = (text) =>
		scope.prefix === '--_qm-' ? text : text.replaceAll('--_qm-', reads.at(-1));
	// The one shadow value a scope may spend: the lift rung off whichever scale it reads.
	const LIFT_RUNG = new RegExp(`^var\\(\\s*(?:${reads.join('|')})lift\\s*\\)$`);

	for (const full of sources(scope.dir, scope.exclude)) {
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
			// The escape covers the value rules — the axes and the shadow property, which
			// are the ones a surface trips by choosing a number. Not the definition rule
			// below it: minting a rung outside the derivation forks the scale rather than
			// trying a value in it, which is a different act and has a different answer.
			const excused = region.mints.get(i);
			if (excused !== undefined) mints.push(`${file}:${ln}: ${excused}`);

			// Only the package scope feeds the dial census (see scopes).
			if (scope.census) for (const m of line.matchAll(/var\(\s*(--qm-[\w-]+)/g)) consumed.add(m[1]);

			// A shadow states occlusion or it states a light source, and only the first
			// survives the poles: an offset is what fixes where the light is. So the
			// property is legal in one spelling — the lift rung — and the derivation that
			// mints it is held to zero offsets, the half no use site can show. Both halves
			// sit before the derivation exemption, since what they hold is the shape of
			// the value rather than a number in it. `text-shadow` carries no rung: a glyph
			// floats over nothing. The colour axis sees both properties but fires only on
			// a hex or a colour function, so `0 1px 4px black` and one mixed from `var()`
			// rungs both walk through it; that gap is why this sits outside the table.
			// Both spellings, since `preview/paint.ts` carries declarations as JS strings.
			const lift = line.match(new RegExp(`^\\s*${scope.prefix}lift\\s*:\\s*([^;]*)`));
			if (lift) {
				// Layer by layer, colour functions flattened away first: a comma inside
				// `color-mix()` does not open a second shadow.
				let layers = lift[1];
				while (/\([^()]*\)/.test(layers)) layers = layers.replace(/\([^()]*\)/g, '');
				if (layers.split(',').some((layer) => !/^\s*0\s+0\s/.test(layer)))
					fail(
						`\`${scope.prefix}lift\` — a lift states occlusion, so every layer opens \`0 0\` (${scope.doc})`
					);
			}

			const shade = line.match(/^\s*(box-shadow|text-shadow|boxShadow|textShadow)\s*:\s*([^;]*)/);
			if (shade && excused === undefined) {
				// A `.ts` declaration ends in a comma inside an object literal, and its value
				// is quoted; neither is part of the value the rules below read.
				const value = shade[2]
					.trim()
					.replace(/,$/, '')
					.trim()
					.replace(/^['"]|['"]$/g, '');
				const lifts = /^(box-shadow|boxShadow)$/.test(shade[1]) && LIFT_RUNG.test(value);
				if (!lifts && !/^(none|inherit|initial|unset|revert)$/.test(value))
					fail(
						`\`${shade[1]}\` — a floating surface lifts with ${hint('`var(--_qm-lift)`')} and nothing else casts (${scope.doc})`
					);
			}

			if (file === scope.derivation) return; // literals here are the defaults

			const decl = line.match(/^\s*([\w-]+)\s*:\s*([^;]*)/);
			const prop = decl?.[1] ?? carry;
			const value = decl ? decl[2] : carry ? line : '';
			// A brace ends whatever was open: a value never spans one.
			carry = /[{}]/.test(line) || line.includes(';') ? null : (prop ?? null);

			if (excused === undefined)
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
	// the way a duplicate object key does — so the check is explicit. Per rule block,
	// so a rung a scoped rule legitimately retunes stays legal.
	const derivation = readFileSync(join(ROOT, scope.derivation), 'utf8');
	for (const [, block] of derivation.matchAll(/\{([^{}]*)\}/g)) {
		const seen = new Set();
		for (const [, name] of block.matchAll(new RegExp(`^\\s*(${scope.prefix}[\\w-]+)\\s*:`, 'gm')))
			if (seen.has(name)) errors.push(`${scope.derivation}: \`${name}\` defined twice in one rule`);
			else seen.add(name);
	}

	// What each host scale calls things, for the conformance rule below: the names
	// alone, keyed on the suffix after the prefix, which is the concept.
	// `--qmh-text-label` and `--pg-text-label` are one decision under two names.
	if (scope.host)
		hostScales.push({
			scope,
			rungs: new Set(
				[...derivation.matchAll(new RegExp(`^\\s*${scope.prefix}([\\w-]+)\\s*:`, 'gm'))].map(
					(m) => m[1]
				)
			)
		});
}

// The conformance rule, and it is the one thing no per-scope axis can see: every scope
// above is checked against itself, its derivation exempt as the place its defaults are
// minted. The preset is the endorsed answer, so an app redefining a name it carries is
// the claim coming apart: the app is meant to look like the preset, and a local copy is
// where it stops. What stays legal is a name the preset does not carry (an app's own
// rail width, its own display size), which is the whole of what a host adds on top —
// including a name a second app happens to have picked too, since two apps agreeing on
// a word is not a claim either of them made.
const preset = hostScales.find((h) => h.scope.prefix === '--qmh-');
for (const { scope, rungs } of hostScales) {
	if (scope === preset?.scope) continue;
	for (const name of rungs)
		if (preset?.rungs.has(name))
			errors.push(
				`${scope.derivation}: \`${scope.prefix}${name}\` restates \`--qmh-${name}\` — read the preset's rung (${scope.doc})`
			);
}

// The dial census, in two severities. A dial a surface consumes and THEMING.md does not
// document cannot be set by the consumer it exists for, and nothing but this looks. The
// reverse — a documented dial nothing reads, a canon page naming one before it is
// minted — is prose ahead of its code, which is how the next dial gets described, so it
// is warned rather than failed.
const dialsIn = (path) =>
	new Set([...readFileSync(path, 'utf8').matchAll(/`(--qm-[\w-]+)`/g)].map((m) => m[1]));

const documented = dialsIn(THEMING);
for (const t of [...consumed].filter((t) => !documented.has(t)).sort())
	errors.push(`THEMING.md: \`${t}\` consumed but undocumented`);
for (const t of [...documented].filter((t) => !consumed.has(t)).sort())
	warnings.push(`THEMING.md: \`${t}\` documented but unconsumed`);

for (const [abs, rel] of canonRoots().flatMap(canonDocs))
	for (const t of [...dialsIn(abs)].filter((t) => !consumed.has(t)).sort())
		warnings.push(`${rel}: \`${t}\` named but not a dial`);

// The class census, one direction only: the package promises the mounted surface roots
// and withholds everything under them, because a full class contract freezes internal
// DOM shape (ARCHITECTURE §Styling). So an internal class appears, moves and vanishes
// freely, and what is checked is the half a consumer can be hurt by — a promised class
// the DOM stopped carrying. THEMING.md is the contract and fails; canon naming a class
// warns, on the same footing as a dial it names early. The lookbehind is what separates
// a class from a dial: `--qm-space` and `--_qm-space` both carry `qm-space` after a dash.
const CLASS_IN_SRC = /(?<![-\w])qm-[\w-]+/g;
const classes = new Set();
for (const scope of SCOPES.filter((s) => s.census))
	for (const full of sources(scope.dir, scope.exclude))
		for (const m of readFileSync(full, 'utf8').matchAll(CLASS_IN_SRC)) classes.add(m[0]);

const promised = new Set(
	[...readFileSync(THEMING, 'utf8').matchAll(/`\.(qm-[\w-]+)`/g)].map((m) => m[1])
);
for (const c of [...promised].filter((c) => !classes.has(c)).sort())
	errors.push(`THEMING.md: \`.${c}\` promised but carried by nothing in src/`);

for (const [abs, rel] of canonRoots().flatMap(canonDocs))
	for (const m of readFileSync(abs, 'utf8').matchAll(/`\.(qm-[\w-]+)`/g))
		if (!classes.has(m[1]))
			warnings.push(`${rel}: \`.${m[1]}\` named but carried by nothing in src/`);

report(
	'Style check',
	errors,
	`Style OK — ${scanned} files over ${SCOPES.length} scopes, ${consumed.size} public dials, ` +
		`${promised.size} contract classes` +
		(mints.length ? `, ${mints.length} minted on purpose.` : '.'),
	[...warnings, ...mints.map((m) => `${m} (minted on purpose)`)]
);
