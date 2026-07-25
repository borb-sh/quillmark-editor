// Geometry-scale lint — enforces SURFACES §Rhythm in code: radius and spacing
// read the closed `--_qm-*` scale, they do not mint a literal (§"Preventing
// drift": "a component reads a token, it does not mint a value"). One rule over
// every `src/lib/**` `<style>` block: no bare length literal in a rhythm property
// — border-radius, gap/row-gap/column-gap, padding(-*), margin(-*). A
// `var(--_qm-…)` is the only value.
//
// Border widths (`1px` hairlines), shadows, transitions, and content sizing
// (min-height/width) are out of scope — not rhythm, not matched. Where the scale
// may be DEFINED is `check-theme.mjs` rule 3, which owns that question for all
// three axes. Zero deps; run via `npm run check:geometry`. THEMING §"The dials"
// documents the two public dials.

import { gate } from './lib/style-lint.mjs';

/** The rhythm properties whose values must come from the scale, not a literal. */
const RHYTHM_PROP =
	/^(border-radius|gap|row-gap|column-gap|padding|margin)(-(top|bottom|left|right))?$/;
const LENGTH = /\b\d*\.?\d+(px|rem)\b/;

gate({
	label: 'Geometry scale',
	svelteOnly: true,
	rule: ({ prop, value, fail }) => {
		if (prop && RHYTHM_PROP.test(prop) && LENGTH.test(value))
			fail(`\`${prop}\` mints a literal — read a \`var(--_qm-…)\` rung (SURFACES §Rhythm)`);
	}
});
