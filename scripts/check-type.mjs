// Type-scale lint — enforces THEMING §"The dials" in code: font size and weight
// read the closed `--_qm-text-*` / `--_qm-weight-*` scale, they do not mint a
// literal (SURFACES §"Preventing drift"). Two rules over every `src/lib/**`
// `<style>` block:
//   1. No bare size literal in `font-size` — a `var(--_qm-text-…)` rung is the
//      only value (title / body / label / meta).
//   2. No bare weight literal in `font-weight` — a `var(--_qm-weight-…)` rung is
//      the only value (label 600 / soft 500); the CSS-wide keywords
//      inherit/initial/unset are allowed (they carry no scale decision).
//
// The `font` shorthand, line-height, and font-family are out of scope — not the
// size/weight ramp, not matched. Where the scale may be DEFINED is
// `check-theme.mjs` rule 3, which owns that question for all three axes. Zero
// deps; run via `npm run check:type`.

import { gate } from './lib/style-lint.mjs';

const LENGTH = /\b\d*\.?\d+(px|rem|em)\b/;
// A weight literal: a numeric weight (100–900) or the bold/lighter keywords. The
// CSS-wide keywords carry no hierarchy decision, so they are not a scale escape.
const WEIGHT_LITERAL = /\b(\d{3}|bold|bolder|lighter|normal)\b/;
const READS_RUNG = /var\(--_qm-/;

gate({
	label: 'Type scale',
	svelteOnly: true,
	rule: ({ prop, value, fail }) => {
		if (prop === 'font-size' && LENGTH.test(value) && !READS_RUNG.test(value))
			fail('`font-size` mints a literal — read a `var(--_qm-text-…)` rung (THEMING §Typography)');
		if (prop === 'font-weight' && WEIGHT_LITERAL.test(value) && !READS_RUNG.test(value))
			fail(
				'`font-weight` mints a literal — read a `var(--_qm-weight-…)` rung (THEMING §Typography)'
			);
	}
});
